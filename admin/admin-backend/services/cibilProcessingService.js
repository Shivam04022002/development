// services/cibilProcessingService.js
//
// Orchestrates CIBIL for a freshly created Application:
//   1. loads decrypted CIBIL config from SystemSettings
//   2. calls the Xaler API (retry / timeout / invalid handled there)
//   3. stores the full raw request/response in the CibilReport collection
//      (NOT on the Application — the Application keeps only a summary)
//   4. records Application History entries (System) across the timeline
//   5. applies the minimum-score auto-reject rule
//   6. updates the Application
//
// Status vs. workflowStage (Phase 5A correction):
//   • Pending CIBIL is a WORKFLOW STAGE, never a status.
//   • Awaiting / accepted → status "pending",  workflowStage "pending_cibil".
//   • Auto-rejected        → status "rejected", workflowStage "rejected", and the
//     record is moved into the EXISTING Rejected module (RejectedApplication).
//
// It NEVER throws. Any vendor failure downgrades to Pending CIBIL so that
// application creation is never blocked.
//
import { getDecryptedCibilConfig } from "./systemSettingsService.js";
import { fetchCibilReport } from "./xalerCibilService.js";
import { createHistoryEntry } from "../controllers/formTrackingController.js";
import CibilReport from "../models/CibilReport.js";
import Application from "../models/Application.js";
import RejectedApplication from "../models/RejectedApplication.js";
import { partySubjectPan, upsertCibilSubject } from "../models/cibilSubjectSchemas.js";
import { PENDING_CIBIL_STAGE } from "../utils/workflowConstants.js";
import { decideByScore } from "../utils/cibilRanges.js";
import { writeAppFile } from "../utils/fileStorage.js";
import { logEvent } from "../utils/log.js";

const REJECTED_STAGE = "rejected";

// Dealer-facing status values returned to the app (unchanged — mobile contract).
const DEALER_STATUS = {
  REJECTED: "rejected",
  PENDING_CIBIL: "pending_cibil",
};

const LOW_CIBIL_MESSAGE =
  "Your application has been rejected because your CIBIL score is below the minimum eligibility criteria.";

const WAITING_REASON = "Waiting for CIBIL Response";
const VENDOR = "Xaler-TransUnion";

/**
 * Phase 1 — multi-subject storage.
 *
 * Exactly ONE bureau pull is made per application, and it is made against the
 * APPLICANT. That is unchanged. What is new is only that the result is now
 * filed under the PERSON it belongs to as well as in `cibil`:
 *
 *   • `cibil.subjectPan` is stamped at pull time instead of being left empty
 *     for the "empty means the applicant" fallback to infer later.
 *   • the summary is mirrored into `cibilSubjects`, keyed by that PAN.
 *   • the CibilReport row records the same PAN.
 *
 * `cibil` itself is written exactly as before, so every existing reader is
 * unaffected. Nothing here reads appDoc.coApplicant.
 */

/** The subject of this application's pull: the applicant, always. */
const subjectOf = (appDoc) => partySubjectPan(appDoc?.applicant);

/**
 * Keep the per-person list in step with the summary just written. Called
 * immediately before each save so the two can never disagree on disk.
 */
function syncCibilSubjects(appDoc) {
  // Never overwrite an attribution that is already recorded — a swapped record
  // carries the original subject and this must not silently re-point it.
  const subjectPan = String(appDoc.cibil?.subjectPan || "").trim() || subjectOf(appDoc);
  if (appDoc.cibil && !appDoc.cibil.subjectPan) appDoc.cibil.subjectPan = subjectPan;
  appDoc.cibilSubjects = upsertCibilSubject(appDoc.cibilSubjects, subjectPan, appDoc.cibil || {});
}

/**
 * processApplicationCibil(appDoc)
 *
 * Mutates + saves `appDoc` (or moves it to Rejected). Returns the dealer outcome:
 *   { dealerStatus: "rejected", reason, message }   — auto-rejected on low CIBIL
 *   { dealerStatus: "pending_cibil" }               — accepted or CIBIL pending
 */
