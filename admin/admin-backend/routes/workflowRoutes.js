// routes/workflowRoutes.js
import express from 'express';
import {
  WORKFLOW_STAGES,
  STAGE_LABELS,
  STAGE_COLORS,
  FINAL_STAGES,
} from '../utils/workflowConstants.js';
import {
  getPendingApplications,
  updateWorkflowStage,
  rejectApplication,
  getRejectedApplications,
  getRejectedApplicationById,
  getApplicationById,
  getPendingApplicationById,
  approveApplication,
  bulkApproveApplications,
  bulkRejectApplications,
  getApprovedApplications,
  getApprovedApplicationById,
  fixDealerForApplications,
  getApplicationHistory,
  addApplicationComment,
  getWorkflowStats,
  normalizeAllWorkflowStages,
  getPendingCibilApplications,
  getDashboardStats,
  getApplicationTimeline,
} from '../controllers/workflowController.js';
import protect from '../middleware/authMiddleware.js';
import Application from "../models/Application.js";

const router = express.Router();

// ── Shared stage config (public — used by mobile app + admin frontend) ────────
router.get('/stages', (_req, res) => {
  res.json({ stages: WORKFLOW_STAGES, labels: STAGE_LABELS, colors: STAGE_COLORS, finalStages: FINAL_STAGES });
});

// ── Permission-aware stats (used by admin Dashboard, not superadmin panel) ───
router.get('/stats', protect, getWorkflowStats);

// ── Phase 6 — read-only dashboard analytics (cards + chart series) ───────────
router.get('/dashboard-stats', protect, getDashboardStats);

// primary endpoints
router.get('/pending', protect, getPendingApplications);
router.get('/pending/:id', protect, getPendingApplicationById);

// Pending CIBIL list (workflowStage = "pending_cibil"). Must be declared before
// '/:id' so "pending-cibil" is not captured as an application id. Access is
// permission-gated per admin's assigned workflow stages (Staff Management).
router.get('/pending-cibil', protect, getPendingCibilApplications);

router.get('/:id', protect, getApplicationById);

// canonical patch used by admin UI to advance non-final stages
router.patch('/workflow/update/:id', protect, updateWorkflowStage);

// deprecated/compat or alternate names (kept for backward compatibility)
router.patch('/update/:id', protect, updateWorkflowStage);
router.patch('/applications/:id', protect, updateWorkflowStage);
router.patch('/applications/update/:id', protect, updateWorkflowStage);

// approve / reject / lists
router.post('/approve/:id', protect, approveApplication);
router.post('/reject/:id', protect, rejectApplication);

// Bulk approve / reject — same core logic as the single endpoints
router.post('/bulk-approve', protect, bulkApproveApplications);
router.post('/bulk-reject', protect, bulkRejectApplications);

router.get('/applications/approved', protect, getApprovedApplications);
router.get('/applications/rejected', protect, getRejectedApplications);
router.get('/applications/approved/:id', protect, getApprovedApplicationById);
router.get('/applications/rejected/:id', protect, getRejectedApplicationById);

// audit history + internal comments (admin/superadmin only — no dealer access)
router.get('/applications/:id/history',  protect, getApplicationHistory);
router.get('/applications/:id/timeline', protect, getApplicationTimeline);
router.post('/applications/:id/comments', protect, addApplicationComment);

// maintenance
router.post('/fix-dealers', protect, fixDealerForApplications);
router.post('/normalize-stages', protect, normalizeAllWorkflowStages);

// NOTE (Phase 2 redesign): the merge endpoints (POST /merge/:formId and the
// bulk POST /merge) have been removed. Applications are now created in one write
// by POST /api/applications on this backend; there is no merge step.

// debug helper
router.get('/debug/pending-stages', protect, async (req, res) => {
  const docs = await Application.aggregate([
    { $match: { status: 'pending' } },
    { $group: { _id: { $toLower: "$workflowStage" }, count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  res.json(docs);
});

export default router;
