// controllers/cibilFetchController.js
//
// The one WRITE endpoint in the CIBIL module: an explicit, admin-triggered
// bureau fetch for the co-applicant.
//
// Kept out of cibilReportController.js on purpose — that file is read-only
// viewing of an already-stored report, and mixing a billable outbound vendor
// call into it would blur a boundary worth keeping sharp.
//
// All decisions live in services/coApplicantCibilService.js. This controller
// only maps the service's structured outcome onto HTTP, using the response
// shape the CIBIL module already uses: { success, message, ... }.
//
import { fetchCoApplicantCibil } from "../services/coApplicantCibilService.js";
import { logError } from "../utils/log.js";

/**
 * Outcome → HTTP. Statuses reuse the conventions already present in this
 * backend: 400 for a validation problem, 404 for a missing application, 409
 * for a conflicting in-flight operation, 500 for a failure the caller cannot
 * fix. No new status code or body shape is introduced.
 *
 * A vendor failure is deliberately NOT reported as a low score or a rejection —
 * it carries no score and changes nothing about the application.
 */
const STATUS_CODE = {
  fetched: 200,
  already_exists: 200, // idempotent: the desired state already holds
  in_progress: 409,
  // PAN is optional for a bureau pull. A 400 now means the co-applicant lacks
  // the identity the vendor does require: mobile, forename, surname and DOB.
  missing_identity: 400,
  no_co_applicant: 400,
  consent_required: 403,
  not_found: 404,
  not_configured: 503,
  // A genuine upstream fault: transport error, timeout, 5xx or 429. The gateway
  // really did fail, so 502 is accurate.
  vendor_failed: 502,
  // NOT an upstream fault. The bureau was reached, understood the request and
  // answered it — the answer was simply "no matching credit file" (or a refusal
  // to return a mismatched consumer's report). Reporting that as 502 claimed the
  // gateway had failed when nothing had, which sent an operator hunting for a
  // production outage that did not exist, and would let any proxy or client
  // treat a settled, billable outcome as a transient error worth repeating.
  // 422 says what is true: the request was well formed, and could not be
  // fulfilled. The body still carries `status: "not_retryable"`, which is what
  // the UI actually reads.
  not_retryable: 422,
};

/** POST /api/cibil/:applicationId/co-applicant/fetch — admin only. */
export const fetchCoApplicantCibilReport = async (req, res) => {
  const { applicationId } = req.params;
  try {
    const actor = req.admin?.name || req.admin?.email || req.admin?.id || "Admin";
    const outcome = await fetchCoApplicantCibil(applicationId, { actor });

    const code = STATUS_CODE[outcome.status] ?? 500;

    // Never echo the vendor request, credentials or raw payload back to the
    // caller. The raw report is retrievable only through the existing
    // subject-aware read endpoints, which apply their own auth.
    return res.status(code).json({
      success: Boolean(outcome.ok),
      status: outcome.status,
      subject: "coApplicant",
      subjectPan: outcome.subjectPan,
      score: outcome.score,
      reportId: outcome.reportId,
      summaryMirrored: outcome.summaryMirrored,
      // "retryable" | "not_retryable" | "unknown" — sanitized advice, so the UI
      // can tell a temporary fault from one that will fail identically again.
      retryability: outcome.retryability,
      retryable: outcome.retryable,
      // Present only when the bureau answered "partial": it is still waiting
      // for the customer's authentication answer. Carries the web-token URL
      // that collects it and the report URLs that serve the report once it is
      // given — the one thing an operator can act on, and previously discarded
      // with the rest of the failure body. `undefined` on every other outcome,
      // so it is simply absent from the JSON and nothing else changes shape.
      //
      // This is normalised, http(s)-only data derived from the response — not
      // the raw payload and not the request, both of which stay internal.
      pendingAuthentication: outcome.pendingAuthentication,
      message: outcome.message || outcome.reason,
    });
  } catch (err) {
    logError("coapplicant_cibil_endpoint_failed", { applicationId, error: err?.message });
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch co-applicant CIBIL." });
  }
};

export default { fetchCoApplicantCibilReport };
