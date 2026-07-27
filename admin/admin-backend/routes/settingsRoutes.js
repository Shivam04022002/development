// routes/settingsRoutes.js
//
// System Settings module (Phase 3). Super Admin only.
//
import express from "express";
import { requireAuth, requireSuperAdmin } from "../middleware/authMiddleware.js";
import { getCibilSettings, updateCibilSettings } from "../controllers/settingsController.js";

const router = express.Router();

// All settings routes require an authenticated Super Admin.
router.use(requireAuth, requireSuperAdmin);

// CIBIL configuration
router.get("/cibil", getCibilSettings);
router.put("/cibil", updateCibilSettings);

export default router;
