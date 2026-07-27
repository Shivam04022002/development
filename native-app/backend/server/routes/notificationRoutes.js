import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import {
  savePushToken,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "../controllers/notificationController.js";

const router = express.Router();

// All notification routes require authentication
router.use(requireAuth);

router.post("/save-token", savePushToken);
router.get("/", getNotifications);
router.get("/unread-count", getUnreadCount);
router.put("/read-all", markAllAsRead);
router.put("/:id/read", markAsRead);

export default router;
