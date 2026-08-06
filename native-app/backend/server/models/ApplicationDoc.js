// models/ApplicationDoc.js
//
// The `applications` collection as the DEALER ACTION flow needs to see it.
//
// Why not reuse models/pendingFiles.js: that model maps to the same collection
// but declares a narrow, typed subset — `applicant: { name, email, phone, pan }`
// with no document fields and no documentVerification. Reads there drop
// everything undeclared, and Mongoose strict mode silently strips undeclared
// paths from updates, so a dealer's document write through it would be a no-op.
//
// This model mirrors the Admin Backend's Application for the fields this flow
// touches — applicant / coApplicant as flexible objects, exactly as they are
// stored — and leaves pendingFiles.js and every screen using it untouched.
//
import mongoose from "mongoose";
import { documentVerification } from "./documentVerificationSchemas.js";

const applicationDocSchema = new mongoose.Schema(
  {
    formId: String,
    applicant: Object,
    coApplicant: Object,
    vehicleDetails: Object,
    documents: Object,
    dealer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    dealerDetails: Object,
    status: String,
    workflowStage: String,
    documentVerification,
  },
  { timestamps: true, strict: false } // strict:false — never drop fields this
                                      // service does not model but the Admin
                                      // Backend owns (cibil, history, …)
);

export default mongoose.models.ApplicationDoc
  || mongoose.model("ApplicationDoc", applicationDocSchema, "applications");
