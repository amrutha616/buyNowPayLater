const mongoose = require("mongoose");

const rewardConfigSchema = new mongoose.Schema(
	{
		key: {
			type: String,
			required: true,
			unique: true,
			default: "default",
		},
		baseCashbackRate: {
			type: Number,
			default: 0.02,
			min: 0,
			max: 1,
		},
		earlyCashbackRate: {
			type: Number,
			default: 0.03,
			min: 0,
			max: 1,
		},
		monthlyCashbackCap: {
			type: Number,
			default: 500,
			min: 0,
		},
		perTxnCashbackCap: {
			type: Number,
			default: 200,
			min: 0,
		},
		referralRewardAmount: {
			type: Number,
			default: 500,
			min: 0,
		},
		campaignRewardDefaultAmount: {
			type: Number,
			default: 250,
			min: 0,
		},
		updatedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("RewardConfig", rewardConfigSchema);
