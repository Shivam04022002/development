/**
 * verifyCibilOrphanRecovery.mjs
 *
 * Verification for the orphan-recovery decision in backfillCibilSubjects.mjs.
 * Same pattern as verifyCibilMapping.js / snapshotCibilReport.js: a standalone
 * script that asserts and exits non-zero on failure. There is no test runner in
 * this package, so this is the repository's testing idiom.
 *
 * NO DATABASE. The decision is a pure function over a report and the candidate
 * records a formId lookup returned, so every case below is exercised with
 * fixtures — including the ones that must never occur in production.
 *
 * Usage:  node scripts/verifyCibilOrphanRecovery.mjs
 */
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  classifyOrphanMirror,
  decideOrphanRecovery,
  formIdFromRawResponsePath,
  subjectPanOfReport,
} from "./backfillCibilSubjects.mjs";

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

const APPLICANT_PAN = "ABCDE1234F";
const COAPP_PAN = "ZZZZZ9999Z";

const report = (over = {}) => ({
  _id: "r1",
  applicationId: "deadbeefdeadbeefdeadbeef",
  rawResponsePath: "applications/FORM-662921/cibil/raw-response.json",
  rawRequest: { pan_id: APPLICANT_PAN },
  ...over,
});

const candidate = (over = {}) => ({
  label: "approvedApplications",
  Model: { schema: { path: () => null } },
  doc: {
    _id: "a1",
    formId: "FORM-662921",
    applicant: { panNo: APPLICANT_PAN },
    coApplicant: {},
    ...over,
  },
});

console.log("formId extraction");
check("pulls formId from a raw-response path", () =>
  assert.equal(
    formIdFromRawResponsePath("applications/FORM-662921/cibil/raw-response.json"),
    "FORM-662921"
  )
);
check("tolerates a leading uploads/ prefix", () =>
  assert.equal(
    formIdFromRawResponsePath("uploads/applications/FORM-094888/cibil/raw-response.json"),
    "FORM-094888"
  )
);
check("returns '' when there is no path", () => assert.equal(formIdFromRawResponsePath(""), ""));
check("returns '' for an unrelated path", () =>
  assert.equal(formIdFromRawResponsePath("some/other/file.json"), "")
);

console.log("\nsubject PAN extraction");
check("normalises pan_id (trim + uppercase)", () =>
  assert.equal(subjectPanOfReport({ rawRequest: { pan_id: " abcde1234f " } }), APPLICANT_PAN)
);
check("missing rawRequest yields ''", () => assert.equal(subjectPanOfReport({}), ""));

console.log("\nrecovery decision");

// 3 · the production case: unique formId + applicant PAN match
check("orphan + unique formId + applicant PAN → recover", () => {
  const d = decideOrphanRecovery({ report: report(), candidates: [candidate()] });
  assert.equal(d.action, "recover");
  assert.equal(d.formId, "FORM-662921");
  assert.equal(d.subjectPan, APPLICANT_PAN);
});

check("PAN match is case/whitespace insensitive on both sides", () => {
  const d = decideOrphanRecovery({
    report: report({ rawRequest: { pan_id: " abcde1234f " } }),
    candidates: [candidate({ applicant: { panNo: "abcde1234f" } })],
  });
  assert.equal(d.action, "recover");
});

check("legacy nested applicant shape resolves", () => {
  const d = decideOrphanRecovery({
    report: report(),
    candidates: [candidate({ applicant: { applicant: { panNo: APPLICANT_PAN } } })],
  });
  assert.equal(d.action, "recover");
});

check("applicant carrying `pan` rather than `panNo` resolves", () => {
  const d = decideOrphanRecovery({
    report: report(),
    candidates: [candidate({ applicant: { pan: APPLICANT_PAN } })],
  });
  assert.equal(d.action, "recover");
});

// 4 · formId matches nothing
check("orphan + formId not found → skip", () => {
  const d = decideOrphanRecovery({ report: report(), candidates: [] });
  assert.equal(d.action, "skip");
  assert.match(d.reason, /matches no record/);
});

// 5 · formId matches more than one record
check("orphan + duplicate formId → skip (never picks one)", () => {
  const d = decideOrphanRecovery({
    report: report(),
    candidates: [candidate(), candidate({ _id: "a2" })],
  });
  assert.equal(d.action, "skip");
  assert.match(d.reason, /ambiguous/);
});

// 6 · PAN mismatch
check("orphan + PAN matches neither party → skip", () => {
  const d = decideOrphanRecovery({
    report: report({ rawRequest: { pan_id: "QQQQQ0000Q" } }),
    candidates: [candidate({ coApplicant: { panNo: COAPP_PAN } })],
  });
  assert.equal(d.action, "skip");
  assert.match(d.reason, /matches neither party/);
});

// 7 · co-applicant PAN — must NOT be attributed to the applicant
check("orphan + co-applicant PAN → 'coapplicant', never 'recover'", () => {
  const d = decideOrphanRecovery({
    report: report({ rawRequest: { pan_id: COAPP_PAN } }),
    candidates: [candidate({ coApplicant: { panNo: COAPP_PAN } })],
  });
  assert.equal(d.action, "coapplicant");
  assert.notEqual(d.action, "recover");
});

