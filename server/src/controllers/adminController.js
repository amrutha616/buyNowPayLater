const User = require("../models/userModel");
const Loan = require("../models/Loan");
const Transaction = require("../models/Transaction");
const KYCDocument = require("../models/KYCDocument");
const KYC = require("../models/kycModel");
const SupportTicket = require("../models/SupportTicket");
const FraudAlert = require("../models/FraudAlert");
const SubscriptionPlan = require("../models/SubscriptionPlan");

const PLATFORM_FEE_RATE = Number(process.env.ADMIN_PLATFORM_FEE_RATE || 0.025);
const COST_OF_CAPITAL_RATE = Number(process.env.ADMIN_COST_OF_CAPITAL_RATE || 0.01);

const toNumber = (value) => Number(value || 0);
const toMoney = (value) => Number(toNumber(value).toFixed(2));

const csvEscape = (value) => {
	if (value === null || value === undefined) return "";
	const stringValue = String(value);
	if (/[",\n]/.test(stringValue)) {
		return `"${stringValue.replace(/"/g, '""')}"`;
	}
	return stringValue;
};

const buildCsv = (rows) => rows.map((row) => row.map(csvEscape).join(",")).join("\n");

const getMonthKey = (date) => {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	return `${date.getFullYear()}-${month}`;
};

const getMonthLabel = (date) =>
	date.toLocaleString("en-IN", {
		month: "short",
		year: "numeric",
	});

const buildRiskLevel = ({ creditScore, utilizationPct, defaultedLoans }) => {
	if (defaultedLoans > 0 || creditScore < 550 || utilizationPct >= 85) {
		return "high";
	}
	if (creditScore < 700 || utilizationPct >= 60) {
		return "medium";
	}
	return "low";
};

const buildUserQuery = (search) => {
	const trimmedSearch = String(search || "").trim();
	if (!trimmedSearch) return {};

	return {
		$or: [
			{ name: { $regex: trimmedSearch, $options: "i" } },
			{ email: { $regex: trimmedSearch, $options: "i" } },
			{ pan: { $regex: trimmedSearch, $options: "i" } },
		],
	};
};

const enrichUsersWithStats = async (users) => {
	if (!users.length) return [];

	const userIds = users.map((user) => user._id);

	const [loanAgg, purchaseAgg, repaymentAgg, kycAgg, kycDecisionAgg] = await Promise.all([
		Loan.aggregate([
			{ $match: { user: { $in: userIds } } },
			{
				$group: {
					_id: "$user",
					activeLoans: {
						$sum: {
							$cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0],
						},
					},
					defaultedLoans: {
						$sum: {
							$cond: [{ $eq: ["$status", "DEFAULTED"] }, 1, 0],
						},
					},
					totalBorrowed: { $sum: "$bnplAmount" },
					remainingAmount: { $sum: "$remainingAmount" },
				},
			},
		]),
		Transaction.aggregate([
			{ $match: { user: { $in: userIds }, type: "PURCHASE", status: "SUCCESS" } },
			{
				$group: {
					_id: "$user",
					totalPurchases: { $sum: 1 },
					purchaseVolume: { $sum: "$totalAmount" },
					bnplUsed: { $sum: "$bnplAmount" },
					upfrontPaid: { $sum: "$upfrontPaid" },
				},
			},
		]),
		Transaction.aggregate([
			{ $match: { user: { $in: userIds }, type: "REPAYMENT", status: "SUCCESS" } },
			{
				$group: {
					_id: "$user",
					totalRepayments: { $sum: 1 },
					repaidAmount: { $sum: "$totalAmount" },
				},
			},
		]),
		KYCDocument.aggregate([
			{ $match: { userId: { $in: userIds } } },
			{ $sort: { updatedAt: -1, createdAt: -1 } },
			{
				$group: {
					_id: "$userId",
					status: { $first: "$verificationStatus" },
					documentType: { $first: "$documentType" },
					updatedAt: { $first: "$updatedAt" },
				},
			},
		]),
		KYC.aggregate([
			{ $match: { userId: { $in: userIds } } },
			{ $sort: { updatedAt: -1, createdAt: -1 } },
			{
				$group: {
					_id: "$userId",
					modelRiskPercent: { $first: "$modelRiskPercent" },
					modelRiskThreshold: { $first: "$modelRiskThreshold" },
					thresholdBreach: { $first: "$thresholdBreach" },
					decisionSource: { $first: "$decisionSource" },
					eligibilityStatus: { $first: "$eligibilityStatus" },
				},
			},
		]),
	]);

	const loanMap = new Map(loanAgg.map((entry) => [String(entry._id), entry]));
	const purchaseMap = new Map(purchaseAgg.map((entry) => [String(entry._id), entry]));
	const repaymentMap = new Map(repaymentAgg.map((entry) => [String(entry._id), entry]));
	const kycMap = new Map(kycAgg.map((entry) => [String(entry._id), entry]));
	const kycDecisionMap = new Map(kycDecisionAgg.map((entry) => [String(entry._id), entry]));

	return users.map((user) => {
		const creditLimit = toNumber(user.creditLimit);
		const outstandingBalance = toNumber(user.outstandingBalance);
		const availableCredit = Math.max(0, creditLimit - outstandingBalance);
		const utilizationPct = creditLimit > 0 ? toMoney((outstandingBalance / creditLimit) * 100) : 0;

		const loanStatsRaw = loanMap.get(String(user._id)) || {};
		const purchaseStatsRaw = purchaseMap.get(String(user._id)) || {};
		const repaymentStatsRaw = repaymentMap.get(String(user._id)) || {};
		const kycRaw = kycMap.get(String(user._id));
		const kycDecisionRaw = kycDecisionMap.get(String(user._id)) || {};

		const loanStats = {
			activeLoans: toNumber(loanStatsRaw.activeLoans),
			defaultedLoans: toNumber(loanStatsRaw.defaultedLoans),
			totalBorrowed: toMoney(loanStatsRaw.totalBorrowed),
			remainingAmount: toMoney(loanStatsRaw.remainingAmount),
		};

		const purchaseStats = {
			totalPurchases: toNumber(purchaseStatsRaw.totalPurchases),
			purchaseVolume: toMoney(purchaseStatsRaw.purchaseVolume),
			bnplUsed: toMoney(purchaseStatsRaw.bnplUsed),
			upfrontPaid: toMoney(purchaseStatsRaw.upfrontPaid),
		};

		const repaymentStats = {
			totalRepayments: toNumber(repaymentStatsRaw.totalRepayments),
			repaidAmount: toMoney(repaymentStatsRaw.repaidAmount),
		};

		const mlRiskPercent = toMoney(kycDecisionRaw.modelRiskPercent);
		const riskScore = mlRiskPercent > 0 ? mlRiskPercent : toMoney(user.riskScore);
		const riskLevel = mlRiskPercent > 0
			? (mlRiskPercent >= 70 ? "high" : mlRiskPercent >= 40 ? "medium" : "low")
			: buildRiskLevel({
				creditScore: toNumber(user.creditScore),
				utilizationPct,
				defaultedLoans: loanStats.defaultedLoans,
			});

		return {
			id: user._id,
			name: user.name,
			email: user.email,
			pan: user.pan || "",
			isAdmin: Boolean(user.isAdmin),
			isEligible: Boolean(user.isEligible),
			creditLimit: toMoney(creditLimit),
			outstandingBalance: toMoney(outstandingBalance),
			availableCredit: toMoney(availableCredit),
			creditScore: toNumber(user.creditScore),
			riskScore: riskScore,
			mlRiskPercent: mlRiskPercent,
			mlRiskThreshold: toMoney(kycDecisionRaw.modelRiskThreshold),
			thresholdBreach: Boolean(kycDecisionRaw.thresholdBreach),
			riskSource: kycDecisionRaw.decisionSource || "legacy",
			monthlyIncome: toMoney(user.monthlyIncome),
			employmentType: user.employmentType || "unemployed",
			utilizationPct,
			riskLevel,
			createdAt: user.createdAt,
			loanStats,
			purchaseStats,
			repaymentStats,
			kyc: kycRaw
				? {
					status: kycRaw.status,
					documentType: kycRaw.documentType,
					updatedAt: kycRaw.updatedAt,
				}
				: {
					status: "not_submitted",
					documentType: null,
					updatedAt: null,
				},
		};
	});
};

