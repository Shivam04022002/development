/**
 * verifyPartyEdit.mjs
 *
 * Verification for the admin applicant / co-applicant EDIT endpoint and the
 * applicant CIBIL fetch endpoint added alongside it.
 *
 * NO DATABASE, NO NETWORK, NO VENDOR. The two decisions worth pinning are pure
 * (the editable-field whitelist and the legacy `name` composition); everything
 * else is asserted against the source, which is the same technique
 * verifyCoApplicantCibilFetch uses for the controller's status map.
 *
 * Usage:  node scripts/verifyPartyEdit.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { composeName, EDITABLE } from "../controllers/applicationPartyController.js";

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

const partySrc = await readFile(
  new URL("../controllers/applicationPartyController.js", import.meta.url), "utf8");
const fetchSrc = await readFile(
  new URL("../controllers/cibilFetchController.js", import.meta.url), "utf8");
const appRoutes = await readFile(
  new URL("../routes/applicationRoutes.js", import.meta.url), "utf8");
const cibilRoutes = await readFile(
  new URL("../routes/cibilReportRoutes.js", import.meta.url), "utf8");

/* ── Surname stays optional ───────────────────────────────────────────────── */
console.log("legacy `name` composition — surname is OPTIONAL");

check("first name only → \"FirstName\"", () => {
  assert.equal(composeName("Bhup", ""), "Bhup");
  assert.equal(composeName("Bhup", undefined), "Bhup");
  assert.equal(composeName("Bhup", null), "Bhup");
  assert.equal(composeName("Bhup", "   "), "Bhup");
});

check("first name + surname → \"FirstName Surname\"", () => {
  assert.equal(composeName("Bhup", "Shri"), "Bhup Shri");
});

check("no placeholder or trailing space ever leaks", () => {
  for (const s of ["", null, undefined, "   "]) {
    const out = composeName("Bhup", s);
    assert.ok(!/undefined|null/.test(out), `got ${JSON.stringify(out)}`);
    assert.equal(out, out.trim(), "must not carry a trailing space");
  }
});

check("values are trimmed", () => {
  assert.equal(composeName("  Bhup  ", "  Shri  "), "Bhup Shri");
});

check("the controller rejects only a missing FIRST name, never a missing surname", () => {
  assert.match(partySrc, /if \(!firstName\)/, "first name is the required one");
  assert.ok(!/if \(!surname\)/.test(partySrc), "a surname must never be required");
  assert.match(partySrc, /First name is required\. Surname is optional\./);
});

/* ── The whitelist ────────────────────────────────────────────────────────── */
console.log("\neditable-field whitelist");

check("every field the admin view displays is editable", () => {
  for (const f of ["firstName", "surname", "email", "gender", "fatherName",
                   "dateOfBirth", "aadharNo", "panNo", "address", "pincode",
                   "policeStation", "postOffice", "relation", "documentType"]) {
    assert.ok(EDITABLE.includes(f), `${f} should be editable`);
  }
  assert.ok(EDITABLE.includes("mobileNumber") && EDITABLE.includes("mobile"),
    "both mobile spellings are accepted, as the readers already are");
});

check("protected fields can NOT be reached through the whitelist", () => {
  for (const f of ["_id", "id", "formId", "dealer", "dealerDetails", "status",
                   "workflowStage", "cibil", "cibilSubjects", "documents",
                   "history", "createdAt", "updatedAt"]) {
    assert.ok(!EDITABLE.includes(f), `${f} must NOT be editable`);
  }
});

check("image/document references are NOT editable here", () => {
  for (const f of ["photo", "aadharFront", "aadharBack", "panImage", "form60"]) {
    assert.ok(!EDITABLE.includes(f), `${f} belongs to the upload flow`);
  }
});

