const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema(
	{
		code: {
			type: String,
			required: true,
			unique: true,
			uppercase: true,
			trim: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		yearlyPrice: {
			type: Number,
			required: true,
			min: 0,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		sortOrder: {
			type: Number,
			default: 0,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
