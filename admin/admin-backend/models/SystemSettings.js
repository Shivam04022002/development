import mongoose from "mongoose";

/**
 * SystemSettings — system-wide configuration (singleton document).
 *
 * A single document (key: "system") holds all configuration sections. The first
 * section is `cibil`. Future phases can add sibling sections (e.g. creditNote)
 * without changing this shape.
 *
 * SECURITY: `cibil.apiKey` is stored ENCRYPTED (see utils/secretCrypto.js). It is
 * never returned to clients in plaintext — the controller masks it on read.
 *
 * NOTE (Phase 3 scope): this stores configuration only. Nothing here calls the
 * TransUnion API, validates credentials, or affects the application workflow.
 */
// One score band. Bands are validated in the controller (continuous,
// non-overlapping) before they are saved.
const scoreRangeSchema = new mongoose.Schema(
  { min: { type: Number, required: true }, max: { type: Number, required: true } },
  { _id: false }
);

const cibilConfigSchema = new mongoose.Schema(
  {
    apiUrl: { type: String, default: "" },
    apiKey: { type: String, default: "" },        // encrypted at rest
    minimumScore: { type: Number, default: 650 },
    autoRejectLowCibil: { type: Boolean, default: true },
    lowCibilRejectionReason: { type: String, default: "Low CIBIL Score" },

    // Decision bands. Absent on older documents — utils/cibilRanges.js falls
    // back to the defaults so nothing crashes.
    pendingRange: { type: scoreRangeSchema, default: () => ({ min: -1, max: 200 }) },
    rejectRange: { type: scoreRangeSchema, default: () => ({ min: 201, max: 649 }) },
    passRange: { type: scoreRangeSchema, default: () => ({ min: 650, max: 900 }) },
  },
  { _id: false }
);

const systemSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "system", unique: true },
    cibil: { type: cibilConfigSchema, default: () => ({}) },

    // audit
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("SystemSettings", systemSettingsSchema, "systemsettings");
