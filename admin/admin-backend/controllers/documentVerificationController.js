// controllers/documentVerificationController.js
//
// Document Verification — verify / reject / request re-upload, with audit.
//
// Scope: this module changes VERIFICATION STATE ONLY. It never touches the
// stored file, the upload flow, or the document path on the application. The
// documents themselves live on the embedded applicant / coApplicant objects and
// are served by the existing authenticated /api/files route — untouched here.
//
// Roles: the system defines exactly two — `admin` and `superadmin`. There is no
// Loan Officer or Supervisor role to reuse, so capability maps onto what exists:
//   admin      → action a document that is still Pending
//   superadmin → the above, plus OVERRIDE an already Verified/Rejected document
//
import mongoose from "mongoose";
import Application from "../models/Application.js";
import ApprovedApplication from "../models/ApprovedApplication.js";
import ActivityLog from "../models/ActivityLog.js";
import ApplicationHistory from "../models/ApplicationHistory.js";
import {
  DOC_STATUS,
  APPLICANT_DOCS,
  CO_APPLICANT_DOCS,
} from "../models/documentVerificationSchemas.js";
import { createHistoryEntry } from "./formTrackingController.js";
import { sendPushNotification } from "../utils/sendPushNotification.js";
import { logEvent } from "../utils/log.js";

const ROLES = ["applicant", "coApplicant"];

const labelFor = (role, field) => {
  const set = role === "applicant" ? APPLICANT_DOCS : CO_APPLICANT_DOCS;
  return (set.find(([f]) => f === field) || [])[1] || field;
};

const isKnownField = (role, field) =>
  (role === "applicant" ? APPLICANT_DOCS : CO_APPLICANT_DOCS).some(([f]) => f === field);

const isSuperAdmin = (admin) => admin?.role === "superadmin" || admin?.role === "sadmin";

/** Locate the record in whichever collection currently holds it. */
async function findApplication(applicationId) {
  let Model = Application;
  let app = await Application.findById(applicationId).lean();
  if (!app) {
    app = await ApprovedApplication.findById(applicationId).lean();
    Model = ApprovedApplication;
  }
  return { app, Model };
}

/**
 * Shared handler for the three actions.
 *
 * `action` decides the resulting status, whether remarks are mandatory, and
 * which audit entry is written.
 */
