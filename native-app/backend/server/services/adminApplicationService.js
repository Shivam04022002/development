// services/adminApplicationService.js
//
// Core Backend Redesign (Phase 2).
// The Mobile Backend is now a GATEWAY: it authenticates the dealer, then
// forwards the complete application payload to the Admin Backend, which is the
// only writer of MongoDB. This replaces the old adminMergeService (which called
// the removed merge endpoint after writing three local collections).
//
import axios from "axios";

const ADMIN_BACKEND_URL = process.env.ADMIN_BACKEND_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const REQUEST_TIMEOUT_MS = 15000; // uploads already went to Cloudinary; this is JSON only

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [500, 1000, 2000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * forwardApplication({ applicant, coApplicant, vehicleDetails, dealer })
 *
 * Sends the full payload to POST {ADMIN_BACKEND_URL}/api/applications.
 * `dealer` is the authenticated mobile User (req.user); its identity is passed
 * via headers so the Admin Backend can resolve the dealer + branch.
 *
 * Returns { success, created, applicationId, alreadyExists, reason, status }.
 * On transport failure it returns { success:false } so the caller can decide
 * how to surface it (submission is only "safe" once the Admin Backend confirms,
 * because the Admin Backend is now the single writer).
 */
export async function forwardApplication({ applicant, coApplicant, vehicleDetails, dealer }) {
  const tag = `[forwardApplication:${vehicleDetails?.formId || applicant?.formId || "?"}]`;

  if (!ADMIN_BACKEND_URL) {
    console.error(`${tag} ADMIN_BACKEND_URL is not set. Cannot forward application.`);
    return { success: false, reason: "config_missing" };
  }

  const url = `${ADMIN_BACKEND_URL.replace(/\/$/, "")}/api/applications`;

  const headers = {
    "Content-Type": "application/json",
    ...(INTERNAL_API_KEY ? { "x-internal-api-key": INTERNAL_API_KEY } : {}),
    ...(dealer?._id ? { "x-dealer-id": String(dealer._id) } : {}),
    ...(dealer?.UserId ? { "x-dealer-userid": String(dealer.UserId) } : {}),
    ...(dealer?.email ? { "x-dealer-email": String(dealer.email) } : {}),
  };

  const body = { applicant, coApplicant, vehicleDetails, source: "mobile" };

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      await sleep(RETRY_DELAYS_MS[attempt - 2]);
      console.warn(`${tag} Retry ${attempt}/${MAX_RETRIES}`);
    }

    try {
      const response = await axios.post(url, body, { headers, timeout: REQUEST_TIMEOUT_MS });
      const data = response.data ?? {};

      // 201 = created, 200 = idempotent repeat (already exists) — both are success.
      // `cibilStatus`/`reason`/`message` carry the Phase 4 dealer outcome
      // ("rejected" on low CIBIL, otherwise "pending_cibil").
      if (response.status === 201) {
        console.log(`${tag} Created — applicationId=${data.applicationId} cibil=${data.status}`);
        return {
          success: true,
          created: true,
          applicationId: data.applicationId,
          httpStatus: 201,
          cibilStatus: data.status,
          reason: data.reason,
          message: data.message,
        };
      }
      if (response.status === 200) {
        console.log(`${tag} Already exists — applicationId=${data.applicationId} cibil=${data.status}`);
        return {
          success: true,
          created: false,
          alreadyExists: true,
          applicationId: data.applicationId,
          httpStatus: 200,
          cibilStatus: data.status,
          reason: data.reason,
          message: data.message,
        };
      }

      console.warn(`${tag} Unexpected status ${response.status} — treating as success`);
      return { success: true, created: true, status: response.status };
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const isClientError = status && status >= 400 && status < 500 && status !== 429;

      console.error(
        `${tag} Attempt ${attempt} failed — status=${status ?? "network_err"} — ${err.message}`
      );
      if (err.response?.data) {
        console.error(`${tag} Admin response:`, JSON.stringify(err.response.data));
      }

      // Non-retryable client errors (bad payload, auth, dealer not resolved): stop.
      if (isClientError) {
        return {
          success: false,
          reason: err.response?.data?.reason || "rejected_by_admin",
          status,
        };
      }
      // else retry (network / 5xx / 429)
    }
  }

  console.error(`${tag} All retries exhausted. Last error: ${lastError?.message}`);
  return { success: false, reason: "admin_unreachable" };
}

export default { forwardApplication };
