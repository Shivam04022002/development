/**
 * verifyCoApplicantCibilFetch.mjs
 *
 * Verification for the on-demand co-applicant CIBIL fetch (Phase 2B.4).
 * Standalone assert script, matching verifyCibilMapping.js and the other
 * verify* scripts; this package has no test runner.
 *
 * NO DATABASE. NO XALER. NO NETWORK. Every collaborator is injected: the
 * service takes its report collection, vendor client, config loader and history
 * writer as parameters, so the whole path runs against fakes.
 *
 * ── On the concurrency test ────────────────────────────────────────────────
 * The race is exercised for real, not asserted by fiat. The fake collection
 * below implements the SAME atomic semantics the production compound unique
 * index provides: findOneAndUpdate+upsert is serialised, returns the pre-image,
 * and a second insert on the same { applicationId, subjectPan } is rejected
 * with code 11000. Two concurrent callers are then run through the actual
 * service and the vendor mock counts its own invocations.
 *
 * Documented limitation: this proves the SERVICE uses the reservation
 * correctly. It cannot prove MongoDB's index behaves as modelled — that is a
 * property of the database, verified in production by the index itself.
 *
 * Usage:  node scripts/verifyCoApplicantCibilFetch.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { requireSuperAdmin } from "../middleware/authMiddleware.js";
import {
  fetchCoApplicantCibil,
  isCompletedReport,
  isStaleReservation,
  consentStatus,
  STALE_RESERVATION_MS,
} from "../services/coApplicantCibilService.js";

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

/** Minimal Express-ish res, enough to observe status/json from middleware. */
const fakeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const APP_ID = "app-1";
const PAN_APPLICANT = "ABCDE1234F";
const PAN_COAPP = "ZZZZZ9999Z";

