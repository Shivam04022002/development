/**
 * verifyCibilSubjectUi.mjs
 *
 * Verification for the subject-aware CIBIL admin UI (Phase 2B.5).
 *
 * This package has NO test runner — no vitest, no jest, no test script, no
 * existing test files. Rather than introduce a framework as a side effect of a
 * feature, this follows the idiom the backend already uses (verifyCibilMapping,
 * verifyCibilSubjectApi, …): a standalone assert script that exits non-zero.
 *
 * Every decision that determines WHICH person's data is shown or requested is a
 * pure function in src/utils/cibilSubjects.js, so all of it is verified here
 * with no DOM, no browser and no network.
 *
 * Limitation, stated plainly: this covers the logic, not React rendering.
 * Assertions about the button appearing in the DOM, the modal mounting, or a
 * real double-click are covered at the logic level (visibility rules,
 * single-flight guard) but not by rendering the component — that would need a
 * test framework this project does not have.
 *
 * Usage:  node scripts/verifyCibilSubjectUi.mjs
 */
import assert from "node:assert/strict";

import {
  normalizePan,
  partyPan,
  hasReport,
  subjectSummary,
  cibilReportPath,
  canFetchCoApplicantCibil,
  fetchOutcome,
  FETCH_MESSAGES,
} from "../src/utils/cibilSubjects.js";

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
};

const PAN_A = "ABCDE1234F";   // applicant
const PAN_B = "ZZZZZ9999Z";   // co-applicant

const applicantEntry = { subjectPan: PAN_A, score: 774, requestId: "tu_applicant" };
const coEntry = { subjectPan: PAN_B, score: 640, requestId: "tu_co" };

const APPLICANT = { panNo: PAN_A, name: "A" };
const CO = { panNo: PAN_B, name: "B" };

/** Post-2B application: both subjects present. */
const appBoth = { _id: "a1", applicant: APPLICANT, coApplicant: CO,
  cibil: applicantEntry, cibilSubjects: [applicantEntry, coEntry] };
/** Today's production shape: applicant only. */
const appApplicantOnly = { _id: "a2", applicant: APPLICANT, coApplicant: CO,
  cibil: applicantEntry, cibilSubjects: [applicantEntry] };
/** Pre-2A legacy: a summary with no subjectPan and no list at all. */
const appLegacy = { _id: "a3", applicant: APPLICANT, coApplicant: CO,
  cibil: { score: 700, requestId: "tu_legacy" } };

console.log("subject summary resolution");

check("applicant summary resolves from cibilSubjects", () => {
  const r = subjectSummary(appBoth, appBoth.applicant, true);
  assert.equal(r.available, true);
  assert.equal(r.summary.requestId, "tu_applicant");
  assert.equal(r.subjectPan, PAN_A);
});

check("co-applicant summary resolves to its OWN entry", () => {
  const r = subjectSummary(appBoth, appBoth.coApplicant, false);
  assert.equal(r.available, true);
  assert.equal(r.summary.requestId, "tu_co");
  assert.equal(r.summary.score, 640);
  assert.equal(r.subjectPan, PAN_B);
});

check("applicant and co-applicant never cross-display", () => {
  const a = subjectSummary(appBoth, appBoth.applicant, true);
  const c = subjectSummary(appBoth, appBoth.coApplicant, false);
  assert.notEqual(a.summary.requestId, c.summary.requestId);
  assert.equal(a.summary.score, 774);
  assert.equal(c.summary.score, 640);
});

check("co-applicant with no report shows nothing, NOT the applicant's", () => {
  const r = subjectSummary(appApplicantOnly, appApplicantOnly.coApplicant, false);
  assert.equal(r.available, false);
  assert.deepEqual(r.summary, {});
  assert.notEqual(r.summary.requestId, "tu_applicant");
});

check("PAN matching is normalised (case + whitespace)", () => {
  const app = { cibilSubjects: [{ subjectPan: " abcde1234f ", score: 774 }] };
  const r = subjectSummary(app, { panNo: "ABCDE1234F" }, true);
  assert.equal(r.available, true);
  assert.equal(r.summary.score, 774);
});

check("legacy nested party shape and `pan` field both resolve", () => {
  assert.equal(partyPan({ applicant: { panNo: PAN_A } }), PAN_A);
  assert.equal(partyPan({ pan: "abcde1234f" }), PAN_A);
  assert.equal(partyPan({}), "");
  assert.equal(normalizePan(" zz "), "ZZ");
});

console.log("\nlegacy compatibility");

check("legacy app.cibil (no subjectPan) still shows for the APPLICANT", () => {
  const r = subjectSummary(appLegacy, appLegacy.applicant, true);
  assert.equal(r.available, true);
  assert.equal(r.summary.requestId, "tu_legacy");
});

check("legacy app.cibil is NOT shown as the co-applicant's", () => {
  const r = subjectSummary(appLegacy, appLegacy.coApplicant, false);
  assert.equal(r.available, false);
  assert.deepEqual(r.summary, {}, "an unattributed summary cannot be claimed");
});

check("app.cibil WITH a matching subjectPan is shown to that party", () => {
  const app = { applicant: APPLICANT, coApplicant: CO, cibil: { subjectPan: PAN_B, score: 640 } };
  assert.equal(subjectSummary(app, CO, false).available, true, "belongs to the co-applicant");
  assert.equal(subjectSummary(app, APPLICANT, true).available, false, "must not leak to the applicant");
});

check("an application with no cibil at all is safe", () => {
  const r = subjectSummary({ applicant: APPLICANT }, APPLICANT, true);
  assert.equal(r.available, false);
  assert.deepEqual(r.summary, {});
  assert.deepEqual(subjectSummary(undefined, undefined, false).summary, {});
});