const collectOverviewData = async () => {
	const monthStart = new Date();
	monthStart.setDate(1);
	monthStart.setHours(0, 0, 0, 0);

	const sixMonthStart = new Date(monthStart);
	sixMonthStart.setMonth(sixMonthStart.getMonth() - 5);

	const [
		totalUsers,
		eligibleUsers,
		newUsersThisMonth,
		totalCreditLimitAgg,
		outstandingAgg,
		activeLoans,
		completedLoans,
		defaultedLoans,
		disbursedAgg,
		defaultedExposureAgg,
		purchaseAgg,
		repaymentAgg,
		paymentMethodAgg,
		topMerchantsAgg,
		recentTransactions,
		pendingKycUsers,
		verifiedKycUsers,
		openSupportTickets,
		monthlyTransactionAgg,
	] = await Promise.all([
		User.countDocuments(),
		User.countDocuments({ isEligible: true }),
		User.countDocuments({ createdAt: { $gte: monthStart } }),
		User.aggregate([{ $group: { _id: null, total: { $sum: "$creditLimit" } } }]),
		User.aggregate([{ $group: { _id: null, total: { $sum: "$outstandingBalance" } } }]),
		Loan.countDocuments({ status: "ACTIVE" }),
		Loan.countDocuments({ status: "COMPLETED" }),
		Loan.countDocuments({ status: "DEFAULTED" }),
		Loan.aggregate([{ $group: { _id: null, total: { $sum: "$bnplAmount" } } }]),
		Loan.aggregate([
			{ $match: { status: "DEFAULTED" } },
			{ $group: { _id: null, total: { $sum: "$remainingAmount" } } },
		]),
		Transaction.aggregate([
			{ $match: { type: "PURCHASE", status: "SUCCESS" } },
			{
				$group: {
					_id: null,
					count: { $sum: 1 },
					totalAmount: { $sum: "$totalAmount" },
					bnplAmount: { $sum: "$bnplAmount" },
					upfrontPaid: { $sum: "$upfrontPaid" },
				},
			},
		]),
		Transaction.aggregate([
			{ $match: { type: "REPAYMENT", status: "SUCCESS" } },
			{
				$group: {
					_id: null,
					count: { $sum: 1 },
					totalAmount: { $sum: "$totalAmount" },
				},
			},
		]),
		Transaction.aggregate([
			{
				$match: {
					status: "SUCCESS",
					paymentMethod: { $in: ["UPI", "CARD", "NET_BANKING"] },
				},
			},
			{
				$group: {
					_id: "$paymentMethod",
					count: { $sum: 1 },
					volume: { $sum: "$totalAmount" },
				},
			},
			{ $sort: { volume: -1 } },
		]),
		Transaction.aggregate([
			{ $match: { type: "PURCHASE", status: "SUCCESS" } },
			{
				$group: {
					_id: "$merchant",
					transactions: { $sum: 1 },
					volume: { $sum: "$totalAmount" },
				},
			},
			{ $sort: { volume: -1 } },
			{ $limit: 5 },
		]),
		Transaction.find({ status: "SUCCESS" })
			.sort({ createdAt: -1 })
			.limit(10)
			.populate("user", "name email")
			.lean(),
		KYCDocument.distinct("userId", { verificationStatus: "pending" }),
		KYCDocument.distinct("userId", { verificationStatus: "verified" }),
		SupportTicket.countDocuments({
			status: { $in: ["open", "in_progress", "awaiting_response"] },
		}),
		Transaction.aggregate([
			{ $match: { status: "SUCCESS", createdAt: { $gte: sixMonthStart } } },
			{
				$group: {
					_id: {
						month: {
							$dateToString: { format: "%Y-%m", date: "$createdAt" },
						},
						type: "$type",
					},
					totalAmount: { $sum: "$totalAmount" },
					bnplAmount: { $sum: "$bnplAmount" },
				},
			},
		]),
	]);

	const totalCreditCapacity = toMoney(totalCreditLimitAgg[0]?.total);
	const totalOutstanding = toMoney(outstandingAgg[0]?.total);
	const totalBnplDisbursed = toMoney(disbursedAgg[0]?.total);
	const defaultedExposure = toMoney(defaultedExposureAgg[0]?.total);

	const purchaseStats = purchaseAgg[0] || {};
	const repaymentStats = repaymentAgg[0] || {};

	const purchaseCount = toNumber(purchaseStats.count);
	const repaymentCount = toNumber(repaymentStats.count);
	const purchaseVolume = toMoney(purchaseStats.totalAmount);
	const bnplDisbursedByTransactions = toMoney(purchaseStats.bnplAmount);
	const upfrontCollected = toMoney(purchaseStats.upfrontPaid);
	const repaymentsCollected = toMoney(repaymentStats.totalAmount);

	const cashInflow = toMoney(upfrontCollected + repaymentsCollected);
	const cashOutflow = toMoney(totalBnplDisbursed);
	const netCashFlow = toMoney(cashInflow - cashOutflow);

	const estimatedRevenue = toMoney(purchaseVolume * PLATFORM_FEE_RATE);
	const estimatedFundingCost = toMoney(totalBnplDisbursed * COST_OF_CAPITAL_RATE);
	const estimatedProfitOrLoss = toMoney(
		estimatedRevenue - estimatedFundingCost - defaultedExposure
	);

	const collectionsCoveragePct =
		totalBnplDisbursed > 0
			? toMoney((repaymentsCollected / totalBnplDisbursed) * 100)
			: 0;

	const monthBuckets = [];
	const monthMap = new Map();
	for (let index = 5; index >= 0; index -= 1) {
		const monthDate = new Date(monthStart);
		monthDate.setMonth(monthDate.getMonth() - index);
		const key = getMonthKey(monthDate);
		const bucket = {
			monthKey: key,
			month: getMonthLabel(monthDate),
			purchaseVolume: 0,
			repaymentVolume: 0,
			bnplDisbursed: 0,
		};
		monthBuckets.push(bucket);
		monthMap.set(key, bucket);
	}

	monthlyTransactionAgg.forEach((entry) => {
		const monthKey = entry._id?.month;
		const type = entry._id?.type;
		if (!monthMap.has(monthKey)) return;

		const bucket = monthMap.get(monthKey);
		if (type === "PURCHASE") {
			bucket.purchaseVolume = toMoney(entry.totalAmount);
			bucket.bnplDisbursed = toMoney(entry.bnplAmount);
		}
		if (type === "REPAYMENT") {
			bucket.repaymentVolume = toMoney(entry.totalAmount);
		}
	});

	const monthlyTrend = monthBuckets.map(({ monthKey, ...bucket }) => bucket);

	return {
		generatedAt: new Date().toISOString(),
		summary: {
			users: {
				total: totalUsers,
				eligible: eligibleUsers,
				newThisMonth: newUsersThisMonth,
				eligibilityRatePct: totalUsers > 0 ? toMoney((eligibleUsers / totalUsers) * 100) : 0,
			},
			loans: {
				active: activeLoans,
				completed: completedLoans,
				defaulted: defaultedLoans,
				totalCreditCapacity,
				totalOutstanding,
				totalBnplDisbursed,
				defaultedExposure,
			},
			transactions: {
				purchaseCount,
				repaymentCount,
				purchaseVolume,
				bnplDisbursed: bnplDisbursedByTransactions,
				upfrontCollected,
				repaymentsCollected,
			},
			finance: {
				cashInflow,
				cashOutflow,
				netCashFlow,
				estimatedRevenue,
				estimatedFundingCost,
				expectedCreditLoss: defaultedExposure,
				estimatedProfitOrLoss,
				collectionsCoveragePct,
			},
			ops: {
				openSupportTickets,
				pendingKycUsers: pendingKycUsers.length,
				verifiedKycUsers: verifiedKycUsers.length,
			},
		},
		distributions: {
			paymentMethods: paymentMethodAgg.map((entry) => ({
				method: entry._id,
				count: toNumber(entry.count),
				volume: toMoney(entry.volume),
			})),
			topMerchants: topMerchantsAgg.map((entry) => ({
				merchant: entry._id || "Unknown",
				transactions: toNumber(entry.transactions),
				volume: toMoney(entry.volume),
			})),
		},
		recentTransactions: recentTransactions.map((txn) => ({
			id: txn._id,
			type: txn.type,
			merchant: txn.merchant,
			amount: toMoney(txn.totalAmount),
			upfrontPaid: toMoney(txn.upfrontPaid),
			bnplAmount: toMoney(txn.bnplAmount),
			paymentMethod: txn.paymentMethod,
			status: txn.status,
			note: txn.note || "",
			createdAt: txn.createdAt,
			userName: txn.user?.name || "Unknown",
			userEmail: txn.user?.email || "",
		})),
		monthlyTrend,
	};
};

