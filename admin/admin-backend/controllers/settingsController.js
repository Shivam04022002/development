// controllers/settingsController.js
//
// System Settings — CIBIL configuration (Phase 3).
// Super Admin only. Stores configuration; does NOT call the TransUnion API,
// validate credentials, generate PDFs, or affect the application workflow.
//
import SystemSettings from "../models/SystemSettings.js";
import { encrypt } from "../utils/secretCrypto.js";

import { normalizeRanges, validateRanges, RANGE_ORDER } from "../utils/cibilRanges.js";

const SETTINGS_KEY = "system";

// Sentinel the frontend echoes back for an unchanged secret field.
const MASK = "";

/**
 * Return the CIBIL config safe for the client: secrets are NEVER included as
 * plaintext. Instead we expose booleans indicating whether a secret is set.
 */
function sanitizeCibil(cibil = {}) {
  return {
    apiUrl: cibil.apiUrl || "",
    minimumScore: typeof cibil.minimumScore === "number" ? cibil.minimumScore : 650,
    autoRejectLowCibil:
      typeof cibil.autoRejectLowCibil === "boolean" ? cibil.autoRejectLowCibil : true,
    lowCibilRejectionReason: cibil.lowCibilRejectionReason || "Low CIBIL Score",
    // Decision bands (defaulted for older documents).
    ...normalizeRanges(cibil),
    // Secret presence flag — the value itself is never returned.
    apiKeySet: !!cibil.apiKey,
  };
}

/** Load the singleton settings doc, creating it with defaults if absent. */
async function loadOrCreate() {
  let doc = await SystemSettings.findOne({ key: SETTINGS_KEY });
  if (!doc) {
    doc = await SystemSettings.create({ key: SETTINGS_KEY });
  }
  return doc;
}

/**
 * GET /api/settings/cibil
 * Returns the CIBIL configuration with secrets masked.
 */
export const getCibilSettings = async (req, res) => {
  try {
    const doc = await loadOrCreate();
    return res.json({ success: true, cibil: sanitizeCibil(doc.cibil) });
  } catch (err) {
    console.error("[settings] getCibilSettings error:", err?.message || err);
    return res.status(500).json({ success: false, error: "Failed to load CIBIL settings" });
  }
};

/**
 * PUT /api/settings/cibil
 * Updates the CIBIL configuration.
 *
 * Secret field (apiKey):
 *   - If a non-empty value is supplied, it is encrypted and stored.
 *   - If omitted or empty, the existing stored value is kept (so editing other
 *     fields never wipes the saved key, and it is never round-tripped in
 *     plaintext through the browser).
 *
 * Validation: API URL and API Key are both required. The key counts as present
 * when it is either supplied in this request or already stored, so saving the
 * scoring rules alone does not force the key to be re-entered.
 */
export const updateCibilSettings = async (req, res) => {
  try {
    const doc = await loadOrCreate();
    const body = req.body || {};
    const current = doc.cibil || {};

    // ── Non-secret fields ──────────────────────────────────────────────────
    if (typeof body.apiUrl === "string") current.apiUrl = body.apiUrl.trim();

    if (body.minimumScore !== undefined) {
      const n = Number(body.minimumScore);
      if (!Number.isNaN(n)) current.minimumScore = n;
    }
    if (body.autoRejectLowCibil !== undefined) {
      current.autoRejectLowCibil =
        body.autoRejectLowCibil === true || body.autoRejectLowCibil === "true";
    }
    if (typeof body.lowCibilRejectionReason === "string") {
      current.lowCibilRejectionReason =
        body.lowCibilRejectionReason.trim() || "Low CIBIL Score";
    }

    // ── Secret field — encrypt only when a new value is provided ────────────
    const suppliedApiKey =
      typeof body.apiKey === "string" && body.apiKey !== MASK ? body.apiKey.trim() : "";
    if (suppliedApiKey.length > 0) {
      current.apiKey = encrypt(suppliedApiKey);
    }

    // ── Decision bands ─────────────────────────────────────────────────────
    // Only validated when the request actually carries them, so saving other
    // fields alone cannot fail on ranges it never sent.
    const suppliedRanges = RANGE_ORDER.filter((k) => body[k] !== undefined);
    if (suppliedRanges.length > 0) {
      const merged = normalizeRanges(current);
      for (const key of suppliedRanges) {
        const r = body[key] || {};
        merged[key] = { min: Number(r.min), max: Number(r.max) };
      }
      const rangeErrors = validateRanges(merged);
      if (rangeErrors.length > 0) {
        return res.status(400).json({ success: false, error: rangeErrors.join(" "), errors: rangeErrors });
      }
      for (const key of RANGE_ORDER) current[key] = merged[key];
    }

    // ── Validation — both credentials are required ─────────────────────────
    const missing = [];
    if (!String(current.apiUrl || "").trim()) missing.push("API URL");
    if (!current.apiKey) missing.push("API Key");
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} required.`,
      });
    }

    doc.cibil = current;
    doc.updatedBy = req.admin?._id || req.admin?.id || null;
    doc.markModified("cibil");
    await doc.save();

    return res.json({ success: true, cibil: sanitizeCibil(doc.cibil) });
  } catch (err) {
    console.error("[settings] updateCibilSettings error:", err?.message || err);
    return res.status(500).json({ success: false, error: "Failed to update CIBIL settings" });
  }
};

export default { getCibilSettings, updateCibilSettings };