console.log("\nsubject-aware read URLs");

check("all four read paths carry subjectPan", () => {
  for (const p of ["/json", "/model", "/pdf", "/pdf/download"]) {
    assert.equal(cibilReportPath("a1", p, PAN_B), `/cibil/a1${p}?subjectPan=${PAN_B}`);
  }
});

check("subjectPan is URL-encoded", () => {
  assert.match(cibilReportPath("a1", "/json", "ab cd&e"), /\?subjectPan=AB%20CD%26E$/);
});

check("an empty subject is never sent as a parameter", () => {
  assert.equal(cibilReportPath("a1", "/json", ""), "/cibil/a1/json");
  assert.equal(cibilReportPath("a1", "/json", undefined), "/cibil/a1/json");
  assert.equal(cibilReportPath("a1", "/json", "   "), "/cibil/a1/json");
});

check("the parameter is normalised before being sent", () => {
  assert.equal(cibilReportPath("a1", "/json", " zzzzz9999z "), `/cibil/a1/json?subjectPan=${PAN_B}`);
});

console.log("\nFetch button visibility");

const base = { isSuperAdmin: true, coApplicant: CO, coApplicantSummary: {}, busy: false };

check("shown for a super admin, co-applicant with PAN, no report", () => {
  const r = canFetchCoApplicantCibil(base);
  assert.equal(r.show, true);
  assert.equal(r.disabled, false);
});

check("hidden for a normal admin", () => {
  const r = canFetchCoApplicantCibil({ ...base, isSuperAdmin: false });
  assert.equal(r.show, false);
  assert.equal(r.reason, "not_superadmin");
});

check("hidden when the co-applicant has no PAN", () => {
  const r = canFetchCoApplicantCibil({ ...base, coApplicant: { name: "No PAN", form60: "x.jpg" } });
  assert.equal(r.show, false);
  assert.equal(r.reason, "missing_pan");
});

check("hidden when there is no co-applicant", () => {
  assert.equal(canFetchCoApplicantCibil({ ...base, coApplicant: {} }).show, false);
  assert.equal(canFetchCoApplicantCibil({ ...base, coApplicant: null }).reason, "no_co_applicant");
});

check("hidden when a report already exists", () => {
  const r = canFetchCoApplicantCibil({ ...base, coApplicantSummary: coEntry });
  assert.equal(r.show, false);
  assert.equal(r.reason, "already_fetched");
});

check("disabled — not hidden — while a fetch is in flight", () => {
  const r = canFetchCoApplicantCibil({ ...base, busy: true });
  assert.equal(r.show, true);
  assert.equal(r.disabled, true, "single-flight: a second click cannot start another POST");
});

console.log("\noutcome messages");

check("every documented backend status maps to its own message", () => {
  const expected = {
    fetched: "Co-Applicant CIBIL report fetched successfully.",
    already_exists: "Co-Applicant CIBIL report already exists.",
    in_progress: "Co-Applicant CIBIL fetch is already in progress.",
    missing_pan: "Co-Applicant PAN is missing. CIBIL cannot be fetched.",
    no_co_applicant: "No co-applicant is available for this application.",
    consent_required: "Co-Applicant consent is required before fetching CIBIL.",
    not_found: "Application or co-applicant was not found.",
    not_configured: "CIBIL service is not configured.",
    vendor_failed: "Co-Applicant CIBIL request failed. No retry should happen automatically.",
  };
  for (const [status, msg] of Object.entries(expected)) {
    assert.equal(FETCH_MESSAGES[status], msg, `message for ${status}`);
    assert.equal(fetchOutcome({ status }).message, msg);
  }
  assert.equal(Object.keys(FETCH_MESSAGES).length, 9, "all nine outcomes covered");
});

check("only fetched / already_exists count as success and trigger a refresh", () => {
  assert.equal(fetchOutcome({ status: "fetched" }).ok, true);
  assert.equal(fetchOutcome({ status: "fetched" }).refresh, true);
  assert.equal(fetchOutcome({ status: "already_exists" }).ok, true);
  assert.equal(fetchOutcome({ status: "already_exists" }).refresh, true);
  for (const s of ["in_progress", "missing_pan", "no_co_applicant", "consent_required",
                   "not_found", "not_configured", "vendor_failed"]) {
    assert.equal(fetchOutcome({ status: s }).ok, false, `${s} must not be success`);
    assert.equal(fetchOutcome({ status: s }).refresh, false, `${s} must not refresh`);
  }
});

check("a vendor failure is never treated as a reason to retry", () => {
  const o = fetchOutcome({ status: "vendor_failed" });
  assert.equal(o.ok, false);
  assert.match(o.message, /No retry should happen automatically/);
});

check("an unrecognised shape falls through to the generic handler", () => {
  assert.equal(fetchOutcome({}), null);
  assert.equal(fetchOutcome(undefined), null);
  assert.equal(fetchOutcome({ status: "something_new" }), null);
});

console.log("\nhelpers");

check("hasReport recognises a score or a requestId only", () => {
  assert.equal(hasReport({ score: 700 }), true);
  assert.equal(hasReport({ requestId: "tu_1" }), true);
  assert.equal(hasReport({ score: null, requestId: "" }), false);
  assert.equal(hasReport({}), false);
  assert.equal(hasReport(null), false);
});

check("resolution never mutates the application object", () => {
  const before = JSON.stringify(appBoth);
  subjectSummary(appBoth, appBoth.applicant, true);
  subjectSummary(appBoth, appBoth.coApplicant, false);
  assert.equal(JSON.stringify(appBoth), before);
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
  (process.exitCode ? "" : ", 0 failures")
);
