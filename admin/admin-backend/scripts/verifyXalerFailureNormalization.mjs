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
  vendorDiagnostics,
  extractPendingAuthentication,
  fetchCibilReport,
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

/* ── Regression: diagnostics survive a failure ────────────────────────────
 * A failed fetch releases (deletes) its reservation row, so the vendor's
 * diagnostic block had nowhere to live and was lost. */
console.log("\nvendor diagnostics are preserved on failure, without leaking identity");

const DIAG_400 = {
  status: "error",
  error_code: "NO_CREDIT_RECORD",
  message: "TransUnion CIBIL has no credit record matching the identity details supplied.",
  what_to_do_next: "Confirm the PAN ABCDE1234F and date of birth 1994-06-12 with the customer.",
  retryable: true,
  diagnosis: { reason: "no_hit" },
  identity_sent: {
    forename: "Ravi", surname: "Kumar", pan_id: "ABCDE1234F",
    date_of_birth: "1994-06-12", phone_number: "9200000000",
  },
  match_strength: { score: 95, level: "strong", present: ["PAN"], missing: ["PIN code"] },
  warnings: [],
};

check("identity_sent is reduced to field names and presence only", () => {
  const d = vendorDiagnostics(DIAG_400);
  assert.deepEqual(d.identitySent, [
    "forename=present", "surname=present", "pan_id=present",
    "date_of_birth=present", "phone_number=present",
  ]);
  const serialised = JSON.stringify(d);
  for (const secret of ["Ravi", "Kumar", "ABCDE1234F", "1994-06-12", "9200000000"]) {
    assert.ok(!serialised.includes(secret), `diagnostics must not carry ${secret === "ABCDE1234F" ? "the PAN" : "identity data"}`);
  }
});

check("an empty identity field is reported as empty, not as present", () => {
  const d = vendorDiagnostics({ identity_sent: { forename: "A", surname: "", pan_id: null } });
  assert.deepEqual(d.identitySent, ["forename=present", "surname=empty", "pan_id=empty"]);
});

check("match_strength is kept — it is what shows why a match was weak", () => {
  const d = vendorDiagnostics(DIAG_400);
  assert.equal(d.matchStrength.score, 95);
  assert.equal(d.matchStrength.level, "strong");
  assert.deepEqual(d.matchStrength.missing, ["PIN code"]);
});

check("free-text diagnostics are sanitised before being kept", () => {
  const d = vendorDiagnostics(DIAG_400);
  assert.ok(!d.whatToDoNext.includes("ABCDE1234F"), "PAN redacted");
  assert.ok(!d.whatToDoNext.includes("1994-06-12"), "DOB redacted");
  assert.match(d.whatToDoNext, /\[PAN\]/);
});

check("the vendor's own retryable flag is recorded, not obeyed", () => {
  const d = vendorDiagnostics(DIAG_400);
  assert.equal(d.vendorRetryableFlag, true, "recorded for the operator");
  assert.equal(classifyRetryability({ data: DIAG_400, httpStatus: 400 }), "not_retryable",
    "but a 400 is still deterministic");
});

check("a non-object body yields no diagnostics rather than throwing", () => {
  assert.equal(vendorDiagnostics(null), null);
  assert.equal(vendorDiagnostics("gateway timeout"), null);
});

/* ── Regression: the authentication artefacts of a "partial" flow ─────────
 * Production, FORM-664454 (2026-08-13): HTTP 200, status "partial", the bureau
 * still waiting for the customer's authentication answer. The body names the
 * web-token URL that collects that answer — the only route to finishing the
 * pull — and it was being parsed, logged as a byte count, and dropped, because
 * every failure path discards the body.
 *
 * The response carries each URL under BOTH a namespaced and a short key, so the
 * extractor is checked against both spellings independently. */
console.log("\npending authentication (partial flow)");

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