exports.getAdminOverview = async (req, res) => {
	try {
		const overview = await collectOverviewData();
		return res.json(overview);
	} catch (err) {
		console.error("Admin overview error:", err);
		return res.status(500).json({ message: "Failed to fetch admin overview" });
	}
};

exports.getAdminStats = async (req, res) => {
	try {
		const overview = await collectOverviewData();
		const stats = {
			users: overview.summary.users.total,
			loans:
				overview.summary.loans.active +
				overview.summary.loans.completed +
				overview.summary.loans.defaulted,
			outstanding: overview.summary.loans.totalOutstanding,
			profitLoss: overview.summary.finance.estimatedProfitOrLoss,
		};

		return res.json(stats);
	} catch (err) {
		console.error("Admin stats error:", err);
		return res.status(500).json({ message: "Failed to fetch admin stats" });
	}
};

exports.getAdminUsers = async (req, res) => {
	try {
		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const requestedLimit = parseInt(req.query.limit, 10) || 20;
		const limit = Math.min(Math.max(requestedLimit, 1), 100);
		const skip = (page - 1) * limit;

		const sortField = String(req.query.sortBy || "createdAt");
		const sortOrder = String(req.query.order || "desc").toLowerCase() === "asc" ? 1 : -1;

		const allowedSortFields = [
			"createdAt",
			"creditScore",
			"outstandingBalance",
			"creditLimit",
			"monthlyIncome",
			"name",
			"email",
		];
		const safeSortField = allowedSortFields.includes(sortField) ? sortField : "createdAt";

		const query = buildUserQuery(req.query.search);

		const [total, users] = await Promise.all([
			User.countDocuments(query),
			User.find(query)
				.select(
					"name email pan isAdmin isEligible creditLimit outstandingBalance creditScore riskScore monthlyIncome employmentType createdAt"
				)
				.sort({ [safeSortField]: sortOrder })
				.skip(skip)
				.limit(limit)
				.lean(),
		]);

		const enrichedUsers = await enrichUsersWithStats(users);
		const totalPages = Math.max(1, Math.ceil(total / limit));

		return res.json({
			page,
			limit,
			total,
			totalPages,
			users: enrichedUsers,
		});
	} catch (err) {
		console.error("Admin users error:", err);
		return res.status(500).json({ message: "Failed to fetch users" });
	}
};