/* ── Fake report collection with real atomic-uniqueness semantics ─────────── */
const fakeReports = (seed = []) => {
  const rows = seed.map((r) => ({ createdAt: new Date(), rawResponse: null, rawRequest: null, requestId: "", rawResponsePath: "", ...r }));
  let seq = 0;
  const key = (r) => `${String(r.applicationId)}::${r.subjectPan}`;
  const findRow = (f) =>
    rows.find(
      (r) =>
        (f._id === undefined || String(r._id) === String(f._id)) &&
        (f.applicationId === undefined || String(r.applicationId) === String(f.applicationId)) &&
        (f.subjectPan === undefined || r.subjectPan === f.subjectPan)
    ) || null;

  return {
    rows,
    async findOne(f) { return findRow(f); },
    async findOneAndUpdate(filter, update, opts = {}) {
      const existing = findRow(filter);
      if (existing) return existing;                    // pre-image (new:false)
      if (!opts.upsert) return null;
      const doc = { _id: `rep-${++seq}`, createdAt: new Date(), rawResponse: null, rawRequest: null, requestId: "", rawResponsePath: "", ...(update.$setOnInsert || {}) };
      // The unique index: a duplicate key can never be inserted.
      if (rows.some((r) => key(r) === key(doc))) { const e = new Error("E11000 duplicate key"); e.code = 11000; throw e; }
      rows.push(doc);
      return null;                                      // null pre-image = we inserted
    },
    async updateOne(filter, update) {
      const row = findRow(filter);
      if (row) Object.assign(row, update.$set || {});
      return { matchedCount: row ? 1 : 0 };
    },
    async deleteOne(filter) {
      const i = rows.findIndex(
        (r) =>
          String(r._id) === String(filter._id) &&
          (filter.requestId === undefined || r.requestId === filter.requestId) &&
          (filter.rawResponse === undefined || r.rawResponse === filter.rawResponse) &&
          (filter.rawRequest === undefined || r.rawRequest === filter.rawRequest) &&
          (filter.rawResponsePath === undefined || r.rawResponsePath === filter.rawResponsePath)
      );
      if (i >= 0) rows.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
  };
};

/** Fake Application document + model. */
const fakeApp = (over = {}) => {
  const doc = {
    _id: APP_ID,
    formId: "FORM-1",
    applicant: { panNo: PAN_APPLICANT, name: "Applicant One" },
    coApplicant: { panNo: PAN_COAPP, name: "Co Applicant", dateOfBirth: "1980-01-01", mobile: "9990001111" },
    cibil: { subjectPan: PAN_APPLICANT, score: 774, requestId: "tu_applicant" },
    cibilSubjects: [{ subjectPan: PAN_APPLICANT, score: 774 }],
    ...over,
  };
  const writes = [];
  const Model = {
    schema: { path: (p) => (p === "cibilSubjects" ? {} : null) },
    collection: { async updateOne(f, u) { writes.push(u.$set); Object.assign(doc, u.$set); return { matchedCount: 1 }; } },
  };
  return { doc, Model, writes };
};

const okVendor = (score = 640) => {
  const calls = [];
  return {
    calls,
    fn: async (party, config) => {
      calls.push({ party, config });
      return {
        ok: true,
        extracted: { score, status: "success", reportDate: "2026-08-11", requestId: `tu_co_${calls.length}`, reportUrl: "" },
        raw: { status: "success", score },
        request: { pan_id: party.panNo },
      };
    },
  };
};

const baseDeps = (over = {}) => {
  const app = over.app || fakeApp();
  const vendor = over.vendor || okVendor();
  const reports = over.reports || fakeReports();
  const hist = [];
  return {
    app,
    vendor,
    reports,
    hist,
    deps: {
      findApplication: async () => (over.notFound ? null : { doc: app.doc, Model: app.Model }),
      reports,
      fetchReport: vendor.fn,
      loadConfig: async () => ({ apiUrl: "https://vendor.example/api", apiKey: "k" }),
      history: async (e) => { hist.push(e.actionType); },
      saveRawFile: async () => "applications/FORM-1/cibil/raw-response-Z.json",
      ...(over.deps || {}),
    },
  };
};

console.log("happy path");

// Test 1 + 8 + 11
await acheck("no existing report → reserves, calls Xaler once, saves under co-applicant", async () => {
  const t = baseDeps();
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.ok, true);
  assert.equal(out.status, "fetched");
  assert.equal(out.subject, "coApplicant");
  assert.equal(out.subjectPan, PAN_COAPP);
  assert.equal(t.vendor.calls.length, 1, "exactly one vendor call");
  const saved = t.reports.rows.find((r) => r.subjectPan === PAN_COAPP);
  assert.ok(saved, "report stored");
  assert.equal(String(saved.applicationId), APP_ID);
  assert.equal(saved.requestId, "tu_co_1");
});

await acheck("summary lands in cibilSubjects, keyed by the co-applicant", async () => {
  const t = baseDeps();
  await fetchCoApplicantCibil(APP_ID, t.deps);
  const list = t.app.doc.cibilSubjects;
  assert.equal(list.length, 2, "applicant entry kept, co-applicant added");
  assert.ok(list.some((e) => e.subjectPan === PAN_COAPP && e.score === 640));
  assert.ok(list.some((e) => e.subjectPan === PAN_APPLICANT && e.score === 774));
});

// Test 2 + 9 + 10
await acheck("applicant report and Application.cibil are untouched", async () => {
  const t = baseDeps({ reports: fakeReports([{ _id: "rep-applicant", applicationId: APP_ID, subjectPan: PAN_APPLICANT, requestId: "tu_applicant", rawResponse: { a: 1 } }]) });
  const applicantBefore = JSON.stringify(t.reports.rows[0]);
  const cibilBefore = JSON.stringify(t.app.doc.cibil);
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.ok, true, "co-applicant fetch still allowed");
  assert.equal(JSON.stringify(t.reports.rows[0]), applicantBefore, "applicant report byte-identical");
  assert.equal(JSON.stringify(t.app.doc.cibil), cibilBefore, "Application.cibil byte-identical");
  assert.equal(t.reports.rows.length, 2, "both reports coexist");
});

