// models/ApprovedApplication.js
import mongoose from "mongoose";

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
  },
  { timestamps: true } 
);

export default mongoose.models.ApprovedApplication
  || mongoose.model("ApprovedApplication", approvedApplicationSchema, "approvedApplications");