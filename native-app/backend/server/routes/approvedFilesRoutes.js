import express from "express";
import { getApprovedFiles, getApprovedFileById } from "../controllers/approvedFilesController.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

// Protect these endpoints for signed-in mobile users
router.use(requireAuth);

router.get("/", getApprovedFiles);       // list all approved
router.get("/:id", getApprovedFileById); // get single approved by ID

export default router;