console.log("\nduplicate and concurrency");

// Test 3
await acheck("co-applicant report already exists → Xaler NOT called", async () => {
  const t = baseDeps({ reports: fakeReports([{ _id: "rep-co", applicationId: APP_ID, subjectPan: PAN_COAPP, requestId: "tu_existing" }]) });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "already_exists");
  assert.equal(t.vendor.calls.length, 0, "no vendor call");
});

// Test 4 · the real race
await acheck("two CONCURRENT fetches → exactly one reservation, exactly one Xaler call", async () => {
  const app = fakeApp();
  const reports = fakeReports();
  const vendor = okVendor();
  const mk = () => baseDeps({ app, reports, vendor }).deps;
  const [a, b] = await Promise.all([
    fetchCoApplicantCibil(APP_ID, mk()),
    fetchCoApplicantCibil(APP_ID, mk()),
  ]);
  assert.equal(vendor.calls.length, 1, `exactly one vendor call, got ${vendor.calls.length}`);
  const winners = [a, b].filter((r) => r.ok);
  const losers = [a, b].filter((r) => !r.ok);
  assert.equal(winners.length, 1, "exactly one winner");
  assert.equal(losers.length, 1, "exactly one loser");
  assert.ok(["in_progress", "already_exists"].includes(losers[0].status), `loser status was ${losers[0].status}`);
  assert.equal(reports.rows.filter((r) => r.subjectPan === PAN_COAPP).length, 1, "one row only");
});

// Test 19
await acheck("a live reservation held by someone else → in_progress, no Xaler call", async () => {
  const t = baseDeps({ reports: fakeReports([{ _id: "resv", applicationId: APP_ID, subjectPan: PAN_COAPP, createdAt: new Date() }]) });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "in_progress");
  assert.equal(t.vendor.calls.length, 0);
});

await acheck("a STALE reservation is reclaimed and the fetch proceeds", async () => {
  const old = new Date(Date.now() - STALE_RESERVATION_MS - 60_000);
  const t = baseDeps({ reports: fakeReports([{ _id: "resv-old", applicationId: APP_ID, subjectPan: PAN_COAPP, createdAt: old }]) });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.ok, true, "a crashed reservation must not block forever");
  assert.equal(t.vendor.calls.length, 1);
});

console.log("\nfailure handling");

// Test 5 + 20
await acheck("Xaler failure → reservation released, no report, retry works", async () => {
  const reports = fakeReports();
  const app = fakeApp();
  let attempt = 0;
  const vendor = { calls: [], fn: async (p, c) => { vendor.calls.push(1); attempt += 1; return attempt === 1 ? { ok: false, reason: "Waiting for CIBIL Response" } : { ok: true, extracted: { score: 700, requestId: "tu_retry" }, raw: {}, request: {} }; } };
  const first = await fetchCoApplicantCibil(APP_ID, baseDeps({ app, reports, vendor }).deps);
  assert.equal(first.status, "vendor_failed");
  assert.equal(first.retryable, true);
  assert.equal(reports.rows.length, 0, "reservation released — no stuck row");
  const second = await fetchCoApplicantCibil(APP_ID, baseDeps({ app, reports, vendor }).deps);
  assert.equal(second.ok, true, "retry succeeds after a released reservation");
  assert.equal(vendor.calls.length, 2);
});

