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
import {
  processApplicationCibil,
  findReportForSubject,
} from "../services/cibilProcessingService.js";
import { extractPendingAuthentication } from "../services/xalerCibilService.js";
import { partySubjectPan } from "../models/cibilSubjectSchemas.js";
import Application from "../models/Application.js";
import ApprovedApplication from "../models/ApprovedApplication.js";
import RejectedApplication from "../models/RejectedApplication.js";
import CibilReport from "../models/CibilReport.js";
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

/* ── Applicant bureau fetch ────────────────────────────────────────────────
 *
 * The applicant's report is normally pulled once, automatically, at application
 * creation (applicationService → processApplicationCibil). When that attempt
 * came back without a score — the bureau was still awaiting the customer's
 * authentication answer, or the vendor was unreachable — there was no way to
 * try again from the admin UI: the only on-demand endpoint was the
 * co-applicant's.
 *
 * This handler adds that door. It deliberately does NOT re-implement anything:
 * the work is done by processApplicationCibil, the SAME function the automatic
 * path calls, so the applicant flow has exactly one implementation. This
 * controller only decides whether to call it and how to describe the result.
 */

/** The application, whichever collection it currently lives in. */
async function findAnyApplication(applicationId) {
  for (const Model of [Application, ApprovedApplication, RejectedApplication]) {
    const doc = await Model.findById(applicationId);
    if (doc) return doc;
  }
  return null;
}

/**
 * Describe what the completed run produced, reading the records the service
 * already wrote rather than re-deriving anything from the vendor payload.
 */
async function describeApplicantOutcome(applicationId, subjectPan) {
  const fresh = await findAnyApplication(applicationId);
  const cibil = fresh?.cibil || {};
  if (cibil.score) {
    return {
      ok: true,
      status: "fetched",
      score: cibil.score,
      retryability: "n/a",
      retryable: false,
      message: "Applicant CIBIL report fetched successfully.",
    };
  }

  // No score. The stored raw response says whether the bureau is waiting on the
  // customer (retryable, and there is something the operator can act on) or the
  // request simply failed.
  const report = await CibilReport.findOne({ applicationId, subjectPan }).lean();
  const raw = report?.rawResponse;
  const flow = String(raw?.status || "").toLowerCase();

  if (flow === "partial") {
    return {
      ok: false,
      status: "in_progress",
      retryability: "retryable",
      retryable: true,
      // Same normalised block the co-applicant path returns, from the same
      // extractor — the UI renders one pending state for both parties.
      pendingAuthentication: extractPendingAuthentication(raw),
      message: typeof raw?.message === "string" ? raw.message : "CIBIL identity verification pending.",
    };
  }

  const vendorSaysNoRetry = raw && typeof raw.retryable === "boolean" && raw.retryable === false;
  return {
    ok: false,
    status: vendorSaysNoRetry ? "not_retryable" : "vendor_failed",
    retryability: vendorSaysNoRetry ? "not_retryable" : "unknown",
    retryable: false,
    message: typeof raw?.message === "string" ? raw.message : "CIBIL could not be fetched.",
  };
}

/** POST /api/cibil/:applicationId/applicant/fetch — super admin only. */
export const fetchApplicantCibilReport = async (req, res) => {
  const { applicationId } = req.params;
  try {
    const app = await findAnyApplication(applicationId);
    if (!app) {
      return res.status(404).json({ success: false, status: "not_found", message: "Application not found." });
    }

    const subjectPan = partySubjectPan(app.applicant);

    // A bureau pull is billable and the applicant path has no reservation lock
    // of its own, so the guard lives here: a report that already carries a
    // requestId is a completed pull and must not be paid for twice. This also
    // guarantees an edit-then-fetch cannot replace or delete a stored report.
    const existing = await findReportForSubject(CibilReport.collection, app._id, subjectPan);
    if (existing && String(existing.requestId || "").trim()) {
      return res.status(STATUS_CODE.already_exists).json({
        success: false,
        status: "already_exists",
        subject: "applicant",
        subjectPan,
        reportId: String(existing._id),
        message: "A CIBIL report already exists for this applicant.",
      });
    }

    // The existing applicant service. It owns every decision that follows —
    // scoring, the pending/unavailable state, history, and the configured
    // auto-reject rule — exactly as it does at application creation.
    await processApplicationCibil(app);

    const outcome = await describeApplicantOutcome(app._id, subjectPan);
    const code = STATUS_CODE[outcome.status] ?? 200;

    return res.status(code).json({
      success: Boolean(outcome.ok),
      status: outcome.status,
      subject: "applicant",
      subjectPan,
      score: outcome.score,
      retryability: outcome.retryability,
      retryable: outcome.retryable,
      pendingAuthentication: outcome.pendingAuthentication,
      message: outcome.message,
    });
  } catch (err) {
    logError("applicant_cibil_endpoint_failed", { applicationId, error: err?.message });
    return res.status(500).json({ success: false, message: "Failed to fetch applicant CIBIL." });
  }
};

export default { fetchCoApplicantCibilReport, fetchApplicantCibilReport };
