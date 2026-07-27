// controllers/applicationController.js
//
// Core Backend Redesign (Phase 2).
// Entry point for creating a loan application. Called by the Mobile Backend
// gateway (server-to-server) after it has authenticated the dealer.
//
import { createApplication } from "../services/applicationService.js";

/**
 * POST /api/applications
 *
 * Body: { applicant, coApplicant, vehicleDetails }
 * Dealer identity is forwarded by the gateway via headers (preferred) or body:
 *   - x-dealer-id     → dealer User _id (from the authenticated mobile token)
 *   - x-dealer-userid → dealer UserId string (fallback)
 *   - x-dealer-email  → dealer email (fallback)
 *
 * Responses:
 *   201 { success:true, applicationId, formId }              — created
 *   200 { success:true, applicationId, alreadyExists:true }  — idempotent repeat
 *   400 { success:false, error }                             — bad payload
 *   422 { success:false, reason }                            — dealer not resolved
 *   500 { success:false, error }                             — unexpected
 */
export const createApplicationHandler = async (req, res) => {
  try {
    const { applicant, coApplicant, vehicleDetails } = req.body || {};

    if (!applicant || !coApplicant || !vehicleDetails) {
      return res.status(400).json({ success: false, error: "Incomplete application data" });
    }

    const dealerId = req.headers["x-dealer-id"] || req.body?.dealerId || null;
    const dealerUserId = req.headers["x-dealer-userid"] || req.body?.dealerUserId || null;
    const dealerEmail = req.headers["x-dealer-email"] || req.body?.dealerEmail || null;

    const result = await createApplication({
      applicant,
      coApplicant,
      vehicleDetails,
      dealerId,
      dealerUserId,
      dealerEmail,
      source: req.body?.source || "mobile",
    });

    // Build the dealer-facing CIBIL response (Phase 4).
    const dealerBody = (base) => {
      const out = { ...base };
      if (result.dealerStatus === "rejected") {
        out.status = "rejected";
        out.reason = result.rejectionReason || "Low CIBIL Score";
        out.message =
          result.message ||
          "Your application has been rejected because your CIBIL score is below the minimum eligibility criteria.";
      } else {
        out.status = "pending_cibil";
      }
      return out;
    };

    if (result.success && result.alreadyExists) {
      return res.status(200).json(
        dealerBody({
          success: true,
          alreadyExists: true,
          applicationId: result.applicationId,
          formId: result.formId,
        })
      );
    }

    if (result.success) {
      return res.status(201).json(
        dealerBody({
          success: true,
          applicationId: result.applicationId,
          formId: result.formId,
        })
      );
    }

    if (result.reason === "dealer_not_resolved") {
      return res.status(422).json({ success: false, reason: result.reason });
    }

    return res.status(400).json({ success: false, reason: result.reason || "invalid_request" });
  } catch (err) {
    console.error("[createApplication] Unexpected error:", err?.message || err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export default { createApplicationHandler };