// Test 17
await acheck("vendor timeout is a failure, not a low score or rejection", async () => {
  const t = baseDeps({ vendor: { calls: [], fn: async () => ({ ok: false, unavailable: true, reason: "Waiting for CIBIL Response" }) } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "vendor_failed");
  assert.equal(out.score, undefined, "no score is implied");
  assert.notEqual(out.status, "rejected");
});

// Test 18
await acheck("malformed vendor response → failure, reservation released", async () => {
  const reports = fakeReports();
  const t = baseDeps({ reports, vendor: { calls: [], fn: async () => ({ ok: false, invalid: true, reason: "CIBIL score missing in response" }) } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "vendor_failed");
  assert.equal(reports.rows.length, 0);
});

await acheck("a vendor that throws is contained and releases the reservation", async () => {
  const reports = fakeReports();
  const t = baseDeps({ reports, vendor: { calls: [], fn: async () => { throw new Error("socket hang up"); } } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.ok, false);
  assert.equal(out.status, "vendor_failed");
  assert.equal(reports.rows.length, 0, "no stuck reservation");
});

console.log("\nvalidation");

// Test 6
await acheck("co-applicant without PAN → no reservation, no Xaler, validation error", async () => {
  const reports = fakeReports();
  const t = baseDeps({ app: fakeApp({ coApplicant: { name: "No Pan", form60: "img.jpg" } }), reports });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "missing_pan");
  assert.equal(t.vendor.calls.length, 0);
  assert.equal(reports.rows.length, 0, "no placeholder row created");
  assert.match(out.message, /Form 60/, "explains Form 60 is not a substitute");
});

// Test 16
await acheck("no co-applicant at all → no_co_applicant, no Xaler", async () => {
  const t = baseDeps({ app: fakeApp({ coApplicant: {} }) });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "no_co_applicant");
  assert.equal(t.vendor.calls.length, 0);
});

// Test 15
await acheck("application not found → not_found, no Xaler", async () => {
  const t = baseDeps({ notFound: true });
  const out = await fetchCoApplicantCibil("missing", t.deps);
  assert.equal(out.status, "not_found");
  assert.equal(t.vendor.calls.length, 0);
});

await acheck("CIBIL not configured → not_configured, no Xaler", async () => {
  const t = baseDeps({ deps: { loadConfig: async () => null } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "not_configured");
  assert.equal(t.vendor.calls.length, 0);
});

// Test 7
await acheck("co-applicant PAN is normalised to the canonical subject key", async () => {
  const t = baseDeps({ app: fakeApp({ coApplicant: { panNo: "  zzzzz9999z  ", name: "Co" } }) });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.subjectPan, PAN_COAPP, "trimmed and upper-cased");
  assert.equal(t.reports.rows[0].subjectPan, PAN_COAPP, "stored canonically");
});

await acheck("legacy nested co-applicant shape resolves to the same subject", async () => {
  const t = baseDeps({ app: fakeApp({ coApplicant: { applicant: { panNo: PAN_COAPP, name: "Co" } } }) });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.subjectPan, PAN_COAPP);
});

console.log("\nbusiness logic untouched");

// Tests 12 + 13
await acheck("no auto-reject, no workflowStage change, no status change", async () => {
  const t = baseDeps({ app: fakeApp({ status: "pending", workflowStage: "contact creation" }) });
  await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(t.app.doc.status, "pending");
  assert.equal(t.app.doc.workflowStage, "contact creation");
  assert.ok(!t.app.writes.some((w) => "status" in w || "workflowStage" in w || "cibil" in w),
    "only cibilSubjects is written");
});

await acheck("a low co-applicant score does NOT reject the application", async () => {
  const t = baseDeps({ app: fakeApp({ status: "pending" }), vendor: okVendor(420) });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.ok, true);
  assert.equal(out.score, 420);
  assert.equal(t.app.doc.status, "pending", "still pending — data acquisition only");
});

await acheck("ApprovedApplication (no cibilSubjects) stores the report, skips the mirror", async () => {
  const app = fakeApp();
  app.Model.schema.path = () => null; // approved: field not declared
  const t = baseDeps({ app });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.ok, true);
  assert.equal(out.summaryMirrored, false);
  assert.equal(t.app.writes.length, 0, "no write forced through the driver");
  assert.ok(t.reports.rows.some((r) => r.subjectPan === PAN_COAPP), "report still stored");
});

console.log("\naudit trail");

await acheck("records requested + fetched history events", async () => {
  const t = baseDeps();
  await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.ok(t.hist.includes("CO_APPLICANT_CIBIL_FETCH_REQUESTED"));
  assert.ok(t.hist.includes("CO_APPLICANT_CIBIL_FETCHED"));
});

