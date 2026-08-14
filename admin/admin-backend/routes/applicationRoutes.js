// routes/applicationRoutes.js
//
// Core Backend Redesign (Phase 2).
// Single application creation endpoint. Called by the Mobile Backend gateway.
//
import express from "express";
import internalAuth from "../middleware/internalAuth.js";
import protect from "../middleware/authMiddleware.js";
import { createApplicationHandler } from "../controllers/applicationController.js";
import { swapApplicant } from "../controllers/applicantSwapController.js";
import { updateApplicationParty } from "../controllers/applicationPartyController.js";
import {
  verifyDocument,
  rejectDocument,
  requestReupload,
  documentHistory,
} from "../controllers/documentVerificationController.js";

const router = express.Router();

// POST /api/applications — create ONE Application (server-to-server, gateway).
router.post("/", internalAuth, createApplicationHandler);

// POST /api/applications/:applicationId/swap-applicant — admin action, so it
// uses the admin token guard rather than the gateway's internal API key.
router.post("/:applicationId/swap-applicant", protect, swapApplicant);

// PATCH /api/applications/:applicationId/party/:role — admin edit of the
// applicant's or co-applicant's detail fields. Admin-authenticated like the
// swap above; the editable-field whitelist lives in the controller, which is
// where the application's current shape is known.
router.patch("/:applicationId/party/:role", protect, updateApplicationParty);

// ── Document verification ──────────────────────────────────────────────────
// RESTful under the document being acted on. All admin-authenticated; the
// override gate (acting on an already-decided document) is enforced in the
// controller, which is where the current status is known.
const DOC = "/:applicationId/documents/:role/:field";
router.get("/:applicationId/documents/history", protect, documentHistory);
router.post(`${DOC}/verify`, protect, verifyDocument);
router.post(`${DOC}/reject`, protect, rejectDocument);
router.post(`${DOC}/request-reupload`, protect, requestReupload);

export default router;
