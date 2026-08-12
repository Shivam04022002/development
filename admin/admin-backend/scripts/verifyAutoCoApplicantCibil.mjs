/**
 * verifyAutoCoApplicantCibil.mjs — Phase 2B.8.
 *
 * The co-applicant bureau fetch now starts automatically after an application
 * is submitted, in addition to the manual Super Admin endpoint. Both entry
 * points call the SAME service, so this suite checks two things:
 *
 *   1. the orchestration seam (startCoApplicantCibil) — that it delegates
 *      every decision, never throws, and never makes the caller wait;
 *   2. that driving the REAL fetchCoApplicantCibil the way the automation does
 *      keeps every existing guarantee: one vendor call per subject, the
 *      applicant's data untouched, no business-state change, reservations
 *      released on every failure shape.
 *
 * NO NETWORK, NO VENDOR, NO DATABASE. The collections are in-memory fakes that
 * model the compound unique index, which is what makes the reservation atomic.
 *
 * Usage:  node scripts/verifyAutoCoApplicantCibil.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { startCoApplicantCibil } from "../services/applicationService.js";
import { fetchCoApplicantCibil } from "../services/coApplicantCibilService.js";
import { classifyRetryability } from "../services/xalerCibilService.js";

let passed = 0;
const acheck = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
};

/* ── fakes ─────────────────────────────────────────────────────────────── */

const APP_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const APPLICANT_PAN = "AAAAA1111A";
const CO_PAN = "BBBBB2222B";

/** A CibilReport collection that enforces { applicationId, subjectPan } unique. */
const fakeReports = () => {
  const rows = [];
  return {
    rows,
    async findOneAndUpdate(filter, _update, opts) {
      const key = (r) =>
        String(r.applicationId) === String(filter.applicationId) &&
        r.subjectPan === filter.subjectPan;
      const existing = rows.find(key);
      if (existing) return opts?.includeResultMetadata ? { value: existing } : existing;
      const row = {
        _id: `r${rows.length + 1}`,
        applicationId: filter.applicationId,
        subjectPan: filter.subjectPan,
        createdAt: new Date(),
      };
      rows.push(row);
      return opts?.includeResultMetadata ? { value: null } : null;
    },
    async findOne(filter) {
      return (
        rows.find(
          (r) =>
            String(r.applicationId) === String(filter.applicationId) &&
            r.subjectPan === filter.subjectPan
        ) || null
      );
    },
    async deleteOne(filter) {
      const i = rows.findIndex((r) => String(r._id) === String(filter._id));
      if (i !== -1) rows.splice(i, 1);
      return { deletedCount: i === -1 ? 0 : 1 };
    },
    async updateOne(filter, update) {
      const row = rows.find((r) => String(r._id) === String(filter._id));
      if (row) Object.assign(row, update.$set || {});
      return { modifiedCount: row ? 1 : 0 };
    },
  };
};

/** An application with an applicant summary already stored, as after the applicant flow. */
const makeApp = (over = {}) => ({
  _id: APP_ID,
  formId: "FORM-1",
  status: "pending",
  workflowStage: "pending cibil",
  applicant: { name: "A", panNo: APPLICANT_PAN },
  coApplicant: { name: "B", panNo: CO_PAN },
  cibil: { score: 800, subjectPan: APPLICANT_PAN, state: "" },
  cibilSubjects: [{ subjectPan: APPLICANT_PAN, score: 800, state: "" }],
  ...over,
});

const okVendor = (score = 640) => async () => ({
  ok: true,
  extracted: { score, status: "success", requestId: "req-1", reportDate: "2026-01-01" },
  raw: { any: "payload" },
  request: { pan_id: "redacted" },
});

/** Model stand-in whose schema declares cibilSubjects, capturing writes. */
const makeModel = (app) => {
  const writes = [];
  return {
    writes,
    schema: { path: (n) => (n === "cibilSubjects" ? {} : undefined) },
    collection: {
      async updateOne(filter, update) {
        writes.push({ filter, update });
        Object.assign(app, update.$set || {});
        return { modifiedCount: 1 };
      },
    },
  };
};