exports.downloadUsersCsv = async (req, res) => {
	try {
		const query = buildUserQuery(req.query.search);

		const users = await User.find(query)
			.select(
				"name email pan isAdmin isEligible creditLimit outstandingBalance creditScore riskScore monthlyIncome employmentType createdAt"
			)
			.sort({ createdAt: -1 })
			.lean();

		const enrichedUsers = await enrichUsersWithStats(users);

		const rows = [
			[
				"Name",
				"Email",
				"PAN",
				"Is Admin",
				"Is Eligible",
				"Credit Limit",
				"Outstanding",
				"Available Credit",
				"Credit Score",
				"Utilization %",
				"Risk",
				"Risk %",
				"Monthly Income",
				"Employment Type",
				"Active Loans",
				"Defaulted Loans",
				"Total Borrowed",
				"Remaining Loan Amount",
				"Total Purchase Volume",
				"Total Repayments",
				"KYC Status",
				"KYC Document",
				"Joined On",
			],
			...enrichedUsers.map((user) => [
				user.name,
				user.email,
				user.pan,
				user.isAdmin ? "Yes" : "No",
				user.isEligible ? "Yes" : "No",
				user.creditLimit,
				user.outstandingBalance,
				user.availableCredit,
				user.creditScore,
				user.utilizationPct,
				user.riskLevel,
				toMoney(user.riskScore),
				user.monthlyIncome,
				user.employmentType,
				user.loanStats.activeLoans,
				user.loanStats.defaultedLoans,
				user.loanStats.totalBorrowed,
				user.loanStats.remainingAmount,
				user.purchaseStats.purchaseVolume,
				user.repaymentStats.repaidAmount,
				user.kyc.status,
				user.kyc.documentType || "",
				new Date(user.createdAt).toISOString(),
			]),
		];

		const csvContent = buildCsv(rows);
		const filename = `bnpl-users-${new Date().toISOString().slice(0, 10)}.csv`;

		res.setHeader("Content-Type", "text/csv; charset=utf-8");
		res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
		return res.status(200).send(csvContent);
	} catch (err) {
		console.error("Admin export error:", err);
		return res.status(500).json({ message: "Failed to export users" });
	}
};

