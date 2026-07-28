// services/systemSettingsService.js
//
// Server-side loader for System Settings. Unlike the controller (which masks
// secrets for the browser), this returns DECRYPTED credentials for internal use
// only — e.g. calling the Xaler CIBIL API. Never expose this over HTTP.
//
import SystemSettings from "../models/SystemSettings.js";
import { decrypt } from "../utils/secretCrypto.js";

const SETTINGS_KEY = "system";

/**
 * Load the CIBIL configuration with the API key decrypted.
 * Returns null if no settings document exists yet.
 */
export async function getDecryptedCibilConfig() {
  const doc = await SystemSettings.findOne({ key: SETTINGS_KEY }).lean();
  if (!doc || !doc.cibil) return null;

  const c = doc.cibil;
  return {
    apiUrl: c.apiUrl || "",
    apiKey: c.apiKey ? safeDecrypt(c.apiKey) : "",
    minimumScore: typeof c.minimumScore === "number" ? c.minimumScore : 650,
    autoRejectLowCibil: typeof c.autoRejectLowCibil === "boolean" ? c.autoRejectLowCibil : true,
    lowCibilRejectionReason: c.lowCibilRejectionReason || "Low CIBIL Score",
  };
}

function safeDecrypt(blob) {
  try {
    return decrypt(blob);
  } catch (err) {
    console.error("[systemSettings] Failed to decrypt the CIBIL API key:", err?.message || err);
    return "";
  }
}

export default { getDecryptedCibilConfig };
