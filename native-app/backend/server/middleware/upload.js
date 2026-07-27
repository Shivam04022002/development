// middleware/upload.js
//
// Phase 7 — local disk upload (replaces multer-storage-cloudinary).
// Files land in a staging folder under the shared uploads root; the Admin
// Backend moves them into applications/<ApplicationNumber>/... at creation.
//
import crypto from "crypto";
import path from "path";
import multer from "multer";
import { UPLOADS_ROOT, ensureDir, ALLOWED_EXT, ALLOWED_MIME, MAX_FILE_BYTES } from "../utils/fileStorage.js";

// Staging directory for freshly uploaded files (pre-application-number).
export const STAGING_REL = "applications/_staging";
const STAGING_ABS = path.join(UPLOADS_ROOT, "applications", "_staging");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureDir(STAGING_ABS); // auto-create if missing
      cb(null, STAGING_ABS);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    // Unique filename → no duplicate-name collisions.
    const ext = path.extname(file.originalname || "").toLowerCase().replace(/[^.a-z0-9]/g, "");
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    cb(null, unique);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || "").slice(1).toLowerCase();
  const okExt = ALLOWED_EXT.includes(ext);
  const okMime = ALLOWED_MIME.includes((file.mimetype || "").toLowerCase());
  if (okExt && okMime) return cb(null, true);
  return cb(new Error(`Unsupported file type (${file.mimetype || ext}). Allowed: ${ALLOWED_EXT.join(", ")}`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES },
});

export default upload;
