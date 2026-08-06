// controllers/applicantSwapController.js
//
// Applicant ↔ Co-Applicant role swap.
//
// Applicant and Co-Applicant are embedded objects on a single Application
// document — there are no separate records, no ids and no references between
// them. A swap is therefore an exchange of two object values (plus the
// denormalised `documents` block that mirrors them by role) in ONE atomic
// update. Nothing is created, copied, moved or deleted: every identity
// attribute — PAN, Aadhaar, mobile, address, photos, uploaded files, personal
// details — travels with the person because it lives inside that person's
// object.
//
// Files on disk are NOT moved. Each document field stores a full relative path,
// so images keep resolving after the swap; only the folder name
// (applications/<formId>/co-applicant/…) becomes historical.
//
import mongoose from "mongoose";
import Application from "../models/Application.js";
import ApprovedApplication from "../models/ApprovedApplication.js";
import CreditNote from "../models/CreditNote.js";
import ActivityLog from "../models/ActivityLog.js";
import { createHistoryEntry } from "./formTrackingController.js";
import { logEvent } from "../utils/log.js";

/** Name of an embedded party, tolerating the legacy nested shape. */
const partyName = (party) => {
  const p = party?.applicant || party || {};
  return (
    p.name ||
    `${p.firstName || ""} ${p.surname || ""}`.trim() ||
    ""
  );
};

/** PAN of an embedded party, tolerating the legacy nested shape. */
const partyPan = (party) => {
  const p = party?.applicant || party || {};
  return String(p.panNo || p.pan || "").trim().toUpperCase();
};

/** An empty / absent co-applicant cannot be promoted. */
const isEmptyParty = (party) =>
  !party || typeof party !== "object" || Object.keys(party).length === 0;

/**
 * POST /api/applications/:applicationId/swap-applicant
 *
 * Promotes the Co-Applicant to Applicant and demotes the Applicant to
 * Co-Applicant. Admin-only.
 */
