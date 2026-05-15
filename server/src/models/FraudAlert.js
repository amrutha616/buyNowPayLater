const mongoose = require("mongoose");

const fraudAlertSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		alertType: {
			type: String,
			enum: [
				"unusual_location",
				"unusual_amount",
				"rapid_transactions",
				"device_change",
				"failed_auth",
				"suspicious_pattern",
			],
			required: true,
		},
		severity: {
			type: String,
			enum: ["low", "medium", "high", "critical"],
			default: "medium",
		},
		description: String,
		detectedAt: {
			type: Date,
			default: Date.now,
		},
		transactionData: mongoose.Schema.Types.Mixed,
		resolved: {
			type: Boolean,
			default: false,
		},
		resolutionAction: String,
		resolvedAt: Date,
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("FraudAlert", fraudAlertSchema);
