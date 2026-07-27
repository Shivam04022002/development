// models/CibilReport.js
//
// Phase 4 correction: the complete Xaler (TransUnion) request/response is an
// INTERNAL record and must NOT live on the Application document. It is stored
// here, one document per application. The Application keeps only a small CIBIL
// summary (score, status, state, reportDate, requestId, fetchedAt).
//
import mongoose from "mongoose";

const cibilReportSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
      unique: true, // one report record per application
    },
    vendor: { type: String, default: "Xaler-TransUnion" },
    // rawRequest never contains the API password/secret.
    rawRequest: { type: mongoose.Schema.Types.Mixed, default: null },
    // rawResponse is stored as a file (see rawResponsePath); kept for legacy docs.
    rawResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    // Relative path to the raw JSON under uploads/ (Phase 7 — local storage).
    rawResponsePath: { type: String, default: "" },
    // Vendor report / PDF reference — kept internal, never exposed to the app UI.
    reportUrl: { type: String, default: "" },
    requestId: { type: String, default: "" },
  },
  { timestamps: true } // provides createdAt / updatedAt
);

export default mongoose.model("CibilReport", cibilReportSchema, "cibilreports");
