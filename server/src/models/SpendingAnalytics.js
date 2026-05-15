const mongoose = require("mongoose");

const spendingAnalyticsSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		month: {
			type: String,
			required: true,
		},
		totalSpent: {
			type: Number,
			default: 0,
		},
		totalPaid: {
			type: Number,
			default: 0,
		},
		categoryBreakdown: [
			{
				category: String,
				amount: Number,
				percentage: Number,
			},
		],
		averageTransactionValue: Number,
		transactionCount: Number,
		topMerchant: String,
		savingsPotential: Number,
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("SpendingAnalytics", spendingAnalyticsSchema);
