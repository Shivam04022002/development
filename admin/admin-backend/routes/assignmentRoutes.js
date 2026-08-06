// routes/assignmentRoutes.js
//
// Task & Assignment Center. Mounted at /api/assignments.
// Admin-authenticated throughout; the supervisor-only rules (reassigning
// another person's task, viewing another queue) are enforced in the controller,
// which is where the current owner is known.
//
import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  listAssignableStaff,
  getAssignment,
  assignApplication,
  updateAssignment,
  myTasks,
} from "../controllers/assignmentController.js";

const router = express.Router();

router.use(protect);

// Static paths first so they are not captured by /:applicationId.
router.get("/staff", listAssignableStaff);
router.get("/my-tasks", myTasks);

router.get("/:applicationId", getAssignment);
router.post("/:applicationId", assignApplication);
router.patch("/:applicationId", updateAssignment);

export default router;
