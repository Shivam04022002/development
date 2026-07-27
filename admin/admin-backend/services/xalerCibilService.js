// services/xalerCibilService.js
//
// Client for the Xaler "Advanced Unified Flow" TransUnion CIBIL API.
//
// Design contract (Phase 4):
//   • Credentials come ONLY from SystemSettings (never hardcoded).
//   • Retries transient failures, enforces a timeout, tolerates invalid bodies.
//   • NEVER throws — always returns a structured result so application creation
//     can continue no matter what the vendor does.
//
// Uses the built-in global fetch (Node 18+/22) with AbortController for the
// timeout, so no extra dependency is added to the admin backend.
//
// NOTE: the exact Xaler request/response field names are vendor-specific. The
// request body and the response extractor below are intentionally defensive and
// check several common key variants. When the real Xaler contract is confirmed,
// adjust `buildRequestBody` and `extractReport` accordingly — nothing else needs
// to change.
//
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
 * Build the request body from stored credentials + applicant PII.
 * Auth fields are included under multiple common names so the same body works
 * whether Xaler expects username/password or clientId/clientSecret style auth.
 */
function buildRequestBody(applicant = {}, config = {}) {
  return {
    // ── Auth (from SystemSettings) ──────────────────────────────────────────
    username: config.username,
    password: config.password,
    clientId: config.clientId,
    clientSecret: config.clientSecret,

    // ── Applicant details ───────────────────────────────────────────────────
    name: applicant.name || "",
    firstName: applicant.name || "",
    fatherName: applicant.fatherName || "",
    dateOfBirth: applicant.dateOfBirth || "",
    gender: applicant.gender || "",
    mobile: applicant.mobileNumber || applicant.mobile || "",
    email: applicant.email || "",
    pan: applicant.panNo || "",
    aadhaar: applicant.aadharNo || "",
    address: applicant.address || "",
    pincode: applicant.pincode || "",
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
    requestId: String(
      pick(data, ["requestId", "requestID", "refId", "referenceId", "transactionId", "data.requestId"]) ?? ""
    ),
    customerName: String(
      pick(data, ["customerName", "name", "consumerName", "data.customerName"]) ?? ""
    ),
    resultCode: String(
      pick(data, ["resultCode", "result", "code", "statusCode", "data.resultCode"]) ?? ""
    ),
    status: String(
      pick(data, ["status", "reportStatus", "data.status"]) ?? ""
    ),
    reportUrl: String(
      pick(data, [
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
 * Returns one of:
 *   { ok:true,  extracted, raw, attempts }                  — score obtained
 *   { ok:false, unavailable:true, reason, attempts, error } — unreachable/timeout/5xx
 *   { ok:false, invalid:true,    reason, raw,  attempts }   — responded but no usable score
 *
 * Never throws.
 */
export async function fetchCibilReport(applicant, config) {
  if (!config || !config.apiUrl) {
    return { ok: false, unavailable: true, reason: "CIBIL API URL not configured", attempts: 0, request: null };
  }

  const requestBody = buildRequestBody(applicant, config);
  // Sanitized copy for persistence (CibilReport.rawRequest) — never store secrets.
  const sanitizedRequest = { ...requestBody, password: undefined, clientSecret: undefined };
  const body = JSON.stringify(requestBody);
  const headers = { "Content-Type": "application/json" };
  // Some deployments expect the client secret as a header too — harmless to
  // include; the vendor ignores unknown headers.
  if (config.clientSecret) headers["x-api-key"] = config.clientSecret;

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

      const status = res.status;

      // Retry on server-side / rate-limit errors.
      if (status >= 500 || status === 429) {
        lastError = new Error(`HTTP ${status}`);
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

      const { extracted, hasScore } = extractReport(data);
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
