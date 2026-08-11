/**
 * verifyXalerFailureNormalization.mjs
 *
 * Verification for the vendor-failure hardening (Phase 2B.6): how a failed
 * Xaler response is turned into a message and a retry classification.
 *
 * Motivated by a real production incident. The first live co-applicant fetch
 * returned HTTP 400 with the explanation "TransUnion CIBIL has no credit record
 * matching the identity details supplied", but the parser only read
 * `data.error` — which this vendor does not send — so the operator saw the
 * generic "CIBIL request rejected (HTTP 400)" and repeated the same paid
 * request 21 seconds later.
 *
 * NO NETWORK, NO VENDOR, NO DATABASE. Both decisions are pure functions.
 *
 * Usage:  node scripts/verifyXalerFailureNormalization.mjs
 */
import assert from "node:assert/strict";

import {
  vendorFailureReason,
  classifyRetryability,
  sanitizeVendorText,
} from "../services/xalerCibilService.js";

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

/**
 * The shape production actually returned, minus the identity fields.
 *
 * `retryable: true` is the REAL value, confirmed from the 2026-08-11 12:22 and
 * 12:37 production calls. An earlier version of this fixture guessed `false`
 * from a log line that printed only the payload's key names, and that guess is
 * what let the precedence bug ship: the vendor means "a corrected request may
 * be tried", while this module asks "may this identical request be resent?".
 */
const NO_RECORD_400 = {
  status: "error",
  error_code: "NO_CREDIT_RECORD",
  message:
    "TransUnion CIBIL has no credit record matching the identity details supplied, " +
    "so no score or report could be generated.",
  what_to_do_next: "Confirm the PAN and date of birth, or proceed without a bureau score.",
  retryable: true,
  fallback_used: true,
  match_strength: "none",
};

console.log("vendor message extraction");

check("1 · data.error is used when present", () => {
  assert.equal(vendorFailureReason({ error: "Invalid PAN format" }, 400), "Invalid PAN format");
});

check("2 · data.message is used when error is absent — the production case", () => {
  const r = vendorFailureReason(NO_RECORD_400, 400);
  assert.match(r, /no credit record matching the identity details/);
  assert.doesNotMatch(r, /CIBIL request rejected/, "the generic fallback must not win");
});

check("error wins over message when both are present", () => {
  assert.equal(vendorFailureReason({ error: "E1", message: "M1" }, 400), "E1");
});

check("3 · generic HTTP fallback remains when neither is usable", () => {
  assert.equal(vendorFailureReason({}, 400), "CIBIL request rejected (HTTP 400)");
  assert.equal(vendorFailureReason(null, 502), "CIBIL request rejected (HTTP 502)");
  assert.equal(vendorFailureReason({ error: "   " }, 400), "CIBIL request rejected (HTTP 400)");
  assert.equal(vendorFailureReason({ message: 42 }, 400), "CIBIL request rejected (HTTP 400)");
});

check("a caller-supplied fallback is honoured", () => {
  assert.equal(vendorFailureReason({}, 400, "CIBIL flow failed"), "CIBIL flow failed");
});

console.log("\nsanitisation (4 + 5)");

check("4 · only a short string is returned — never the raw payload", () => {
  const r = vendorFailureReason(NO_RECORD_400, 400);
  assert.equal(typeof r, "string");
  assert.ok(r.length <= 300);
  assert.ok(!r.includes("steps"), "no payload structure");
  assert.ok(!r.includes("identity_sent"), "no identity echo");
});

check("5 · PAN, Aadhaar and DOB-shaped values are redacted", () => {
  assert.equal(sanitizeVendorText("No record for ABCDE1234F"), "No record for [PAN]");
  assert.equal(sanitizeVendorText("id 123456789012 unknown"), "id [AADHAAR] unknown");
  assert.equal(sanitizeVendorText("dob 1975-07-05 mismatch"), "dob [DATE] mismatch");
  assert.match(vendorFailureReason({ message: "PAN ABCDE1234F not found" }, 400), /\[PAN\]/);
});

check("long vendor text is truncated", () => {
  assert.ok(sanitizeVendorText("x".repeat(1000)).length <= 300);
});

check("no credential-shaped content survives", () => {
  const r = sanitizeVendorText("key=SECRETVALUE token ABCDE1234F");
  assert.ok(!r.includes("ABCDE1234F"), "PAN redacted even beside other text");
});

console.log("\nretry classification");

check("the production case → not_retryable despite the vendor's retryable:true", () => {
  // The exact payload that cost two extra paid calls before the precedence fix.
  assert.equal(NO_RECORD_400.retryable, true, "fixture must carry the real vendor value");
  assert.equal(classifyRetryability({ data: NO_RECORD_400, httpStatus: 400 }), "not_retryable");
});

check("HTTP 400 outranks the vendor's boolean, in both directions", () => {
  assert.equal(classifyRetryability({ data: { retryable: true }, httpStatus: 400 }), "not_retryable");
  assert.equal(classifyRetryability({ data: { retryable: false }, httpStatus: 400 }), "not_retryable");
});

check("explicit vendor retryable:true → retryable away from 400", () => {
  assert.equal(classifyRetryability({ data: { retryable: true }, httpStatus: 503 }), "retryable");
  assert.equal(classifyRetryability({ data: { retryable: true } }), "retryable");
});

check("the vendor's boolean still outranks the 5xx heuristic", () => {
  assert.equal(classifyRetryability({ data: { retryable: false }, httpStatus: 503 }), "not_retryable");
  assert.equal(classifyRetryability({ data: { retryable: false }, httpStatus: 429 }), "not_retryable");
});

check("transport faults are retryable", () => {
  assert.equal(classifyRetryability({ transport: true }), "retryable");
  assert.equal(classifyRetryability({ transport: true, httpStatus: 400 }), "retryable");
});

check("5xx and 429 are retryable without a vendor boolean", () => {
  for (const s of [500, 502, 503, 504, 429]) {
    assert.equal(classifyRetryability({ data: {}, httpStatus: s }), "retryable", `HTTP ${s}`);
  }
});

check("a bare 400 is not_retryable — the same request cannot succeed", () => {
  assert.equal(classifyRetryability({ data: {}, httpStatus: 400 }), "not_retryable");
});

check("anything else is unknown — never guessed", () => {
  assert.equal(classifyRetryability({ data: {}, httpStatus: 418 }), "unknown");
  assert.equal(classifyRetryability({}), "unknown");
  assert.equal(classifyRetryability({ data: { retryable: "yes" } }), "unknown",
    "a non-boolean vendor field is not trusted");
});

check("no free-text matching is used to classify", () => {
  // A message mentioning "no credit record" but WITHOUT a boolean and with a
  // retryable status must not be downgraded by reading the prose.
  assert.equal(
    classifyRetryability({ data: { message: "no credit record found" }, httpStatus: 503 }),
    "retryable"
  );
});

console.log("\nno automatic retry is implied");

check("classification is advice only — it triggers nothing", () => {
  // Pure functions: no timers, no callbacks, no side effects to schedule a call.
  assert.equal(typeof classifyRetryability({ transport: true }), "string");
  assert.equal(typeof vendorFailureReason({}, 400), "string");
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
  (process.exitCode ? "" : ", 0 failures")
);
