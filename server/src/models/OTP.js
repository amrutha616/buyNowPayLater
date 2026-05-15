const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		email: String,
		phone: String,
		otpCode: {
			type: String,
			required: true,
		},
		purpose: {
			type: String,
			enum: ["registration", "login", "2fa", "kyc_verify", "payment_confirm", "student_college_email", "student_parent_guarantee"],
			required: true,
		},
		expiresAt: {
			type: Date,
			required: true,
		},
		verified: {
			type: Boolean,
			default: false,
		},
		attempts: {
			type: Number,
			default: 0,
		},
		maxAttempts: {
			type: Number,
			default: 5,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("OTP", otpSchema);
