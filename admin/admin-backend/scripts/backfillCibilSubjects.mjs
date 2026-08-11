/**
 * backfillCibilSubjects.mjs
 *
 * Phase 1 — multi-subject CIBIL storage. One-time migration that attributes the
 * existing single-subject data to a person and removes the index that
 * physically caps an application at one bureau report.
 *
 * IT DOES NOT FETCH ANYTHING. No Xaler/TransUnion call is made, no
 * co-applicant report is created, and no application changes status, workflow
 * stage or score. The values written are derived entirely from data already on
 * the record.
 *
 * Four steps, each idempotent and each reported separately:
 *
 *   1. applications / rejectedApplications — set `cibil.subjectPan` where it is
 *      empty AND the record has a report (score or requestId). The value is the
 *      applicant's PAN, which is exactly what the "empty means the applicant"
 *      fallback already infers at read time. Records with no report are left
 *      alone: attributing a report that does not exist would be inventing data.
 *
 *   2. applications / rejectedApplications — mirror `cibil` into
 *      `cibilSubjects` for records that have a report and no entry yet.
 *
 *   3. cibilreports — set `subjectPan` from the owning application's
 *      `cibil.subjectPan`, else that application's applicant PAN. A report whose
 *      application no longer exists (see the audit's §6B id divergence) cannot
 *      be attributed and is REPORTED, not guessed at.
 *
 *   4. cibilreports — drop the obsolete unique index "applicationId_1" and
 *      create the compound unique { applicationId, subjectPan }.
 *      Step 4 runs ONLY with --with-index, and only after steps 1-3 report zero
 *      remaining unattributed rows: dropping the old index while two rows still
 *      share a blank subjectPan would let the compound index build fail, or
 *      worse, permit a duplicate.
 *
 * ORDER OF OPERATIONS FOR DEPLOYMENT
 *   a. Deploy the schema changes (models/*). Behaviour is unchanged: the old
 *      unique index still stands and still allows exactly one report per
 *      application, which is all Phase 1 writes.
 *   b. Run this script with --dry-run. Read the report.
 *   c. Run it without flags to apply steps 1-3.
 *   d. Re-run --dry-run to confirm zero remaining.
 *   e. Only when Phase 2 is ready to write a second subject, run
 *      --with-index to perform step 4.
 *
 * Usage:
 *   node scripts/backfillCibilSubjects.mjs --dry-run     # report only, no writes
 *   node scripts/backfillCibilSubjects.mjs               # apply steps 1-3
 *   node scripts/backfillCibilSubjects.mjs --with-index  # apply steps 1-4
 *
 * Run it from the directory whose .env points at the target database — this
 * uses dotenv exactly as server.js does, so the cwd decides the database.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";

// ── autoIndex OFF ───────────────────────────────────────────────────────────
// Mongoose builds every index declared on a registered schema when the
// CONNECTION OPENS — not when the model is imported. So importing the models
// below is harmless on its own, but the moment connect() runs, CibilReport's
// compound index would be created. A Phase 2A dry run against production
// created `applicationId_1_subjectPan_1` exactly that way; it had to be
// dropped by hand afterwards.
//
// These statements execute after the (hoisted) imports but before connect(),
// which is the point that matters. The same options are repeated on the
// connection itself below, so the guarantee does not depend on global state.
// `autoCreate: false` also stops Mongoose creating a missing collection.
//
// Result: this script performs NO implicit index or collection work. Every
// index change stays explicit, inside migrateIndex(), behind --with-index.
mongoose.set("autoIndex", false);
mongoose.set("autoCreate", false);

import Application from "../models/Application.js";
import ApprovedApplication from "../models/ApprovedApplication.js";
import RejectedApplication from "../models/RejectedApplication.js";
import CibilReport from "../models/CibilReport.js";
import { normalizePan, partySubjectPan, toCibilSubject } from "../models/cibilSubjectSchemas.js";

dotenv.config();

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry-run");
const WITH_INDEX = ARGS.includes("--with-index");

const OLD_INDEX_NAME = "applicationId_1";
const NEW_INDEX_KEY = { applicationId: 1, subjectPan: 1 };

const startedAt = Date.now();
const stats = {
  appsSubjectSet: 0,
  appsSubjectSkippedNoReport: 0,
  appsSubjectSkippedNoPan: 0,
  appsListMirrored: 0,
  reportsAttributed: 0,
  reportsAlreadyAttributed: 0,
  // Orphan recovery (formId + rawRequest.pan_id, both required)
  reportsRecovered: 0,
  reportsCoApplicantOrphan: 0,
  reportsUnrecoverable: 0,
  recoveredMirrored: 0,
  recoveredNoSummary: 0,
};

/** A record "has a report" — the same test every consumer already applies. */
const hasReport = (cibil) =>
  typeof cibil?.score === "number" || Boolean(String(cibil?.requestId || "").trim());

