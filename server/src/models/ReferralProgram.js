const mongoose = require("mongoose");

const referralProgramSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			unique: true,
		},
		referralCode: {
			type: String,
			unique: true,
			required: true,
		},
		referrals: [
			{
				referredUserId: mongoose.Schema.Types.ObjectId,
				referredEmail: String,
				referredAt: Date,
				status: { type: String, enum: ["pending", "registered", "active"] },
				bonusAwarded: { type: Boolean, default: false },
			},
		],
		totalReferrals: {
			type: Number,
			default: 0,
		},
		totalBonusEarned: {
			type: Number,
			default: 0,
		},
		bonusPerReferral: {
			type: Number,
			default: 5000,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("ReferralProgram", referralProgramSchema);