await acheck("records a failure event and no success event", async () => {
  const t = baseDeps({ vendor: { calls: [], fn: async () => ({ ok: false, reason: "boom" }) } });
  await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.ok(t.hist.includes("CO_APPLICANT_CIBIL_FETCH_FAILED"));
  assert.ok(!t.hist.includes("CO_APPLICANT_CIBIL_FETCHED"));
});

console.log("\nauthorization (Test 14)");

// The endpoint is Super Admin only. requireSuperAdmin is the real middleware,
// exercised directly with fake req/res — no server and no network.
await acheck("requireSuperAdmin admits a super admin", async () => {
  let nexted = false;
  requireSuperAdmin({ admin: { role: "superadmin" } }, fakeRes(), () => { nexted = true; });
  assert.equal(nexted, true);
});

await acheck("a normal admin is refused 403", async () => {
  const res = fakeRes();
  let nexted = false;
  requireSuperAdmin({ admin: { role: "admin" } }, res, () => { nexted = true; });
  assert.equal(nexted, false, "must not reach the handler");
  assert.equal(res.statusCode, 403);
});

await acheck("an unauthenticated caller is refused 401", async () => {
  const res = fakeRes();
  let nexted = false;
  requireSuperAdmin({}, res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 401);
});

// The case that motivated the tightening: `protect` is fail-open, so a token
// that verifies but matches no Admin document is admitted with its payload as
// req.admin and role defaulted to "admin". requireSuperAdmin still stops it.
await acheck("a fail-open token payload (role defaulted to 'admin') is refused", async () => {
  const res = fakeRes();
  let nexted = false;
  requireSuperAdmin({ admin: { id: "dealer-123", role: "admin", isSuperAdmin: false } }, res, () => { nexted = true; });
  assert.equal(nexted, false, "a non-admin bearer must never trigger a billable call");
  assert.equal(res.statusCode, 403);
});

await acheck("a dealer-shaped payload with no role at all is refused", async () => {
  const res = fakeRes();
  let nexted = false;
  requireSuperAdmin({ admin: { id: "dealer-123" } }, res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 403);
});

await acheck("the route wires protect + requireSuperAdmin before the handler", async () => {
  const src = await readFile(new URL("../routes/cibilReportRoutes.js", import.meta.url), "utf8");
  const line = src.split(/\r?\n/).join(" ").match(/co-applicant\/fetch[\s\S]{0,120}/)?.[0] || "";
  assert.match(line, /protect/, "protect must run first");
  assert.match(line, /requireSuperAdmin/, "requireSuperAdmin must gate the handler");
});

console.log("\nhelpers and consent");

await acheck("isCompletedReport distinguishes a report from a reservation", async () => {
  assert.equal(isCompletedReport({ requestId: "tu_1" }), true);
  assert.equal(isCompletedReport({ rawResponse: {} }), true);
  assert.equal(isCompletedReport({ rawResponsePath: "p.json" }), true);
  assert.equal(isCompletedReport({ requestId: "", rawResponse: null, rawRequest: null }), false);
  assert.equal(isCompletedReport(null), false);
});

await acheck("isStaleReservation only reclaims empty, old rows", async () => {
  const old = new Date(Date.now() - STALE_RESERVATION_MS - 1000);
  assert.equal(isStaleReservation({ createdAt: old, requestId: "" }), true);
  assert.equal(isStaleReservation({ createdAt: new Date(), requestId: "" }), false);
  assert.equal(isStaleReservation({ createdAt: old, requestId: "tu_1" }), false, "never reclaim a real report");
});

await acheck("consent status reports the absence of a field rather than assuming", async () => {
  const c = consentStatus();
  assert.equal(c.known, false);
  assert.match(c.reason, /no co-applicant CIBIL consent field/);
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
  (process.exitCode ? "" : ", 0 failures")
);
