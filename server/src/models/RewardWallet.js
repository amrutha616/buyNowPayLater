const mongoose = require("mongoose");

const rewardWalletSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			unique: true,
		},
		totalEarned: {
			type: Number,
			default: 0,
			min: 0,
		},
		totalRedeemed: {
			type: Number,
			default: 0,
			min: 0,
		},
		balance: {
			type: Number,
			default: 0,
			min: 0,
		},
		tier: {
			type: String,
			enum: ["BRONZE", "SILVER", "GOLD", "PLATINUM"],
			default: "BRONZE",
		},
		currentMonthKey: {
			type: String,
			default: "",
		},
		currentMonthEarned: {
			type: Number,
			default: 0,
			min: 0,
		},
		lastRewardAt: {
			type: Date,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("RewardWallet", rewardWalletSchema);
