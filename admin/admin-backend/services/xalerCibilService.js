// services/xalerCibilService.js
//
// Client for the Xaler "Advanced Unified Flow" TransUnion CIBIL API.
// Implemented against: TransUnion CIBIL Hybrid API, Integration Documentation
// v2.0 — Unified Orchestrator.
//
// Design contract:
//   • Authentication is API-key only (doc §2.1): the key comes ONLY from
//     SystemSettings (never hardcoded) and is sent in the `Authorization`
//     header alongside `Content-Type: application/json`.
//   • One call to the Unified endpoint (doc §5.1,
//     POST /api/transunion-cibil/fulfill-offer-advanced/). Xaler orchestrates
//     all four TransUnion steps internally, so this client never calls
//     FulfillOffer / GetAuthenticationQuestions / GetCustomerAssets /
//     GetProductWebToken itself, and never handles SSN_EXISTS (doc §6).
//   • No payload encryption here: AES-256-CBC, RSA PKCS1v15 and mTLS are
//     performed by Xaler (doc §8). Our only crypto is at-rest encryption of the
//     stored API key (utils/secretCrypto.js).
//   • Retries transient failures, enforces a timeout, tolerates invalid bodies.
//   • NEVER throws — always returns a structured result so application creation
//     can continue no matter what the vendor does.
//
// Uses the built-in global fetch (Node 18+/22) with AbortController for the
// timeout, so no extra dependency is added to the admin backend.
//
import crypto from "crypto";
import { logEvent, logWarn } from "../utils/log.js";

