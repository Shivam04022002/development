// routes/pendingFilesRoutes.js
import express from "express";
import { getPendingFiles, getPendingFileById } from "../controllers/pendingFilesController.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

// Protect all routes
router.use(requireAuth);

// Routes
router.get("/", getPendingFiles);          // GET all pending files
router.get("/:id", getPendingFileById);    // GET a single pending file by ID

export default router;
