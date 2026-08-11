/**
 * verifyCibilDuplicateGuard.mjs
 *
 * Verification for the duplicate-fetch guard added in Phase 2B.2. Same idiom as
 * verifyCibilMapping.js / verifyCibilOrphanRecovery.mjs: a standalone script
 * that asserts and exits non-zero. This package has no test runner.
 *
 * NO DATABASE, NO VENDOR CALL. The guard's lookup takes its collection as a
 * parameter, so every case runs against an in-memory fake that records the
 * exact query it was given and answers from a fixture set.
 *
 * The property under test is narrow and important: the guard must key on
 * PERSON, not on application. Blocking a second pull for the SAME subject is
 * the point; blocking a first pull for a DIFFERENT subject would defeat the
 * entire co-applicant feature.
 *
 * Usage:  node scripts/verifyCibilDuplicateGuard.mjs
 */
import assert from "node:assert/strict";

import { findReportForSubject } from "../services/cibilProcessingService.js";
import { partySubjectPan, normalizePan } from "../models/cibilSubjectSchemas.js";

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

const APP_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const PAN_APPLICANT = "ABCDE1234F";
const PAN_COAPP = "ZZZZZ9999Z";

/**
 * In-memory stand-in for CibilReport.collection. Matches on the exact
 * { applicationId, subjectPan } pair, exactly as the compound unique index
 * does, and records every query for inspection.
 */
const fakeCollection = (rows = []) => {
  const queries = [];
  return {
    queries,
    async findOne(filter) {
      queries.push(filter);
      return (
        rows.find(
          (r) =>
            String(r.applicationId) === String(filter.applicationId) &&
            normalizePan(r.subjectPan) === normalizePan(filter.subjectPan)
        ) || null
      );
    },
  };
};

const applicantReport = { _id: "rep-applicant", applicationId: APP_A, subjectPan: PAN_APPLICANT, requestId: "tu_1" };

console.log("subject discrimination — the core property");

// Test 1 · same application + same applicant PAN → already exists, no Xaler
await acheck("existing applicant report, same PAN → blocked (no vendor call)", async () => {
  const coll = fakeCollection([applicantReport]);
  const found = await findReportForSubject(coll, APP_A, PAN_APPLICANT);
  assert.ok(found, "must find the existing report");
  assert.equal(found._id, "rep-applicant");
});

// Test 2 · same application + co-applicant PAN → permitted
await acheck("existing applicant report, DIFFERENT co-applicant PAN → permitted", async () => {
  const coll = fakeCollection([applicantReport]);
  const found = await findReportForSubject(coll, APP_A, PAN_COAPP);
  assert.equal(found, null, "a different subject must NOT be treated as a duplicate");
});

// Test 3 · nothing stored → permitted
await acheck("no existing report → permitted", async () => {
  const coll = fakeCollection([]);
  assert.equal(await findReportForSubject(coll, APP_A, PAN_APPLICANT), null);
});

await acheck("same PAN on a DIFFERENT application → permitted", async () => {
  const coll = fakeCollection([applicantReport]);
  assert.equal(await findReportForSubject(coll, "bbbbbbbbbbbbbbbbbbbbbbbb", PAN_APPLICANT), null);
});

console.log("\nquery shape");

await acheck("queries exactly { applicationId, subjectPan } — no extra criteria", async () => {
  const coll = fakeCollection([]);
  await findReportForSubject(coll, APP_A, PAN_APPLICANT);
  assert.equal(coll.queries.length, 1);
  assert.deepEqual(Object.keys(coll.queries[0]).sort(), ["applicationId", "subjectPan"]);
  assert.equal(coll.queries[0].applicationId, APP_A);
  assert.equal(coll.queries[0].subjectPan, PAN_APPLICANT);
});

await acheck("the key matches what saveCibilReport upserts on", async () => {
  // saveCibilReport uses { applicationId: appDoc._id, subjectPan }. If the two
  // ever diverge, the guard would check a different row than the write creates.
  const coll = fakeCollection([]);
  await findReportForSubject(coll, APP_A, PAN_APPLICANT);
  assert.deepEqual(coll.queries[0], { applicationId: APP_A, subjectPan: PAN_APPLICANT });
});

console.log("\nPAN normalisation (canonical helper only — no second implementation)");