/* ── Orphan recovery ──────────────────────────────────────────────────────────
 * A report is "orphaned" when its applicationId matches no document in any of
 * the three collections. That happens because one of the two approval paths
 * (workflowController.js updateWorkflowStage) mints a NEW _id for the approved
 * copy and deletes the source Application, leaving the report pointing at an id
 * that no longer exists.
 *
 * Such a report is recoverable, but ONLY on evidence that already exists in the
 * data — never on a guess. Two independent facts must both hold:
 *
 *   1. `rawResponsePath` embeds the formId (the raw JSON is written to
 *      uploads/applications/<formId>/cibil/raw-response.json), and that formId
 *      matches EXACTLY ONE record across all three collections.
 *   2. `rawRequest.pan_id` — the PAN the bureau pull was actually made against,
 *      recorded verbatim at request time — equals that record's APPLICANT PAN.
 *
 * Fact 2 is what makes this deterministic rather than inferential: the subject
 * is read from the stored request, not deduced from role, score, date, ordering
 * or name. Anything that fails either check is skipped and reported.
 */

/** formId out of `applications/<formId>/cibil/raw-response.json`. "" if absent. */
export const formIdFromRawResponsePath = (path) => {
  const m = String(path || "").match(/(?:^|\/)applications\/([^/]+)\//);
  return m ? m[1].trim() : "";
};

/** The PAN the bureau pull was made against, as stored on the request. */
export const subjectPanOfReport = (report) => normalizePan(report?.rawRequest?.pan_id);

/**
 * decideOrphanRecovery({ report, candidates }) → { action, reason, ... }
 *
 * Pure: no database, no I/O. `candidates` is every record whose formId matches
 * the one embedded in the report's rawResponsePath, across all three
 * collections. Exported so the decision can be tested without MongoDB.
 *
 * action:
 *   "recover"     — safe: unique formId match AND pan_id === applicant PAN
 *   "coapplicant" — pan_id is the CO-APPLICANT's; reported, never written
 *   "skip"        — anything else, with the reason
 */
export function decideOrphanRecovery({ report, candidates }) {
  const formId = formIdFromRawResponsePath(report?.rawResponsePath);
  if (!formId) return { action: "skip", reason: "no formId in rawResponsePath" };

  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) return { action: "skip", reason: `formId ${formId} matches no record`, formId };
  if (list.length > 1) {
    return { action: "skip", reason: `formId ${formId} matches ${list.length} records — ambiguous`, formId };
  }

  const subjectPan = subjectPanOfReport(report);
  if (!subjectPan) return { action: "skip", reason: "rawRequest.pan_id missing", formId };

  const target = list[0];
  const applicantPan = partySubjectPan(target.doc?.applicant);
  const coApplicantPan = partySubjectPan(target.doc?.coApplicant);

  if (applicantPan && subjectPan === applicantPan) {
    return { action: "recover", formId, subjectPan, target };
  }

  // The subject is the co-applicant. Real, but not what this recovery covers:
  // re-pointing such a report is a separate decision about whose record it
  // belongs on, and there is no production example to validate against
  // (every stored report was pulled against an applicant). Reported, not acted on.
  if (coApplicantPan && subjectPan === coApplicantPan) {
    return { action: "coapplicant", formId, subjectPan, target, reason: "pan_id is the co-applicant's" };
  }

  return { action: "skip", reason: `pan_id matches neither party on ${formId}`, formId };
}

