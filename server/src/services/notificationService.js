/**
 * Notification Service
 * Handles email, SMS, and in-app notifications
 */

const Notification = require("../models/Notification");

const createNotification = async (userId, type, title, message, channel = "in_app", relatedId = null) => {
	try {
		const notification = await Notification.create({
			userId,
			type,
			title,
			message,
			channel,
			relatedId,
		});

		// In production: integrate with email/SMS providers
		if (channel === "email") {
			sendEmail(userId, title, message);
		} else if (channel === "sms") {
			sendSMS(userId, message);
		}

		return notification;
	} catch (err) {
		console.error("Notification creation error:", err);
	}
};

const getUserNotifications = async (userId, limit = 20) => {
	try {
		return await Notification.find({ userId })
			.sort({ createdAt: -1 })
			.limit(limit);
	} catch (err) {
		console.error("Get notifications error:", err);
		throw err;
	}
};

const markAsRead = async (notificationId) => {
	try {
		return await Notification.findByIdAndUpdate(
			notificationId,
			{ read: true },
			{ new: true }
		);
	} catch (err) {
		console.error("Mark read error:", err);
		throw err;
	}
};

const sendEmail = (userId, subject, message) => {
	// Integration with SendGrid, Nodemailer, etc.
	console.log(`[EMAIL] To User ${userId}: ${subject}`);
};

const sendSMS = (userId, message) => {
	// Integration with Twilio, AWS SNS, etc.
	console.log(`[SMS] To User ${userId}: ${message}`);
};

module.exports = {
	createNotification,
	getUserNotifications,
	markAsRead,
	sendEmail,
	sendSMS,
};
