// utils/fileStorage.js
//
// Phase 7 — local file storage (replaces Cloudinary).
// Shared uploads root, resolvable by both backends. In production set
// UPLOADS_ROOT to an absolute path the Admin and Mobile backends both mount
// (they run on the same host); in dev it defaults to the repo-level uploads/.
//
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// server/utils → ../../../../uploads = <repo>/uploads
export const UPLOADS_ROOT = process.env.UPLOADS_ROOT
  ? path.resolve(process.env.UPLOADS_ROOT)
  : path.resolve(__dirname, "../../../../uploads");

// Absolute base used to build public file URLs returned to the mobile app.
export const FILE_PUBLIC_BASE = (process.env.FILE_PUBLIC_BASE || "").replace(/\/$/, "");

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

/** Build the public URL for a relative upload path (for the mobile app). */
export function publicUrl(rel) {
  const clean = String(rel || "").replace(/^[/\\]+/, "");
  return FILE_PUBLIC_BASE ? `${FILE_PUBLIC_BASE}/files/${clean}` : `/files/${clean}`;
}

/**
 * Relative path inside an application's folder: applications/<formId>/<...>.
 * Mirrors appRel() in the Admin Backend's copy of this module, so both
 * services lay files out identically under the shared uploads root.
 */
export function appRel(formId, ...parts) {
  const safe = String(formId || "unknown").replace(/[^A-Za-z0-9_-]/g, "_");
  return ["applications", safe, ...parts].join("/");
}

/**
 * Move a staged upload into an application folder, returning the new relative
 * path (or null if the source is missing). Best-effort — never throws.
 *
 * Mirrors moveIntoApp() in the Admin Backend. Uploads that belong to an
 * application must not be left in applications/_staging: nothing else sweeps
 * that folder, so a file left there is an orphan forever.
 */
export async function moveIntoApp(formId, category, baseName, sourceRel) {
  try {
    const srcAbs = absFromRel(sourceRel);
    await fsp.access(srcAbs);
    const ext = path.extname(srcAbs).toLowerCase() || "";
    const destRel = category
      ? appRel(formId, category, `${baseName}${ext}`)
      : appRel(formId, `${baseName}${ext}`);
    const destAbs = absFromRel(destRel);
    ensureDir(path.dirname(destAbs));
    await fsp.rename(srcAbs, destAbs).catch(async (e) => {
      // rename across devices → fallback to copy+unlink
      if (e.code === "EXDEV") {
        await fsp.copyFile(srcAbs, destAbs);
        await fsp.unlink(srcAbs).catch(() => {});
      } else throw e;
    });
    return destRel;
  } catch (err) {
    if (err?.code !== "ENOENT") console.warn(`[fileStorage] moveIntoApp failed (${sourceRel}):`, err.message);
    return null;
  }
}

/** Delete a staged upload. Best-effort — used to clean up rejected requests. */
export async function removeRel(rel) {
  try {
    await fsp.unlink(absFromRel(rel));
  } catch {
    /* already gone or outside the root — nothing to do */
  }
}

export default {
  UPLOADS_ROOT, FILE_PUBLIC_BASE, ensureDir, absFromRel, relFromAbs, publicUrl,
  appRel, moveIntoApp, removeRel,
};
