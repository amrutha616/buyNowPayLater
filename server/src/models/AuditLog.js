const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		action: {
			type: String,
			trim: true,
			required: true,
		},
		entityType: {
			type: String,
			trim: true,
			default: "aadhaar_kyc",
		},
		referenceId: {
			type: String,
			trim: true,
		},
		maskedAadhaar: {
			type: String,
			trim: true,
		},
		status: {
			type: String,
			trim: true,
		},
		message: {
			type: String,
			trim: true,
		},
		ipAddress: {
			type: String,
			trim: true,
		},
		userAgent: {
			type: String,
			trim: true,
		},
		metadata: {
			type: mongoose.Schema.Types.Mixed,
			default: {},
		},
	},
	{ timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);