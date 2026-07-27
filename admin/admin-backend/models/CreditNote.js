// models/CreditNote.js
//
// Phase 5B — Credit Note, the final step of the Pending CIBIL stage.
// One document per application (upserted). Customer Name, House Address and
// CIBIL Score are populated from the Application; the rest are entered by staff.
//
import mongoose from "mongoose";

const YES_NO = ["Yes", "No"];

const creditNoteSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
      unique: true, // one credit note per application
    },

    // Auto-populated from the Application
    customerName: { type: String, default: "" },
    houseAddress: { type: String, default: "" },
    cibilScore: { type: Number, default: null },

    // Staff-entered
    dpdDays: { type: Number, default: null },
    enquiryCount: { type: Number, default: null },
    suitFiled: { type: String, enum: YES_NO, default: "No" },
    writeOff: { type: String, enum: YES_NO, default: "No" },
    totalOverdue: { type: Number, default: null },
    totalEmiAmount: { type: Number, default: null },
    totalEmiCount: { type: Number, default: null },
    distanceFromBranch: { type: Number, default: null },

    // Relative path to the generated PDF under uploads/ (Phase 7).
    pdfPath: { type: String, default: "" },

    // Audit
    createdBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true } // createdAt / updatedAt
);

export default mongoose.model("CreditNote", creditNoteSchema, "creditnotes");
