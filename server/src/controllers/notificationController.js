/**
 * Notification Controller
 */

const { getUserNotifications, markAsRead, createNotification } = require("../services/notificationService");
const Notification = require("../models/Notification");

exports.getNotifications = async (req, res) => {
	try {
		const notifications = await getUserNotifications(req.user.id, 50);
		const unread = notifications.filter((n) => !n.read).length;
		res.json({ notifications, unreadCount: unread });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.markNotificationRead = async (req, res) => {
	try {
		const { notificationId } = req.params;
		const notification = await markAsRead(notificationId);
		res.json({ message: "Notification marked as read", notification });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.markAllRead = async (req, res) => {
	try {
		const result = await Notification.updateMany(
			{ userId: req.user.id, read: false },
			{ read: true }
		);
		res.json({ message: "All notifications marked as read", matched: result.matchedCount });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.deleteNotification = async (req, res) => {
	try {
		const { notificationId } = req.params;
		await Notification.findByIdAndDelete(notificationId);
		res.json({ message: "Notification deleted" });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