// ─── Loans ────────────────────────────────────────────────────────────────────

exports.getAdminLoans = async (req, res) => {
	try {
		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
		const skip = (page - 1) * limit;
		const statusFilter = req.query.status;
		const search = String(req.query.search || "").trim();

		const loanQuery = {};
		if (statusFilter && ["ACTIVE", "COMPLETED", "DEFAULTED"].includes(statusFilter)) {
			loanQuery.status = statusFilter;
		}
		if (search) {
			const matchingUsers = await User.find({
				$or: [
					{ name: { $regex: search, $options: "i" } },
					{ email: { $regex: search, $options: "i" } },
				],
			}).select("_id").lean();
			const userIds = matchingUsers.map((u) => u._id);
			if (userIds.length === 0) {
				return res.json({ page, limit, total: 0, totalPages: 1, loans: [] });
			}
			loanQuery.user = { $in: userIds };
		}

		const [total, loans] = await Promise.all([
			Loan.countDocuments(loanQuery),
			Loan.find(loanQuery)
				.populate("user", "name email")
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.lean(),
		]);

		const formatted = loans.map((loan) => ({
			id: loan._id,
			status: loan.status,
			merchant: loan.merchant || "Unknown",
			bnplAmount: toMoney(loan.bnplAmount),
			totalPaid: toMoney(loan.totalPaid),
			remainingAmount: toMoney(loan.remainingAmount),
			installmentPlan: loan.installmentPlan,
			paidInstallments: (loan.installments || []).filter((i) => i.status === "PAID").length,
			pendingInstallments: (loan.installments || []).filter((i) => i.status === "PENDING").length,
			createdAt: loan.createdAt,
			userName: loan.user?.name || "Unknown",
			userEmail: loan.user?.email || "",
		}));

		return res.json({
			page, limit, total,
			totalPages: Math.max(1, Math.ceil(total / limit)),
			loans: formatted,
		});
	} catch (err) {
		console.error("Admin loans error:", err);
		return res.status(500).json({ message: "Failed to fetch loans" });
	}
};

