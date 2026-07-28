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
const cibilConfigSchema = new mongoose.Schema(
  {
    apiUrl: { type: String, default: "" },
    apiKey: { type: String, default: "" },        // encrypted at rest
    minimumScore: { type: Number, default: 650 },
    autoRejectLowCibil: { type: Boolean, default: true },
    lowCibilRejectionReason: { type: String, default: "Low CIBIL Score" },
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
