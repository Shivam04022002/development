// models/ApplicationHistory.js
import mongoose from "mongoose";

const applicationHistorySchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    formId: {
      type: String,
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      required: true,
      enum: [
        "FORM_CREATED",
        "STAGE_CHANGED",
        "STATUS_CHANGED",
        "APPROVED",
        "REJECTED",
        "CIBIL_REQUESTED",
        "CIBIL_RESPONSE_RECEIVED",
        "CIBIL_PENDING",
        // A pull was deliberately not made because that subject already has a
        // report (the duplicate-fetch guard). Without this value the entry was
        // rejected by enum validation and silently dropped, because
        // createHistoryEntry swallows its errors.
        "CIBIL_SKIPPED",
        // On-demand co-applicant bureau fetch, requested explicitly by an admin.
        "CO_APPLICANT_CIBIL_FETCH_REQUESTED",
        "CO_APPLICANT_CIBIL_FETCHED",
        "CO_APPLICANT_CIBIL_FETCH_FAILED",
        "REVOKED",
        "COMMENT",
        "COMMENT_ADDED",
        "NOTE_ADDED",
        "DOCUMENT_UPLOADED",
        "DOCUMENT_VERIFIED",
        "DOCUMENT_REJECTED",
        "DOCUMENT_REUPLOAD_REQUESTED",
        "DEALER_DOCUMENT_UPLOADED",
        "DOCUMENT_REMOVED",
        "VEHICLE_DETAILS_UPDATED",
        "CUSTOMER_DETAILS_UPDATED",
        "CO_APPLICANT_UPDATED",
        "APPLICANT_ROLE_SWAPPED",
        "DEALER_ASSIGNED",
        "APPLICATION_ASSIGNED",
        "ASSIGNMENT_UPDATED",
        "ASSIGNMENT_CLOSED",
        "BRANCH_CHANGED",
        "REJECTION_REASON_UPDATED",
        "EDIT_FIELDS",
        "OTHER",
      ],
    },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    remarks: { type: String, default: "" },
    updatedBy: { type: String, required: true },
    updatedByEmail: { type: String, default: "" },
    updatedByRole: { type: String, default: "admin" },
    updatedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

applicationHistorySchema.index({ formId: 1, updatedAt: -1 });
applicationHistorySchema.index({ applicationId: 1, updatedAt: -1 });
applicationHistorySchema.index({ updatedByAdminId: 1 });
applicationHistorySchema.index({ actionType: 1 });

export default mongoose.model(
  "ApplicationHistory",
  applicationHistorySchema,
  "applicationHistories"
);
