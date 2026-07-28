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
 * Normalise the vendor response into the fields we persist for quick access.
 * Returns { extracted, hasScore }.
 */
function extractReport(data) {
  const scoreRaw = pick(data, [
    "cibilScore", "score", "creditScore", "bureauScore",
    "data.cibilScore", "data.score", "result.score",
  ]);
  const score = scoreRaw === undefined ? null : Number(scoreRaw);
  const hasScore = score !== null && !Number.isNaN(score);

  const extracted = {
    score: hasScore ? score : null,
    reportDate: String(
      pick(data, ["reportDate", "date", "generatedOn", "data.reportDate"]) ?? ""
    ),
    // doc §5.4/§5.5 return `client_key` as the flow identifier.
    requestId: String(
      pick(data, [
        "client_key",
        "requestId", "requestID", "refId", "referenceId", "transactionId", "data.requestId",
      ]) ?? ""
    ),
    customerName: String(
      pick(data, ["customerName", "name", "consumerName", "data.customerName"]) ?? ""
    ),
    resultCode: String(
      pick(data, ["resultCode", "result", "code", "statusCode", "data.resultCode"]) ?? ""
    ),
    // doc §5.4/§5.5 return `status`: "success" | "partial" | "error".
    status: String(
      pick(data, ["status", "reportStatus", "data.status"]) ?? ""
    ),
    // doc §5.4/§5.5 return the S3 report as `report_url`.
    reportUrl: String(
      pick(data, [
        "report_url",
        "reportUrl", "pdfUrl", "reportLink", "pdfLink", "reportPdfUrl",
        "documentUrl", "data.reportUrl", "data.pdfUrl",
      ]) ?? ""
    ),
  };

  return { extracted, hasScore };
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

      // Non-object body → invalid.
      if (!data || typeof data !== "object") {
        return {
          ok: false,
          invalid: true,
          reason: "Invalid CIBIL response",
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
          reason: data.error || `CIBIL request rejected (HTTP ${httpStatus})`,
          raw: data,
          attempts,
          request: sanitizedRequest,
        };
      }

      const { extracted, hasScore } = extractReport(data);
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
          reason: data.message || "CIBIL identity verification pending",
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
          reason: data.message || "CIBIL flow failed",
          raw: data,
          attempts,
          request: sanitizedRequest,
        };
      }

      // "success" (or a legacy body without a `status`) still needs a usable
      // score before the minimum-score rule can be applied.
      if (!hasScore) {
        return { ok: false, invalid: true, reason: "CIBIL score missing in response", raw: data, attempts, request: sanitizedRequest };
      }

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
    attempts,
    error: lastError?.message,
    request: sanitizedRequest,
  };
}

export default { fetchCibilReport };
