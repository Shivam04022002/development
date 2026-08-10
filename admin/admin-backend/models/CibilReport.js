// models/CibilReport.js
//
// Phase 4 correction: the complete Xaler (TransUnion) request/response is an
// INTERNAL record and must NOT live on the Application document. It is stored
// here. The Application keeps only a small CIBIL summary (score, status, state,
// reportDate, requestId, fetchedAt).
//
// Phase 1 (multi-subject storage): one document per application PER SUBJECT,
// rather than one per application. A bureau pull is made against one person's
// PAN, so `subjectPan` identifies whose report this is — the same attribution
// key already used by Application.cibil.subjectPan.
//
// ── Index migration note ──────────────────────────────────────────────────
// The previous unique index was on `applicationId` alone (name:
// "applicationId_1"), which physically permits only one report per
// application. It is replaced here by the compound unique index
// { applicationId, subjectPan }.
//
// The old index is NOT dropped by this schema change — Mongoose's autoIndex
// creates missing indexes but never removes obsolete ones. Dropping it is a
// deliberate, separate step: scripts/backfillCibilSubjects.mjs.
//
// Deploying this file on its own is therefore a no-op for behaviour, and that
// is intentional: while "applicationId_1" survives, a second report for the
// same application still fails with E11000. Phase 1 creates no second report,
// so nothing changes — and the stale index acts as a guardrail against one
// being written before the backfill has attributed the existing rows.
//
// No standalone `applicationId` index is declared: the compound index above has
// applicationId as its prefix, so lookups by applicationId alone still use it.
// Declaring one would also collide by name with the surviving unique index and
// make Mongoose's index build fail on startup.
//
import mongoose from "mongoose";

const cibilReportSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },

    // PAN of the person this report was pulled against. Empty on rows written
    // before Phase 1 until the backfill attributes them, and on records whose
    // applicant had no PAN on file — the existing "empty means the applicant"
    // fallback covers both.
    subjectPan: { type: String, default: "" },

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

// One report per person per application.
cibilReportSchema.index({ applicationId: 1, subjectPan: 1 }, { unique: true });

export default mongoose.model("CibilReport", cibilReportSchema, "cibilreports");