/* ── Steps 1 + 2 ─────────────────────────────────────────────────────────── */
async function attributeApplications(Model, label) {
  const coll = Model.collection;
  const cursor = coll.find(
    {},
    { projection: { _id: 1, formId: 1, applicant: 1, cibil: 1, cibilSubjects: 1 } }
  );

  let scanned = 0;
  for await (const doc of cursor) {
    scanned += 1;
    const cibil = doc.cibil || {};
    if (!hasReport(cibil)) {
      stats.appsSubjectSkippedNoReport += 1;
      continue;
    }

    const existing = normalizePan(cibil.subjectPan);
    const applicantPan = partySubjectPan(doc.applicant);
    const subjectPan = existing || applicantPan;

    if (!subjectPan) {
      // A report exists but the applicant has no PAN on file. Leaving
      // subjectPan empty keeps the existing fallback working; inventing a key
      // would be worse than the gap.
      stats.appsSubjectSkippedNoPan += 1;
      continue;
    }

    const set = {};
    if (!existing) set["cibil.subjectPan"] = subjectPan;

    const alreadyListed = (doc.cibilSubjects || []).some(
      (e) => normalizePan(e?.subjectPan) === subjectPan
    );
    if (!alreadyListed) {
      set.cibilSubjects = [
        ...(doc.cibilSubjects || []),
        toCibilSubject(subjectPan, { ...cibil, subjectPan }),
      ];
    }

    if (!Object.keys(set).length) continue;

    if (set["cibil.subjectPan"]) stats.appsSubjectSet += 1;
    if (set.cibilSubjects) stats.appsListMirrored += 1;

    if (!DRY_RUN) {
      // Native driver, no timestamp bookkeeping: `updatedAt` on these records
      // is load-bearing elsewhere (approval-time proxy in exports) and must not
      // move because of a migration.
      await coll.updateOne({ _id: doc._id }, { $set: set });
    }
  }

  console.log(`  ${label}: ${scanned} scanned`);
}

/** Every record carrying this formId, across all three collections. */
async function findByFormId(formId) {
  const out = [];
  for (const [label, Model] of [
    ["applications", Application],
    ["approvedApplications", ApprovedApplication],
    ["rejectedApplications", RejectedApplication],
  ]) {
    for await (const doc of Model.collection.find(
      { formId },
      { projection: { _id: 1, formId: 1, applicant: 1, coApplicant: 1, cibil: 1, cibilSubjects: 1 } }
    )) {
      out.push({ label, Model, doc });
    }
  }
  return out;
}

/**
 * Attempt deterministic recovery of one orphaned report.
 *
 * WRITE ORDER MATTERS and is fixed: every check passes first, then subjectPan,
 * then the summary mirror, and only last the applicationId re-point. Doing the
 * re-point first would destroy the evidence the checks depend on if a later
 * step failed.
 *
 * rawRequest, rawResponse, rawResponsePath, reportUrl, requestId and the score
 * are never touched.
 */