const baseDeps = ({ app, reports, vendor, hist } = {}) => {
  const application = app || makeApp();
  const Model = makeModel(application);
  const events = [];
  return {
    app: application,
    Model,
    events,
    deps: {
      findApplication: async () => ({ doc: application, Model }),
      reports: reports || fakeReports(),
      fetchReport: vendor || okVendor(),
      loadConfig: async () => ({ apiUrl: "https://vendor.invalid" }),
      history: async (e) => {
        events.push(e);
        if (hist) hist(e);
      },
      saveRawFile: async () => "path/raw.json",
      now: () => Date.now(),
      actor: "System (automatic)",
    },
  };
};

/* ── 1 · the orchestration seam ────────────────────────────────────────── */

console.log("application creation — the automatic trigger");

await acheck("1 · applicant + co-applicant + PAN → the co-applicant fetch is started", async () => {
  const calls = [];
  await startCoApplicantCibil(APP_ID, {
    fetchCoApplicant: async (id, opts) => {
      calls.push({ id, opts });
      return { ok: true, status: "fetched", score: 640 };
    },
    log: () => {},
  });
  assert.equal(calls.length, 1, "the service is invoked exactly once");
  assert.equal(calls[0].id, APP_ID);
  assert.match(calls[0].opts.actor, /System/, "the automatic path identifies itself as the actor");
});

await acheck("2 · applicant only → the service decides, and no vendor call happens", async () => {
  const t = baseDeps({ app: makeApp({ coApplicant: undefined }) });
  let vendorCalls = 0;
  t.deps.fetchReport = async () => { vendorCalls += 1; return { ok: true }; };
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "no_co_applicant");
  assert.equal(vendorCalls, 0, "no bureau request for an application with no co-applicant");
  assert.equal(t.events.length, 0, "and nothing is written to the timeline");
});

await acheck("3 · co-applicant without a PAN → no Xaler call, no reservation", async () => {
  const reports = fakeReports();
  const t = baseDeps({ app: makeApp({ coApplicant: { name: "B" } }), reports });
  let vendorCalls = 0;
  t.deps.fetchReport = async () => { vendorCalls += 1; return { ok: true }; };
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "missing_pan");
  assert.equal(vendorCalls, 0, "no paid request without a PAN to key it on");
  assert.equal(reports.rows.length, 0, "and no reservation row is left behind");
});

await acheck("4 · a co-applicant failure cannot fail the caller", async () => {
  // The property that matters is that the promise SETTLES rather than
  // rejecting: an unhandled rejection here would surface in the submit path.
  // Every shape the service could produce, plus two it never should.
  for (const behaviour of [
    async () => { throw new Error("socket hang up"); },
    async () => ({ ok: false, status: "vendor_failed" }),
    async () => ({ ok: false, status: "not_retryable" }),
    async () => null,
    () => { throw new Error("threw synchronously"); },
  ]) {
    let rejected = false;
    await startCoApplicantCibil(APP_ID, {
      fetchCoApplicant: behaviour,
      log: () => {},
      onError: () => {},
    }).catch(() => { rejected = true; });
    assert.equal(rejected, false, "resolves — never rejects into the caller");
  }
});

await acheck("4b · a throwing logger still cannot escape", async () => {
  const out = await startCoApplicantCibil(APP_ID, {
    fetchCoApplicant: async () => ({ ok: true, status: "fetched" }),
    log: () => { throw new Error("log sink down"); },
    onError: () => {},
  });
  assert.equal(out.status, "error");
});

await acheck("5 · creation does not wait for the vendor response", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let settled = false;

  const promise = startCoApplicantCibil(APP_ID, {
    fetchCoApplicant: async () => { await gate; return { ok: true, status: "fetched" }; },
    log: () => {},
  });
  promise.then(() => { settled = true; });

  // Let every already-queued microtask run. A blocking implementation would
  // have completed by now; a detached one is still waiting on the vendor.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(settled, false, "still pending while the vendor is slow");

  release();
  await promise;
  assert.equal(settled, true, "and completes once the vendor answers");
});

/**
 * Source assertions must read CODE, not prose. The comments in these files
 * legitimately discuss processApplicationCibil and requireSuperAdmin, and a
 * naive substring search would match the explanation rather than the call.
 */