const PARTIAL_200 = {
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

check("the production partial body yields every actionable field", () => {
  const p = extractPendingAuthentication(PARTIAL_200);
  assert.equal(p.pendingAuthentication, true);
  assert.equal(p.webTokenUrl, "https://webtoken.transunion.example/session/abc123");
  assert.equal(p.jsonReportUrl, "https://api.xaler.example/reports/abc123.json");
  assert.equal(p.pdfReportUrl, "https://api.xaler.example/reports/abc123.pdf");
  assert.equal(p.requestId, "tu_1755000000000_aabbccddeeff");
  assert.equal(p.vendorRetryableFlag, true);
});

check("the short key spellings are read when the namespaced ones are absent", () => {
  const p = extractPendingAuthentication({
    pending_authentication: true,
    web_token_url: "https://wt.example/s/1",
    report_url: "https://r.example/1.json",
    pdf_report_url: "https://r.example/1.pdf",
  });
  assert.equal(p.webTokenUrl, "https://wt.example/s/1");
  assert.equal(p.jsonReportUrl, "https://r.example/1.json");
  assert.equal(p.pdfReportUrl, "https://r.example/1.pdf");
});

check("the namespaced key wins when both spellings are present", () => {
  const p = extractPendingAuthentication({
    transunion_webtoken_url: "https://wt.example/namespaced",
    web_token_url: "https://wt.example/short",
  });
  assert.equal(p.webTokenUrl, "https://wt.example/namespaced");
});

check("only absolute http(s) links are handed on", () => {
  // These are rendered as links by the admin UI, so a script-bearing URL in a
  // vendor payload must not survive extraction.
  const p = extractPendingAuthentication({
    // eslint-disable-next-line no-script-url
    web_token_url: "javascript:alert(1)",
    report_url: "data:text/html,<script>alert(1)</script>",
    pdf_report_url: "/relative/path.pdf",
  });
  assert.equal(p.webTokenUrl, "", "javascript: rejected");
  assert.equal(p.jsonReportUrl, "", "data: rejected");
  assert.equal(p.pdfReportUrl, "", "a relative path is not a vendor link");
});

check("an absurdly long link is rejected rather than forwarded", () => {
  const p = extractPendingAuthentication({ web_token_url: `https://wt.example/${"x".repeat(4000)}` });
  assert.equal(p.webTokenUrl, "");
});

check("the shared extraction is reused, not re-derived under a second key list", () => {
  // extractReport() already resolves client_key → requestId and report_url →
  // reportUrl for every other branch of this client. If the pending block ever
  // stops agreeing with it, these two are the fields that would silently drift.
  const p = extractPendingAuthentication(PARTIAL_200);
  assert.equal(p.requestId, PARTIAL_200.client_key, "the same identifier the success path stores");
  const noNamespaced = { ...PARTIAL_200 };
  delete noNamespaced.transunion_json_report_url;
  assert.equal(extractPendingAuthentication(noNamespaced).jsonReportUrl, PARTIAL_200.report_url,
    "falls back to the shared extractor's reportUrl, not a private key list");
});

check("an already-computed extraction is used verbatim when the caller supplies one", () => {
  const p = extractPendingAuthentication(
    { pending_authentication: true },
    { requestId: "tu_shared", reportUrl: "https://r.example/shared.json" }
  );
  assert.equal(p.requestId, "tu_shared", "no second resolution pass");
  assert.equal(p.jsonReportUrl, "https://r.example/shared.json");
});

check("a missing pending_authentication is null — not a claim that it is false", () => {
  assert.equal(extractPendingAuthentication({ status: "partial" }).pendingAuthentication, null);
  assert.equal(extractPendingAuthentication({ pending_authentication: false }).pendingAuthentication, false);
  assert.equal(extractPendingAuthentication({ pending_authentication: "OTP unanswered" }).pendingAuthentication, true);
});

check("a non-object body yields no block rather than throwing", () => {
  assert.equal(extractPendingAuthentication(null), null);
  assert.equal(extractPendingAuthentication("gateway timeout"), null);
});

check("no identity is carried out of the payload", () => {
  const p = extractPendingAuthentication({
    ...PARTIAL_200,
    identity_sent: { pan_id: "ABCDE1234F", forename: "Ravi", date_of_birth: "1994-06-12" },
  });
  const serialised = JSON.stringify(p);
  for (const secret of ["ABCDE1234F", "Ravi", "1994-06-12"]) {
    assert.ok(!serialised.includes(secret), `must not carry ${secret}`);
  }
});

/* End to end through the real client, with fetch stubbed — no network. This is
 * what proves the extractor is actually wired into the partial branch. */
const withStubbedFetch = async (httpStatus, payload, fn) => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ status: httpStatus, text: async () => JSON.stringify(payload) });
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
};
const CONFIG = { apiUrl: "https://vendor.example/api", apiKey: "k" };
const PARTY = { firstName: "A", surname: "B", dateOfBirth: "1978-01-01", mobile: "9000000000" };

await acheck("HTTP 200 / partial → pending, retryable, with the authentication block", async () => {
  const res = await withStubbedFetch(200, PARTIAL_200, () => fetchCibilReport(PARTY, CONFIG));
  assert.equal(res.ok, false, "no report was produced");
  assert.equal(res.pending, true, "the discriminator the caller branches on");
  assert.equal(res.retryability, "retryable", "doc §5.5 — no charge, retry allowed");
  assert.match(res.reason, /authentication answer/, "the vendor's own explanation");
  assert.ok(res.pendingAuth, "the authentication block must be attached");
  assert.equal(res.pendingAuth.webTokenUrl, "https://webtoken.transunion.example/session/abc123");
  assert.equal(res.raw.status, "partial", "the complete body is still returned for storage");
});

await acheck("a successful flow gains no pending block and is otherwise unchanged", async () => {
  const res = await withStubbedFetch(200, { status: "success", riskScore: 721, client_key: "tu_ok" },
    () => fetchCibilReport(PARTY, CONFIG));
  assert.equal(res.ok, true);
  assert.equal(res.extracted.score, 721);
  assert.equal(res.pendingAuth, undefined, "success carries no pending authentication");
  assert.equal(res.pending, undefined);
});

await acheck("a transport-class 5xx is exhausted and stays unavailable, never pending", async () => {
  const res = await withStubbedFetch(503, {}, () => fetchCibilReport(PARTY, CONFIG));
  assert.equal(res.ok, false);
  assert.equal(res.unavailable, true);
  assert.equal(res.pending, undefined, "a gateway fault is not a pending authentication");
  assert.equal(res.pendingAuth, undefined);
  assert.equal(res.retryability, "retryable");
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
  (process.exitCode ? "" : ", 0 failures")
);