check("`name` is derived, never accepted from the client", () => {
  assert.ok(!EDITABLE.includes("name"), "name must not be client-settable");
  assert.match(partySrc, /\$set\[`\$\{base\}\.name`\] = composeName\(/);
});

check("the update is built only from whitelisted keys", () => {
  assert.match(partySrc, /EDITABLE\.filter\(\(f\) => body\[f\] !== undefined\)/,
    "supplied fields must be intersected with the whitelist");
});

/* ── CIBIL must not be disturbed by an edit ───────────────────────────────── */
console.log("\nediting details does not touch CIBIL");

check("the party controller never writes cibil or deletes a report", () => {
  assert.ok(!/cibilreports|CibilReport/.test(partySrc), "must not touch the report collection");
  assert.ok(!/\$set\[[^\]]*cibil/.test(partySrc), "must not write a cibil field");
  assert.ok(!/deleteOne|deleteMany|remove\(/.test(partySrc), "must never delete anything");
});

check("the party controller never triggers a bureau call", () => {
  assert.ok(!/fetchCibilReport|processApplicationCibil|fetchCoApplicantCibil/.test(partySrc),
    "saving details must not start a CIBIL request");
});

check("workflow stage and status are not writable", () => {
  // Comments legitimately NAME these fields (to say they are off limits), so
  // strip comments and look for an actual write instead of a mention.
  const code = partySrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  assert.ok(!/\$set\[[^\]]*(workflowStage|status)/.test(code), "must not $set status/workflowStage");
  assert.ok(!/\b(app|doc)\.(status|workflowStage)\s*=/.test(code), "must not assign them on the doc");
});

/* ── Audit trail ──────────────────────────────────────────────────────────── */
console.log("\naudit trail follows the existing convention");

check("a history entry is written for each party, with the existing helper", () => {
  assert.match(partySrc, /createHistoryEntry\(/);
  assert.match(partySrc, /APPLICANT_DETAILS_UPDATED/);
  assert.match(partySrc, /CO_APPLICANT_DETAILS_UPDATED/);
});

check("history records field NAMES only — no personal values", () => {
  assert.match(partySrc, /details updated \(\$\{changed\.join\(", "\)\}\)/,
    "the remark lists changed field names");
  assert.ok(!/remarks:.*body\[/.test(partySrc), "no submitted value may reach the timeline");
});

check("a history failure does not fail the edit", () => {
  assert.match(partySrc, /catch \(histErr\)/);
});

/* ── Routing and auth ─────────────────────────────────────────────────────── */
console.log("\nrouting and authorization");

check("the party route is admin-authenticated", () => {
  // The comment above the route also names the path, so match the CALL.
  const line = appRoutes
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("router.") && l.includes("/party/:role"));
  assert.ok(line, "route must exist");
  assert.match(line, /protect/, "must be behind the admin guard");
  assert.match(line, /router\.patch/, "PATCH — a partial update of one section");
});

check("the applicant CIBIL fetch is Super Admin only, like the co-applicant's", () => {
  const joined = cibilRoutes.split(/\r?\n/).join(" ");
  const applicant = joined.match(/applicant\/fetch[\s\S]{0,160}/)?.[0] || "";
  assert.match(joined, /"\/:applicationId\/applicant\/fetch"/, "route must exist");
  assert.match(applicant, /protect/);
  assert.match(applicant, /requireSuperAdmin/, "a billable call needs the same gate");
});

/* ── The applicant fetch reuses the existing service ──────────────────────── */
console.log("\napplicant CIBIL fetch reuses the existing implementation");

check("it calls processApplicationCibil — no second implementation", () => {
  assert.match(fetchSrc, /await processApplicationCibil\(app\)/,
    "the automatic path's own function must do the work");
  assert.ok(!/fetchCibilReport\(/.test(fetchSrc),
    "the controller must not call the vendor client directly");
  assert.ok(!/buildRequestBody/.test(fetchSrc), "the request builder must not be touched");
});

check("a completed report is not paid for twice", () => {
  assert.match(fetchSrc, /findReportForSubject\(/, "reuses the existing lookup helper");
  assert.match(fetchSrc, /status: "already_exists"/);
});

check("a partial flow is reported as pending, not as a failure", () => {
  assert.match(fetchSrc, /if \(flow === "partial"\)/);
  assert.match(fetchSrc, /status: "in_progress"/);
  assert.match(fetchSrc, /pendingAuthentication: extractPendingAuthentication\(raw\)/,
    "the same extractor the co-applicant path uses");
});

check("the co-applicant handler is untouched and still exported", () => {
  assert.match(fetchSrc, /export const fetchCoApplicantCibilReport/);
  assert.match(fetchSrc, /await fetchCoApplicantCibil\(applicationId, \{ actor \}\)/);
  assert.match(fetchSrc, /export default \{ fetchCoApplicantCibilReport, fetchApplicantCibilReport \}/);
});

check("the outcome→HTTP map is reused, not duplicated", () => {
  const maps = fetchSrc.match(/const STATUS_CODE = \{/g) || [];
  assert.equal(maps.length, 1, "exactly one status map in the module");
  assert.match(fetchSrc, /STATUS_CODE\[outcome\.status\]/);
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
  (process.exitCode ? "" : ", 0 failures")
);