const codeOf = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments
    .replace(/^[ \t]*\/\/.*$/gm, "")     // whole-line // comments
    .replace(/\/\/.*$/gm, "");           // trailing // comments

await acheck("6 · the applicant flow is untouched by this change", () => {
  const code = codeOf("../services/applicationService.js");
  assert.match(code, /const cibilOutcome = await processApplicationCibil\(created\);/,
    "the applicant call site is unchanged and still awaited");
  assert.equal((code.match(/processApplicationCibil/g) || []).length, 2,
    "imported and called once — not duplicated or wrapped");
  assert.doesNotMatch(code, /fetchCibilReport/, "no second Xaler request builder");
  assert.doesNotMatch(code, /await startCoApplicantCibil/, "the co-applicant call is not awaited");
  assert.ok(
    code.indexOf("startCoApplicantCibil(created._id)") >
      code.indexOf("await processApplicationCibil(created)"),
    "co-applicant is sequenced after the applicant flow, not alongside it"
  );
});

await acheck("6b · the protected HTTP route is not called internally", () => {
  const code = codeOf("../services/applicationService.js");
  assert.doesNotMatch(code, /co-applicant\/fetch/, "no internal HTTP call");
  assert.doesNotMatch(code, /axios|node-fetch|supertest/, "no HTTP client introduced");
  assert.doesNotMatch(code, /requireSuperAdmin/, "auth middleware neither imported nor bypassed");
  assert.match(code, /from "\.\/coApplicantCibilService\.js"/, "the service is called directly");
});

/* ── 2 · duplicate and race ────────────────────────────────────────────── */

console.log("\nduplicate and race protection");

await acheck("7 · same application + same PAN → one vendor call", async () => {
  const reports = fakeReports();
  const app = makeApp();
  let vendorCalls = 0;
  const count = async (...a) => { vendorCalls += 1; return okVendor()(...a); };

  const a = baseDeps({ app, reports, vendor: count });
  await fetchCoApplicantCibil(APP_ID, a.deps);
  const b = baseDeps({ app, reports, vendor: count });
  const second = await fetchCoApplicantCibil(APP_ID, b.deps);

  assert.equal(vendorCalls, 1, "the second attempt must not be a second paid request");
  assert.equal(second.status, "already_exists");
});

await acheck("8 · concurrent automatic triggers → one vendor call", async () => {
  const reports = fakeReports();
  const app = makeApp();
  let vendorCalls = 0;
  const slow = async (...a) => {
    vendorCalls += 1;
    await new Promise((r) => setTimeout(r, 5));
    return okVendor()(...a);
  };
  const mk = () => baseDeps({ app, reports, vendor: slow }).deps;

  const [x, y] = await Promise.all([
    fetchCoApplicantCibil(APP_ID, mk()),
    fetchCoApplicantCibil(APP_ID, mk()),
  ]);

  assert.equal(vendorCalls, 1, "the unique index arbitrates — only the holder calls the vendor");
  const statuses = [x.status, y.status].sort();
  assert.deepEqual(statuses, ["fetched", "in_progress"].sort());
});

await acheck("9 · a different application is allowed", async () => {
  const reports = fakeReports();
  let vendorCalls = 0;
  const count = async (...a) => { vendorCalls += 1; return okVendor()(...a); };

  const a = baseDeps({ app: makeApp(), reports, vendor: count });
  await fetchCoApplicantCibil(APP_ID, a.deps);

  const other = makeApp({ _id: "bbbbbbbbbbbbbbbbbbbbbbbb", formId: "FORM-2" });
  const b = baseDeps({ app: other, reports, vendor: count });
  const out = await fetchCoApplicantCibil(String(other._id), b.deps);

  assert.equal(out.status, "fetched");
  assert.equal(vendorCalls, 2, "a different application is a different subject row");
});

