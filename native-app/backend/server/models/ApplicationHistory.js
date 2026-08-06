// models/ApplicationHistory.js
//
// Mirror of the Admin Backend's ApplicationHistory, pointing at the SAME
// collection so dealer actions land in the one audit trail the admin already
// reads (Application Details → Timeline / Activity History). No second store.
//
// `strict: false` because the Admin Backend owns this schema; this service only
// appends entries and must never drop a field it does not model.
//
import mongoose from "mongoose";

const applicationHistorySchema = new mongoose.Schema(
  {
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application", index: true },
    formId: String,
    actionType: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    remarks: String,
    updatedBy: String,
    updatedByEmail: String,
    updatedByRole: String,
    updatedByAdminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { strict: false, versionKey: false }
);

// Collection name must match the Admin Backend EXACTLY ("applicationHistories",
// capital H) — MongoDB collection names are case-sensitive, and a mismatch
// would silently write dealer actions into a separate, invisible collection.
export default mongoose.models.ApplicationHistory
  || mongoose.model("ApplicationHistory", applicationHistorySchema, "applicationHistories");
