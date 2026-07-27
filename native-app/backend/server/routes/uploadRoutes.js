// routes/uploadRoutes.js
//
// Phase 7 — local file upload (replaces Cloudinary). Contract unchanged for the
// mobile app: POST multipart file → { url }. Files are stored on local disk
// (staging) and returned as a public URL the app stores and submits. The Admin
// Backend later moves them into applications/<ApplicationNumber>/...
//
import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import upload, { STAGING_REL } from "../middleware/upload.js";
import { publicUrl } from "../utils/fileStorage.js";

const router = express.Router();

// POST /api/upload — store a file locally (any field name accepted).
router.post("/", requireAuth, (req, res) => {
  upload.any()(req, res, (err) => {
    if (err) {
      const isValidation =
        err.code === "LIMIT_FILE_SIZE" || /Unsupported file type/.test(err.message || "");
      console.error("[UPLOAD] error:", err.message || err);
      return res
        .status(isValidation ? 400 : 500)
        .json({ error: "Upload failed", details: String(err.message || err) });
    }

    const file = req.files?.[0] || req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded. Send a file field in multipart/form-data." });
    }

    const rel = `${STAGING_REL}/${file.filename}`;
    const url = publicUrl(rel);
    console.log(`[UPLOAD] ✅ stored ${file.originalname} → ${rel}`);
    // `url` (public) keeps the mobile app working; `path` is the relative path.
    return res.status(200).json({ url, path: rel });
  });
});

// GET /api/upload — health check
router.get("/", (_req, res) => {
  res.json({ message: "Upload route active (local storage). POST multipart/form-data.", field: "any" });
});

export default router;