async function recoverOrphan(rep, orphans, coApplicantOrphans) {
  const formId = formIdFromRawResponsePath(rep.rawResponsePath);
  const candidates = formId ? await findByFormId(formId) : [];
  const decision = decideOrphanRecovery({ report: rep, candidates });

  if (decision.action === "coapplicant") {
    stats.reportsCoApplicantOrphan += 1;
    coApplicantOrphans.push(`${rep.applicationId} → ${decision.formId} (${decision.reason})`);
    return;
  }

  if (decision.action !== "recover") {
    stats.reportsUnrecoverable += 1;
    orphans.push(`${rep.applicationId} — ${decision.reason}`);
    return;
  }

  const { subjectPan, target } = decision;

  // The obsolete `applicationId_1` unique index is still in place by design, so
  // re-pointing onto a record that already owns a report would fail with E11000
  // mid-migration. Check first and skip rather than crash — and this is a real
  // signal, not just defensiveness: two reports claiming one application means
  // the data needs a human before anything is rewritten.
  const occupied = await CibilReport.collection.findOne(
    { applicationId: target.doc._id, _id: { $ne: rep._id } },
    { projection: { _id: 1 } }
  );
  if (occupied) {
    stats.reportsUnrecoverable += 1;
    orphans.push(
      `${rep.applicationId} — ${decision.formId} already has report ${occupied._id}; not re-pointed`
    );
    return;
  }

  stats.reportsRecovered += 1;
  console.log(
    `      recover ${rep.applicationId} → ${decision.formId} ` +
    `(${target.label} ${target.doc._id}) subject=applicant`
  );

  if (DRY_RUN) return;

  // 1 · attribute the report to the person it was pulled against
  await CibilReport.collection.updateOne({ _id: rep._id }, { $set: { subjectPan } });

  // 2 · mirror the summary onto the owning record — only where the schema can
  //     actually hold it. ApprovedApplication carries no `cibil` block and no
  //     `cibilSubjects` (see the audit's §6A), so there is no summary to mirror
  //     and writing one through the native driver would produce a field the
  //     model strips on read. Reported rather than silently skipped.
  const ownerCibil = target.doc.cibil;
  const ownerSupportsList = Boolean(target.Model.schema?.path("cibilSubjects"));
  if (ownerSupportsList && hasReport(ownerCibil)) {
    const already = (target.doc.cibilSubjects || []).some(
      (e) => normalizePan(e?.subjectPan) === subjectPan
    );
    if (!already) {
      await target.Model.collection.updateOne(
        { _id: target.doc._id },
        {
          $set: {
            "cibil.subjectPan": normalizePan(target.doc.cibil?.subjectPan) || subjectPan,
            cibilSubjects: [
              ...(target.doc.cibilSubjects || []),
              toCibilSubject(subjectPan, { ...ownerCibil, subjectPan }),
            ],
          },
        }
      );
      stats.recoveredMirrored += 1;
    }
  } else {
    stats.recoveredNoSummary += 1;
  }

  // 3 · LAST — re-point the report at the record that exists today.
  await CibilReport.collection.updateOne(
    { _id: rep._id },
    { $set: { applicationId: target.doc._id } }
  );
}

/* ── Step 3 ──────────────────────────────────────────────────────────────── */
async function attributeReports() {
  const coll = CibilReport.collection;
  const orphans = [];
  const coApplicantOrphans = [];

  // rawResponsePath and rawRequest.pan_id are the two recovery keys; the bulky
  // rawResponse blob is deliberately excluded from the projection.
  const projection = {
    _id: 1, applicationId: 1, subjectPan: 1, rawResponsePath: 1, "rawRequest.pan_id": 1,
  };
  for await (const rep of coll.find({}, { projection })) {
    if (normalizePan(rep.subjectPan)) {
      stats.reportsAlreadyAttributed += 1;
      continue;
    }

    const owner =
      (await Application.collection.findOne(
        { _id: rep.applicationId },
        { projection: { applicant: 1, cibil: 1 } }
      )) ||
      (await RejectedApplication.collection.findOne(
        { _id: rep.applicationId },
        { projection: { applicant: 1, cibil: 1 } }
      ));

    if (!owner) {
      // The application this report belongs to is gone — the id divergence
      // documented in the audit (§6B). Try the deterministic formId + pan_id
      // recovery; anything short of a complete match is skipped, not guessed.
      await recoverOrphan(rep, orphans, coApplicantOrphans);
      continue;
    }

    const subjectPan = normalizePan(owner.cibil?.subjectPan) || partySubjectPan(owner.applicant);
    if (!subjectPan) {
      stats.reportsUnrecoverable += 1;
      orphans.push(`${rep.applicationId} — no PAN on the owning applicant`);
      continue;
    }

    stats.reportsAttributed += 1;
    if (!DRY_RUN) await coll.updateOne({ _id: rep._id }, { $set: { subjectPan } });
  }

  if (coApplicantOrphans.length) {
    console.log(`\n  ℹ ${coApplicantOrphans.length} orphan(s) belong to the CO-APPLICANT — reported, not modified:`);
    coApplicantOrphans.slice(0, 20).forEach((o) => console.log(`      ${o}`));
  }

  if (orphans.length) {
    console.log(`\n  ⚠ ${orphans.length} report(s) could not be attributed:`);
    orphans.slice(0, 20).forEach((o) => console.log(`      ${o}`));
    if (orphans.length > 20) console.log(`      … and ${orphans.length - 20} more`);
  }
}

