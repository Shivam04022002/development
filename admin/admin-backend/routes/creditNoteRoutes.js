// routes/creditNoteRoutes.js
//
// Phase 5B — Credit Note module. Authenticated admins; the completion endpoint
// additionally enforces the Pending CIBIL permission inside the controller.
//
import express from "express";
import protect from "../middleware/authMiddleware.js";
import { getCreditNote, completeCreditNote } from "../controllers/creditNoteController.js";

const router = express.Router();

router.get("/:applicationId", protect, getCreditNote);
router.post("/:applicationId", protect, completeCreditNote);

export default router;