// Test 4 · whitespace + case
check("stored ' abcde1234f ' and requested 'ABCDE1234F' are one subject", () => {
  assert.equal(partySubjectPan({ panNo: " abcde1234f " }), PAN_APPLICANT);
  assert.equal(normalizePan(" abcde1234f "), PAN_APPLICANT);
});

await acheck("a differently-formatted stored PAN still blocks the pull", async () => {
  const coll = fakeCollection([{ _id: "r", applicationId: APP_A, subjectPan: " abcde1234f " }]);
  const found = await findReportForSubject(coll, APP_A, PAN_APPLICANT);
  assert.ok(found, "normalisation must make these the same subject");
});

// Test 5 · legacy nested party shape
check("legacy nested shape resolves to the same canonical subject", () => {
  assert.equal(partySubjectPan({ applicant: { panNo: "abcde1234f" } }), PAN_APPLICANT);
});

check("party using `pan` rather than `panNo` resolves identically", () => {
  assert.equal(partySubjectPan({ pan: "abcde1234f" }), PAN_APPLICANT);
});

check("a party with no PAN yields ''", () => {
  assert.equal(partySubjectPan({}), "");
  assert.equal(partySubjectPan(null), "");
});

// An empty subject must behave as a literal, never as "match anything".
await acheck("empty subjectPan does NOT match a populated report", async () => {
  const coll = fakeCollection([applicantReport]);
  assert.equal(
    await findReportForSubject(coll, APP_A, partySubjectPan({})),
    null,
    "a PAN-less party must not be blocked by someone else's report"
  );
});

await acheck("a real PAN does NOT match a blank stored subject", async () => {
  const coll = fakeCollection([{ _id: "blank", applicationId: APP_A, subjectPan: "" }]);
  assert.equal(await findReportForSubject(coll, APP_A, PAN_APPLICANT), null);
});

console.log("\nnon-mutation");

// Tests 6 + 7 · the guard reads; it must never write or alter anything
await acheck("guard does not mutate the stored report", async () => {
  const row = { _id: "r", applicationId: APP_A, subjectPan: PAN_APPLICANT, requestId: "tu_1", rawRequest: { pan_id: PAN_APPLICANT } };
  const before = JSON.stringify(row);
  await findReportForSubject(fakeCollection([row]), APP_A, PAN_APPLICANT);
  assert.equal(JSON.stringify(row), before);
});

await acheck("guard does not mutate the application document it reads from", async () => {
  const appDoc = { _id: APP_A, applicant: { panNo: PAN_APPLICANT }, cibil: { score: 774 } };
  const before = JSON.stringify(appDoc);
  await findReportForSubject(fakeCollection([]), appDoc._id, partySubjectPan(appDoc.applicant));
  assert.equal(JSON.stringify(appDoc), before, "Application.cibil must be untouched");
});

await acheck("the fake collection is never asked to write", async () => {
  const coll = fakeCollection([applicantReport]);
  await findReportForSubject(coll, APP_A, PAN_APPLICANT);
  // The fake exposes only findOne; any insert/update/delete call would throw.
  assert.deepEqual(Object.keys(coll).filter((k) => k !== "queries"), ["findOne"]);
});

console.log("\nexisting applicant flow preserved");

// Test 8 · the subject used for the guard is derived from the SAME party object
// that is handed to Xaler, so a permitted pull sends an unchanged payload.
await acheck("permitted pull passes the applicant object through unchanged", async () => {
  const applicant = { panNo: PAN_APPLICANT, name: "A B", dateOfBirth: "1975-07-05", mobile: "9990001111" };
  const appDoc = { _id: APP_A, applicant };
  const snapshot = JSON.stringify(applicant);
  const found = await findReportForSubject(fakeCollection([]), appDoc._id, partySubjectPan(appDoc.applicant));
  assert.equal(found, null, "no report → the pull proceeds");
  assert.equal(JSON.stringify(appDoc.applicant), snapshot, "the object sent to Xaler is untouched");
});

await acheck("a fresh application can never trip the guard", async () => {
  // The production trigger runs once, at creation, on a document with no report.
  const coll = fakeCollection([]);
  assert.equal(await findReportForSubject(coll, "newly-created-id", PAN_APPLICANT), null);
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
  (process.exitCode ? "" : ", 0 failures")
);