exports.getAdminLoanStats = async (req, res) => {
	try {
		const [statusAgg, merchantAgg, planAgg] = await Promise.all([
			Loan.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, totalBnpl: { $sum: "$bnplAmount" } } }]),
			Loan.aggregate([
				{ $group: { _id: "$merchant", count: { $sum: 1 }, totalBnpl: { $sum: "$bnplAmount" } } },
				{ $sort: { totalBnpl: -1 } },
				{ $limit: 6 },
			]),
			Loan.aggregate([
				{ $group: { _id: "$installmentPlan", count: { $sum: 1 } } },
				{ $sort: { _id: 1 } },
			]),
		]);
		return res.json({
			byStatus: statusAgg.map((s) => ({ status: s._id, count: s.count, totalBnpl: toMoney(s.totalBnpl) })),
			byMerchant: merchantAgg.map((m) => ({ merchant: m._id || "Unknown", count: m.count, totalBnpl: toMoney(m.totalBnpl) })),
			byPlan: planAgg.map((p) => ({ plan: `${p._id}mo`, count: p.count })),
		});
	} catch (err) {
		console.error("Admin loan stats error:", err);
		return res.status(500).json({ message: "Failed to fetch loan stats" });
	}
};

// ─── Transactions ─────────────────────────────────────────────────────────────

exports.getAdminTransactions = async (req, res) => {
	try {
		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
		const skip = (page - 1) * limit;
		const typeFilter = req.query.type;
		const search = String(req.query.search || "").trim();

		const txnQuery = { status: "SUCCESS" };
		if (typeFilter && ["PURCHASE", "REPAYMENT"].includes(typeFilter)) {
			txnQuery.type = typeFilter;
		}
		if (search) {
			const matchingUsers = await User.find({
				$or: [
					{ name: { $regex: search, $options: "i" } },
					{ email: { $regex: search, $options: "i" } },
				],
			}).select("_id").lean();
			if (matchingUsers.length) {
				txnQuery.user = { $in: matchingUsers.map((u) => u._id) };
			} else {
				txnQuery.merchant = { $regex: search, $options: "i" };
			}
		}

		const [total, txns] = await Promise.all([
			Transaction.countDocuments(txnQuery),
			Transaction.find(txnQuery)
				.populate("user", "name email")
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.lean(),
		]);

		const formatted = txns.map((t) => ({
			id: t._id,
			type: t.type,
			merchant: t.merchant || "-",
			totalAmount: toMoney(t.totalAmount),
			upfrontPaid: toMoney(t.upfrontPaid),
			bnplAmount: toMoney(t.bnplAmount),
			paymentMethod: t.paymentMethod,
			status: t.status,
			createdAt: t.createdAt,
			userName: t.user?.name || "Unknown",
			userEmail: t.user?.email || "",
		}));

		return res.json({
			page, limit, total,
			totalPages: Math.max(1, Math.ceil(total / limit)),
			transactions: formatted,
		});
	} catch (err) {
		console.error("Admin txns error:", err);
		return res.status(500).json({ message: "Failed to fetch transactions" });
	}
};

// ─── Fraud Alerts ─────────────────────────────────────────────────────────────

