// routes/underwritingReportRoutes.js
//
// Read-only underwriting model. Reuses the existing admin authentication.
// Separate from creditNoteRoutes so the production Credit Note endpoints are
// untouched.
//
import express from "express";
import protect from "../middleware/authMiddleware.js";
import { getUnderwritingModel } from "../controllers/underwritingReportController.js";

const router = express.Router();

router.get("/:applicationId/model", protect, getUnderwritingModel);

export default router;
