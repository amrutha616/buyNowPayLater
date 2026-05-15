/**
 * Enhanced Risk Scoring Service
 * Incorporates payment history, behavior, and CIBIL-like scoring
 */

const User = require("../models/userModel");
const Loan = require("../models/Loan");
const Repayment = require("../models/Repayment");

const calculateAdvancedRiskScore = async (userId) => {
	try {
		const user = await User.findById(userId);
		if (!user) throw new Error("User not found");

		let score = user.creditScore || 0;

		// 1. Payment history (up to 200 points)
		const paymentHistory = await getPaymentHistory(userId);
		score += assessPaymentHistory(paymentHistory);

		// 2. Loan utilization (up to 100 points)
		const utilisationScore = assessLoanUtilisation(user);
		score += utilisationScore;

		// 3. Transaction behavior (up to 100 points)
		const behaviorScore = await assessTransactionBehavior(userId);
		score += behaviorScore;

		// 4. Account age (up to 50 points)
		const accountAgeScore = assessAccountAge(user.createdAt);
		score += accountAgeScore;

		score = Math.min(score, 1000); // Cap at 1000
		return Math.max(score, 0); // Floor at 0
	} catch (err) {
		console.error("Advanced risk score error:", err);
		return user?.creditScore || 0;
	}
};

const getPaymentHistory = async (userId) => {
	try {
		const repayments = await Repayment.find({ userId })
			.sort({ dueDate: -1 })
			.limit(12);

		return {
			totalPayments: repayments.length,
			onTimePayments: repayments.filter((r) => r.status === "paid").length,
			latePayments: repayments.filter((r) => r.isLate).length,
			skippedPayments: repayments.filter((r) => r.status === "skipped").length,
		};
	} catch (err) {
		return { totalPayments: 0, onTimePayments: 0, latePayments: 0, skippedPayments: 0 };
	}
};

const assessPaymentHistory = (history) => {
	let score = 0;

	if (history.totalPayments === 0) return 0;

	const onTimeRate = history.onTimePayments / history.totalPayments;
	if (onTimeRate === 1) score += 200; // Perfect payment
	else if (onTimeRate >= 0.95) score += 150;
	else if (onTimeRate >= 0.85) score += 100;
	else if (onTimeRate >= 0.7) score += 50;

	// Penalty for late payments
	score -= history.latePayments * 10;
	score -= history.skippedPayments * 25;

	return Math.max(score, 0);
};

const assessLoanUtilisation = (user) => {
	const utilisationRatio = user.outstandingBalance / user.creditLimit;

	if (utilisationRatio < 0.3) return 100; // Excellent
	if (utilisationRatio < 0.5) return 80;
	if (utilisationRatio < 0.7) return 50;
	if (utilisationRatio < 0.9) return 20;
	return 0; // High utilization = risk
};

const assessTransactionBehavior = async (userId) => {
	try {
		const loans = await Loan.find({ userId }).limit(5);

		if (loans.length === 0) return 0;

		const avgLoanSize = loans.reduce((sum, l) => sum + l.amount, 0) / loans.length;
		const consistency = loans.length >= 3 ? 50 : 25;

		return consistency;
	} catch (err) {
		return 0;
	}
};

const assessAccountAge = (createdAt) => {
	const ageInDays = (Date.now() - new Date(createdAt)) / (1000 * 60 * 60 * 24);

	if (ageInDays < 30) return 0;
	if (ageInDays < 90) return 10;
	if (ageInDays < 180) return 25;
	if (ageInDays < 365) return 35;
	return 50;
};

module.exports = {
	calculateAdvancedRiskScore,
	getPaymentHistory,
	assessPaymentHistory,
	assessLoanUtilisation,
	assessTransactionBehavior,
	assessAccountAge,
};