await acheck("10 · a different subject on the same application is allowed", async () => {
  const reports = fakeReports();
  const app = makeApp();
  let vendorCalls = 0;
  const count = async (...a) => { vendorCalls += 1; return okVendor()(...a); };

  const a = baseDeps({ app, reports, vendor: count });
  await fetchCoApplicantCibil(APP_ID, a.deps);

  // The co-applicant is replaced by a different person on the same application.
  app.coApplicant = { name: "C", panNo: "CCCCC3333C" };
  const b = baseDeps({ app, reports, vendor: count });
  const out = await fetchCoApplicantCibil(APP_ID, b.deps);

  assert.equal(out.status, "fetched");
  assert.equal(vendorCalls, 2);
  assert.equal(reports.rows.length, 2, "one row per subject, not per application");
});

await acheck("11 · a completed report is not mistaken for a reservation", async () => {
  const reports = fakeReports();
  const app = makeApp();
  const a = baseDeps({ app, reports });
  await fetchCoApplicantCibil(APP_ID, a.deps);

  // Age the completed row well past the staleness window.
  reports.rows[0].createdAt = new Date(Date.now() - 60 * 60 * 1000);

  const b = baseDeps({ app, reports });
  const out = await fetchCoApplicantCibil(APP_ID, b.deps);
  assert.equal(out.status, "already_exists", "an old COMPLETED report is never reclaimed");
  assert.equal(reports.rows.length, 1);
});

await acheck("12 · a failed reservation is released", async () => {
  const reports = fakeReports();
  const t = baseDeps({
    reports,
    vendor: async () => ({ ok: false, reason: "nope", retryability: "not_retryable" }),
  });
  await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(reports.rows.length, 0, "no empty row is left to block a later attempt");
});

/* ── 3 · storage and applicant isolation ───────────────────────────────── */

console.log("\nstorage and applicant isolation");

await acheck("13 · the report is stored under applicationId + normalised co-applicant PAN", async () => {
  const reports = fakeReports();
  // Messy casing/whitespace on the stored record must still normalise.
  const app = makeApp({ coApplicant: { name: "B", panNo: `  ${CO_PAN.toLowerCase()} ` } });
  const t = baseDeps({ app, reports });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);

  assert.equal(out.status, "fetched");
  assert.equal(reports.rows.length, 1);
  assert.equal(reports.rows[0].subjectPan, CO_PAN, "normalised, upper-case");
  assert.equal(String(reports.rows[0].applicationId), APP_ID);
});

await acheck("14 · the summary is added to cibilSubjects", async () => {
  const app = makeApp();
  const t = baseDeps({ app });
  await fetchCoApplicantCibil(APP_ID, t.deps);

  const entry = app.cibilSubjects.find((e) => e.subjectPan === CO_PAN);
  assert.ok(entry, "a co-applicant entry exists");
  assert.equal(entry.score, 640);
});

await acheck("15 · Application.cibil — the applicant's — is untouched", async () => {
  const app = makeApp();
  const before = JSON.stringify(app.cibil);
  const t = baseDeps({ app });
  await fetchCoApplicantCibil(APP_ID, t.deps);

  assert.equal(JSON.stringify(app.cibil), before, "byte-identical");
  // And no write anywhere in the flow may name it.
  for (const w of t.Model.writes) {
    const keys = Object.keys(w.update.$set || {});
    assert.ok(!keys.includes("cibil"), "no write targets Application.cibil");
    assert.deepEqual(keys, ["cibilSubjects"], "the only field written is cibilSubjects");
  }
});

await acheck("16 · the applicant's cibilSubjects entry survives unchanged", async () => {
  const app = makeApp();
  const t = baseDeps({ app });
  await fetchCoApplicantCibil(APP_ID, t.deps);

  const applicantEntry = app.cibilSubjects.find((e) => e.subjectPan === APPLICANT_PAN);
  assert.ok(applicantEntry, "still present — not clobbered by the co-applicant write");
  assert.equal(applicantEntry.score, 800);
});

await acheck("17 · no duplicate subject entries", async () => {
  const reports = fakeReports();
  const app = makeApp();
  await fetchCoApplicantCibil(APP_ID, baseDeps({ app, reports }).deps);
  await fetchCoApplicantCibil(APP_ID, baseDeps({ app, reports }).deps);

  const pans = app.cibilSubjects.map((e) => e.subjectPan);
  assert.equal(new Set(pans).size, pans.length, "one entry per subjectPan");
  assert.equal(pans.filter((p) => p === CO_PAN).length, 1);
});