export async function processApplicationCibil(appDoc) {
  // Common fields for every history entry created here (performedBy = System).
  const hist = (actionType, remarks, newValue = null) =>
    createHistoryEntry({
      applicationId: appDoc._id,
      formId: appDoc.formId,
      actionType,
      newValue,
      remarks,
      updatedBy: "System",
      updatedByRole: "system",
    });

  try {
    const config = await getDecryptedCibilConfig();

    // ── Timeline: CIBIL Requested ──────────────────────────────────────────
    await hist("CIBIL_REQUESTED", "CIBIL report requested from Xaler (TransUnion)");
    logEvent("cibil_request", { applicationId: String(appDoc._id), formId: appDoc.formId });

    // No configuration yet → treat as unavailable (stays Pending CIBIL).
    if (!config || !config.apiUrl) {
      logEvent("cibil_response", { applicationId: String(appDoc._id), formId: appDoc.formId, ok: false, reason: "not_configured" });
      return await markPending(appDoc, "unavailable", "CIBIL not configured — awaiting response", hist);
    }

    const applicant = appDoc.applicant || {};
    const result = await fetchCibilReport(applicant, config);
    logEvent("cibil_response", {
      applicationId: String(appDoc._id), formId: appDoc.formId,
      ok: !!result.ok, score: result.extracted?.score ?? null,
      attempts: result.attempts ?? null, reason: result.ok ? undefined : result.reason,
    });

    // Persist the vendor record (raw request/response) in CibilReport, filed
    // under the person it was pulled against.
    await saveCibilReport(appDoc, result, subjectOf(appDoc));

    appDoc.cibil = appDoc.cibil || {};
    appDoc.cibil.fetchedAt = new Date();

    // ── Timeline: CIBIL Response Received ──────────────────────────────────
    await hist(
      "CIBIL_RESPONSE_RECEIVED",
      result.ok
        ? `CIBIL response received — score ${result.extracted.score}`
        : `CIBIL response — ${result.reason || "unavailable"}`
    );

    // Vendor unreachable / timeout / no score → stays Pending CIBIL.
    if (!result.ok) {
      return await markPending(appDoc, "unavailable", result.reason || WAITING_REASON, hist);
    }

    // ── Success: store summary on the Application (no raw, no reportUrl) ────
    const ex = result.extracted;
    appDoc.cibil = {
      ...appDoc.cibil,
      score: ex.score,
      status: ex.status,
      reportDate: ex.reportDate,
      requestId: ex.requestId,
    };

    // ── Decision bands, configured in Admin → CIBIL Settings ───────────────
    // The bands themselves stay fully configurable; only the reject band moves
    // the application. Everything else remains at Pending CIBIL until the
    // Credit Note is completed, which is what advances it to Contact Creation.
    // No threshold is hardcoded here.
    const decision = decideByScore(ex.score, config);

    // No usable score (null / unparseable): stay in Pending CIBIL and wait.
    if (decision.matched === null) {
      logEvent("cibil_decision", {
        applicationId: String(appDoc._id), formId: appDoc.formId,
        score: ex.score ?? null, decision: "PENDING_CIBIL", result: "AWAITING",
        configuredRange: null,
      });
      return await markPending(appDoc, "pending", WAITING_REASON, hist);
    }

    const autoReject = config.autoRejectLowCibil === true;
    const isReject = decision.matched === "reject";
    const cibilResult = isReject ? "REJECT" : decision.matched === "pass" ? "PASS" : "NTC";
    const goesToRejected = isReject && autoReject;

    logEvent("cibil_decision", {
      applicationId: String(appDoc._id), formId: appDoc.formId,
      score: ex.score,
      decision: goesToRejected ? "REJECT" : "PENDING_CIBIL",
      result: isReject ? "LOW_CIBIL" : cibilResult,
      configuredRange: decision.configuredRange,
      autoRejectLowCibil: autoReject,
    });

    appDoc.cibil.result = cibilResult;

    // ── Reject band with the master switch on → Rejected Files ─────────────
    if (goesToRejected) {
      const reason = config.lowCibilRejectionReason || "Low CIBIL Score";
      await moveToRejected(appDoc, reason);
      await hist(
        "REJECTED",
        `Auto Rejected — ${reason} (score ${ex.score} in reject range ${decision.configuredRange})`,
        "rejected"
      );
      return { dealerStatus: DEALER_STATUS.REJECTED, reason, message: LOW_CIBIL_MESSAGE };
    }

    // ── Everything else stays at Pending CIBIL ─────────────────────────────
    // NTC, PASS, and reject-band scores when auto-reject is disabled all wait
    // here for the Credit Note, which performs the move to Contact Creation.
    // cibil.result records which band matched.
    const remark =
      cibilResult === "NTC"
        ? `Pending CIBIL — NTC, no or insufficient credit history (score ${ex.score} in pending range ${decision.configuredRange})`
        : cibilResult === "PASS"
        ? `Pending CIBIL — CIBIL passed (score ${ex.score} in pass range ${decision.configuredRange})`
        : `Pending CIBIL — low CIBIL (score ${ex.score} in reject range ${decision.configuredRange}), auto-reject disabled, manual review`;

    appDoc.status = "pending";
    appDoc.workflowStage = PENDING_CIBIL_STAGE;
    appDoc.cibil.state = "pending";
    appDoc.markModified("cibil");
    syncCibilSubjects(appDoc);
    await appDoc.save();
    await hist("CIBIL_PENDING", remark, "pending_cibil");
    return { dealerStatus: DEALER_STATUS.PENDING_CIBIL };
  } catch (err) {
    // Absolute safety net — creation must never fail because of CIBIL.
    console.error("[cibilProcessing] Unexpected error:", err?.message || err);
    try {
      return await markPending(appDoc, "unavailable", WAITING_REASON, hist);
    } catch (saveErr) {
      console.error("[cibilProcessing] Failed to persist pending state:", saveErr?.message || saveErr);
      return { dealerStatus: DEALER_STATUS.PENDING_CIBIL };
    }
  }
}

