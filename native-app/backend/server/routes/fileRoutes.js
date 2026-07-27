// routes/fileRoutes.js
//
// Phase 7 — secure file download. Authenticated users only.
// GET /api/files/<relative-path>  → streams the file from the uploads root.
// Path traversal is blocked by absFromRel().
//
import express from "express";
import fs from "fs";
import requireAuth from "../middleware/requireAuth.js";
import { absFromRel } from "../utils/fileStorage.js";

const router = express.Router();

router.get(/^\/(.+)/, requireAuth, (req, res) => {
  try {
    const rel = req.params[0];
    const abs = absFromRel(rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return res.status(404).json({ error: "File not found" });
    }
    return res.sendFile(abs);
  } catch (err) {
    return res.status(400).json({ error: "Invalid file path" });
  }
});

export default router;
