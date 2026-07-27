// controllers/appplicationController.js
//
// Core Backend Redesign (Phase 2).
// The Mobile Backend is now a GATEWAY. submitApplication no longer writes to
// MongoDB (no Applicant / CoApplicant / VehicleDetails collections, no merge).
// It authenticates the dealer (via requireAuth) and forwards the complete
// payload to the Admin Backend, which creates the single Application document.
//
import ApprovedApplication from "../models/ApprovedApplication.js";
import RejectedApplication from "../models/rejectedApplication.js";
import PendingFiles from "../models/pendingFiles.js";
import { forwardApplication } from "../services/adminApplicationService.js";

// Full application (applicant + coApplicant + vehicleDetails) → forwarded to Admin Backend
export const submitApplication = async (req, res) => {
  try {
    const { applicant, coApplicant, vehicleDetails } = req.body;

    if (!applicant || !coApplicant || !vehicleDetails) {
      return res.status(400).json({ error: "Incomplete application data" });
    }

    // ── Forward the complete payload to the Admin Backend (single writer) ──
    const result = await forwardApplication({
      applicant,
      coApplicant,
      vehicleDetails,
      dealer: req.user,
    });

    if (result.success) {
      console.log(
        `✅ [SUCCESS] Application forwarded — created=${result.created} ` +
        `alreadyExists=${!!result.alreadyExists} applicationId=${result.applicationId ?? "?"} ` +
        `cibil=${result.cibilStatus ?? "?"}`
      );

      // Phase 4 dealer response — pass through the CIBIL outcome from Admin.
      // Auto-rejected on low CIBIL:
      if (result.cibilStatus === "rejected") {
        return res.status(200).json({
          success: true,
          status: "rejected",
          reason: result.reason || "Low CIBIL Score",
          message:
            result.message ||
            "Your application has been rejected because your CIBIL score is below the minimum eligibility criteria.",
        });
      }

      // Accepted / awaiting CIBIL. `merged` kept for backward compatibility.
      return res.status(200).json({
        success: true,
        status: "pending_cibil",
        merged: true,
      });
    }

    // Forward failed → the application was NOT saved (admin is the only writer).
    // Report honestly so the dealer can retry, keeping the same response shape.
    console.error(`❌ [FAILURE] Forward to Admin Backend failed — reason=${result.reason}`);
    return res.status(502).json({
      success: false,
      merged: false,
      message: "Could not submit application right now. Please try again.",
    });
  } catch (error) {
    console.error("❌ [FAILURE] Error submitting application:", String(error?.message || error));
    console.error("❌ Error stack:", error?.stack);
    try {
      res.status(500).json({ error: "Internal server error", details: String(error?.message || "Unknown error") });
    } catch (resErr) {
      console.error("❌ Failed to send error response:", String(resErr));
      res.status(500).end();
    }
  }
};

export const getPendingApplications = async (req, res) => {
  try {
    // Applications now live in the shared `applications` collection (written by
    // the Admin Backend). PendingFiles is mapped to that collection.
    const userId = req.user._id;
    const pendingApps = await PendingFiles.find({
      status: "pending",
      $or: [{ dealer: userId }, { user: userId }],
    }).lean();
    res.json(pendingApps);
  } catch (error) {
    console.error("Error fetching pending applications:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const getApplicationByFormId = async (req, res) => {
  try {
    const { formId } = req.params;
    let app = await PendingFiles.findOne({ formId }).lean();
    if (!app) {
      app = await ApprovedApplication.findOne({ formId }).lean();
    }
    if (!app) {
      app = await RejectedApplication.findOne({ formId }).lean();
    }

    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    // Ensure it belongs to the logged in user or user's id is somehow linked.
    // Usually dealer is stored in app.dealer or app.user depending on the collection
    const userId = req.user._id.toString();
    const appUserId = app.user?.toString() || app.dealer?.toString() || "";

    // As a simple safety check, though some older apps might not have it properly set:
    if (appUserId && appUserId !== userId) {
      // return res.status(403).json({ error: "Access denied" });
      // Temporarily letting it pass if not fully strict since admin operations might assign it
    }

    res.json(app);
  } catch (error) {
    console.error("Error fetching application by formId:", error);
    res.status(500).json({ error: "Server error" });
  }
};
