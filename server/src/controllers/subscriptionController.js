const Loan = require("../models/Loan");
const Transaction = require("../models/Transaction");
const User = require("../models/userModel");
const Notification = require("../models/Notification");
const SubscriptionPlan = require("../models/SubscriptionPlan");
const { createOTP, verifyOTP } = require("../services/otpService");
const { redeemReward } = require("../services/rewardService");

const DEFAULT_SUBSCRIPTION_CATALOG = [
	{ code: "NETFLIX", name: "Netflix", yearlyPrice: 1499 },
	{ code: "PRIME_VIDEO", name: "Amazon Prime Video", yearlyPrice: 1499 },
	{ code: "DISNEY_HOTSTAR", name: "Disney+ Hotstar", yearlyPrice: 1499 },
	{ code: "ZEE5", name: "ZEE5", yearlyPrice: 999 },
	{ code: "AHA", name: "Aha", yearlyPrice: 999 },
];

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getDateStart = (dateValue = new Date()) => {
	const d = new Date(dateValue);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const calculateDaysRemaining = (endDate, fromDate = new Date()) => {
	const diff = getDateStart(endDate).getTime() - getDateStart(fromDate).getTime();
	return Math.ceil(diff / DAY_IN_MS);
};

const calculateEmiSummary = ({ principalAmount, annualInterestRate, durationMonths }) => {
	const p = Number(principalAmount || 0);
	const n = Number(durationMonths || 0);
	const monthlyRate = Number(annualInterestRate || 0) / 1200;

	if (p <= 0 || n <= 0) {
		return {
			principalAmount: 0,
			annualInterestRate: Number(annualInterestRate || 0),
			durationMonths: n,
			monthlyRate,
			emiAmount: 0,
			totalPayable: 0,
			totalInterest: 0,
		};
	}

	const rawEmi =
		monthlyRate === 0
			? p / n
			: (p * monthlyRate * Math.pow(1 + monthlyRate, n)) /
			  (Math.pow(1 + monthlyRate, n) - 1);

	const emiAmount = round2(rawEmi);
	const totalPayable = round2(rawEmi * n);

	return {
		principalAmount: round2(p),
		annualInterestRate: Number(annualInterestRate || 0),
		durationMonths: n,
		monthlyRate,
		emiAmount,
		totalPayable,
		totalInterest: round2(totalPayable - p),
	};
};

const buildInstallments = ({ durationMonths, emiAmount, totalPayable }) => {
	const today = new Date();
	const installments = [];
	let allocated = 0;

	for (let i = 1; i <= durationMonths; i++) {
		const dueDate = new Date(today);
		dueDate.setMonth(dueDate.getMonth() + i);

		let amount = emiAmount;
		if (i === durationMonths) {
			amount = round2(totalPayable - allocated);
		}

		allocated = round2(allocated + amount);

		installments.push({
			installmentNumber: i,
			amount,
			dueDate,
			paidAmount: 0,
			status: "PENDING",
		});
	}

	return installments;
};

const ensureCatalogSeeded = async () => {
	const existingCount = await SubscriptionPlan.countDocuments();
	if (existingCount > 0) return;

	await SubscriptionPlan.insertMany(
		DEFAULT_SUBSCRIPTION_CATALOG.map((plan, index) => ({
			...plan,
			sortOrder: index + 1,
			isActive: true,
		}))
	);
};

const getActiveCatalog = async () => {
	await ensureCatalogSeeded();

	const plans = await SubscriptionPlan.find({ isActive: true })
		.sort({ sortOrder: 1, name: 1 })
		.lean();

	return plans.map((plan) => ({
		code: plan.code,
		name: plan.name,
		yearlyPrice: Number(plan.yearlyPrice || 0),
	}));
};

const getSelectedPlans = async (subscriptionCodes = []) => {
	const catalog = await getActiveCatalog();
	const selectedSet = new Set((subscriptionCodes || []).map((code) => String(code || "").trim().toUpperCase()));
	return catalog.filter((item) => selectedSet.has(item.code));
};

const getNextEmiDue = (loan) => {
	const pending = (loan.installments || [])
		.filter((inst) => inst.status === "PENDING" || inst.status === "PARTIALLY_PAID")
		.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

	if (!pending.length) return null;

	const next = pending[0];
	return {
		installmentNumber: next.installmentNumber,
		dueDate: next.dueDate,
		amountDue: round2(Math.max(0, Number(next.amount || 0) - Number(next.paidAmount || 0))),
	};
};

const buildActivationRows = (order) => {
	const activatedAt = new Date(order.createdAt || Date.now());
	const expiresAt = new Date(activatedAt);
	expiresAt.setFullYear(expiresAt.getFullYear() + 1);

	const nextEmi = getNextEmiDue(order);

	return (order.bundleItems || []).map((item) => {
		const daysLeft = calculateDaysRemaining(expiresAt);

		return {
			orderId: order._id,
			loanStatus: order.status,
			subscriptionCode: item.code,
			subscriptionName: item.name,
			activatedAt,
			expiresAt,
			daysLeft,
			renewalEligible: daysLeft >= 0 && daysLeft <= 30,
			nextEmi,
			beneficiaryEmail: order.beneficiaryEmail,
			activationCode: order.activationCode,
		};
	});
};

const createRenewalRemindersIfNeeded = async (userId, activationRows) => {
	for (const row of activationRows) {
		if (!row.renewalEligible) continue;

		const title = `${row.subscriptionName} renewal due soon`;
		const exists = await Notification.findOne({
			userId,
			type: "subscription_renewal",
			title,
			relatedId: row.orderId,
		});

		if (exists) continue;

		await Notification.create({
			userId,
			type: "subscription_renewal",
			title,
			message: `${row.subscriptionName} expires on ${new Date(row.expiresAt).toLocaleDateString("en-IN")}. Renew now with Subscription Hub BNPL checkout.`,
			channel: "in_app",
			relatedId: row.orderId,
		});
	}
};

const createBundleLoanForUser = async ({ user, selectedPlans, durationMonths, annualInterestRate, beneficiaryEmail, activationCode, rewardRedemptionAmount = 0 }) => {
	const basePrincipalAmount = selectedPlans.reduce((sum, plan) => sum + Number(plan.yearlyPrice), 0);
	const appliedRewardRedemption = round2(Math.max(0, Math.min(Number(rewardRedemptionAmount || 0), basePrincipalAmount)));
	const principalAmount = round2(basePrincipalAmount - appliedRewardRedemption);
	const emiSummary = calculateEmiSummary({ principalAmount, annualInterestRate, durationMonths });

	const availableCredit = Number(user.creditLimit || 0) - Number(user.outstandingBalance || 0);
	if (emiSummary.totalPayable > availableCredit) {
		const err = new Error("Insufficient BNPL credit for this bundle");
		err.code = 400;
		err.payload = {
			message: err.message,
			requiredCredit: emiSummary.totalPayable,
			availableCredit,
		};
		throw err;
	}

	const installments = buildInstallments({
		durationMonths,
		emiAmount: emiSummary.emiAmount,
		totalPayable: emiSummary.totalPayable,
	});

	user.outstandingBalance = round2(Number(user.outstandingBalance || 0) + emiSummary.totalPayable);
	await user.save();

	const loan = await Loan.create({
		user: user._id,
		merchant: "Subscription Hub",
		category: "SUBSCRIPTION_BUNDLE",
		principalAmount: emiSummary.principalAmount,
		annualInterestRate,
		totalPayable: emiSummary.totalPayable,
		emiAmount: emiSummary.emiAmount,
		bundleDurationMonths: durationMonths,
		bundleItems: selectedPlans,
		upfrontPaid: 0,
		bnplAmount: emiSummary.totalPayable,
		installmentPlan: durationMonths,
		installments,
		totalPaid: 0,
		status: "ACTIVE",
		beneficiaryEmail,
		activationCode,
	});

	await Transaction.create({
		user: user._id,
		type: "PURCHASE",
		merchant: "Subscription Hub",
		totalAmount: emiSummary.principalAmount,
		upfrontPaid: 0,
		bnplAmount: emiSummary.totalPayable,
		loan: loan._id,
		paymentMethod: "NONE",
		note: `OTT bundle checkout (${selectedPlans.map((plan) => plan.name).join(", ")})${appliedRewardRedemption > 0 ? `, Rewards used: ₹${appliedRewardRedemption}` : ""}`,
	});

	return {
		loan,
		emiSummary,
		appliedRewardRedemption,
		basePrincipalAmount,
	};
};

exports.getCatalog = async (req, res) => {
	try {
		const subscriptions = await getActiveCatalog();
		return res.json({ subscriptions });
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to load catalog" });
	}
};

exports.getQuote = async (req, res) => {
	try {
		const subscriptionCodes = Array.isArray(req.body?.subscriptionCodes)
			? req.body.subscriptionCodes
			: [];
		const durationMonths = Number(req.body?.durationMonths || 12);
		const annualInterestRate = Number(req.body?.annualInterestRate ?? 12);

		if (![3, 6, 9, 12].includes(durationMonths)) {
			return res.status(400).json({ message: "Duration must be 3, 6, 9, or 12 months" });
		}

		if (annualInterestRate < 0 || annualInterestRate > 36) {
			return res.status(400).json({ message: "Annual interest rate must be between 0 and 36" });
		}

		const selectedPlans = await getSelectedPlans(subscriptionCodes);
		if (selectedPlans.length === 0) {
			return res.status(400).json({ message: "Select at least one subscription" });
		}

		const principalAmount = selectedPlans.reduce((sum, plan) => sum + Number(plan.yearlyPrice), 0);
		const emiSummary = calculateEmiSummary({ principalAmount, annualInterestRate, durationMonths });

		return res.json({
			selectedPlans,
			emiSummary,
		});
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to calculate quote" });
	}
};

exports.sendCheckoutOTP = async (req, res) => {
	try {
		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const otpResult = await createOTP(user.email, null, "payment_confirm", user._id);
		if (!otpResult.success) {
			return res.status(otpResult.statusCode || 400).json({ message: otpResult.message });
		}

		return res.json({
			message: "Checkout OTP sent",
			expiresIn: otpResult.expiresIn,
			destination: otpResult.destination,
		});
	} catch (err) {
		return res.status(500).json({ message: err.message || "Unable to send OTP" });
	}
};

exports.checkoutBundle = async (req, res) => {
	try {
		const subscriptionCodes = Array.isArray(req.body?.subscriptionCodes)
			? req.body.subscriptionCodes
			: [];
		const durationMonths = Number(req.body?.durationMonths || 12);
		const annualInterestRate = Number(req.body?.annualInterestRate ?? 12);
		const beneficiaryEmail = String(req.body?.beneficiaryEmail || "").trim().toLowerCase();
		const rewardRedeemAmount = Number(req.body?.rewardRedeemAmount || 0);
		const otpCode = String(req.body?.otpCode || "").trim();

		if (!otpCode) {
			return res.status(400).json({ message: "OTP is required for checkout" });
		}

		if (!beneficiaryEmail) {
			return res.status(400).json({ message: "Beneficiary email is required" });
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(beneficiaryEmail)) {
			return res.status(400).json({ message: "Invalid beneficiary email format" });
		}

		const selectedPlans = await getSelectedPlans(subscriptionCodes);
		if (selectedPlans.length === 0) {
			return res.status(400).json({ message: "Select at least one subscription" });
		}

		if (![3, 6, 9, 12].includes(durationMonths)) {
			return res.status(400).json({ message: "Duration must be 3, 6, 9, or 12 months" });
		}

		if (annualInterestRate < 0 || annualInterestRate > 36) {
			return res.status(400).json({ message: "Annual interest rate must be between 0 and 36" });
		}

		let user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const otpVerification = await verifyOTP(user.email, null, otpCode, "payment_confirm");
		if (!otpVerification.success) {
			return res.status(400).json({ message: otpVerification.message || "Invalid OTP" });
		}

		if (!user.isEligible) {
			return res.status(403).json({
				message: "BNPL unavailable for this profile.",
				riskLevel: user.riskLevel || "High",
				riskScore: Number(user.riskScore || 0),
				reasons: Array.isArray(user.riskReasons) ? user.riskReasons : ["Risk policy check failed"],
			});
		}

		let redemptionResult = { amount: 0, walletBalance: 0 };
		if (rewardRedeemAmount > 0) {
			redemptionResult = await redeemReward({
				userId: user._id,
				amount: rewardRedeemAmount,
				source: "PURCHASE_REDEMPTION",
				note: "Rewards redeemed on subscription bundle checkout",
				metadata: {
					subscriptionCodes,
					durationMonths,
				},
			});
		}

		// Generate activation code
		const activationCode = `${selectedPlans.map(p => p.code).join("-")}_ACTIVE_${Date.now()}_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

		const { loan, emiSummary, appliedRewardRedemption, basePrincipalAmount } = await createBundleLoanForUser({
			user,
			selectedPlans,
			durationMonths,
			annualInterestRate,
			beneficiaryEmail,
			activationCode,
			rewardRedemptionAmount: redemptionResult.amount || 0,
		});

		// Send activation email
		const emailService = require("../services/emailService");
		const planNames = selectedPlans.map(p => p.name).join(", ");
		try {
			await emailService.sendActivationEmail(beneficiaryEmail, activationCode, planNames);
		} catch (emailErr) {
			console.warn("Warning: Activation email could not be sent:", emailErr.message);
			// Don't fail the checkout if email fails
		}

		const now = new Date();
		const expiresAt = new Date(now);
		expiresAt.setFullYear(expiresAt.getFullYear() + 1);

		const activations = selectedPlans.map((plan) => ({
			code: plan.code,
			name: plan.name,
			status: "ACTIVATED",
			activatedAt: now,
			expiresAt,
		}));

		return res.status(201).json({
			message: "Subscription bundle activated successfully",
			loanId: loan._id,
			selectedPlans,
			emiSummary,
			rewardsUsed: Number(appliedRewardRedemption || 0),
			basePrincipalAmount,
			activations,
		});
	} catch (err) {
		if (err.code && err.payload) {
			return res.status(err.code).json(err.payload);
		}

		console.error("Subscription checkout error:", err);
		return res.status(500).json({ message: err.message || "Failed to complete checkout" });
	}
};

exports.getOrders = async (req, res) => {
	try {
		const orders = await Loan.find({
			user: req.user.id,
			category: "SUBSCRIPTION_BUNDLE",
		})
			.sort({ createdAt: -1 })
			.lean();

		return res.json({ orders });
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to fetch orders" });
	}
};

exports.getActivatedSubscriptions = async (req, res) => {
	try {
		const orders = await Loan.find({
			user: req.user.id,
			category: "SUBSCRIPTION_BUNDLE",
		})
			.sort({ createdAt: -1 })
			.lean();

		const activatedSubscriptions = orders.flatMap((order) => buildActivationRows(order));
		await createRenewalRemindersIfNeeded(req.user.id, activatedSubscriptions);

		return res.json({ activatedSubscriptions });
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to load activated subscriptions" });
	}
};

exports.renewBundle = async (req, res) => {
	try {
		const orderId = String(req.body?.orderId || "").trim();
		const otpCode = String(req.body?.otpCode || "").trim();
		const durationMonths = Number(req.body?.durationMonths || 12);
		const annualInterestRate = Number(req.body?.annualInterestRate ?? 12);
		const rewardRedeemAmount = Number(req.body?.rewardRedeemAmount || 0);

		if (!orderId) {
			return res.status(400).json({ message: "orderId is required" });
		}

		if (!otpCode) {
			return res.status(400).json({ message: "OTP is required for renewal" });
		}

		if (![3, 6, 9, 12].includes(durationMonths)) {
			return res.status(400).json({ message: "Duration must be 3, 6, 9, or 12 months" });
		}

		if (annualInterestRate < 0 || annualInterestRate > 36) {
			return res.status(400).json({ message: "Annual interest rate must be between 0 and 36" });
		}

		const previousOrder = await Loan.findOne({
			_id: orderId,
			user: req.user.id,
			category: "SUBSCRIPTION_BUNDLE",
		}).lean();

		if (!previousOrder) {
			return res.status(404).json({ message: "Bundle order not found" });
		}

		let user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const otpVerification = await verifyOTP(user.email, null, otpCode, "payment_confirm");
		if (!otpVerification.success) {
			return res.status(400).json({ message: otpVerification.message || "Invalid OTP" });
		}

		if (!user.isEligible) {
			return res.status(403).json({
				message: "BNPL unavailable for this profile.",
				riskLevel: user.riskLevel || "High",
				riskScore: Number(user.riskScore || 0),
				reasons: Array.isArray(user.riskReasons) ? user.riskReasons : ["Risk policy check failed"],
			});
		}

		const selectedPlans = (previousOrder.bundleItems || []).map((item) => ({
			code: item.code,
			name: item.name,
			yearlyPrice: Number(item.yearlyPrice || 0),
		}));

		// Generate activation code for renewal
		const activationCode = `${selectedPlans.map(p => p.code).join("-")}_ACTIVE_${Date.now()}_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
		const beneficiaryEmail = previousOrder.beneficiaryEmail || user.email;

		let redemptionResult = { amount: 0, walletBalance: 0 };
		if (rewardRedeemAmount > 0) {
			redemptionResult = await redeemReward({
				userId: user._id,
				amount: rewardRedeemAmount,
				source: "PURCHASE_REDEMPTION",
				note: "Rewards redeemed on subscription renewal",
				metadata: {
					orderId,
					durationMonths,
				},
			});
		}

		const { loan, emiSummary, appliedRewardRedemption, basePrincipalAmount } = await createBundleLoanForUser({
			user,
			selectedPlans,
			durationMonths,
			annualInterestRate,
			beneficiaryEmail,
			activationCode,
			rewardRedemptionAmount: redemptionResult.amount || 0,
		});

		// Send renewal activation email
		const emailService = require("../services/emailService");
		const planNames = selectedPlans.map(p => p.name).join(", ");
		try {
			await emailService.sendActivationEmail(beneficiaryEmail, activationCode, planNames, true);
		} catch (emailErr) {
			console.warn("Warning: Renewal activation email could not be sent:", emailErr.message);
		}

		return res.status(201).json({
			message: "Subscription bundle renewed successfully",
			loanId: loan._id,
			selectedPlans,
			emiSummary,
			rewardsUsed: Number(appliedRewardRedemption || 0),
			basePrincipalAmount,
			renewedFromOrderId: orderId,
		});
	} catch (err) {
		if (err.code && err.payload) {
			return res.status(err.code).json(err.payload);
		}

		return res.status(500).json({ message: err.message || "Failed to renew subscription bundle" });
	}
};
