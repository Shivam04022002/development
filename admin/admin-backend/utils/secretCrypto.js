// utils/secretCrypto.js
//
// Symmetric encryption for sensitive System Settings credentials
// (e.g. CIBIL password / client secret) using AES-256-GCM.
//
// Encrypted values are stored as: v1:<ivB64>:<authTagB64>:<cipherB64>
// The "v1" prefix lets us identify encrypted blobs and evolve the scheme later.
//
// Key source: process.env.SETTINGS_ENC_KEY.
//   - Preferred: a 32-byte key provided as 64 hex chars or base64.
//   - Otherwise the string is stretched to 32 bytes via scrypt (dev fallback).
// If SETTINGS_ENC_KEY is unset, a fixed dev passphrase is used and a warning is
// logged — production MUST set SETTINGS_ENC_KEY.
//
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "v1";
const DEV_FALLBACK = "dealermitra-dev-settings-key-change-me";

let warnedAboutKey = false;

function deriveKey() {
  const raw = process.env.SETTINGS_ENC_KEY;

  if (!raw) {
    if (!warnedAboutKey) {
      console.warn(
        "[secretCrypto] SETTINGS_ENC_KEY is not set — using an insecure dev key. " +
          "Set SETTINGS_ENC_KEY (32-byte hex/base64) in production."
      );
      warnedAboutKey = true;
    }
    return crypto.scryptSync(DEV_FALLBACK, "systemsettings", 32);
  }

  // 64 hex chars → 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  // base64 that decodes to exactly 32 bytes
  try {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  } catch {
    /* fall through */
  }
  // Anything else: stretch deterministically to 32 bytes
  return crypto.scryptSync(raw, "systemsettings", 32);
}

/** True if the value looks like an encrypted blob produced by encrypt(). */
export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

/**
 * Encrypt a plaintext string. Returns the encoded blob.
 * Empty / nullish input returns "" (nothing to encrypt).
 */
export function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === "") return "";
  const key = deriveKey();
  const iv = crypto.randomBytes(12); // GCM standard nonce size
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64")}:${authTag.toString("base64")}:${enc.toString("base64")}`;
}

/**
 * Decrypt a blob produced by encrypt(). Returns "" on empty input.
 * Throws if the blob is malformed or authentication fails.
 * (Callers that display settings should NOT decrypt secrets — see the
 * controller, which masks them instead.)
 */
export function decrypt(blob) {
  if (!blob) return "";
  if (!isEncrypted(blob)) return blob; // tolerate legacy plaintext
  const [, ivB64, tagB64, dataB64] = blob.split(":");
  const key = deriveKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

export default { encrypt, decrypt, isEncrypted };
