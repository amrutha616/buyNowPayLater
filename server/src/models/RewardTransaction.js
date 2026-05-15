const mongoose = require("mongoose");

const rewardTransactionSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		loan: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Loan",
		},
		type: {
			type: String,
			enum: ["EARNED", "REDEEMED", "ADJUSTED"],
			required: true,
		},
		source: {
			type: String,
			enum: [
				"REPAYMENT_CASHBACK",
				"REFERRAL",
				"CAMPAIGN",
				"PURCHASE_REDEMPTION",
				"EMI_REDEMPTION",
				"MANUAL",
			],
			required: true,
		},
		amount: {
			type: Number,
			required: true,
			min: 0,
		},
		rateApplied: {
			type: Number,
			default: 0,
			min: 0,
		},
		paymentAmount: {
			type: Number,
			default: 0,
			min: 0,
		},
		installmentNumber: {
			type: Number,
			min: 1,
		},
		note: {
			type: String,
			trim: true,
		},
		metadata: {
			type: mongoose.Schema.Types.Mixed,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("RewardTransaction", rewardTransactionSchema);
