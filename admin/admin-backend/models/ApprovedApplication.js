import mongoose from "mongoose";
import { rcDetails, numberPlateDetails, spdcDetails } from "./vehicleDocSchemas.js";

const approvedApplicationSchema = new mongoose.Schema(
  {
    formId: { type: String, required: true, unique: true },
    applicant: Object,
    coApplicant: Object,
    vehicleDetails: Object,
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    dealerDetails: Object, // snapshot (email, branch, district, name)
    status: { type: String, default: "approved" },
    workflowStage: { type: String, default: "disbursement" },
    // Dedicated, immutable approval timestamp. Unlike the generic `updatedAt`
    // (which timestamps:true can rewrite on any later save), this is set once at
    // approval and is the authoritative source for "Processing Days" in exports.
    approvedAt: { type: Date },
    history: [
      {
        updatedBy: String,
        updatedAt: Date,
        changes: String,
      },
    ],

    // ── RC & Number Plate module ─────────────────────────────────────────────
    // An approved application is the only kind eligible for RC / Number Plate
    // upload, so this is where the sections are actually read and written.
    // Same definition as Application (see vehicleDocSchemas.js).
    rcDetails,
    numberPlateDetails,
    spdcDetails,
  },
  { timestamps: true }
);

approvedApplicationSchema.index({ createdAt: -1 });
approvedApplicationSchema.index({ workflowStage: 1 });
approvedApplicationSchema.index({ "dealerDetails.branch": 1 });
approvedApplicationSchema.index({ "dealerDetails.district": 1 });
approvedApplicationSchema.index({ dealer: 1 });
approvedApplicationSchema.index({ "dealerDetails.branch": 1, createdAt: -1 });
approvedApplicationSchema.index({ "dealerDetails.name": 1 });

// RC & Number Plate module. The dealer's pending lists and vehicle counts are
// always scoped to one dealer, so the compound indexes lead with `dealer`; the
// single-field pairs serve the admin vehicle list, which is not dealer-scoped.
// Declared only here: the Mobile Backend's model points at the same collection
// and inherits these, so there is exactly one owner of the index definitions.
approvedApplicationSchema.index({ dealer: 1, "rcDetails.status": 1 });
approvedApplicationSchema.index({ dealer: 1, "numberPlateDetails.status": 1 });
approvedApplicationSchema.index({ "rcDetails.status": 1 });
approvedApplicationSchema.index({ "numberPlateDetails.status": 1 });

export default mongoose.model(
  "ApprovedApplication",
  approvedApplicationSchema,
  "approvedApplications"
);
