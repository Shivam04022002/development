import mongoose from "mongoose";
import { cibilSubjects } from "./cibilSubjectSchemas.js";

const RejectedSchema = new mongoose.Schema(
  {
    formId: String,
    applicant: Object,
    coApplicant: Object,
    vehicleDetails: Object,

    // ✅ Add these two:
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",    // allows populate()
    },
    dealerDetails: {
      _id: mongoose.Schema.Types.ObjectId,
      userId: String,
      email: String,
      name: String,
      district: String,
      branch: String,
    },

    status: { type: String, default: "rejected" },

    // workflowStage of a rejected record is "rejected" (terminal). Additive:
    // older records simply won't have it.
    workflowStage: { type: String, default: "rejected" },

    // CIBIL summary retained for auto-rejected (Low CIBIL) applications so the
    // existing Rejected module can display the score. Never stores raw/report URL.
    cibil: {
      score: { type: Number, default: null },
      status: { type: String, default: "" },
      state: { type: String, default: "" },
      // Decision outcome: "NTC" | "PASS" | "REJECT" (set by cibilProcessingService).
      result: { type: String, default: "" },
      reportDate: { type: String, default: "" },
      requestId: { type: String, default: "" },
      fetchedAt: { type: Date, default: null },
    },

    // Carried across from the Application at auto-rejection so the per-person
    // summaries are not lost when the record leaves `applications` (Phase 1 —
    // multi-subject storage). `cibil` above is unchanged and still holds the
    // applicant's summary, which is what the Rejected module reads.
    cibilSubjects,

    rejection: {
      rejectedBy: String,
      reason: String,
      rejectedAt: Date,
    },

    history: [
      {
        updatedBy: String,
        updatedAt: Date,
        changes: String,
      },
    ],
  },
  { timestamps: true }
);

RejectedSchema.index({ formId: 1 });
RejectedSchema.index({ status: 1 });
RejectedSchema.index({ createdAt: -1 });
RejectedSchema.index({ "dealerDetails.branch": 1 });
RejectedSchema.index({ "dealerDetails.district": 1 });
RejectedSchema.index({ dealer: 1 });
RejectedSchema.index({ "dealerDetails.branch": 1, createdAt: -1 });
RejectedSchema.index({ "dealerDetails.name": 1 });

export default mongoose.model("RejectedApplication", RejectedSchema, "rejectedApplications");