exports.getAdminFraudAlerts = async (req, res) => {
	try {
		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
		const skip = (page - 1) * limit;
		const resolvedFilter = req.query.resolved;
		const severityFilter = req.query.severity;

		const query = {};
		if (resolvedFilter === "true") query.resolved = true;
		if (resolvedFilter === "false") query.resolved = false;
		if (severityFilter && ["low", "medium", "high", "critical"].includes(severityFilter)) {
			query.severity = severityFilter;
		}

		const [total, alerts, severityAgg, unresolvedCount] = await Promise.all([
			FraudAlert.countDocuments(query),
			FraudAlert.find(query)
				.populate("userId", "name email")
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.lean(),
			FraudAlert.aggregate([{ $group: { _id: "$severity", count: { $sum: 1 } } }]),
			FraudAlert.countDocuments({ resolved: false }),
		]);

		const formatted = alerts.map((a) => ({
			id: a._id,
			alertType: a.alertType,
			severity: a.severity,
			description: a.description || "",
			resolved: a.resolved,
			resolutionAction: a.resolutionAction || null,
			resolvedAt: a.resolvedAt || null,
			createdAt: a.createdAt,
			userName: a.userId?.name || "Unknown",
			userEmail: a.userId?.email || "",
		}));

		return res.json({
			page, limit, total,
			totalPages: Math.max(1, Math.ceil(total / limit)),
			unresolvedCount,
			alerts: formatted,
			bySeverity: severityAgg.map((s) => ({ severity: s._id, count: s.count })),
		});
	} catch (err) {
		console.error("Admin fraud alerts error:", err);
		return res.status(500).json({ message: "Failed to fetch fraud alerts" });
	}
};

exports.resolveAdminFraudAlert = async (req, res) => {
	try {
		const { alertId } = req.params;
		const { action } = req.body;
		if (!action) return res.status(400).json({ message: "Resolution action is required" });

		const alert = await FraudAlert.findByIdAndUpdate(
			alertId,
			{ resolved: true, resolutionAction: action, resolvedAt: new Date() },
			{ new: true }
		);
		if (!alert) return res.status(404).json({ message: "Alert not found" });
		return res.json({ message: "Alert resolved", alert });
	} catch (err) {
		console.error("Resolve fraud alert error:", err);
		return res.status(500).json({ message: "Failed to resolve alert" });
	}
};

// ─── Reports ──────────────────────────────────────────────────────────────────

exports.getAdminReports = async (req, res) => {
	try {
		const today = new Date();
		const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
		const twelveMonthStart = new Date(monthStart);
		twelveMonthStart.setMonth(twelveMonthStart.getMonth() - 11);

		const [monthlyAgg, creditScoreAgg, employmentAgg, dailyAgg] = await Promise.all([
			Transaction.aggregate([
				{ $match: { status: "SUCCESS", createdAt: { $gte: twelveMonthStart } } },
				{
					$group: {
						_id: { month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, type: "$type" },
						amount: { $sum: "$totalAmount" },
						count: { $sum: 1 },
					},
				},
			]),
			User.aggregate([
				{
					$bucket: {
						groupBy: "$creditScore",
						boundaries: [0, 400, 500, 600, 700, 800, 1001],
						default: "Unknown",
						output: { count: { $sum: 1 } },
					},
				},
			]),
			User.aggregate([{ $group: { _id: "$employmentType", count: { $sum: 1 } } }]),
			Transaction.aggregate([
				{
					$match: {
						status: "SUCCESS",
						type: "PURCHASE",
						createdAt: { $gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) },
					},
				},
				{
					$group: {
						_id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
						amount: { $sum: "$totalAmount" },
						count: { $sum: 1 },
					},
				},
				{ $sort: { _id: 1 } },
			]),
		]);

		const monthKeys = [];
		for (let i = 11; i >= 0; i--) {
			const d = new Date(monthStart);
			d.setMonth(d.getMonth() - i);
			monthKeys.push({
				key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
				label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
			});
		}

		const monthMap = {};
		monthKeys.forEach(({ key, label }) => {
			monthMap[key] = { month: label, purchases: 0, repayments: 0, purchaseCount: 0 };
		});
		monthlyAgg.forEach((entry) => {
			const k = entry._id?.month;
			if (!monthMap[k]) return;
			if (entry._id.type === "PURCHASE") {
				monthMap[k].purchases = toMoney(entry.amount);
				monthMap[k].purchaseCount = entry.count;
			}
			if (entry._id.type === "REPAYMENT") monthMap[k].repayments = toMoney(entry.amount);
		});

		const scoreLabels = ["<400", "400-499", "500-599", "600-699", "700-799", "800+"];
		const scoreDist = creditScoreAgg.map((b, i) => ({ range: scoreLabels[i] || "?", count: b.count }));

		return res.json({
			monthlyTrend: Object.values(monthMap),
			creditScoreDist: scoreDist,
			employmentDist: employmentAgg.map((e) => ({ type: e._id || "unknown", count: e.count })),
			dailyPurchases: dailyAgg.map((d) => ({ date: d._id, amount: toMoney(d.amount), count: d.count })),
		});
	} catch (err) {
		console.error("Admin reports error:", err);
		return res.status(500).json({ message: "Failed to generate reports" });
	}
};

