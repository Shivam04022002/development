// routes/cibilReportRoutes.js
//
// Read-only CIBIL viewing endpoints. Reuses the existing admin authentication
// (protect) — only authenticated admins can read the JSON or the PDF.
//
import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  getCibilJson,
  getCibilModel,
  viewCibilPdf,
  downloadCibilPdf,
} from "../controllers/cibilReportController.js";

const router = express.Router();

router.get("/:applicationId/json", protect, getCibilJson);
router.get("/:applicationId/model", protect, getCibilModel);
router.get("/:applicationId/pdf/download", protect, downloadCibilPdf); // before /pdf
router.get("/:applicationId/pdf", protect, viewCibilPdf);

export default router;
