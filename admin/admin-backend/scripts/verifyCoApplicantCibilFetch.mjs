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
import {
  classifyRetryability,
  extractPendingAuthentication,
} from "../services/xalerCibilService.js";

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
  // The real client now always classifies a failure; a transport exhaustion
  // ("Waiting for CIBIL Response") is retryable, which is what makes the
  // follow-up attempt below legitimate.
  const vendor = { calls: [], fn: async (p, c) => { vendor.calls.push(1); attempt += 1; return attempt === 1 ? { ok: false, reason: "Waiting for CIBIL Response", retryability: "retryable" } : { ok: true, extracted: { score: 700, requestId: "tu_retry" }, raw: {}, request: {} }; } };
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

console.log("\nvendor failure classification (Phase 2B.6)");

// The exact production case: HTTP 400, no bureau record — and note the vendor
// itself says `retryable: true`, meaning "a corrected request may be tried".
//
// `retryability` is DERIVED by the real classifier rather than hardcoded. When
// it was hardcoded, this suite and verifyXalerFailureNormalization agreed on a
// value neither had taken from a real payload, and the precedence bug shipped
// with both green. Deriving it here means the two can no longer drift apart.
const NO_RECORD_PAYLOAD = { status: "error", error_code: "NO_CREDIT_RECORD", retryable: true };
const NO_RECORD = {
  ok: false,
  invalid: true,
  reason: "TransUnion CIBIL has no credit record matching the identity details supplied.",
  retryability: classifyRetryability({ data: NO_RECORD_PAYLOAD, httpStatus: 400 }),
};

await acheck("the classifier derives not_retryable from the real 400 payload", () => {
  assert.equal(NO_RECORD.retryability, "not_retryable",
    "HTTP 400 must outrank the vendor's retryable:true");
});

