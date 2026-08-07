// models/disbursementSchemas.js
//
// Final disbursement details, captured when an application is moved to the
// `disbursed` stage.
//
// Stored as an additive sub-document on the application (the same pattern as
// documentVerification and assignment) rather than in a new collection: the
// data is one-to-one with the application, is written once, and has to survive
// the move from `applications` to `approvedApplications`.
//
// `default: undefined` — an application that has not been disbursed carries no
// disbursement key at all, so no migration is needed and existing records stay
// exactly as they are.
//
import mongoose from "mongoose";

/** Normalise a loan number for comparison: trimmed, case-insensitive. */
export const normalizeLoanNumber = (v) => String(v ?? "").trim();
export const loanNumberKey = (v) => normalizeLoanNumber(v).toUpperCase();

export const disbursement = {
  type: new mongoose.Schema(
    {
      // Rupees. Stored as a Number so it can be summed and compared; the UI
      // formats it for display.
      approvedAmount: { type: Number, required: true, min: 0 },

      // The lender's own loan number. Casing is preserved exactly as entered;
      // uniqueness is checked case-insensitively in the controller.
      loanNumber: { type: String, required: true, trim: true },

      // The business date of the disbursement, stored as a Date (ISO on the
      // wire). Distinct from `disbursedAt`, which is when the record was made.
      disbursementDate: { type: Date, required: true },

      // Who recorded it, and when. Denormalised name so the details render
      // without joining Admin.
      disbursedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      disbursedByName: { type: String, default: "" },
      disbursedAt: { type: Date, default: null },
    },
    { _id: false }
  ),
  default: undefined,
};

export default { disbursement, normalizeLoanNumber, loanNumberKey };