const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pick the first defined, non-empty value among several candidate keys/paths. */
function pick(obj, keys) {
  for (const k of keys) {
    const v = getDeep(obj, k);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/** Support dot-paths like "data.score" in addition to flat keys. */
function getDeep(obj, path) {
  if (!obj) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
  return path.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
}

/**
 * One unique identifier per request. The verified request sends this SAME value
 * in client_key, request_key and partner_customer_id — never three values.
 * Xaler rewrites it itself when TransUnion reports SSN_EXISTS (doc §6), so a
 * fresh id per call still resolves to the same consumer.
 */
function generateRequestId() {
  return `tu_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

/** Split a single stored name into the documented forename / surname pair. */
function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { forename: "", surname: "" };
  return { forename: parts[0], surname: parts.slice(1).join(" ") };
}

/**
 * forename / surname for the request. New applications collect the two parts
 * separately, so use them verbatim. splitName() remains only as the fallback
 * for legacy records that stored a single `name`.
 */
function resolveName(applicant = {}) {
  if (applicant.firstName) {
    return { forename: applicant.firstName, surname: applicant.surname || "" };
  }
  return splitName(applicant.name);
}

/**
 * Format a stored date of birth as the verified YYYY-MM-DD — e.g. 1975-07-05.
 * Applications store the DOB as a full ISO timestamp; the leading date part is
 * taken verbatim so no timezone shift can occur.
 */
function toIsoDate(value) {
  if (!value) return "";
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

/**
 * Resolve the applicant object regardless of how the Application stored it.
 * Legacy records embed the real applicant one level down
 * (application.applicant.applicant); newer records store it flat. Only the
 * object handed to buildRequestBody changes — the builder itself is untouched.
 */
function resolveApplicant(applicant) {
  if (applicant && typeof applicant.applicant === "object" && applicant.applicant !== null) {
    return applicant.applicant;
  }
  return applicant || {};
}

/**
 * Build the request body for the Unified endpoint. Mirrors the request verified
 * manually in Postman EXACTLY — these eight fields and nothing else.
 * Authentication is NOT part of the body: the API key travels in the
 * `Authorization` header.
 */
function buildRequestBody(applicant = {}, requestId) {
  const { forename, surname } = resolveName(applicant);

  return {
    // The one generated id, repeated in all three identifier fields.
    client_key: requestId,
    request_key: requestId,
    partner_customer_id: requestId,

    // Applicant details.
    forename,
    surname,
    pan_id: applicant.panNo || "",
    date_of_birth: toIsoDate(applicant.dateOfBirth),
    phone_number: applicant.mobileNumber || applicant.mobile || "",
  };
}

/**
 * Generic deep walker. Yields [path, key, value] for every leaf in an
 * arbitrary object/array tree, so extraction does not depend on the vendor
 * keeping a fixed response shape.
 */
function* walkLeaves(node, path = "", depth = 0) {
  if (depth > 16 || node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* walkLeaves(node[i], `${path}[${i}]`, depth + 1);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const p = path ? `${path}.${k}` : k;
      if (v !== null && typeof v === "object") yield* walkLeaves(v, p, depth + 1);
      else yield [p, k, v];
    }
  }
}

/** First leaf whose key matches and whose value passes `valid`. */
function findLeaf(data, keyMatches, valid) {
  for (const [path, key, value] of walkLeaves(data)) {
    if (!keyMatches(String(key).toLowerCase())) continue;
    if (valid && !valid(value)) continue;
    return { value, path };
  }
  return { value: undefined, path: "" };
}

// A CIBIL score is 300–900; the range check stops the walker latching onto
// unrelated numerics (e.g. "CreditMix": 25) or onto "scoreName" strings.
const SCORE_MIN = 300;
const SCORE_MAX = 900;
const isScoreValue = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= SCORE_MIN && n <= SCORE_MAX;
};

// Checked in priority order anywhere in the tree. `riskScore` is what the
// TransUnion payload actually uses
// (steps[].response…TrueLinkCreditReport.Borrower.CreditScore.riskScore).
const SCORE_KEYS = ["riskscore", "cibilscore", "creditscore", "bureauscore", "score"];
const DATE_KEYS = ["inquirydate", "reportdate", "report_date", "generatedon", "creationdate", "date"];

/** Locate the score anywhere in the response, preferring the documented keys. */
function findScore(data) {
  for (const wanted of SCORE_KEYS) {
    const hit = findLeaf(data, (k) => k === wanted, isScoreValue);
    if (hit.value !== undefined) return hit;
  }
  return { value: undefined, path: "" };
}

/**
 * Report date. Prefers a date that sits alongside the score (the CreditScore
 * block carries Source.InquiryDate), then falls back to any documented date key.
 */
function findReportDate(data, scorePath) {
  if (scorePath) {
    const parent = scorePath.replace(/\.[^.]+$/, "");
    for (const wanted of DATE_KEYS) {
      for (const [path, key, value] of walkLeaves(data)) {
        if (path.startsWith(parent) && String(key).toLowerCase() === wanted && value) {
          return { value, path };
        }
      }
    }
  }
  for (const wanted of DATE_KEYS.filter((k) => k !== "date")) {
    const hit = findLeaf(data, (k) => k === wanted, (v) => !!v);
    if (hit.value !== undefined) return hit;
  }
  return { value: undefined, path: "" };
}

/**
 * Normalise the vendor response into the fields we persist for quick access.
 * Returns { extracted, hasScore, diagnostics }.
 */
function extractReport(data) {
  const scoreHit = findScore(data);
  const hasScore = scoreHit.value !== undefined;
  const score = hasScore ? Number(scoreHit.value) : null;

  const dateHit = findReportDate(data, scoreHit.path);
  // TransUnion emits "2026-07-29+05:30", which new Date() rejects. Keep the
  // vendor's date but in the parseable leading form so the existing admin
  // formatters render it instead of falling back to "—".
  const reportDate = (() => {
    const raw = String(dateHit.value ?? "");
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : raw;
  })();

  // doc §5.4/§5.5 return `client_key` as the flow identifier and `report_url`
  // for the stored report; both sit at the top level. Deep lookups are kept as
  // fallbacks so a nested variant still resolves.
  const requestId =
    pick(data, ["client_key", "requestId", "requestID", "refId", "referenceId", "transactionId"]) ??
    findLeaf(data, (k) => k === "client_key" || k === "requestid", (v) => !!v).value;

  const reportUrl =
    pick(data, ["report_url", "reportUrl", "pdfUrl", "reportLink", "documentUrl"]) ??
    findLeaf(data, (k) => k === "report_url" || k === "reporturl", (v) => !!v).value;

  const status = pick(data, ["status", "reportStatus", "data.status"]);

  const extracted = {
    score,
    reportDate,
    requestId: String(requestId ?? ""),
    customerName: String(pick(data, ["customerName", "name", "consumerName"]) ?? ""),
    resultCode: String(pick(data, ["resultCode", "result", "code", "statusCode"]) ?? ""),
    status: String(status ?? ""),
    reportUrl: String(reportUrl ?? ""),
  };

  const diagnostics = {
    scorePath: scoreHit.path || null,
    reportDatePath: dateHit.path || null,
    topLevelKeys: data && typeof data === "object" ? Object.keys(data) : [],
    searchedScoreKeys: SCORE_KEYS,
    scoreRange: `${SCORE_MIN}-${SCORE_MAX}`,
  };

  return { extracted, hasScore, diagnostics };
}

/* ── Failure normalisation ────────────────────────────────────────────────
 * Two small, shared decisions about a FAILED vendor response. Success parsing
 * is untouched.
 *
 * Why this exists: the HTTP 400 branch below runs before the `status: "error"`
 * branch, and it only read `data.error`. This vendor puts its explanation in
 * `data.message`, so a real 400 surfaced as the generic "CIBIL request
 * rejected (HTTP 400)" and the useful text — e.g. that the bureau holds no
 * credit record for the identity supplied — was discarded before anyone saw it.
 */

/** Redact anything identity-shaped before a vendor string is stored or logged. */
export const sanitizeVendorText = (text) =>
  String(text ?? "")
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, "[PAN]")     // PAN
    .replace(/\b\d{12}\b/g, "[AADHAAR]")                  // Aadhaar
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "[DATE]")          // DOB-shaped
    .trim()
    .slice(0, 300);

/**
 * The most useful sanitised explanation the vendor gave, in preference order:
 * the structured `error`, then `message`, then a generic HTTP fallback.
 */
export function vendorFailureReason(data, httpStatus, fallback) {
  const structured = typeof data?.error === "string" ? data.error.trim() : "";
  const message = typeof data?.message === "string" ? data.message.trim() : "";
  const chosen = structured || message;
  return chosen
    ? sanitizeVendorText(chosen)
    : fallback || `CIBIL request rejected (HTTP ${httpStatus})`;
}

/**
 * Is repeating this identical request worth another paid call?
 *
 *   "retryable"     transport/temporary — a repeat may succeed
 *   "not_retryable" deterministic — the same request will fail the same way
 *   "unknown"       insufficient evidence; the caller must not assume either
 *
 * Precedence: transport, then HTTP 400, then the vendor's own boolean, then
 * 5xx/429. No vendor-specific condition is invented, and no free-text message
 * is pattern-matched.
 *
 * A 400 is settled BEFORE the vendor boolean is consulted, because the two are
 * answering different questions. Production, 2026-08-11: Xaler's no-credit-
 * record rejection arrives as HTTP 400 with `retryable: true` beside a
 * `what_to_do_next` telling the operator to correct the PAN or date of birth —
 * i.e. "a CORRECTED request may be tried", not "this identical request may
 * succeed". Trusting that flag here classified a deterministic rejection as
 * retryable and cost two further paid calls.
 */
export function classifyRetryability({ data, httpStatus, transport = false } = {}) {
  if (transport) return "retryable";

  // A 400 means the exact request was rejected, so re-sending it unchanged
  // cannot help — whatever the vendor's flag says about a corrected one.
  if (httpStatus === 400) return "not_retryable";

  // Elsewhere the vendor's explicit boolean is the best evidence available.
  if (typeof data?.retryable === "boolean") {
    return data.retryable ? "retryable" : "not_retryable";
  }

  if (
    typeof httpStatus === "number" &&
    (httpStatus >= 500 || httpStatus === 429)
  ) {
    return "retryable";
  }

  return "unknown";
}

/** Parse a response body as JSON, tolerating non-JSON payloads. */
async function parseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text; // non-JSON — caller treats as invalid
  }
}

/**
 * fetchCibilReport(applicant, config)
 *
 * Single call to the Unified endpoint (doc §5.1). Returns one of:
 *   { ok:true,  extracted, raw, attempts }                  — score obtained
 *   { ok:false, unavailable:true, reason, attempts, error } — unreachable / timeout /
 *                                                            5xx (doc §4.3), or a
 *                                                            "partial" flow (doc §5.5)
 *   { ok:false, invalid:true,    reason, raw,  attempts }   — HTTP 400 validation
 *                                                            error (doc §4.1), a
 *                                                            "error" flow, or no
 *                                                            usable score
 *
 * Never throws.
 */
export async function fetchCibilReport(applicant, config) {
  if (!config || !config.apiUrl) {
    return { ok: false, unavailable: true, reason: "CIBIL API URL not configured", attempts: 0, request: null };
  }

  const requestBody = buildRequestBody(resolveApplicant(applicant), generateRequestId());
  // Copy for persistence (CibilReport.rawRequest). The body carries applicant
  // details only — the API key travels in the header and is never stored.
  const sanitizedRequest = { ...requestBody };
  const body = JSON.stringify(requestBody);
  // Required headers, doc §2.1.
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = config.apiKey;

  let lastError = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    attempts = attempt;
    if (attempt > 1) await sleep(RETRY_DELAYS_MS[attempt - 2]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(config.apiUrl, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const httpStatus = res.status;

      // Server errors (doc §4.3: 500 / 502 / 504) and rate limiting → retry.
      if (httpStatus >= 500 || httpStatus === 429) {
        lastError = new Error(`HTTP ${httpStatus}`);
        continue;
      }

      const data = await parseBody(res);

      // Compact response summary. The complete body is already persisted by
      // cibilProcessingService (CibilReport.rawResponse plus the raw-response
      // .json file), so logging it here would only duplicate ~1 MB per request.
      try {
        const size = typeof data === "object" ? JSON.stringify(data).length : String(data ?? "").length;
        logEvent("cibil_response_body", {
          httpStatus,
          bytes: size,
          topLevelKeys: data && typeof data === "object" ? Object.keys(data) : [],
          status: typeof data?.status === "string" ? data.status : null,
          message: typeof data?.message === "string" ? data.message.slice(0, 200) : null,
        });
      } catch (logErr) {
        logWarn("cibil_response_body_unloggable", { error: logErr?.message });
      }

      // Non-object body → invalid.
      if (!data || typeof data !== "object") {
        return {
          ok: false,
          invalid: true,
          reason: "Invalid CIBIL response",
          retryability: classifyRetryability({ httpStatus }),
          raw: data ?? null,
          attempts,
          request: sanitizedRequest,
        };
      }

      // Validation error (doc §4.1, HTTP 400) → the request is wrong, so
      // retrying it unchanged cannot help.
      if (httpStatus === 400 || (httpStatus >= 400 && typeof data.error === "string")) {
        return {
          ok: false,
          invalid: true,
          reason: vendorFailureReason(data, httpStatus),
          retryability: classifyRetryability({ data, httpStatus }),
          raw: data,
          attempts,
          request: sanitizedRequest,
        };
      }

      const { extracted, hasScore, diagnostics } = extractReport(data);
      const flowStatus = String(data.status || "").toLowerCase();

      // ── Documented unified statuses (doc §5.4 / §5.5) ──────────────────────
      // "partial": the flow ran but identity verification is not complete, so
      // no report is available yet. Xaler applies no charge and the same
      // consumer can be retried later — this maps onto the existing "awaiting
      // CIBIL" outcome, which keeps the application at Pending CIBIL.
      if (flowStatus === "partial") {
        return {
          ok: false,
          unavailable: true,
          reason: vendorFailureReason(data, httpStatus, "CIBIL identity verification pending"),
          // doc §5.5: no charge applied and the same consumer may be retried.
          retryability: "retryable",
          raw: data,
          attempts,
          request: sanitizedRequest,
        };
      }

      // "error": the flow failed outright.
      if (flowStatus === "error") {
        return {
          ok: false,
          invalid: true,
          reason: vendorFailureReason(data, httpStatus, "CIBIL flow failed"),
          retryability: classifyRetryability({ data, httpStatus }),
          raw: data,
          attempts,
          request: sanitizedRequest,
        };
      }

      // "success" (or a legacy body without a `status`) still needs a usable
      // score before the minimum-score rule can be applied.
      if (!hasScore) {
        // Everything needed to diagnose a shape change, without another code edit.
        logWarn("cibil_score_not_found", {
          httpStatus,
          topLevelKeys: diagnostics.topLevelKeys,
          detectedStatus: extracted.status || null,
          detectedRequestId: extracted.requestId || null,
          detectedReportUrl: extracted.reportUrl || null,
          detectedReportDate: extracted.reportDate || null,
          searchedScoreKeys: diagnostics.searchedScoreKeys,
          acceptedScoreRange: diagnostics.scoreRange,
          message: typeof data?.message === "string" ? data.message : null,
        });
        return {
          ok: false, invalid: true,
          reason: "CIBIL score missing in response",
          retryability: classifyRetryability({ data, httpStatus }),
          raw: data, attempts, request: sanitizedRequest,
        };
      }

      logEvent("cibil_parsed", {
        score: extracted.score,
        scorePath: diagnostics.scorePath,
        reportDatePath: diagnostics.reportDatePath,
        status: extracted.status || null,
        requestId: extracted.requestId || null,
        hasReportUrl: !!extracted.reportUrl,
      });
      return { ok: true, extracted, raw: data, attempts, request: sanitizedRequest };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      const isTimeout = err.name === "AbortError";
      console.error(
        `[xalerCibil] Attempt ${attempt}/${MAX_RETRIES} failed — ${isTimeout ? "timeout" : err.message}`
      );
      // network/timeout → retry
    }
  }

  return {
    ok: false,
    unavailable: true,
    reason: "Waiting for CIBIL Response",
    retryability: classifyRetryability({ transport: true }),
    attempts,
    error: lastError?.message,
    request: sanitizedRequest,
  };
}

export default { fetchCibilReport };