await acheck("no-record failure → status not_retryable, reservation released", async () => {
  const reports = fakeReports();
  const t = baseDeps({ reports, vendor: { calls: [], fn: async () => NO_RECORD } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "not_retryable");
  assert.equal(out.retryability, "not_retryable");
  assert.equal(out.retryable, false, "must not invite another paid request");
  assert.equal(reports.rows.length, 0, "reservation still released — subject never stuck");
});

await acheck("no-record failure surfaces the vendor's explanation, not a generic string", async () => {
  const t = baseDeps({ vendor: { calls: [], fn: async () => NO_RECORD } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.match(out.reason, /no credit record matching the identity details/);
});

await acheck("retryable vendor failure keeps status vendor_failed", async () => {
  const reports = fakeReports();
  const t = baseDeps({ reports, vendor: { calls: [], fn: async () => ({ ok: false, reason: "Waiting for CIBIL Response", retryability: "retryable" }) } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "vendor_failed");
  assert.equal(out.retryable, true);
  assert.equal(reports.rows.length, 0, "reservation released");
});

/* ── Regression: a "partial" flow is not a gateway failure ────────────────
 * Xaler answers HTTP 200 / status "partial" (IV_IN_PROGRESS) when identity
 * verification has not finished. No charge is applied and the same consumer may
 * be retried, but every non-not_retryable failure was collapsed into
 * vendor_failed, so this surfaced as 502 — the same misleading "gateway is
 * down" signal the no-hit fix above removed.
 *
 * The discriminator matters. The client's transport-exhaustion return sets
 * `unavailable` AND `retryability: "retryable"` too, so branching on either of
 * those alone would turn every genuine timeout into a 409. Only `pending`
 * separates them, which is why the two checks below are a pair: the second is
 * what fails if the condition is ever widened back to `unavailable`. */

/**
 * The production body for FORM-664454 (2026-08-13), minus identity: HTTP 200,
 * status "partial", the bureau still waiting for the customer's authentication
 * answer. It carries both the namespaced and the short spellings of every URL,
 * which is why the extractor reads both.
 *
 * `pendingAuth` is DERIVED by the real extractor rather than hand-written, for
 * the same reason `retryability` above is derived by the real classifier: a
 * hand-written fixture can agree with a test while disagreeing with the client.
 */
const PARTIAL_BODY = {
  status: "partial",
  message:
    "The bureau is still waiting for the customer's authentication answer, so the credit " +
    "report cannot be pulled yet. This happens when the OTP question was never answered, " +
    "or the answer was never submitted back to the bureau.",
  pending_authentication: true,
  transunion_webtoken_url: "https://webtoken.transunion.example/session/abc123",
  transunion_json_report_url: "https://api.xaler.example/reports/abc123.json",
  xaler_generated_pdf_report_url: "https://api.xaler.example/reports/abc123.pdf",
  web_token_url: "https://webtoken.transunion.example/session/abc123",
  report_url: "https://api.xaler.example/reports/abc123.json",
  pdf_report_url: "https://api.xaler.example/reports/abc123.pdf",
  client_key: "tu_1755000000000_aabbccddeeff",
  retryable: true,
};

const PARTIAL = {
  ok: false,
  unavailable: true,
  pending: true,
  reason: "CIBIL identity verification pending",
  retryability: "retryable",
  raw: PARTIAL_BODY,
  pendingAuth: extractPendingAuthentication(PARTIAL_BODY),
};

await acheck("a partial / IV_IN_PROGRESS flow → in_progress, not vendor_failed", async () => {
  const reports = fakeReports();
  const t = baseDeps({ reports, vendor: { calls: [], fn: async () => PARTIAL } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "in_progress", "pending verification is not a gateway fault");
  assert.equal(out.retryability, "retryable");
  assert.equal(out.retryable, true, "the same consumer may be retried later");
  assert.equal(reports.rows.length, 0, "reservation released — subject never stuck");
});

await acheck("a transport exhaustion is unavailable but NOT pending → stays vendor_failed", async () => {
  const t = baseDeps({
    vendor: { calls: [], fn: async () => ({ ok: false, unavailable: true, reason: "Waiting for CIBIL Response", retryability: "retryable" }) },
  });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "vendor_failed", "the gateway really did fail — 502 is accurate");
});

await acheck("the client marks its partial branch pending, so the two files cannot drift", async () => {
  const src = await readFile(new URL("../services/xalerCibilService.js", import.meta.url), "utf8");
  const branch = src.slice(src.indexOf('flowStatus === "partial"'));
  const body = branch.slice(0, branch.indexOf("}"));
  assert.ok(/pending:\s*true/.test(body), "the partial return must set pending:true");
  assert.ok(!/pending:\s*true/.test(src.slice(src.lastIndexOf("classifyRetryability({ transport: true })"))),
    "the transport-exhaustion return must NOT be marked pending");
});

/* ── Regression: a pending flow must not throw away what the vendor sent ───
 * FORM-664454, production: HTTP 200 / "partial", with the web-token URL the
 * customer has to complete — and ZERO rows in `cibilreports` for the
 * co-applicant. The status was already correct (in_progress / 409); the branch
 * returned before anything was persisted, so the only route to finishing the
 * pull was parsed and then dropped.
 *
 * The reservation is still released. Storing the body in the reserved row would
 * make isCompletedReport() true — every later attempt would answer
 * `already_exists`, permanently, because nothing would ever complete it. The
 * checks below pin both halves: the payload survives, and the subject stays
 * fetchable. */

await acheck("the counterfactual: a partial body in the reserved row reads as a COMPLETED report", () => {
  // This is the whole reason the row is released rather than completed. Every
  // field the success path writes flips isCompletedReport(), and the schema has
  // no field that says "incomplete" — so a pending row would answer
  // `already_exists` on every later attempt, permanently, because nothing would
  // ever complete it. That is strictly worse than the bug being fixed: it would
  // turn a retryable pending state into a subject that can never be fetched.
  assert.equal(isCompletedReport({ rawResponse: PARTIAL_BODY }), true, "rawResponse alone is enough");
  assert.equal(isCompletedReport({ rawRequest: { pan_id: PAN_COAPP } }), true, "so is rawRequest");
  assert.equal(isCompletedReport({ rawResponsePath: "applications/FORM-1/cibil/x.json" }), true);
  assert.equal(isCompletedReport({ requestId: PARTIAL_BODY.client_key }), true);
  // The one payload field it ignores cannot carry a response body.
  assert.equal(isCompletedReport({ reportUrl: PARTIAL_BODY.report_url }), false,
    "reportUrl is not a completion marker — and not somewhere a body can live");
});

await acheck("a pending flow returns the bureau's authentication details", async () => {
  const t = baseDeps({ vendor: { calls: [], fn: async () => PARTIAL } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  const p = out.pendingAuthentication;
  assert.ok(p, "the authentication block must reach the caller");
  assert.equal(p.pendingAuthentication, true);
  assert.equal(p.webTokenUrl, "https://webtoken.transunion.example/session/abc123",
    "the URL that collects the customer's answer");
  assert.equal(p.jsonReportUrl, "https://api.xaler.example/reports/abc123.json");
  assert.equal(p.pdfReportUrl, "https://api.xaler.example/reports/abc123.pdf");
  assert.equal(p.requestId, "tu_1755000000000_aabbccddeeff", "the flow can be named later");
  assert.equal(p.vendorRetryableFlag, true, "recorded, not obeyed");
});

await acheck("the complete partial body is written to the existing file store", async () => {
  const saved = [];
  const t = baseDeps({ vendor: { calls: [], fn: async () => PARTIAL } });
  t.deps.saveRawFile = async (formId, parts, data) => {
    saved.push({ formId, parts, data });
    return ["applications", formId, ...parts].join("/");
  };
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(saved.length, 1, "exactly one write");
  assert.equal(saved[0].formId, "FORM-1");
  assert.deepEqual(saved[0].parts, ["cibil", `pending-response-${PAN_COAPP}.json`]);
  assert.notEqual(saved[0].parts[1], `raw-response-${PAN_COAPP}.json`,
    "must never overwrite or impersonate a completed report");
  assert.deepEqual(JSON.parse(saved[0].data), PARTIAL_BODY, "verbatim — nothing lost");
  assert.equal(out.pendingResponsePath, `applications/FORM-1/cibil/pending-response-${PAN_COAPP}.json`);
});

await acheck("a file-store failure degrades to the response only, never to a throw", async () => {
  const t = baseDeps({ vendor: { calls: [], fn: async () => PARTIAL } });
  t.deps.saveRawFile = async () => { throw new Error("EACCES"); };
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "in_progress");
  assert.equal(out.pendingResponsePath, "", "no path is claimed when the write failed");
  assert.ok(out.pendingAuthentication, "the details still reach the caller");
});

await acheck("a pending flow creates NO report row, so the subject stays fetchable", async () => {
  const app = fakeApp();
  const reports = fakeReports();
  let call = 0;
  const vendor = { calls: [], fn: async () => { vendor.calls.push(1); call += 1; return call === 1 ? PARTIAL : { ok: true, extracted: { score: 700, requestId: "tu_after_auth" }, raw: {}, request: {} }; } };
  const first = await fetchCoApplicantCibil(APP_ID, baseDeps({ app, reports, vendor }).deps);
  assert.equal(first.status, "in_progress");
  assert.equal(reports.rows.length, 0,
    "a pending body in the reserved row would read as a completed report and block the retry");
  const second = await fetchCoApplicantCibil(APP_ID, baseDeps({ app, reports, vendor }).deps);
  assert.equal(second.ok, true, "the retry the vendor invited must actually be possible");
  assert.equal(second.status, "fetched");
  assert.equal(vendor.calls.length, 2);
});

await acheck("a pending flow writes no score and no summary anywhere", async () => {
  const t = baseDeps({ vendor: { calls: [], fn: async () => PARTIAL } });
  const cibilBefore = JSON.stringify(t.app.doc.cibil);
  const subjectsBefore = JSON.stringify(t.app.doc.cibilSubjects);
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.ok, false, "pending is not a fetched report");
  assert.equal(out.score, undefined, "no score is implied");
  assert.equal(JSON.stringify(t.app.doc.cibil), cibilBefore, "Application.cibil is the applicant's");
  assert.equal(JSON.stringify(t.app.doc.cibilSubjects), subjectsBefore, "no co-applicant summary");
  assert.equal(t.app.writes.length, 0, "no write to the application at all");
  assert.ok(t.hist.includes("CO_APPLICANT_CIBIL_FETCH_FAILED"));
  assert.ok(!t.hist.includes("CO_APPLICANT_CIBIL_FETCHED"), "never logged as fetched");
});

await acheck("only a pending flow carries the block — no other failure gains it", async () => {
  const others = [
    ["transport exhaustion", { ok: false, unavailable: true, reason: "Waiting for CIBIL Response", retryability: "retryable" }],
    ["generic retryable", { ok: false, reason: "boom", retryability: "retryable" }],
    ["no credit record", NO_RECORD],
  ];
  for (const [name, res] of others) {
    const saved = [];
    const t = baseDeps({ vendor: { calls: [], fn: async () => res } });
    t.deps.saveRawFile = async (...a) => { saved.push(a); return "x"; };
    const out = await fetchCoApplicantCibil(APP_ID, t.deps);
    assert.equal(out.pendingAuthentication, undefined, `${name} must not report pending authentication`);
    assert.equal(out.pendingResponsePath, undefined, `${name} must not claim a stored body`);
    assert.equal(saved.length, 0, `${name} must not write a pending file`);
  }
});

/* Xaler's own PCC-conflict refusal: the bureau was reached and declined, with
 * `retryable: false`. It must stay deterministic — not become "pending" because
 * it is also a non-success flow. */
const PCC_PAYLOAD = {
  status: "error",
  error_code: "BUREAU_PCC_CONFLICT",
  message: "The bureau returned a PCC for a different consumer, so no report can be released.",
  bureau_returned_pcc: true,
  retryable: false,
};
const PCC_CONFLICT = {
  ok: false,
  invalid: true,
  reason: PCC_PAYLOAD.message,
  // Derived, like NO_RECORD above: an `error` flow arrives HTTP 200, so it is
  // the vendor's own boolean that settles this one.
  retryability: classifyRetryability({ data: PCC_PAYLOAD, httpStatus: 200 }),
  raw: PCC_PAYLOAD,
};

await acheck("BUREAU_PCC_CONFLICT → not_retryable, reservation released, no pending block", async () => {
  assert.equal(PCC_CONFLICT.retryability, "not_retryable", "the vendor said so explicitly");
  const reports = fakeReports();
  const t = baseDeps({ reports, vendor: { calls: [], fn: async () => PCC_CONFLICT } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "not_retryable");
  assert.equal(out.retryable, false);
  assert.equal(out.pendingAuthentication, undefined);
  assert.equal(reports.rows.length, 0, "subject never stuck");
});

await acheck("unknown retryability is neither promised nor denied", async () => {
  const t = baseDeps({ vendor: { calls: [], fn: async () => ({ ok: false, reason: "odd", retryability: "unknown" }) } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "vendor_failed");
  assert.equal(out.retryability, "unknown");
  assert.equal(out.retryable, false, "unknown must not be reported as retryable");
});

await acheck("a missing retryability defaults to unknown", async () => {
  const t = baseDeps({ vendor: { calls: [], fn: async () => ({ ok: false, reason: "no field" }) } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.retryability, "unknown");
});

await acheck("a thrown client is classed retryable (transport fault)", async () => {
  const t = baseDeps({ vendor: { calls: [], fn: async () => { throw new Error("socket hang up"); } } });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.retryability, "retryable");
});

await acheck("no failure path retries the vendor automatically", async () => {
  const vendor = { calls: [], fn: async () => { vendor.calls.push(1); return NO_RECORD; } };
  const t = baseDeps({ vendor });
  await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(vendor.calls.length, 1, "exactly one call — never repeated by the service");
});

await acheck("the audit remark carries the category and a sanitised reason only", async () => {
  const t = baseDeps({ vendor: { calls: [], fn: async () => ({ ...NO_RECORD, reason: "No record for ABCDE1234F" }) } });
  const remarks = [];
  t.deps.history = async (e) => { t.hist.push(e.actionType); remarks.push(e.remarks || ""); };
  await fetchCoApplicantCibil(APP_ID, t.deps);
  const failed = remarks.find((r) => r.includes("failed"));
  assert.match(failed, /not_retryable/, "category recorded");
  assert.ok(!failed.includes("ABCDE1234F"), "PAN must never reach history");
  assert.match(failed, /\[PAN\]/, "redacted instead");
});

console.log("\nrequest observability (Phase 2B.6)");

await acheck("a coapplicant_cibil_request event is emitted per real invocation", async () => {
  // The service logs through utils/log; capture stdout to prove the event fires
  // exactly once and carries no PAN.
  const lines = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...a) => { lines.push(String(chunk)); return orig(chunk, ...a); };
  try {
    await fetchCoApplicantCibil(APP_ID, baseDeps().deps);
  } finally {
    process.stdout.write = orig;
  }
  const reqLines = lines.filter((l) => l.includes("coapplicant_cibil_request"));
  assert.equal(reqLines.length, 1, `exactly one request event, got ${reqLines.length}`);
  assert.ok(reqLines[0].includes("coApplicant"), "distinguishes the subject");
  assert.ok(!reqLines[0].includes(PAN_COAPP), "no PAN in the request log");
});

console.log("\nvalidation");

// Test 6 — PAN is optional; the bureau's required identity is not.
await acheck("co-applicant with neither PAN nor identity → no reservation, no Xaler", async () => {
  const reports = fakeReports();
  const t = baseDeps({ app: fakeApp({ coApplicant: { name: "No Pan", form60: "img.jpg" } }), reports });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.status, "missing_identity");
  assert.equal(t.vendor.calls.length, 0);
  assert.equal(reports.rows.length, 0, "no placeholder row created");
  assert.match(out.message, /mobile number, first name, last name and date of birth/);
  assert.match(out.message, /PAN is optional/);
});

await acheck("co-applicant with NO PAN but full identity → the fetch proceeds", async () => {
  const reports = fakeReports();
  const t = baseDeps({
    app: fakeApp({
      coApplicant: {
        name: "Asha Verma",
        mobile: "9876543210",
        dateOfBirth: "1988-03-14",
        form60: "img.jpg",
      },
    }),
    reports,
  });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(t.vendor.calls.length, 1, "a missing PAN no longer blocks the request");
  assert.equal(out.ok, true);
  assert.match(out.subjectPan, /^K:[0-9A-F]{8}$/, "stored under a derived key, not an empty one");
});

await acheck("each required identity field is genuinely required", async () => {
  const full = { name: "Asha Verma", mobile: "9876543210", dateOfBirth: "1988-03-14" };
  for (const missing of ["name", "mobile", "dateOfBirth"]) {
    const coApplicant = { ...full };
    delete coApplicant[missing];
    const t = baseDeps({ app: fakeApp({ coApplicant }) });
    const out = await fetchCoApplicantCibil(APP_ID, t.deps);
    assert.equal(out.status, "missing_identity", `missing ${missing} must block`);
    assert.equal(t.vendor.calls.length, 0, `no paid call without ${missing}`);
  }
  // A single-word name has no surname, so it cannot satisfy the requirement.
  const t = baseDeps({ app: fakeApp({ coApplicant: { ...full, name: "Asha" } }) });
  assert.equal((await fetchCoApplicantCibil(APP_ID, t.deps)).status, "missing_identity");
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
  const t = baseDeps({ app: fakeApp({ coApplicant: { panNo: "  zzzzz9999z  ", name: "Co Applicant", dateOfBirth: "1980-01-01", mobile: "9990001111" } }) });
  const out = await fetchCoApplicantCibil(APP_ID, t.deps);
  assert.equal(out.subjectPan, PAN_COAPP, "trimmed and upper-cased");
  assert.equal(t.reports.rows[0].subjectPan, PAN_COAPP, "stored canonically");
});

await acheck("legacy nested co-applicant shape resolves to the same subject", async () => {
  const t = baseDeps({ app: fakeApp({ coApplicant: { applicant: { panNo: PAN_COAPP, name: "Co Applicant", dateOfBirth: "1980-01-01", mobile: "9990001111" } } }) });
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

/* ── Regression: outcome → HTTP status ────────────────────────────────────
 * A bureau no-hit was mapped to 502. Nothing had failed at the gateway: the
 * vendor was reached and answered. Operators saw "502 Bad Gateway" in DevTools
 * and went looking for a production outage that did not exist.
 *
 * Read from the source so the map cannot drift away from these expectations
 * without a test failing. */
console.log("\nHTTP status mapping (co-applicant fetch)");

const controllerSrc = await readFile(
  new URL("../controllers/cibilFetchController.js", import.meta.url), "utf8");
const mappedCode = (status) => {
  const m = controllerSrc.match(new RegExp(`^\\s*${status}:\\s*(\\d{3})\\s*,`, "m"));
  return m ? Number(m[1]) : null;
};

await acheck("a bureau no-hit is NOT reported as a gateway failure", () => {
  const code = mappedCode("not_retryable");
  assert.notEqual(code, 502, "502 claims the upstream failed; the bureau answered normally");
  assert.equal(code, 422, "well-formed request, could not be fulfilled");
});

await acheck("a genuine upstream fault is still 502", () => {
  // Transport error, timeout, 5xx or 429 — the gateway really did fail.
  assert.equal(mappedCode("vendor_failed"), 502);
});

await acheck("success and the remaining outcomes keep their codes", () => {
  assert.equal(mappedCode("fetched"), 200);
  assert.equal(mappedCode("already_exists"), 200);
  assert.equal(mappedCode("in_progress"), 409);
  assert.equal(mappedCode("missing_identity"), 400);
  assert.equal(mappedCode("no_co_applicant"), 400);
  assert.equal(mappedCode("consent_required"), 403);
  assert.equal(mappedCode("not_found"), 404);
  assert.equal(mappedCode("not_configured"), 503);
});

await acheck("the body still carries the status the UI matches on", () => {
  // The frontend maps by `status`, not by HTTP code — which is why the code
  // could be corrected without touching the message the operator sees.
  assert.match(controllerSrc, /status:\s*outcome\.status/);
});

await acheck("a pending bureau authentication is still 409, not 502 or 422", () => {
  // It shares `in_progress` with a reservation already in flight: both mean
  // "come back to this", and neither is a fault.
  assert.equal(mappedCode("in_progress"), 409);
});

await acheck("the authentication details are echoed, the internal path is not", () => {
  assert.match(controllerSrc, /pendingAuthentication:\s*outcome\.pendingAuthentication/,
    "the frontend can only act on what the response carries");
  assert.ok(!/pendingResponsePath/.test(controllerSrc),
    "the uploads path is internal, like rawResponsePath");
  assert.ok(!/outcome\.(raw|request)\b/.test(controllerSrc),
    "the raw vendor payload and request must never be echoed");
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
  (process.exitCode ? "" : ", 0 failures")
);
