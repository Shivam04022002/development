// models/pendingFiles.js
import mongoose from "mongoose";

const pendingFilesSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    formId: {
      type: String,
      required: true,
      unique: true,
    },
    applicant: {
      name: String,
      email: String,
      phone: String,
      pan: String,
      form60: String,
    },
    coApplicant: {
      name: String,
      email: String,
      phone: String,
      pan: String,
      form60: String,
    },
    vehicleDetails: {
      brandName: String,
      modelName: String,
      priceOfVehicle: String,
      financeRequired: String,
      tenure: String,
    },
    dealerDetails: {
      name: String,
      branch: String,
    },
    // ✅ Main status (for Pending / Approved / Rejected)
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    // ✅ Workflow stage (tracks process pipeline)
    workflowStage: {
      type: String,
      default: "contact creation", // first stage
    },
    history: [
      {
        stage: String,
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "applications" } // ⚡ Still mapped to applications collection
);

const PendingFiles = mongoose.model("PendingFiles", pendingFilesSchema);

export default PendingFiles;
