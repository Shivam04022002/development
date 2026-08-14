// controllers/applicationPartyController.js
//
// Admin edit of the APPLICANT / CO-APPLICANT detail fields.
//
// Before this there was no way to correct a party's details after submission:
// applicationRoutes exposed creation (gateway), applicant swap and document
// verification, and nothing else wrote to `applicant` / `coApplicant`. A typo in
// a name or a date of birth therefore had to be fixed by the dealer resubmitting
// the whole application.
//
// Modelled on vehicleController.updateVehicleDetails, which is the existing
// pattern for "admin edits one section of an application": validate, build a
// dotted $set from a whitelist, write, log to history, return the updated
// section. No new architecture is introduced.
//
// ── What this endpoint deliberately cannot do ─────────────────────────────
// The update is built from an explicit FIELD WHITELIST, so a caller cannot
// reach _id, formId, dealer, dealerDetails, status, workflowStage, cibil,
// cibilSubjects, documents or any image reference by putting them in the body.
// Those are owned by other flows (creation, workflow, the CIBIL services, the
// upload system) and an edit form is not allowed to move them.
//
// CIBIL is untouched on purpose: editing identity does NOT delete a stored
// report and does NOT trigger a new bureau call. Re-fetching is a separate,
// explicit admin action — see cibilFetchController.
//
import mongoose from "mongoose";
import Application from "../models/Application.js";
import ApprovedApplication from "../models/ApprovedApplication.js";
import RejectedApplication from "../models/RejectedApplication.js";
import { createHistoryEntry } from "./formTrackingController.js";
import { logEvent, logError } from "../utils/log.js";

/** The two parties this endpoint can edit, and the history action for each. */
const ROLES = {
  applicant: { field: "applicant", action: "APPLICANT_DETAILS_UPDATED", label: "Applicant" },
  coApplicant: { field: "coApplicant", action: "CO_APPLICANT_DETAILS_UPDATED", label: "Co-Applicant" },
};

/**
 * Editable detail fields — exactly the text values the admin application view
 * renders for a party. Images (photo, aadharFront, aadharBack, panImage,
 * form60) are deliberately absent: they belong to the upload/document
 * verification flow, which has its own endpoints and its own audit trail.
 *
 * `name` is NOT accepted from the client. It is DERIVED below from
 * firstName + surname, so the composed value can never disagree with its parts.
 */
export const EDITABLE = [
  "firstName",
  "surname",
  "mobileNumber",
  "mobile",
  "email",
  "gender",
  "fatherName",
  "dateOfBirth",
  "aadharNo",
  "panNo",
  "address",
  "pincode",
  "policeStation",
  "postOffice",
  "relation",
  "customRelation",
  "documentType",
];

/** Trim a supplied string; non-strings pass through untouched (e.g. a Date). */
const clean = (v) => (typeof v === "string" ? v.trim() : v);

/**
 * The legacy single `name`, composed from the parts.
 *
 * SURNAME IS OPTIONAL — some people genuinely have only one name. The filter
 * before the join is what stops "First undefined", "First null" and the
 * trailing space of a naive template literal. This mirrors the composition the
 * dealer app already performs at submission, so a record edited here and a
 * record created there are byte-identical in shape.
 */
export const composeName = (firstName, surname) =>
  [clean(firstName) || "", clean(surname) || ""].filter(Boolean).join(" ");

/** The application, whichever collection it currently lives in. */
async function findApplication(applicationId) {
  for (const Model of [Application, ApprovedApplication, RejectedApplication]) {
    const doc = await Model.findById(applicationId);
    if (doc) return { doc, Model };
  }
  return null;
}

/**
 * PATCH /api/applications/:applicationId/party/:role
 *
 * Body: any subset of EDITABLE. Only the keys actually supplied are written, so
 * a partial form submission cannot blank the fields it did not include.
 */
export const updateApplicationParty = async (req, res) => {
  const { applicationId, role } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ success: false, message: "Invalid application id." });
    }

    const roleSpec = ROLES[role];
    if (!roleSpec) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Expected one of: ${Object.keys(ROLES).join(", ")}.`,
      });
    }

    const found = await findApplication(applicationId);
    if (!found) {
      return res.status(404).json({ success: false, message: "Application not found." });
    }
    const { doc: app, Model } = found;

    const body = req.body || {};
    const supplied = EDITABLE.filter((f) => body[f] !== undefined);
    if (supplied.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Nothing to update. Provide at least one editable field.",
      });
    }

    // Legacy records nest the real party one level down
    // (application.applicant.applicant). Write where the data actually lives, or
    // the edit would land beside it and be invisible to every reader.
    const current = app[roleSpec.field] || {};
    const nested =
      current && typeof current.applicant === "object" && current.applicant !== null;
    const base = nested ? `${roleSpec.field}.applicant` : roleSpec.field;
    const existing = nested ? current.applicant : current;

    // A co-applicant edit on an application that has none would create the
    // party as a side effect of a typo. Refuse rather than invent one.
    if (role === "coApplicant" && Object.keys(current).length === 0) {
      return res.status(400).json({
        success: false,
        message: "This application has no co-applicant.",
      });
    }

    const $set = {};
    const changed = [];

    for (const field of supplied) {
      let value = clean(body[field]);
      if (field === "panNo" && typeof value === "string") value = value.toUpperCase();
      $set[`${base}.${field}`] = value;
      changed.push(field);
    }

    // Keep the legacy `name` in step with the parts whenever either changes.
    //
    // First name is required; surname is NOT, and no validation here may make
    // it so. An edit that would leave the party with no first name at all is
    // rejected, because `name` is what every existing screen and stored record
    // reads — emptying it would make the person unidentifiable in the UI.
    if (supplied.includes("firstName") || supplied.includes("surname")) {
      const firstName = supplied.includes("firstName") ? clean(body.firstName) : clean(existing.firstName);
      const surname = supplied.includes("surname") ? clean(body.surname) : clean(existing.surname);
      if (!firstName) {
        return res.status(400).json({
          success: false,
          message: "First name is required. Surname is optional.",
          field: "firstName",
        });
      }
      $set[`${base}.name`] = composeName(firstName, surname);
      changed.push("name");
    }

    await Model.collection.updateOne({ _id: app._id }, { $set });

    // Existing audit convention: a history entry per admin action, actor in
    // `updatedBy`. Field NAMES only — no values, so no personal data reaches
    // the timeline.
    const actor = req.admin?.name || req.admin?.email || req.admin?.id || "Admin";
    try {
      await createHistoryEntry({
        applicationId: app._id,
        formId: app.formId,
        actionType: roleSpec.action,
        remarks: `${roleSpec.label} details updated (${changed.join(", ")})`,
        updatedBy: actor,
        updatedByRole: "admin",
      });
    } catch (histErr) {
      // Never fail the edit because the timeline write failed — same posture as
      // the vehicle and workflow controllers.
      logError("party_update_history_failed", {
        applicationId: String(app._id),
        error: histErr?.message,
      });
    }

    logEvent("application_party_updated", {
      applicationId: String(app._id),
      formId: app.formId,
      role,
      changed,
    });

    const fresh = await Model.findById(app._id).lean();
    const updated = fresh?.[roleSpec.field] || {};

    return res.json({
      success: true,
      message: `${roleSpec.label} details updated.`,
      role,
      changed,
      party: nested ? updated.applicant || {} : updated,
    });
  } catch (err) {
    logError("application_party_update_failed", { applicationId, role, error: err?.message });
    return res.status(500).json({ success: false, message: "Failed to update details." });
  }
};

export default { updateApplicationParty };