async function applyAction(req, res, action) {
  try {
    const { applicationId, role, field } = req.params;
    const remarks = String(req.body?.remarks ?? "").trim();

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ success: false, message: "Invalid application id." });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: "Unknown document owner." });
    }
    if (!isKnownField(role, field)) {
      return res.status(400).json({ success: false, message: `Unknown document "${field}".` });
    }

    // Reject and Re-upload must carry a reason; Verify may.
    if (action !== "verify" && !remarks) {
      return res.status(400).json({
        success: false,
        message:
          action === "reject"
            ? "A reason is required to reject a document."
            : "A reason is required when requesting a re-upload.",
      });
    }

    const { app, Model } = await findApplication(applicationId);
    if (!app) {
      return res.status(404).json({ success: false, message: "Application not found." });
    }

    // The document must actually exist on the record — verification is about a
    // file that was uploaded, not a placeholder.
    const party = app[role]?.applicant || app[role] || {};
    const hasFile = Boolean(party?.[field]) || Boolean(app?.documents?.[role]?.[field]);
    if (!hasFile) {
      return res.status(400).json({
        success: false,
        message: `${labelFor(role, field)} has not been uploaded yet.`,
      });
    }

    // Override gate: changing a decision that has already been made is a
    // supervisor action.
    const current = app.documentVerification?.[role]?.[field]?.status || DOC_STATUS.PENDING;
    const alreadyDecided = current === DOC_STATUS.VERIFIED || current === DOC_STATUS.REJECTED;
    if (alreadyDecided && !isSuperAdmin(req.admin)) {
      return res.status(403).json({
        success: false,
        message: `${labelFor(role, field)} is already ${current}. Only a Super Admin can override a completed verification.`,
      });
    }

    const adminName = req.admin?.name || req.admin?.email || "admin";
    const adminId = req.admin?._id || req.admin?.id || null;
    const now = new Date();
    const base = `documentVerification.${role}.${field}`;

    const $set = { [`${base}.remarks`]: remarks };
    let status;
    let historyType;

    if (action === "verify") {
      status = DOC_STATUS.VERIFIED;
      historyType = "DOCUMENT_VERIFIED";
      $set[`${base}.verifiedBy`] = adminName;
      $set[`${base}.verifiedByAdminId`] = adminId;
      $set[`${base}.verifiedAt`] = now;
    } else if (action === "reject") {
      status = DOC_STATUS.REJECTED;
      historyType = "DOCUMENT_REJECTED";
      $set[`${base}.verifiedBy`] = adminName;
      $set[`${base}.verifiedByAdminId`] = adminId;
      $set[`${base}.verifiedAt`] = now;
    } else {
      status = DOC_STATUS.REUPLOAD;
      historyType = "DOCUMENT_REUPLOAD_REQUESTED";
      $set[`${base}.reuploadRequestedBy`] = adminName;
      $set[`${base}.reuploadRequestedByAdminId`] = adminId;
      $set[`${base}.reuploadRequestedAt`] = now;
    }
    $set[`${base}.status`] = status;

    // timestamps:false — on approved records `updatedAt` is the approval-time
    // proxy the Processing Days export falls back to.
    await Model.updateOne({ _id: applicationId }, { $set }, { timestamps: false });

    const label = labelFor(role, field);
    const who = role === "applicant" ? "Applicant" : "Co-Applicant";

    // ── Audit ────────────────────────────────────────────────────────────
    await createHistoryEntry({
      applicationId,
      formId: app.formId,
      actionType: historyType,
      oldValue: { document: label, owner: who, status: current },
      newValue: { document: label, owner: who, status, remarks },
      remarks: remarks
        ? `${who} ${label}: ${status} — ${remarks}`
        : `${who} ${label}: ${status}`,
      updatedBy: adminName,
      updatedByEmail: req.admin?.email || "",
      updatedByRole: req.admin?.role || "admin",
      updatedByAdminId: adminId,
    });

    try {
      await ActivityLog.create({
        adminId,
        applicationId,
        action: historyType,
        notes: `${who} ${label} → ${status}${remarks ? ` (${remarks})` : ""}`,
        meta: { role, field, label, status, previousStatus: current, remarks, override: alreadyDecided },
        at: now,
      });
    } catch (logErr) {
      console.error("Failed to log document verification:", logErr);
    }

    logEvent("document_verification", {
      applicationId: String(applicationId),
      formId: app.formId,
      role,
      field,
      status,
      override: alreadyDecided,
      adminId: adminId ? String(adminId) : null,
      at: now.toISOString(),
    });

    // ── Notify the dealer on a re-upload request ─────────────────────────
    // Reuses the existing notifier, which persists a Notification row and sends
    // the Expo push. "updated" is an existing enum value, so no schema change.
    let notified = false;
    if (action === "reupload" && app.dealer) {
      try {
        await sendPushNotification(
          app.dealer,
          `${label} requires re-upload`,
          remarks,
          "updated",
          app.formId
        );
        notified = true;
      } catch (nErr) {
        console.error("Re-upload notification failed:", nErr);
      }
    }

    return res.json({
      success: true,
      message: `${label} marked ${status}.`,
      document: { role, field, label, status, remarks, notified },
    });
  } catch (err) {
    console.error("Document verification error:", err);
    return res.status(500).json({ success: false, message: "Failed to update document verification." });
  }
}

export const verifyDocument = (req, res) => applyAction(req, res, "verify");
export const rejectDocument = (req, res) => applyAction(req, res, "reject");
export const requestReupload = (req, res) => applyAction(req, res, "reupload");

/**
 * GET /api/applications/:applicationId/documents/history
 * The verification trail for this application, newest first. Reads the existing
 * ApplicationHistory collection — no separate log.
 */
export const documentHistory = async (req, res) => {
  try {
    const { applicationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ success: false, message: "Invalid application id." });
    }

    const entries = await ApplicationHistory.find({
      applicationId,
      actionType: { $in: ["DOCUMENT_VERIFIED", "DOCUMENT_REJECTED", "DOCUMENT_REUPLOAD_REQUESTED"] },
    })
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      success: true,
      entries: entries.map((e) => ({
        actionType: e.actionType,
        document: e.newValue?.document || "",
        owner: e.newValue?.owner || "",
        status: e.newValue?.status || "",
        remarks: e.newValue?.remarks || "",
        performedBy: e.updatedBy || "",
        at: e.updatedAt,
      })),
    });
  } catch (err) {
    console.error("documentHistory error:", err);
    return res.status(500).json({ success: false, message: "Failed to load document history." });
  }
};

export default { verifyDocument, rejectDocument, requestReupload, documentHistory };
