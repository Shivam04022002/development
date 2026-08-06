// models/ApprovedApplication.js
import mongoose from "mongoose";
import { rcDetails, numberPlateDetails, spdcDetails } from "./vehicleDocSchemas.js";

const approvedApplicationSchema = new mongoose.Schema(
  {
    formId: { type: String, required: true },
    applicant: { type: Object, required: true },
    coApplicant: { type: Object },
    vehicleDetails: { type: Object },
    dealer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    dealerDetails: { type: Object },
    status: { type: String, default: "approved" },
    workflowStage: { type: String, default: "disbursement" },
    approval: {
      approvedBy: String,
      approvedAt: Date,
    },
    history: [
      {
        stage: String,
        updatedAt: { type: Date, default: Date.now },
        updatedBy: String,
        changes: String,
      },
    ],

    // ── RC & Number Plate module ─────────────────────────────────────────────
    // Written by the dealer upload endpoints in this backend, read by the
    // pending lists and vehicle counts. Same definition the Admin Backend uses
    // for this collection (see vehicleDocSchemas.js).
    rcDetails,
    numberPlateDetails,
    spdcDetails,
  },
  { timestamps: true }
);

export default mongoose.models.ApprovedApplication
  || mongoose.model("ApprovedApplication", approvedApplicationSchema, "approvedApplications");