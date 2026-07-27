// routes/applicationRoutes.js
//
// Core Backend Redesign (Phase 2).
// Single application creation endpoint. Called by the Mobile Backend gateway.
//
import express from "express";
import internalAuth from "../middleware/internalAuth.js";
import { createApplicationHandler } from "../controllers/applicationController.js";

const router = express.Router();

// POST /api/applications — create ONE Application (server-to-server, gateway).
router.post("/", internalAuth, createApplicationHandler);

export default router;
