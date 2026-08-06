// middleware/upload.js
//
// Phase 7 — local disk upload for the Admin Backend.
//
// This is the SAME upload system the Mobile Backend already runs, not a second
// one: multer with disk storage under the shared UPLOADS_ROOT, the same staging
// folder convention, the same allowed extensions/MIME types and the same 15MB
// cap (all read from utils/fileStorage.js, which now mirrors the Mobile
// Backend's copy field for field). No Cloudinary, no S3.
//
import crypto from "crypto";
import path from "path";
import multer from "multer";
import {
  UPLOADS_ROOT,
  ensureDir,
  ALLOWED_EXT,
  ALLOWED_MIME,
  MAX_FILE_BYTES,
} from "../utils/fileStorage.js";

// Staging directory for freshly uploaded files, shared with the Mobile Backend.
export const STAGING_REL = "applications/_staging";
const STAGING_ABS = path.join(UPLOADS_ROOT, "applications", "_staging");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureDir(STAGING_ABS);
      cb(null, STAGING_ABS);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    // Unique filename → no duplicate-name collisions. The original name is
    // never used on disk, so a hostile filename cannot influence the path.
    const ext = path.extname(file.originalname || "").toLowerCase().replace(/[^.a-z0-9]/g, "");
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || "").slice(1).toLowerCase();
  const okExt = ALLOWED_EXT.includes(ext);
  const okMime = ALLOWED_MIME.includes((file.mimetype || "").toLowerCase());
  if (okExt && okMime) return cb(null, true);
  return cb(new Error(`Unsupported file type (${file.mimetype || ext}). Allowed: ${ALLOWED_EXT.join(", ")}`));
}

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_BYTES } });

export default upload;