await acheck("subjects are matched by PAN, never by position or role", async () => {
  // The co-applicant sits FIRST in the list and the applicant second; a
  // position-based implementation would overwrite the wrong one.
  const app = makeApp({
    cibilSubjects: [
      { subjectPan: CO_PAN, score: null, state: "pending" },
      { subjectPan: APPLICANT_PAN, score: 800, state: "" },
    ],
  });
  await fetchCoApplicantCibil(APP_ID, baseDeps({ app }).deps);

  assert.equal(app.cibilSubjects.find((e) => e.subjectPan === APPLICANT_PAN).score, 800);
  assert.equal(app.cibilSubjects.find((e) => e.subjectPan === CO_PAN).score, 640);
});

/* ── 4 · business safety ───────────────────────────────────────────────── */

console.log("\nbusiness safety");

await acheck("18 + 19 · status and workflow stage are unchanged", async () => {
  const app = makeApp();
  const t = baseDeps({ app });
  await fetchCoApplicantCibil(APP_ID, t.deps);

  assert.equal(app.status, "pending");
  assert.equal(app.workflowStage, "pending cibil");
  for (const w of t.Model.writes) {
    const keys = Object.keys(w.update.$set || {});
    for (const forbidden of ["status", "workflowStage", "eligibility", "approval", "rejection"]) {
      assert.ok(!keys.includes(forbidden), `no write touches ${forbidden}`);
    }
  }
});

await acheck("20 · a low co-applicant score does not reject the application", async () => {
  const app = makeApp();
  const t = baseDeps({ app, vendor: okVendor(410) });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);

  assert.equal(out.status, "fetched");
  assert.equal(app.status, "pending", "still pending — no auto-reject on the co-applicant");
  assert.equal(app.workflowStage, "pending cibil");
  assert.equal(app.cibilSubjects.find((e) => e.subjectPan === CO_PAN).score, 410);
});

/* ── 5 · failure behaviour ─────────────────────────────────────────────── */

console.log("\nfailure behaviour");

await acheck("21 · Xaler 400 no-credit-record → not_retryable (the 2B.7 rule holds)", async () => {
  const NO_RECORD = { status: "error", error_code: "NO_CREDIT_RECORD", retryable: true };
  assert.equal(classifyRetryability({ data: NO_RECORD, httpStatus: 400 }), "not_retryable",
    "the vendor's retryable:true must not outrank a 400");

  const reports = fakeReports();
  const t = baseDeps({
    reports,
    vendor: async () => ({
      ok: false,
      reason: "no credit record matching the identity details supplied",
      retryability: classifyRetryability({ data: NO_RECORD, httpStatus: 400 }),
    }),
  });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "not_retryable");
  assert.equal(out.retryable, false);
  assert.equal(reports.rows.length, 0, "reservation released");
});

await acheck("22 · 5xx / 429 / timeout classify as retryable, 400 does not", async () => {
  for (const s of [500, 502, 503, 504, 429]) {
    assert.equal(classifyRetryability({ data: {}, httpStatus: s }), "retryable", `HTTP ${s}`);
  }
  assert.equal(classifyRetryability({ transport: true }), "retryable", "timeout");
  assert.equal(classifyRetryability({ data: {}, httpStatus: 400 }), "not_retryable");

  const t = baseDeps({
    vendor: async () => ({ ok: false, reason: "upstream", retryability: "retryable" }),
  });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "vendor_failed");
  assert.equal(out.retryable, true);
});

