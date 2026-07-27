// controllers/settingsController.js
//
// System Settings — CIBIL configuration (Phase 3).
// Super Admin only. Stores configuration; does NOT call the TransUnion API,
// validate credentials, generate PDFs, or affect the application workflow.
//
import SystemSettings from "../models/SystemSettings.js";
import { encrypt } from "../utils/secretCrypto.js";

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
    username: cibil.username || "",
    clientId: cibil.clientId || "",
    minimumScore: typeof cibil.minimumScore === "number" ? cibil.minimumScore : 650,
    autoRejectLowCibil:
      typeof cibil.autoRejectLowCibil === "boolean" ? cibil.autoRejectLowCibil : true,
    lowCibilRejectionReason: cibil.lowCibilRejectionReason || "Low CIBIL Score",
    // Secret presence flags — value itself is never returned.
    passwordSet: !!cibil.password,
    clientSecretSet: !!cibil.clientSecret,
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
 * Secret fields (password, clientSecret):
 *   - If a non-empty value is supplied, it is encrypted and stored.
 *   - If omitted or empty, the existing stored value is kept (so editing other
 *     fields never wipes saved secrets, and secrets are never round-tripped in
 *     plaintext through the browser).
 */
export const updateCibilSettings = async (req, res) => {
  try {
    const doc = await loadOrCreate();
    const body = req.body || {};
    const current = doc.cibil || {};

    // ── Non-secret fields ──────────────────────────────────────────────────
    if (typeof body.apiUrl === "string") current.apiUrl = body.apiUrl.trim();
    if (typeof body.username === "string") current.username = body.username.trim();
    if (typeof body.clientId === "string") current.clientId = body.clientId.trim();

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

    // ── Secret fields — encrypt only when a new value is provided ───────────
    if (typeof body.password === "string" && body.password !== MASK && body.password.length > 0) {
      current.password = encrypt(body.password);
    }
    if (
      typeof body.clientSecret === "string" &&
      body.clientSecret !== MASK &&
      body.clientSecret.length > 0
    ) {
      current.clientSecret = encrypt(body.clientSecret);
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
