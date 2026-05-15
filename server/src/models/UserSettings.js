const mongoose = require("mongoose");

const userSettingsSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			unique: true,
		},
		notificationPreferences: {
			emailNotifications: { type: Boolean, default: true },
			smsNotifications: { type: Boolean, default: true },
			pushNotifications: { type: Boolean, default: true },
			paymentReminders: { type: Boolean, default: true },
			marketingEmails: { type: Boolean, default: false },
		},
		bankAccount: {
			accountHolderName: String,
			accountNumber: String,
			ifscCode: String,
			bankName: String,
			accountType: { type: String, enum: ["savings", "current"] },
			verified: { type: Boolean, default: false },
		},
		emergencyContact: {
			name: String,
			phone: String,
			relation: String,
		},
		twoFactorAuth: {
			enabled: { type: Boolean, default: false },
			method: { type: String, enum: ["sms", "email"] },
		},
		autoPayEnabled: {
			type: Boolean,
			default: false,
		},
		language: {
			type: String,
			default: "en",
			enum: ["en", "hi"],
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("UserSettings", userSettingsSchema);