check("applicant wins when both parties share a PAN (no ambiguity leak)", () => {
  const d = decideOrphanRecovery({
    report: report(),
    candidates: [candidate({ coApplicant: { panNo: APPLICANT_PAN } })],
  });
  assert.equal(d.action, "recover");
});

// 8 · missing pan_id
check("orphan + missing rawRequest.pan_id → skip", () => {
  const d = decideOrphanRecovery({ report: report({ rawRequest: {} }), candidates: [candidate()] });
  assert.equal(d.action, "skip");
  assert.match(d.reason, /pan_id missing/);
});

check("orphan + no rawResponsePath → skip before any lookup", () => {
  const d = decideOrphanRecovery({ report: report({ rawResponsePath: "" }), candidates: [candidate()] });
  assert.equal(d.action, "skip");
  assert.match(d.reason, /no formId/);
});

check("applicant with no PAN on file → skip, never a blank-PAN match", () => {
  const d = decideOrphanRecovery({
    report: report(),
    candidates: [candidate({ applicant: {} })],
  });
  assert.equal(d.action, "skip");
});

// 9/10 · the decision is pure — it cannot write, and is stable across calls
console.log("\npurity / idempotency");
check("decision performs no mutation of its inputs", () => {
  const r = report();
  const c = [candidate()];
  const before = JSON.stringify({ r, doc: c[0].doc });
  decideOrphanRecovery({ report: r, candidates: c });
  assert.equal(JSON.stringify({ r, doc: c[0].doc }), before);
});
check("repeated calls return the same decision", () => {
  const args = { report: report(), candidates: [candidate()] };
  assert.deepEqual(decideOrphanRecovery(args).action, decideOrphanRecovery(args).action);
});

// Summary-mirror capability — classified before the write guard so --dry-run
// can report it. Must be decidable with no database and no write.
console.log("\nsummary-mirror classification (dry-run reporting)");

const withSummary = { score: 774, requestId: "tu_1" };

check("ApprovedApplication (no cibilSubjects path) → 'none'", () =>
  assert.equal(
    classifyOrphanMirror({
      supportsList: false,
      ownerCibil: withSummary,
      existingSubjects: undefined,
      subjectPan: APPLICANT_PAN,
    }),
    "none"
  )
);

check("schema supports the list but the record has no summary → 'none'", () =>
  assert.equal(
    classifyOrphanMirror({
      supportsList: true,
      ownerCibil: {},
      existingSubjects: [],
      subjectPan: APPLICANT_PAN,
    }),
    "none"
  )
);

check("Application with a summary and no entry yet → 'mirror'", () =>
  assert.equal(
    classifyOrphanMirror({
      supportsList: true,
      ownerCibil: withSummary,
      existingSubjects: [],
      subjectPan: APPLICANT_PAN,
    }),
    "mirror"
  )
);

check("subject already listed → 'already' (idempotent re-run)", () =>
  assert.equal(
    classifyOrphanMirror({
      supportsList: true,
      ownerCibil: withSummary,
      existingSubjects: [{ subjectPan: APPLICANT_PAN }],
      subjectPan: APPLICANT_PAN,
    }),
    "already"
  )
);

check("'already' matching is PAN-normalised, not literal", () =>
  assert.equal(
    classifyOrphanMirror({
      supportsList: true,
      ownerCibil: withSummary,
      existingSubjects: [{ subjectPan: " abcde1234f " }],
      subjectPan: APPLICANT_PAN,
    }),
    "already"
  )
);

check("a different subject in the list still mirrors", () =>
  assert.equal(
    classifyOrphanMirror({
      supportsList: true,
      ownerCibil: withSummary,
      existingSubjects: [{ subjectPan: COAPP_PAN }],
      subjectPan: APPLICANT_PAN,
    }),
    "mirror"
  )
);

check("classification mutates nothing and is stable", () => {
  const args = {
    supportsList: true,
    ownerCibil: withSummary,
    existingSubjects: [{ subjectPan: COAPP_PAN }],
    subjectPan: APPLICANT_PAN,
  };
  const before = JSON.stringify(args);
  const a = classifyOrphanMirror(args);
  const b = classifyOrphanMirror(args);
  assert.equal(JSON.stringify(args), before);
  assert.equal(a, b);
});

check("the production case: both orphans are approvedApplications → 'none' ×2", () => {
  const both = ["FORM-662921", "FORM-094888"].map(() =>
    classifyOrphanMirror({
      supportsList: false, // ApprovedApplication declares no cibilSubjects
      ownerCibil: undefined, // …and carries no cibil block either
      existingSubjects: undefined,
      subjectPan: APPLICANT_PAN,
    })
  );
  assert.deepEqual(both, ["none", "none"]);
});

// 11 · importing the migration must not enable automatic index creation
console.log("\nindex safety");
check("importing the migration leaves autoIndex/autoCreate off", () => {
  assert.equal(mongoose.get("autoIndex"), false);
  assert.equal(mongoose.get("autoCreate"), false);
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
  (process.exitCode ? "" : ", 0 failures")
);