await acheck("23 · a vendor throw releases the reservation", async () => {
  const reports = fakeReports();
  const t = baseDeps({ reports, vendor: async () => { throw new Error("socket hang up"); } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.ok, false);
  assert.equal(reports.rows.length, 0);
});

await acheck("24 · a malformed response releases the reservation", async () => {
  for (const bad of [null, undefined, {}, { ok: false }, { ok: true, extracted: null }]) {
    const reports = fakeReports();
    const t = baseDeps({ reports, vendor: async () => bad });
    const out = await fetchCoApplicantCibil(APP_ID, t.deps);
    assert.ok(out && typeof out === "object", "an outcome is always returned");
    if (!out.ok) assert.equal(reports.rows.length, 0, `reservation released for ${JSON.stringify(bad)}`);
  }
});

await acheck("25 · no stale reservation survives a failure, so a retry is possible", async () => {
  const reports = fakeReports();
  const app = makeApp();
  await fetchCoApplicantCibil(APP_ID, baseDeps({
    app, reports, vendor: async () => ({ ok: false, reason: "x", retryability: "retryable" }),
  }).deps);
  assert.equal(reports.rows.length, 0);

  // A later attempt is not blocked by the failed one.
  const out = await fetchCoApplicantCibil(APP_ID, baseDeps({ app, reports }).deps);
  assert.equal(out.status, "fetched");
});

/* ── 6 · audit ─────────────────────────────────────────────────────────── */

console.log("\naudit history");

await acheck("26 + 27 · requested and fetched events are recorded", async () => {
  const t = baseDeps();
  await fetchCoApplicantCibil(APP_ID, t.deps);
  const types = t.events.map((e) => e.actionType);
  assert.ok(types.includes("CO_APPLICANT_CIBIL_FETCH_REQUESTED"));
  assert.ok(types.includes("CO_APPLICANT_CIBIL_FETCHED"));
  // The model's field is actionType, not action.
  for (const e of t.events) {
    assert.ok(e.actionType, "every entry uses actionType");
    assert.equal(e.action, undefined, "and never `action`");
  }
});

await acheck("28 · a failure event is recorded with its category", async () => {
  const t = baseDeps({
    vendor: async () => ({ ok: false, reason: "no credit record", retryability: "not_retryable" }),
  });
  await fetchCoApplicantCibil(APP_ID, t.deps);
  const failed = t.events.find((e) => e.actionType === "CO_APPLICANT_CIBIL_FETCH_FAILED");
  assert.ok(failed, "the failure is on the timeline");
  assert.match(failed.remarks, /not_retryable/);
});

await acheck("29 · no sensitive value reaches the timeline", async () => {
  const t = baseDeps({
    app: makeApp({ coApplicant: { name: "Sensitive Name", panNo: CO_PAN, aadharNo: "123456789012", dateOfBirth: "1975-07-05" } }),
    vendor: async () => ({
      ok: false,
      reason: `PAN ${CO_PAN} / aadhaar 123456789012 / dob 1975-07-05 not found`,
      retryability: "not_retryable",
    }),
  });
  await fetchCoApplicantCibil(APP_ID, t.deps);

  const blob = JSON.stringify(t.events);
  assert.ok(!blob.includes(CO_PAN), "no PAN");
  assert.ok(!blob.includes("123456789012"), "no Aadhaar");
  assert.ok(!blob.includes("1975-07-05"), "no DOB");
  assert.ok(!blob.includes("Sensitive Name"), "no name");
  assert.match(blob, /\[PAN\]/, "redacted instead");
});

await acheck("the automatic actor is recorded, and the remark does not contradict it", async () => {
  const t = baseDeps();
  await fetchCoApplicantCibil(APP_ID, t.deps);
  const requested = t.events.find((e) => e.actionType === "CO_APPLICANT_CIBIL_FETCH_REQUESTED");
  assert.equal(requested.updatedBy, "System (automatic)");
  assert.doesNotMatch(requested.remarks, /by admin/,
    "an automatic fetch must not be recorded as an admin action");
});

/* ── 7 · the manual endpoint is untouched ──────────────────────────────── */

console.log("\nmanual Super Admin fallback still guarded");

await acheck("the route still requires a super admin", () => {
  const routes = readFileSync(
    new URL("../routes/cibilReportRoutes.js", import.meta.url), "utf8"
  );
  assert.match(routes, /co-applicant\/fetch/, "the manual endpoint still exists");
  assert.match(routes, /protect[\s\S]{0,80}requireSuperAdmin/, "still behind protect + requireSuperAdmin");
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
    (process.exitCode ? "" : ", 0 failures")
);
