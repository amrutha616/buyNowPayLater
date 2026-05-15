/**
 * Analytics Controller
 */

const SpendingAnalytics = require("../models/SpendingAnalytics");
const Transaction = require("../models/Transaction");
const Loan = require("../models/Loan");
const CreditReport = require("../models/CreditReport");
const User = require("../models/userModel");

const toDisplayLabel = (value) => {
	const normalized = String(value || "").trim();
	if (!normalized) return "";
	return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
};

const deriveBureauRating = (score) => {
	if (score >= 750) return "Excellent";
	if (score >= 700) return "Good";
	if (score >= 650) return "Fair";
	return "Poor";
};

const deriveApprovalRating = (score) => {
	if (score >= 750) return "Excellent";
	if (score >= 650) return "Good";
	if (score >= 550) return "Fair";
	return "Poor";
};

exports.getSpendingAnalytics = async (req, res) => {
	try {
		const { month } = req.query; // YYYY-MM format
		const currentMonth = month || new Date().toISOString().slice(0, 7);

		let analytics = await SpendingAnalytics.findOne({
			userId: req.user.id,
			month: currentMonth,
		});

		if (!analytics) {
			analytics = await calculateMonthlyAnalytics(req.user.id, currentMonth);
		}

		res.json({ analytics });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const calculateMonthlyAnalytics = async (userId, month) => {
	try {
		const startDate = new Date(month + "-01");
		const endDate = new Date(startDate);
		endDate.setMonth(endDate.getMonth() + 1);

		const transactions = await Transaction.find({
			userId,
			createdAt: { $gte: startDate, $lt: endDate },
		});

		const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
		const totalPaid = transactions.filter((t) => t.type === "payment").reduce((sum, t) => sum + t.amount, 0);

		// Category breakdown (mock data)
		const categoryBreakdown = [
			{ category: "Shopping", amount: totalSpent * 0.4, percentage: 40 },
			{ category: "Food", amount: totalSpent * 0.25, percentage: 25 },
			{ category: "Utilities", amount: totalSpent * 0.2, percentage: 20 },
			{ category: "Entertainment", amount: totalSpent * 0.15, percentage: 15 },
		];

		const analytics = await SpendingAnalytics.create({
			userId,
			month,
			totalSpent,
			totalPaid,
			categoryBreakdown,
			transactionCount: transactions.length,
			averageTransactionValue: transactions.length > 0 ? totalSpent / transactions.length : 0,
			savingsPotential: totalSpent * 0.1,
		});

		return analytics;
	} catch (err) {
		console.error("Calculate analytics error:", err);
		throw err;
	}
};

exports.getCreditScore = async (req, res) => {
	try {
		const [user, report] = await Promise.all([
			User.findById(req.user.id).select("creditScore bureauScore bureauScoreRating").lean(),
			CreditReport.findOne({ userId: req.user.id }).select("bureauScore scoreRating").lean(),
		]);

		const approvalScore = Math.max(0, Number(user?.creditScore || 0));
		const bureauScore = Math.max(
			0,
			Number(user?.bureauScore || report?.bureauScore || 0)
		);
		const bureauRating = user?.bureauScoreRating || report?.scoreRating || null;
		const hasBureauScore = bureauScore > 0;
		const score = hasBureauScore ? bureauScore : approvalScore;

		res.json({
			creditScore: score,
			approvalScore,
			bureauScore,
			category: hasBureauScore
				? toDisplayLabel(bureauRating || deriveBureauRating(bureauScore))
				: deriveApprovalRating(approvalScore),
			label: hasBureauScore ? "Bureau Score" : "Approval Score",
			scoreType: hasBureauScore ? "simulated_bureau" : "internal_approval",
			scaleMax: hasBureauScore ? 900 : 1000,
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.getLoanAnalytics = async (req, res) => {
	try {
		const loans = await Loan.find({ userId: req.user.id });

		const analytics = {
			totalLoans: loans.length,
			activeLoans: loans.filter((l) => l.status === "active").length,
			totalBorrowed: loans.reduce((sum, l) => sum + l.amount, 0),
			totalRepaid: loans.reduce((sum, l) => sum + l.repaidAmount, 0),
			outstandingBalance: loans.reduce((sum, l) => sum + (l.amount - l.repaidAmount), 0),
		};

		res.json({ analytics });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
