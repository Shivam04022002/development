// models/rejectedApplication.js
import mongoose from "mongoose";

const RejectedSchema = new mongoose.Schema(
  {
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    formId: String,
    applicant: Object,
    coApplicant: Object,
    vehicleDetails: Object,
    dealerDetails: Object, // snapshot (name, branch, district, email, etc.)
    status: { type: String, default: "rejected" },
    rejection: {
      rejectedBy: String,
      reason: String,
      rejectedAt: Date,
    },
    history: Array,
  },
  { timestamps: true }
);

// use a clear collection name
export default mongoose.model("RejectedApplication", RejectedSchema, "rejectedApplications");