/* ── Step 4 ──────────────────────────────────────────────────────────────── */
async function migrateIndex() {
  const coll = CibilReport.collection;
  const existing = await coll.indexes();
  const names = existing.map((i) => i.name);
  console.log(`  current indexes: ${names.join(", ")}`);

  const blocking = await coll.countDocuments({ $or: [{ subjectPan: "" }, { subjectPan: { $exists: false } }] });
  if (blocking > 0) {
    console.log(`  ✗ REFUSING: ${blocking} report(s) still have no subjectPan.`);
    console.log("    Resolve those first — dropping the old index now would remove");
    console.log("    the only constraint protecting them from being overwritten.");
    return;
  }

  if (names.includes(OLD_INDEX_NAME)) {
    console.log(`  ${DRY_RUN ? "would drop" : "dropping"} obsolete unique index "${OLD_INDEX_NAME}"`);
    if (!DRY_RUN) await coll.dropIndex(OLD_INDEX_NAME);
  } else {
    console.log(`  "${OLD_INDEX_NAME}" already absent`);
  }

  const compoundName = "applicationId_1_subjectPan_1";
  if (names.includes(compoundName)) {
    console.log(`  "${compoundName}" already present`);
  } else {
    console.log(`  ${DRY_RUN ? "would create" : "creating"} unique ${JSON.stringify(NEW_INDEX_KEY)}`);
    if (!DRY_RUN) await coll.createIndex(NEW_INDEX_KEY, { unique: true });
  }
}

/* ── Main ────────────────────────────────────────────────────────────────── */
async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }

  // Repeated here so the guarantee holds even if the globals above are ever
  // removed or overridden by an imported module.
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false });
  const dbName = mongoose.connection.name;
  const host = mongoose.connection.host;
  console.log(`Connected to database "${dbName}" on ${host}`);
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY"}${WITH_INDEX ? " + INDEX MIGRATION" : ""}\n`);

  console.log("Step 1+2 — attribute applications and mirror summaries");
  await attributeApplications(Application, "applications");
  await attributeApplications(RejectedApplication, "rejectedApplications");

  console.log("\nStep 3 — attribute cibilreports");
  await attributeReports();

  if (WITH_INDEX) {
    console.log("\nStep 4 — index migration");
    await migrateIndex();
  } else {
    console.log("\nStep 4 — index migration SKIPPED (pass --with-index to run it)");
  }

  console.log("\n--- Summary ---");
  console.log(`cibil.subjectPan set:            ${stats.appsSubjectSet}`);
  console.log(`cibilSubjects mirrored:          ${stats.appsListMirrored}`);
  console.log(`skipped, no report on record:    ${stats.appsSubjectSkippedNoReport}`);
  console.log(`skipped, applicant has no PAN:   ${stats.appsSubjectSkippedNoPan}`);
  console.log(`directly attributed:             ${stats.reportsAttributed}`);
  console.log(`reports already attributed:      ${stats.reportsAlreadyAttributed}`);
  console.log(`orphan recovered:                ${stats.reportsRecovered}`);
  console.log(`  …of those, summary mirrored:   ${stats.recoveredMirrored}`);
  console.log(`  …of those, no summary to hold: ${stats.recoveredNoSummary}`);
  console.log(`orphan is CO-APPLICANT's:        ${stats.reportsCoApplicantOrphan}  (reported, never written)`);
  console.log(`unrecoverable:                   ${stats.reportsUnrecoverable}`);
  console.log(`Execution time:                  ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);

  await mongoose.disconnect();
}

// Run only when invoked directly. Importing this file (the verification script
// does, to test the pure recovery decision) must never open a connection or
// touch data — without this guard, `import` would run the whole migration.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch(async (err) => {
    console.error("FAILED:", err?.message || err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}
