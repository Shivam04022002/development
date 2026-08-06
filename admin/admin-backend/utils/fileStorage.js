// utils/fileStorage.js
//
// Phase 7 — local file storage (replaces Cloudinary). Shared uploads root,
// resolvable by both the Admin and Mobile backends. Set UPLOADS_ROOT in
// production; in dev it defaults to the repo-level uploads/.
//
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// admin-backend/utils → ../../../uploads = <repo>/uploads
export const UPLOADS_ROOT = process.env.UPLOADS_ROOT
  ? path.resolve(process.env.UPLOADS_ROOT)
  : path.resolve(__dirname, "../../../uploads");

// Upload constraints. Identical to the Mobile Backend's copy of this module so
// a file accepted by one service is accepted by the other — there is one set of
// rules for the shared uploads root, not two.
export const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "pdf"];
export const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "application/pdf",
];
export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

export function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

/** Resolve a relative upload path to an absolute path, blocking traversal. */
export function absFromRel(rel) {
  const clean = String(rel || "").replace(/^[/\\]+/, "");
  const abs = path.resolve(UPLOADS_ROOT, clean);
  if (abs !== UPLOADS_ROOT && !abs.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new Error("Path traversal blocked");
  }
  return abs;
}

/** Convert an absolute path under the uploads root to a forward-slash relative path. */
export function relFromAbs(abs) {
  return path.relative(UPLOADS_ROOT, abs).split(path.sep).join("/");
}

/** Absolute path to an application's folder (applications/<formId>). */
export function appDirAbs(formId) {
  const safe = String(formId || "unknown").replace(/[^A-Za-z0-9_-]/g, "_");
  return path.join(UPLOADS_ROOT, "applications", safe);
}
export function appRel(formId, ...parts) {
  const safe = String(formId || "unknown").replace(/[^A-Za-z0-9_-]/g, "_");
  return ["applications", safe, ...parts].join("/");
}

/**
 * Parse an application-file reference into a relative path under the uploads
 * root, or null if it is not a local file (e.g. a legacy Cloudinary http URL).
 * Accepts absolute local URLs ("…/files/applications/…"), root-relative
 * ("/files/applications/…" or "/uploads/applications/…") and bare relative
 * ("applications/…") forms.
 */
export function toLocalRel(ref) {
  if (!ref || typeof ref !== "string") return null;
  const v = ref.trim();
  // Legacy remote (Cloudinary etc.) — leave untouched.
  if (/^https?:\/\//i.test(v) && !/\/files\/applications\//i.test(v) && !/\/uploads\/applications\//i.test(v)) {
    return null;
  }
  const m = v.match(/(?:\/files\/|\/uploads\/)(.+)$/);
  if (m) return m[1].replace(/^[/\\]+/, "");
  if (/^applications\//i.test(v)) return v.replace(/^[/\\]+/, "");
  return null;
}

/** Move a staged file into an application folder. Returns the new relative path
 *  or null if the source is missing (best-effort — never throws). */
export async function moveIntoApp(formId, category, baseName, sourceRel) {
  try {
    const srcAbs = absFromRel(sourceRel);
    await fsp.access(srcAbs);
    const ext = path.extname(srcAbs).toLowerCase() || "";
    const destRel = category ? appRel(formId, category, `${baseName}${ext}`) : appRel(formId, `${baseName}${ext}`);
    const destAbs = absFromRel(destRel);
    ensureDir(path.dirname(destAbs));
    await fsp.rename(srcAbs, destAbs).catch(async (e) => {
      // rename across devices → fallback to copy+unlink
      if (e.code === "EXDEV") { await fsp.copyFile(srcAbs, destAbs); await fsp.unlink(srcAbs).catch(() => {}); }
      else throw e;
    });
    return destRel;
  } catch (err) {
    if (err?.code !== "ENOENT") console.warn(`[fileStorage] moveIntoApp failed (${sourceRel}):`, err.message);
    return null;
  }
}

/** Write a buffer/string to an application file. Returns the relative path. */
export async function writeAppFile(formId, relSubParts, data) {
  const destRel = appRel(formId, ...(Array.isArray(relSubParts) ? relSubParts : [relSubParts]));
  const destAbs = absFromRel(destRel);
  ensureDir(path.dirname(destAbs));
  await fsp.writeFile(destAbs, data);
  return destRel;
}

export default {
  UPLOADS_ROOT, ensureDir, absFromRel, relFromAbs, appDirAbs, appRel,
  toLocalRel, moveIntoApp, writeAppFile,
  ALLOWED_EXT, ALLOWED_MIME, MAX_FILE_BYTES,
};
