// routes/cibilReportRoutes.js
//
// CIBIL viewing endpoints (read, `protect`) plus one write — the on-demand
// co-applicant bureau fetch, which is Super Admin only because it is billable.
//
import express from "express";
import protect, { requireSuperAdmin } from "../middleware/authMiddleware.js";
import {
  getCibilJson,
  getCibilModel,
  viewCibilPdf,
  downloadCibilPdf,
} from "../controllers/cibilReportController.js";
import {
  fetchCoApplicantCibilReport,
  fetchApplicantCibilReport,
} from "../controllers/cibilFetchController.js";

const router = express.Router();

router.get("/:applicationId/json", protect, getCibilJson);
router.get("/:applicationId/model", protect, getCibilModel);
router.get("/:applicationId/pdf/download", protect, downloadCibilPdf); // before /pdf
router.get("/:applicationId/pdf", protect, viewCibilPdf);

// The only write in this module: an explicit bureau fetch for the co-applicant.
//
// SUPER ADMIN ONLY, for two independent reasons:
//
// 1. It spends money. Configuring the Xaler credentials is already
//    requireAuth + requireSuperAdmin (settingsRoutes.js:12), so triggering a
//    billable call against those same credentials is gated the same way.
//
// 2. `protect` alone is not a sufficient barrier here. It is fail-open by
//    design: a token that verifies against JWT_SECRET but matches no Admin
//    document is still admitted, with the decoded payload attached as
//    req.admin (authMiddleware.js:33-47), and a payload carrying no role is
//    defaulted to "admin" (:51-54). requireSuperAdmin demands an explicit
//    role === "superadmin", which such a token does not carry.
//
// The read endpoints above stay on `protect` — viewing a stored report costs
// nothing and is a normal loan-officer action.
router.post(
  "/:applicationId/co-applicant/fetch",
  protect,
  requireSuperAdmin,
  fetchCoApplicantCibilReport
);

// The applicant's equivalent. Same guard for the same two reasons: it spends
// money against the same credentials, and `protect` alone is fail-open.
router.post(
  "/:applicationId/applicant/fetch",
  protect,
  requireSuperAdmin,
  fetchApplicantCibilReport
);

export default router;