/** Store the vendor record: raw JSON is written to
 *  uploads/applications/<formId>/cibil/raw-response.json and the CibilReport
 *  keeps the relative path (not the blob). rawRequest (small, sanitized) stays. */
async function saveCibilReport(appDoc, result, subjectPan = "") {
  try {
    const ex = result?.extracted || {};

    // Requirement 10: store the CIBIL raw JSON in the application folder.
    let rawResponsePath = "";
    if (result?.raw !== undefined && result?.raw !== null && appDoc.formId) {
      try {
        rawResponsePath = await writeAppFile(
          appDoc.formId,
          ["cibil", "raw-response.json"],
          JSON.stringify(result.raw, null, 2)
        );
      } catch (e) {
        console.warn("[cibilProcessing] Failed to write raw-response.json:", e?.message || e);
      }
    }

    // Keyed by { applicationId, subjectPan } — the compound unique index — so a
    // future second subject lands in its own row instead of overwriting this
    // one. With one pull per application there is nothing to match yet, so this
    // still inserts exactly one row per application, as before.
    await CibilReport.findOneAndUpdate(
      { applicationId: appDoc._id, subjectPan },
      {
        applicationId: appDoc._id,
        subjectPan,
        vendor: VENDOR,
        rawRequest: result?.request ?? null,
        // Stored in Mongo so the JSON is the permanent source of truth for
        // on-demand PDF/JSON viewing; the file copy below is kept as-is.
        rawResponse: result?.raw ?? null,
        rawResponsePath,                 // relative path under uploads/
        reportUrl: ex.reportUrl || "",
        requestId: ex.requestId || "",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    console.error("[cibilProcessing] Failed to store CibilReport:", err?.message || err);
  }
}

/**
 * Move an auto-rejected application into the EXISTING Rejected module.
 * status = "rejected", workflowStage = "rejected". The original _id is preserved
 * so history / CibilReport references and the Rejected detail view stay valid.
 * (Same collection and endpoints as manual rejections — no separate flow.)
 */
async function moveToRejected(appDoc, reason) {
  // Attribute before the snapshot: the rejected copy must carry the same
  // subject and per-person list the application had.
  syncCibilSubjects(appDoc);
  const src = appDoc.toObject();
  const rejectedDoc = new RejectedApplication({
    _id: src._id,
    formId: src.formId,
    applicant: src.applicant,
    coApplicant: src.coApplicant,
    vehicleDetails: src.vehicleDetails,
    dealer: src.dealer,
    dealerDetails: src.dealerDetails,
    status: "rejected",
    workflowStage: REJECTED_STAGE,
    cibil: { ...(src.cibil || {}), state: "auto_rejected" },
    // Same summaries, same "auto_rejected" state, carried per person.
    cibilSubjects: (src.cibilSubjects || []).map((s) => ({ ...s, state: "auto_rejected" })),
    rejection: { rejectedBy: "System", reason, rejectedAt: new Date() },
    createdAt: src.createdAt,
    updatedAt: new Date(),
    history: src.history || [],
  });
  await rejectedDoc.save({ timestamps: false });
  await Application.findByIdAndDelete(src._id);
}

/** Keep the application at Pending CIBIL (status "pending"), save, record history. */
async function markPending(appDoc, state, remark, hist) {
  appDoc.status = "pending";
  appDoc.workflowStage = PENDING_CIBIL_STAGE;
  appDoc.cibil = appDoc.cibil || {};
  appDoc.cibil.state = state || "pending";
  if (!appDoc.cibil.fetchedAt) appDoc.cibil.fetchedAt = new Date();
  appDoc.markModified("cibil");
  syncCibilSubjects(appDoc);
  await appDoc.save();
  if (hist) await hist("CIBIL_PENDING", remark || WAITING_REASON, "pending_cibil");
  return { dealerStatus: DEALER_STATUS.PENDING_CIBIL };
}

export default { processApplicationCibil };
