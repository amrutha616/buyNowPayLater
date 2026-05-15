const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
	getNotifications,
	markNotificationRead,
	markAllRead,
	deleteNotification,
} = require("../controllers/notificationController");

const router = express.Router();

router.get("/", authMiddleware, getNotifications);
router.put("/:notificationId/read", authMiddleware, markNotificationRead);
router.put("/mark-all-read", authMiddleware, markAllRead);
router.delete("/:notificationId", authMiddleware, deleteNotification);

module.exports = router;
