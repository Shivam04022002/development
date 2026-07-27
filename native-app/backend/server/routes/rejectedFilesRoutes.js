import express from "express";
import { listRejected, getRejectedById } from "../controllers/rejectedFilesController.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

// Protect routes
router.use(requireAuth);

router.get("/", listRejected);
router.get("/:id", getRejectedById);

export default router;