export const swapApplicant = async (req, res) => {
  try {
    const { applicationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ success: false, message: "Invalid application id." });
    }

    // The record lives in `applications` until approval, then in
    // `approvedApplications`. Look in both so an approved-but-not-disbursed
    // loan can still be corrected.
    let Model = Application;
    let app = await Application.findById(applicationId).lean();
    if (!app) {
      app = await ApprovedApplication.findById(applicationId).lean();
      Model = ApprovedApplication;
    }
    if (!app) {
      return res.status(404).json({ success: false, message: "Application not found." });
    }

    // Restriction: never after disbursement. `disbursed` is the explicit final
    // stage; records approved through the approve endpoint carry the earlier
    // `disbursement` stage and are still correctable.
    if (String(app.workflowStage || "").trim().toLowerCase() === "disbursed") {
      return res.status(409).json({
        success: false,
        message: "This loan has already been disbursed. The applicant can no longer be swapped.",
      });
    }

    if (isEmptyParty(app.coApplicant)) {
      return res.status(400).json({
        success: false,
        message: "This application has no co-applicant to swap with.",
      });
    }

    const outgoingApplicant = app.applicant;
    const incomingApplicant = app.coApplicant;
    const oldApplicantName = partyName(outgoingApplicant) || "—";
    const newApplicantName = partyName(incomingApplicant) || "—";

    const documents = app.documents || {};
    const $set = {
      applicant: incomingApplicant,
      coApplicant: outgoingApplicant,
      // The denormalised document block is keyed by ROLE, so it swaps with them
      // or it would contradict the embedded objects.
      "documents.applicant": documents.coApplicant || {},
      "documents.coApplicant": documents.applicant || {},
    };

    // Document verification is keyed by role too, so it must swap in the same
    // update — otherwise a verified document would stay attached to the ROLE
    // instead of the person who owns it. Only written when a verification block
    // exists, so untouched applications gain nothing.
    const verification = app.documentVerification;
    if (verification && (verification.applicant || verification.coApplicant)) {
      $set["documentVerification.applicant"] = verification.coApplicant || {};
      $set["documentVerification.coApplicant"] = verification.applicant || {};
    }

    // CIBIL is pulled against the APPLICANT's PAN, so the stored report belongs
    // to whoever is the applicant right now — the person being demoted. Record
    // that subject so the report can still be attributed to them afterwards.
    // The report itself is untouched: not moved, not copied, not re-pulled.
    const hasCibil =
      app.cibil && (app.cibil.score != null || app.cibil.requestId || app.cibil.fetchedAt);
    const existingSubject = String(app.cibil?.subjectPan || "").trim();
    if (Model === Application && hasCibil && !existingSubject) {
      $set["cibil.subjectPan"] = partyPan(outgoingApplicant);
    }

    // timestamps:false — on approved records `updatedAt` is the approval-time
    // proxy the Processing Days export falls back to.
    await Model.updateOne({ _id: applicationId }, { $set }, { timestamps: false });

    // ── Credit Note ────────────────────────────────────────────────────────
    // It is keyed by application and denormalises the APPLICANT's details, so
    // it now describes the wrong person. Refresh the fields and flag the
    // rendered PDF as outdated — the stored file is never overwritten here.
    let creditNoteUpdated = false;
    try {
      const note = await CreditNote.findOne({ applicationId }).lean();
      if (note) {
        const incoming = incomingApplicant?.applicant || incomingApplicant || {};
        // The promoted applicant's own CIBIL — null unless the stored report is
        // theirs, which after a swap it is not.
        const subject = String($set["cibil.subjectPan"] || existingSubject || "").trim();
        const incomingPan = partyPan(incomingApplicant);
        const scoreForNewApplicant =
          subject && incomingPan && subject === incomingPan
            ? (app.cibil?.score ?? null)
            : null;

        await CreditNote.updateOne(
          { applicationId },
          {
            $set: {
              customerName: newApplicantName === "—" ? "" : newApplicantName,
              houseAddress: incoming.address || "",
              cibilScore: scoreForNewApplicant,
              pdfOutdated: Boolean(note.pdfPath),
            },
          }
        );
        creditNoteUpdated = true;
      }
    } catch (cnErr) {
      // A Credit Note problem must not roll back or block the swap; it is
      // reported and left for staff to redo.
      console.error("Credit Note refresh after swap failed:", cnErr);
    }

    // ── Audit ──────────────────────────────────────────────────────────────
    const adminName = req.admin?.name || req.admin?.email || "admin";
    const adminId = req.admin?._id || req.admin?.id || null;
    const at = new Date();

    await createHistoryEntry({
      applicationId,
      formId: app.formId,
      actionType: "APPLICANT_ROLE_SWAPPED",
      oldValue: { applicant: oldApplicantName, coApplicant: newApplicantName },
      newValue: { applicant: newApplicantName, coApplicant: oldApplicantName },
      remarks: `Applicant role swapped: "${oldApplicantName}" → Co-Applicant, "${newApplicantName}" → Applicant`,
      updatedBy: adminName,
      updatedByEmail: req.admin?.email || "",
      updatedByRole: req.admin?.role || "admin",
      updatedByAdminId: adminId,
    });

    try {
      await ActivityLog.create({
        adminId,
        applicationId,
        action: "SWAP_APPLICANT",
        notes: `Applicant "${oldApplicantName}" and Co-Applicant "${newApplicantName}" swapped roles`,
        meta: {
          oldApplicant: oldApplicantName,
          newApplicant: newApplicantName,
          creditNoteRefreshed: creditNoteUpdated,
          collection: Model === Application ? "applications" : "approvedApplications",
        },
        at,
      });
    } catch (logErr) {
      console.error("Failed to log applicant swap:", logErr);
    }

    logEvent("applicant_role_swapped", {
      applicationId: String(applicationId),
      formId: app.formId,
      oldApplicant: oldApplicantName,
      newApplicant: newApplicantName,
      adminId: adminId ? String(adminId) : null,
      at: at.toISOString(),
    });

    return res.json({ success: true, message: "Applicant swapped successfully" });
  } catch (err) {
    console.error("swapApplicant error:", err);
    return res.status(500).json({ success: false, message: "Failed to swap applicant." });
  }
};

export default { swapApplicant };
