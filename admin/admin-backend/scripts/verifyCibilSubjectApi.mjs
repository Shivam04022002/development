/**
 * verifyCibilSubjectApi.mjs
 *
 * Verification for the subject-aware CIBIL read APIs (Phase 2B.3). Same idiom
 * as verifyCibilMapping.js / verifyCibilDuplicateGuard.mjs — a standalone
 * script that asserts and exits non-zero. This package has no test runner.
 *
 * NO DATABASE, NO VENDOR CALL. The two decisions that determine which subject a
 * response describes are pure functions over a request and an application
 * document, so they are exercised directly:
 *
 *   subjectFromRequest(req)        which subject was asked for
 *   summaryForSubject(app, pan)    whose summary may be returned
 *
 * The property that matters most is negative: one subject's data must never be
 * returned for another subject's request. CIBIL raw responses carry a person's
 * full bureau file, so a cross-subject leak is a data-protection failure, not a
 * cosmetic bug. Most of the checks below assert something is NOT returned.
 *
 * Usage:  node scripts/verifyCibilSubjectApi.mjs
 */
import assert from "node:assert/strict";

import { subjectFromRequest, summaryForSubject } from "../controllers/cibilReportController.js";
import { normalizePan } from "../models/cibilSubjectSchemas.js";

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

const applicantSummary = { subjectPan: PAN_A, score: 774, requestId: "tu_applicant" };
const coApplicantSummary = { subjectPan: PAN_B, score: 640, requestId: "tu_coapplicant" };

/** An Application after Phase 2A: legacy `cibil` plus the per-person list. */
const appBoth = {
  _id: "app-1",
  formId: "FORM-1",
  cibil: applicantSummary,
  cibilSubjects: [applicantSummary, coApplicantSummary],
};

/** An Application with only the applicant pulled — today's production shape. */
const appApplicantOnly = {
  _id: "app-2",
  formId: "FORM-2",
  cibil: applicantSummary,
  cibilSubjects: [applicantSummary],
};

/** A record predating Phase 2A: `cibil` with no subjectPan, no list at all. */
const appLegacy = {
  _id: "app-3",
  formId: "FORM-3",
  cibil: { score: 700, requestId: "tu_legacy" },
};

/** ApprovedApplication: no cibil block and no cibilSubjects (audit §6A). */
const appApproved = { _id: "app-4", formId: "FORM-4" };

console.log("subject parsing from the request");

check("no query → '' (legacy request)", () => {
  assert.equal(subjectFromRequest({}), "");
  assert.equal(subjectFromRequest({ query: {} }), "");
});

// Test 6 · normalisation
check("' abcde1234f ' and 'ABCDE1234F' parse to the same subject", () => {
  assert.equal(subjectFromRequest({ query: { subjectPan: " abcde1234f " } }), PAN_A);
  assert.equal(subjectFromRequest({ query: { subjectPan: "ABCDE1234F" } }), PAN_A);
});

check("uses the canonical helper — parsing equals normalizePan", () => {
  const raw = " zzzzz9999z ";
  assert.equal(subjectFromRequest({ query: { subjectPan: raw } }), normalizePan(raw));
});

console.log("\nsummary selection");

// Test 1 · legacy call, no subject
check("no subject → app.cibil, exactly as before", () => {
  assert.deepEqual(summaryForSubject(appBoth, ""), applicantSummary);
  assert.deepEqual(summaryForSubject(appLegacy, ""), appLegacy.cibil);
});

// Test 2 · applicant subject
check("applicant subject → the applicant's summary", () => {
  assert.deepEqual(summaryForSubject(appBoth, PAN_A), applicantSummary);
});

// Test 3 · co-applicant subject
check("co-applicant subject → the CO-APPLICANT's summary", () => {
  const s = summaryForSubject(appBoth, PAN_B);
  assert.equal(s.requestId, "tu_coapplicant");
  assert.equal(s.score, 640);
});

// Test 4 + 9 · the isolation property, stated negatively
check("co-applicant subject NEVER yields the applicant's summary", () => {
  const s = summaryForSubject(appApplicantOnly, PAN_B);
  assert.deepEqual(s, {}, "must be empty, not the applicant's data");
  assert.notEqual(s.requestId, "tu_applicant");
  assert.equal(s.score, undefined, "another person's score must not leak");
});

check("applicant subject NEVER yields the co-applicant's summary", () => {
  const coOnly = { _id: "x", cibil: coApplicantSummary, cibilSubjects: [coApplicantSummary] };
  const s = summaryForSubject(coOnly, PAN_A);
  assert.deepEqual(s, {});
  assert.notEqual(s.requestId, "tu_coapplicant");
});

check("an unknown subject yields {} — never a fallback to any report", () => {
  assert.deepEqual(summaryForSubject(appBoth, "QQQQQ0000Q"), {});
});

console.log("\nlegacy and approved records");

// Test 7 · legacy report with no subjectPan
check("legacy cibil (no subjectPan) is returned for a legacy call", () => {
  assert.deepEqual(summaryForSubject(appLegacy, ""), appLegacy.cibil);
});

check("legacy cibil is NOT returned for a subject-scoped call", () => {
  assert.deepEqual(
    summaryForSubject(appLegacy, PAN_A),
    {},
    "an unattributed summary cannot be claimed by any subject"
  );
});

check("cibil carrying its own subjectPan is returned to that subject", () => {
  const app = { _id: "y", cibil: { subjectPan: PAN_A, score: 774 } }; // no cibilSubjects
  assert.deepEqual(summaryForSubject(app, PAN_A), app.cibil);
  assert.deepEqual(summaryForSubject(app, PAN_B), {});
});

check("ApprovedApplication (no cibil, no cibilSubjects) yields {} safely", () => {
  assert.deepEqual(summaryForSubject(appApproved, ""), {});
  assert.deepEqual(summaryForSubject(appApproved, PAN_A), {});
});

check("a missing application object does not throw", () => {
  assert.deepEqual(summaryForSubject(undefined, PAN_A), {});
  assert.deepEqual(summaryForSubject(null, ""), {});
});

console.log("\nnormalisation inside selection");

check("stored subjectPan is matched case/space-insensitively", () => {
  const app = { cibilSubjects: [{ subjectPan: " abcde1234f ", score: 774 }] };
  assert.equal(summaryForSubject(app, PAN_A).score, 774);
});

console.log("\nnon-mutation");

check("selection never mutates the application document", () => {
  const before = JSON.stringify(appBoth);
  summaryForSubject(appBoth, PAN_B);
  summaryForSubject(appBoth, "");
  assert.equal(JSON.stringify(appBoth), before);
});

check("repeated calls are stable", () => {
  assert.deepEqual(summaryForSubject(appBoth, PAN_B), summaryForSubject(appBoth, PAN_B));
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
  (process.exitCode ? "" : ", 0 failures")
);
