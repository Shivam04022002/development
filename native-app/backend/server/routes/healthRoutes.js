// routes/healthRoutes.js
//
// Phase 8 — monitoring endpoints. Public, read-only, no sensitive data.
//   GET /health          — process liveness
//   GET /health/db       — MongoDB connection state
//   GET /health/storage  — uploads root reachable + writable
//
import express from "express";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { UPLOADS_ROOT } from "../utils/fileStorage.js";

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "mobile-backend",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

router.get("/db", (_req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  const state = mongoose.connection.readyState;
  const ok = state === 1;
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "unavailable",
    db: states[state] || "unknown",
    timestamp: new Date().toISOString(),
  });
});

router.get("/storage", (_req, res) => {
  try {
    fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
    const probe = path.join(UPLOADS_ROOT, `.health-${Date.now()}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    res.json({ status: "ok", writable: true, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: "unavailable", writable: false, error: err.message });
  }
});

export default router;
