import User from "../models/User.js";
import Notification from "../models/Notification.js";

// POST /api/notifications/save-token
export const savePushToken = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    await User.findByIdAndUpdate(userId, { pushToken: token });
    console.log(`✅ Push token saved for user ${userId}`);

    res.json({ success: true, message: "Push token saved" });
  } catch (error) {
    console.error("❌ Error saving push token:", error);
    res.status(500).json({ error: "Failed to save push token" });
  }
};

// GET /api/notifications
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(notifications);
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

// GET /api/notifications/unread-count
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await Notification.countDocuments({ user: userId, read: false });
    res.json({ count });
  } catch (error) {
    console.error("❌ Error getting unread count:", error);
    res.status(500).json({ error: "Failed to get unread count" });
  }
};

// PUT /api/notifications/:id/read
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true, notification });
  } catch (error) {
    console.error("❌ Error marking as read:", error);
    res.status(500).json({ error: "Failed to mark as read" });
  }
};

// PUT /api/notifications/read-all
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    await Notification.updateMany({ user: userId, read: false }, { read: true });
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    console.error("❌ Error marking all as read:", error);
    res.status(500).json({ error: "Failed to mark all as read" });
  }
};
