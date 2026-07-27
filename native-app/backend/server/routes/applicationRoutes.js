import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import { submitApplication, getPendingApplications, getApplicationByFormId } from "../controllers/appplicationController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/pending", getPendingApplications);
router.post("/submit", submitApplication);
router.get("/by-formid/:formId", getApplicationByFormId);

export default router;