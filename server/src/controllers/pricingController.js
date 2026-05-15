/**
 * Dynamic Pricing Controller
 */

const DynamicPricing = require("../models/DynamicPricing");
const { calculateAdvancedRiskScore } = require("../services/riskService");

exports.calculateDynamicRate = async (req, res) => {
	try {
		const userId = req.user.id;

		// Get user's credit score
		const creditScore = await calculateAdvancedRiskScore(userId);

		let pricing = await DynamicPricing.findOne({ userId });
		if (!pricing) {
			pricing = new DynamicPricing({ userId, baseCreditScore: creditScore });
		}

		// Base rate: 12% (annual)
		const baseRate = 12;

		// Risk multiplier (0.7x to 1.5x)
		let riskMultiplier = 1;
		if (creditScore >= 850) riskMultiplier = 0.7;
		else if (creditScore >= 750) riskMultiplier = 0.8;
		else if (creditScore >= 650) riskMultiplier = 0.95;
		else if (creditScore >= 550) riskMultiplier = 1.2;
		else riskMultiplier = 1.5;

		// Loyalty discount (0-2%)
		const loyaltyDiscount = pricing.totalRepayments > 5 ? 2 : 0;

		// Early repayment discount (2%)
		const earlyRepaymentDiscount = 2;

		// Promotional discount (if any)
		const promotionalDiscount = pricing.promotionalDiscount || 0;

		const adjustedRate = baseRate * riskMultiplier;

		const effectiveRate = Math.max(
			1,
			adjustedRate - loyaltyDiscount - promotionalDiscount
		);

		pricing.baseCreditScore = creditScore;
		pricing.adjustedInterestRate = adjustedRate;
		pricing.riskMultiplier = riskMultiplier;
		pricing.loyaltyDiscount = loyaltyDiscount;
		pricing.effectiveInterestRate = effectiveRate;
		pricing.lastUpdated = new Date();

		await pricing.save();

		res.json({
			creditScore,
			baseRate: baseRate + "%",
			riskMultiplier: riskMultiplier.toFixed(2) + "x",
			adjustedRate: adjustedRate.toFixed(2) + "%",
			discounts: {
				loyalty: loyaltyDiscount + "%",
				earlyRepayment: earlyRepaymentDiscount + "%",
				promotional: promotionalDiscount + "%",
			},
			effectiveRate: effectiveRate.toFixed(2) + "%",
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.getPricingHistory = async (req, res) => {
	try {
		const pricing = await DynamicPricing.findOne({ userId: req.user.id });
		res.json({ pricing });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