// ─── User management ──────────────────────────────────────────────────────────

exports.updateUserAdmin = async (req, res) => {
	try {
		const { userId } = req.params;
		const { creditLimit, isEligible } = req.body;

		if (String(userId) === String(req.admin.id)) {
			return res.status(400).json({ message: "Cannot modify your own admin account" });
		}

		const updates = {};
		if (creditLimit !== undefined && Number(creditLimit) >= 0) updates.creditLimit = Number(creditLimit);
		if (isEligible !== undefined) updates.isEligible = Boolean(isEligible);

		if (Object.keys(updates).length === 0) {
			return res.status(400).json({ message: "No valid fields to update" });
		}

		const user = await User.findByIdAndUpdate(userId, updates, { new: true })
			.select("name email creditLimit isEligible");
		if (!user) return res.status(404).json({ message: "User not found" });

		return res.json({ message: "User updated", user });
	} catch (err) {
		console.error("Admin update user error:", err);
		return res.status(500).json({ message: "Failed to update user" });
	}
};

exports.getSubscriptionCatalogAdmin = async (req, res) => {
	try {
		const plans = await SubscriptionPlan.find({}).sort({ sortOrder: 1, name: 1 }).lean();
		return res.json({ plans });
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to fetch subscription catalog" });
	}
};

exports.createSubscriptionPlanAdmin = async (req, res) => {
	try {
		const code = String(req.body?.code || "").trim().toUpperCase();
		const name = String(req.body?.name || "").trim();
		const yearlyPrice = Number(req.body?.yearlyPrice || 0);
		const isActive = req.body?.isActive !== false;
		const sortOrder = Number(req.body?.sortOrder || 0);

		if (!code || !name) {
			return res.status(400).json({ message: "code and name are required" });
		}

		if (!Number.isFinite(yearlyPrice) || yearlyPrice < 0) {
			return res.status(400).json({ message: "yearlyPrice must be a valid non-negative number" });
		}

		const existing = await SubscriptionPlan.findOne({ code });
		if (existing) {
			return res.status(409).json({ message: "Subscription code already exists" });
		}

		const plan = await SubscriptionPlan.create({
			code,
			name,
			yearlyPrice,
			isActive,
			sortOrder,
		});

		return res.status(201).json({ message: "Subscription plan created", plan });
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to create subscription plan" });
	}
};

exports.updateSubscriptionPlanAdmin = async (req, res) => {
	try {
		const { planId } = req.params;
		const updates = {};

		if (req.body?.code !== undefined) {
			updates.code = String(req.body.code || "").trim().toUpperCase();
		}

		if (req.body?.name !== undefined) {
			updates.name = String(req.body.name || "").trim();
		}

		if (req.body?.yearlyPrice !== undefined) {
			const yearlyPrice = Number(req.body.yearlyPrice);
			if (!Number.isFinite(yearlyPrice) || yearlyPrice < 0) {
				return res.status(400).json({ message: "yearlyPrice must be a valid non-negative number" });
			}
			updates.yearlyPrice = yearlyPrice;
		}

		if (req.body?.isActive !== undefined) {
			updates.isActive = Boolean(req.body.isActive);
		}

		if (req.body?.sortOrder !== undefined) {
			updates.sortOrder = Number(req.body.sortOrder || 0);
		}

		if (!Object.keys(updates).length) {
			return res.status(400).json({ message: "No valid fields to update" });
		}

		const plan = await SubscriptionPlan.findByIdAndUpdate(planId, updates, {
			new: true,
			runValidators: true,
		});

		if (!plan) {
			return res.status(404).json({ message: "Subscription plan not found" });
		}

		return res.json({ message: "Subscription plan updated", plan });
	} catch (err) {
		if (err.code === 11000) {
			return res.status(409).json({ message: "Subscription code already exists" });
		}
		return res.status(500).json({ message: err.message || "Failed to update subscription plan" });
	}
};

exports.deleteSubscriptionPlanAdmin = async (req, res) => {
	try {
		const { planId } = req.params;
		const plan = await SubscriptionPlan.findByIdAndDelete(planId);

		if (!plan) {
			return res.status(404).json({ message: "Subscription plan not found" });
		}

		return res.json({ message: "Subscription plan deleted" });
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to delete subscription plan" });
	}
};
