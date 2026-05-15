const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		type: {
			type: String,
			enum: [
				"loan_approved",
				"loan_rejected",
				"payment_due",
				"payment_reminder",
				"subscription_renewal",
				"subscription_expiry",
				"payment_confirmed",
				"late_payment",
				"emi_generated",
				"referral_bonus",
				"support_response",
				"fraud_alert",
				"kyc_verified",
			],
			required: true,
		},
		title: {
			type: String,
			required: true,
		},
		message: {
			type: String,
			required: true,
		},
		channel: {
			type: String,
			enum: ["email", "sms", "in_app"],
			default: "in_app",
		},
		relatedId: {
			type: mongoose.Schema.Types.ObjectId,
		},
		read: {
			type: Boolean,
			default: false,
		},
		sentAt: {
			type: Date,
			default: Date.now,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("Notification", notificationSchema);
