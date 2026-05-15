const mongoose = require("mongoose");

const dynamicPricingSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		baseCreditScore: Number,
		baseInterestRate: {
			type: Number,
			default: 12,
		},
		adjustedInterestRate: Number,
		riskMultiplier: {
			type: Number,
			default: 1,
		},
		loyaltyDiscount: {
			type: Number,
			default: 0,
		},
		earlyRepaymentDiscount: {
			type: Number,
			default: 2,
		},
		promotionalDiscount: {
			type: Number,
			default: 0,
		},
		effectiveInterestRate: Number,
		lastUpdated: {
			type: Date,
			default: Date.now,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("DynamicPricing", dynamicPricingSchema);
