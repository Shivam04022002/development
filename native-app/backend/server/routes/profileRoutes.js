import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import { getProfile, updateProfile, changePassword } from "../controllers/profileController.js";

const router = express.Router();

// GET /api/profile — fetch profile info
router.get("/", requireAuth, getProfile);

// PUT /api/profile — update profile info
router.put("/", requireAuth, updateProfile);

// PUT /api/profile/password — change password
router.put("/password", requireAuth, changePassword);

export default router;
