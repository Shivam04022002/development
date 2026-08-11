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
  reportsOrphaned: 0,
  reportsAlreadyAttributed: 0,
};

/** A record "has a report" — the same test every consumer already applies. */
const hasReport = (cibil) =>
  typeof cibil?.score === "number" || Boolean(String(cibil?.requestId || "").trim());

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

/* ── Step 3 ──────────────────────────────────────────────────────────────── */
async function attributeReports() {
  const coll = CibilReport.collection;
  const orphans = [];

  for await (const rep of coll.find({}, { projection: { _id: 1, applicationId: 1, subjectPan: 1 } })) {
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
      // documented in the audit (§6B). Not guessable; reported for review.
      stats.reportsOrphaned += 1;
      orphans.push(String(rep.applicationId));
      continue;
    }

    const subjectPan = normalizePan(owner.cibil?.subjectPan) || partySubjectPan(owner.applicant);
    if (!subjectPan) {
      stats.reportsOrphaned += 1;
      orphans.push(`${rep.applicationId} (no PAN on the owning applicant)`);
      continue;
    }

    stats.reportsAttributed += 1;
    if (!DRY_RUN) await coll.updateOne({ _id: rep._id }, { $set: { subjectPan } });
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
  console.log(`reports attributed:              ${stats.reportsAttributed}`);
  console.log(`reports already attributed:      ${stats.reportsAlreadyAttributed}`);
  console.log(`reports UNATTRIBUTABLE:          ${stats.reportsOrphaned}`);
  console.log(`Execution time:                  ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("FAILED:", err?.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
