const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/userModel");
const Transaction = require("../models/Transaction");
const Loan = require("../models/Loan");
const Notification = require("../models/Notification");
const KYC = require("../models/kycModel");
const { validatePANForIndividual } = require("../services/panVerificationService");
const { createOTP, verifyOTP } = require("../services/otpService");
const { normalizePhone } = require("../services/smsService");
const { sendEmail } = require("../services/emailService");
const { applyRepaymentCashback, redeemReward } = require("../services/rewardService");

const JWT_SECRET = process.env.JWT_SECRET || "secret123";
const ADMIN_LOGIN_EMAIL = String(process.env.ADMIN_LOGIN_EMAIL || "admin@snapcredit.com").toLowerCase();
const ADMIN_LOGIN_PASSWORD = String(process.env.ADMIN_LOGIN_PASSWORD || "Admin@123");

const toPublicUser = (userDoc) => {
	const approvalScore = Number(userDoc.creditScore || 0);
	const availableCredit = Math.max(
		0,
		Number(userDoc.creditLimit) - Number(userDoc.outstandingBalance)
	);

	return {
		id: userDoc._id,
		name: userDoc.name,
		email: userDoc.email,
		phone: userDoc.phone || null,
		verified: Boolean(userDoc.verified),
		isAdmin: Boolean(userDoc.isAdmin),
		creditLimit: Number(userDoc.creditLimit),
		outstandingBalance: Number(userDoc.outstandingBalance),
		availableCredit,
		creditScore: approvalScore,
		approvalScore,
		bureauScore: Number(userDoc.bureauScore || 0),
		bureauScoreRating: userDoc.bureauScoreRating || null,
		isEligible: Boolean(userDoc.isEligible),
		studentVerificationStatus: userDoc.studentVerificationStatus || "draft",
		studentTrustScore: Number(userDoc.studentTrustScore || 0),
		studentRiskLevel: userDoc.studentRiskLevel || "CRITICAL",
		studentSuggestedBnplLimit: Number(userDoc.studentSuggestedBnplLimit || 0),
		studentApprovalDecision: userDoc.studentApprovalDecision || "REJECTED",
		studentVerificationUpdatedAt: userDoc.studentVerificationUpdatedAt || null,
		aadhaarVerificationStatus: userDoc.aadhaarVerificationStatus || "not_started",
		aadhaarMaskedNumber: userDoc.aadhaarMaskedNumber || null,
		aadhaarVerificationReferenceId: userDoc.aadhaarVerificationReferenceId || null,
		aadhaarVerifiedName: userDoc.aadhaarVerifiedName || null,
		aadhaarKycScore: Number(userDoc.aadhaarKycScore || 0),
		aadhaarFraudScore: Number(userDoc.aadhaarFraudScore || 0),
		aadhaarBnplEligibility: userDoc.aadhaarBnplEligibility || "not_available",
		pan: userDoc.pan || null,
		monthlyIncome: Number(userDoc.monthlyIncome || 0),
		employmentType: userDoc.employmentType || "unemployed",
		riskLevel: userDoc.riskLevel || "High",
		riskScore: Number(userDoc.riskScore || 0),
		riskReasons: Array.isArray(userDoc.riskReasons) ? userDoc.riskReasons : [],
		lastRiskAssessedAt: userDoc.lastRiskAssessedAt || null,
	};
};

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const getStartOfDay = (dateValue = new Date()) => {
	const date = new Date(dateValue);
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const createUpcomingPaymentReminders = async (userId, loans) => {
	if (!Array.isArray(loans) || loans.length === 0) {
		return;
	}

	const todayStart = getStartOfDay();

	for (const loan of loans) {
		for (const installment of loan.installments || []) {
			if (installment.status !== "PENDING") {
				continue;
			}

			const dueDate = new Date(installment.dueDate);
			if (Number.isNaN(dueDate.getTime())) {
				continue;
			}

			const dueStart = getStartOfDay(dueDate);
			const daysUntilDue = Math.ceil((dueStart - todayStart) / MS_IN_DAY);

			if (daysUntilDue < 0 || daysUntilDue > 3) {
				continue;
			}

			const merchantName = loan.merchant || "your merchant";
			const title = `EMI ${installment.installmentNumber} payment reminder`;
			const dueAmount = Math.max(0, Number(installment.amount) - Number(installment.paidAmount || 0));

			const existingReminder = await Notification.findOne({
				userId,
				type: "payment_reminder",
				relatedId: loan._id,
				title,
			});

			if (existingReminder) {
				continue;
			}

			await Notification.create({
				userId,
				type: "payment_reminder",
				title,
				message: `EMI ${installment.installmentNumber} for ${merchantName} of ₹${dueAmount} is due on ${dueDate.toLocaleDateString("en-IN")}. Pay before the last date to avoid penalties.`,
				channel: "in_app",
				relatedId: loan._id,
			});
		}
	}
};

const hashToken = (rawToken) =>
	crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");

const getResetPasswordUrl = (email, token) => {
	const configuredBase =
		process.env.FRONTEND_RESET_PASSWORD_URL ||
		(process.env.FRONTEND_URL
			? `${process.env.FRONTEND_URL.replace(/\/$/, "")}/reset-password`
			: "http://localhost:5173/reset-password");

	const separator = configuredBase.includes("?") ? "&" : "?";
	return `${configuredBase}${separator}token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
};

exports.sendRegistrationOTP = async (req, res) => {
	try {
		const emailInput = req.body?.email;
		const normalizedEmail = emailInput ? String(emailInput).toLowerCase().trim() : "";

		if (!normalizedEmail) {
			return res.status(400).json({ message: "Email is required" });
		}

		const existingByEmail = await User.findOne({ email: normalizedEmail });
		if (existingByEmail) {
			return res.status(409).json({ message: "Email is already registered" });
		}

		const result = await createOTP(normalizedEmail, null, "registration", null);
		if (!result.success) {
			return res.status(result.statusCode || 400).json({ message: result.message });
		}

		return res.status(200).json(result);
	} catch (err) {
		console.error("Send registration OTP error:", err);
		return res.status(500).json({ message: "Failed to send OTP" });
	}
};

exports.register = async (req, res) => {
	try {
		const {
			name,
			email,
			phone,
			otpCode,
			password,
			pan,
			monthlyIncome,
			employmentType,
			age,
			employer,
			existingDebt,
		} = req.body;
		const normalizedEmail = email ? String(email).toLowerCase().trim() : "";
		const normalizedPhone = normalizePhone(phone);
		const normalizedPAN = pan ? String(pan).toUpperCase().trim() : null;
		const hasIncomeInput = monthlyIncome !== undefined && monthlyIncome !== null && monthlyIncome !== "";
		const parsedMonthlyIncome = hasIncomeInput ? Number(monthlyIncome) : 0;
		const normalizedEmploymentType = employmentType
			? String(employmentType).trim().toLowerCase()
			: "unemployed";
		const normalizedOtpCode = otpCode ? String(otpCode).trim() : "";
		const allowedEmploymentTypes = new Set(["salaried", "self-employed", "student", "unemployed"]);

		if (!name || !normalizedEmail || !password) {
			return res.status(400).json({ message: "Name, email, and password are required" });
		}

		if (!normalizedOtpCode) {
			return res.status(400).json({ message: "OTP is required to verify your email" });
		}

		if (!Number.isFinite(parsedMonthlyIncome) || parsedMonthlyIncome < 0) {
			return res.status(400).json({ message: "Monthly income must be a valid non-negative number" });
		}

		if (!allowedEmploymentTypes.has(normalizedEmploymentType)) {
			return res.status(400).json({ message: "Invalid employment type" });
		}

		const existing = await User.findOne({ email: normalizedEmail });
		if (existing) {
			return res.status(409).json({ message: "User already exists" });
		}

		if (normalizedPhone) {
			const existingPhone = await User.findOne({ phone: normalizedPhone });
			if (existingPhone) {
				return res.status(409).json({ message: "Phone number already registered" });
			}
		}

		if (normalizedPAN) {
			const existingPAN = await User.findOne({ pan: normalizedPAN });
			if (existingPAN) {
				return res.status(409).json({ message: "PAN already registered" });
			}

			const panValidation = validatePANForIndividual(normalizedPAN, name);
			if (!panValidation.isValid) {
				return res.status(400).json({
					message: "PAN verification failed",
					reasons: panValidation.reasons,
				});
			}
		}

		const otpVerification = await verifyOTP(normalizedEmail, null, normalizedOtpCode, "registration");
		if (!otpVerification.success) {
			return res.status(400).json({ message: otpVerification.message || "Invalid OTP" });
		}

		const hashedPassword = await bcrypt.hash(password, 10);
		let user = await User.create({
			name,
			email: normalizedEmail,
			...(normalizedPhone ? { phone: normalizedPhone } : {}),
			password: hashedPassword,
			verified: true,
			...(normalizedPhone ? { phoneVerifiedAt: new Date() } : {}),
			...(normalizedPAN ? { pan: normalizedPAN } : {}),
			monthlyIncome: parsedMonthlyIncome,
			employmentType: normalizedEmploymentType,
			age: Number(age) || null,
			employer: employer || null,
			creditLimit: 0,
			creditScore: 0,
			isEligible: false,
		});

		return res.status(201).json({
			message: "Account created successfully",
			user: toPublicUser(user),
		});
	} catch (err) {
		console.error("Registration error:", err);
		return res.status(500).json({ message: err.message || "Error creating user" });
	}
};

exports.login = async (req, res) => {
	try {
		const { email, password, pan, monthlyIncome } = req.body;

		if (!email || !password) {
			return res.status(400).json({ message: "Email and password are required" });
		}

		let user = await User.findOne({ email: email.toLowerCase() });
		if (!user) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		if (user.phone && user.verified === false) {
			return res.status(403).json({
				message: "Phone number is not verified. Complete OTP verification to activate this account.",
			});
		}

		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch) {
			return res.status(401).json({ message: "Invalid credentials" });
		}



		const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
			expiresIn: "7d",
		});

		return res.json({
			message: "Login successful",
			token,
			user: toPublicUser(user),
		});
	} catch (err) {
		return res.status(500).json({ message: "Error logging in" });
	}
};

exports.adminLogin = async (req, res) => {
	try {
		const email = String(req.body?.email || "").toLowerCase().trim();
		const password = String(req.body?.password || "");

		if (!email || !password) {
			return res.status(400).json({ message: "Email and password are required" });
		}

		if (email !== ADMIN_LOGIN_EMAIL || password !== ADMIN_LOGIN_PASSWORD) {
			return res.status(401).json({ message: "Invalid admin credentials" });
		}

		let adminUser = await User.findOne({ email: ADMIN_LOGIN_EMAIL });
		if (!adminUser) {
			const hashedPassword = await bcrypt.hash(ADMIN_LOGIN_PASSWORD, 10);
			adminUser = await User.create({
				name: "Admin",
				email: ADMIN_LOGIN_EMAIL,
				password: hashedPassword,
				verified: true,
				isAdmin: true,
				creditLimit: 0,
				creditScore: 0,
				isEligible: false,
			});
		} else if (!adminUser.isAdmin) {
			adminUser.isAdmin = true;
			await adminUser.save();
		}

		const token = jwt.sign({ id: adminUser._id, email: adminUser.email }, JWT_SECRET, {
			expiresIn: "7d",
		});

		return res.json({
			message: "Admin login successful",
			token,
			user: toPublicUser(adminUser),
		});
	} catch (err) {
		console.error("Admin login error:", err);
		return res.status(500).json({ message: "Error logging in as admin" });
	}
};

exports.forgotPassword = async (req, res) => {
	try {
		const emailInput = req.body?.email;
		const email = emailInput ? String(emailInput).toLowerCase().trim() : "";

		if (!email) {
			return res.status(400).json({ message: "Email is required" });
		}

		const user = await User.findOne({ email });
		const genericMessage = "If an account exists for this email, a reset link has been sent.";

		if (!user) {
			return res.json({ message: genericMessage });
		}

		const rawToken = crypto.randomBytes(32).toString("hex");
		const tokenHash = hashToken(rawToken);
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

		user.resetPasswordTokenHash = tokenHash;
		user.resetPasswordExpiresAt = expiresAt;
		await user.save();

		const resetUrl = getResetPasswordUrl(email, rawToken);

		const emailResult = await sendEmail({
			to: email,
			subject: "Reset your SnapCredit password",
			text: `You requested a password reset. Click this link to continue: ${resetUrl}. This link expires in 15 minutes.`,
			html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset Password</a></p><p>This link expires in 15 minutes.</p>`,
		});

		if (!emailResult?.success) {
			user.resetPasswordTokenHash = undefined;
			user.resetPasswordExpiresAt = undefined;
			await user.save();

			console.error("Forgot password email send failed", {
				email,
				provider: emailResult?.provider,
				warning: emailResult?.warning,
			});

			return res.status(502).json({
				message: "Unable to send reset email right now. Please try again shortly.",
			});
		}

		return res.json({
			message: genericMessage,
			...(process.env.NODE_ENV === "production" ? {} : { debugResetToken: rawToken }),
		});
	} catch (err) {
		console.error("Forgot password error:", err);
		return res.status(500).json({ message: "Failed to process forgot password request" });
	}
};

exports.resetPassword = async (req, res) => {
	try {
		const emailInput = req.body?.email;
		const tokenInput = req.body?.token;
		const newPassword = req.body?.newPassword;

		const email = emailInput ? String(emailInput).toLowerCase().trim() : "";
		const token = tokenInput ? String(tokenInput).trim() : "";

		if (!email || !token || !newPassword) {
			return res.status(400).json({ message: "Email, token, and new password are required" });
		}

		if (String(newPassword).length < 6) {
			return res.status(400).json({ message: "New password must be at least 6 characters" });
		}

		const user = await User.findOne({ email });
		if (!user) {
			return res.status(400).json({ message: "Invalid or expired reset token" });
		}

		const tokenHash = hashToken(token);
		if (
			!user.resetPasswordTokenHash ||
			user.resetPasswordTokenHash !== tokenHash ||
			!user.resetPasswordExpiresAt ||
			user.resetPasswordExpiresAt.getTime() < Date.now()
		) {
			return res.status(400).json({ message: "Invalid or expired reset token" });
		}

		user.password = await bcrypt.hash(String(newPassword), 10);
		user.resetPasswordTokenHash = undefined;
		user.resetPasswordExpiresAt = undefined;
		await user.save();

		return res.json({ message: "Password reset successful. You can now login." });
	} catch (err) {
		console.error("Reset password error:", err);
		return res.status(500).json({ message: "Failed to reset password" });
	}
};

exports.predictRisk = async (req, res) => {
	try {
		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		return res.json({
			eligible: Boolean(user.isEligible),
			credit_limit: Number(user.creditLimit || 0),
			risk_level: user.riskLevel || "High",
			risk_score: Number(user.riskScore || 0),
			reasons: Array.isArray(user.riskReasons) ? user.riskReasons : [],
			user: toPublicUser(user),
		});
	} catch (err) {
		console.error("Predict risk error:", err);
		return res.status(500).json({ message: "Failed to assess risk" });
	}
};

exports.getDashboard = async (req, res) => {
	try {
		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const kyc = await KYC.findOne({ userId: user._id })
			.select("verificationStatus eligibilityStatus assignedCreditLimit")
			.lean();

		return res.json({
			...toPublicUser(user),
			verificationStatus: kyc?.verificationStatus || "pending",
			eligibilityStatus: kyc?.eligibilityStatus || (user.isEligible ? "approved" : "manual_review"),
			assignedCreditLimit: Number(
				kyc?.assignedCreditLimit ?? user.creditLimit ?? 0
			),
		});
	} catch (err) {
		return res.status(500).json({ message: "Error fetching dashboard" });
	}
};

exports.purchase = async (req, res) => {
	try {
		const totalAmount = Number(req.body.amount);
		const merchant = req.body.merchant || "PhonePay Merchant";
		const mode = req.body.mode || "FULL_BNPL";
		const upfrontAmount = Number(req.body.upfrontAmount || 0);
		const paymentMethod = req.body.paymentMethod || "UPI";
		const installmentPlan = Number(req.body.installmentPlan || 3);
		const rewardRedeemAmountRequested = Number(req.body.rewardRedeemAmount || 0);
		let purchaseRewardRedemption = { amount: 0, walletBalance: 0 };

		if (!totalAmount || totalAmount <= 0) {
			return res.status(400).json({ message: "Purchase amount must be greater than 0" });
		}

		if (![1, 3, 6, 9, 12].includes(installmentPlan)) {
			return res.status(400).json({ message: "Invalid installment plan. Choose 1, 3, 6, 9, or 12 months" });
		}

		let user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		let upfrontPaid = 0;
		let bnplAmount = 0;
		let finalAmount = totalAmount;

		if (rewardRedeemAmountRequested > 0) {
			purchaseRewardRedemption = await redeemReward({
				userId: req.user.id,
				amount: rewardRedeemAmountRequested,
				source: "PURCHASE_REDEMPTION",
				note: `Rewards redeemed on purchase at ${merchant}`,
				metadata: { merchant, requested: rewardRedeemAmountRequested },
			});

			finalAmount = Math.max(
				0,
				Math.round((totalAmount - Number(purchaseRewardRedemption.amount || 0) + Number.EPSILON) * 100) / 100
			);
		}

		if (mode === "PAY_NOW") {
			upfrontPaid = finalAmount;
			bnplAmount = 0;
		} else if (mode === "FULL_BNPL") {
			upfrontPaid = 0;
			bnplAmount = finalAmount;
		} else if (mode === "SPLIT") {
			if (upfrontAmount < 0 || upfrontAmount > finalAmount) {
				return res.status(400).json({ message: "Invalid upfront amount" });
			}
			upfrontPaid = upfrontAmount;
			bnplAmount = finalAmount - upfrontAmount;
		} else {
			return res.status(400).json({ message: "Invalid payment mode" });
		}

		if (bnplAmount > 0) {
			if (!user.isEligible) {
				return res.status(403).json({
					message: "BNPL unavailable for this profile.",
					riskLevel: user.riskLevel || "High",
					riskScore: Number(user.riskScore || 0),
					reasons: Array.isArray(user.riskReasons) ? user.riskReasons : ["Risk policy check failed"],
				});
			}
		}

		const availableCredit = Number(user.creditLimit) - Number(user.outstandingBalance);

		if (bnplAmount > availableCredit) {
			return res.status(400).json({ message: "Insufficient BNPL credit" });
		}

		user.outstandingBalance += bnplAmount;
		await user.save();

		let loan = null;

		// Create loan with installment schedule if BNPL amount > 0
		if (bnplAmount > 0) {
			const installmentAmount = Math.ceil(bnplAmount / installmentPlan);
			const installments = [];
			const today = new Date();

			for (let i = 1; i <= installmentPlan; i++) {
				const dueDate = new Date(today);
				dueDate.setMonth(dueDate.getMonth() + i);

				// Last installment gets any remaining amount due to rounding
				const amount = i === installmentPlan 
					? bnplAmount - (installmentAmount * (installmentPlan - 1))
					: installmentAmount;

				installments.push({
					installmentNumber: i,
					amount,
					dueDate,
					paidAmount: 0,
					status: "PENDING",
				});
			}

			loan = await Loan.create({
				user: user._id,
				merchant,
				principalAmount: totalAmount,
				upfrontPaid,
				bnplAmount,
				installmentPlan,
				installments,
				totalPaid: 0,
			});
		}

		const transaction = await Transaction.create({
			user: user._id,
			type: "PURCHASE",
			merchant,
			totalAmount: finalAmount,
			upfrontPaid,
			bnplAmount,
			loan: loan?._id,
			paymentMethod: upfrontPaid > 0 ? paymentMethod : "NONE",
			note: `Mode: ${mode}, Installments: ${installmentPlan} months${purchaseRewardRedemption.amount > 0 ? `, Rewards used: ₹${purchaseRewardRedemption.amount}` : ""}`,
		});

		return res.json({
			message: "Payment successful",
			rewardsUsed: Number(purchaseRewardRedemption.amount || 0),
			payableAfterRewards: finalAmount,
			transaction,
			loan,
			user: toPublicUser(user),
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({ message: "Error processing payment" });
	}
};

exports.repay = async (req, res) => {
	try {
		const amount = Number(req.body.amount);
		const paymentMethod = req.body.paymentMethod || "UPI";
		const loanId = req.body.loanId;
		const installmentNumber = req.body.installmentNumber
			? Number(req.body.installmentNumber)
			: null;
		const merchant = typeof req.body.merchant === "string" ? req.body.merchant.trim() : "";
		const rewardRedeemAmountRequested = Number(req.body.rewardRedeemAmount || 0);
		let redemptionResult = { amount: 0, walletBalance: 0 };

		if ((amount <= 0 || Number.isNaN(amount)) && rewardRedeemAmountRequested <= 0) {
			return res.status(400).json({ message: "Repayment amount or reward redemption must be greater than 0" });
		}

		if (req.body.installmentNumber && (!Number.isInteger(installmentNumber) || installmentNumber <= 0)) {
			return res.status(400).json({ message: "Invalid EMI installment number" });
		}

		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		if (user.outstandingBalance <= 0) {
			return res.status(400).json({ message: "No outstanding BNPL balance" });
		}

		if (rewardRedeemAmountRequested > 0) {
			redemptionResult = await redeemReward({
				userId: user._id,
				amount: rewardRedeemAmountRequested,
				source: "EMI_REDEMPTION",
				note: "Rewards redeemed for EMI repayment",
				metadata: {
					loanId: loanId || null,
					installmentNumber: installmentNumber || null,
					requested: rewardRedeemAmountRequested,
				},
			});
		}

		const totalRequestedRepayment = Number(amount || 0) + Number(redemptionResult.amount || 0);
		let payable = Math.min(totalRequestedRepayment, Number(user.outstandingBalance));
		let remainingPayment = payable;
		const paidInstallments = [];
		let rewardDueDate = null;
		let rewardInstallmentNumber = null;
		let rewardLoanId = loanId || null;

		// If specific loan is specified, pay its installments
		if (loanId) {
			const loan = await Loan.findOne({ _id: loanId, user: user._id, status: "ACTIVE" });
			if (!loan) {
				return res.status(404).json({ message: "Loan not found" });
			}

			if (installmentNumber) {
				const selectedInstallment = loan.installments.find(
					(inst) => inst.installmentNumber === installmentNumber
				);

				if (!selectedInstallment) {
					return res.status(404).json({ message: "Selected EMI month not found" });
				}

				const amountDue = Math.max(0, selectedInstallment.amount - selectedInstallment.paidAmount);
				if (amountDue <= 0 || selectedInstallment.status === "PAID") {
					return res.status(400).json({ message: "Selected EMI month is already paid" });
				}

				if (payable > amountDue) {
					return res.status(400).json({ message: `Amount exceeds selected EMI due (₹${amountDue})` });
				}

				selectedInstallment.paidAmount += payable;
				remainingPayment = 0;
				rewardDueDate = selectedInstallment.dueDate;
				rewardInstallmentNumber = selectedInstallment.installmentNumber;

				if (selectedInstallment.paidAmount >= selectedInstallment.amount) {
					selectedInstallment.status = "PAID";
					selectedInstallment.paidDate = new Date();
				}

				paidInstallments.push(selectedInstallment.installmentNumber);
			} else {
				// Pay pending installments in order
				for (let installment of loan.installments) {
					if (installment.status === "PENDING" && remainingPayment > 0) {
						if (!rewardDueDate) {
							rewardDueDate = installment.dueDate;
							rewardInstallmentNumber = installment.installmentNumber;
						}
						const amountDue = installment.amount - installment.paidAmount;
						const paymentForThis = Math.min(remainingPayment, amountDue);

						installment.paidAmount += paymentForThis;
						remainingPayment -= paymentForThis;

						if (installment.paidAmount >= installment.amount) {
							installment.status = "PAID";
							installment.paidDate = new Date();
						}

						paidInstallments.push(installment.installmentNumber);
					}
				}
			}

			loan.totalPaid = loan.installments.reduce((sum, inst) => sum + inst.paidAmount, 0);

			// Check if loan is fully paid
			if (loan.totalPaid >= loan.bnplAmount) {
				loan.status = "COMPLETED";
			}

			await loan.save();

			const repaidAmount = payable - remainingPayment;
			if (repaidAmount <= 0) {
				return res.status(400).json({ message: "No pending installments for this loan" });
			}

			await Transaction.create({
				user: user._id,
				type: "REPAYMENT",
				merchant: loan.merchant,
				totalAmount: repaidAmount,
				upfrontPaid: repaidAmount,
				bnplAmount: 0,
				loan: loan._id,
				installmentNumber: paidInstallments.length > 0 ? paidInstallments[0] : null,
				paymentMethod,
				note: installmentNumber
					? `EMI ${installmentNumber} payment`
					: `Installment payment for ${paidInstallments.join(", ")}`,
			});

			user.outstandingBalance -= repaidAmount;
		} else {
			// General repayment or merchant-targeted repayment.
			const loanFilter = { user: user._id, status: "ACTIVE" };
			if (merchant) {
				loanFilter.merchant = merchant;
			}

			const activeLoans = await Loan.find(loanFilter).sort({ createdAt: 1 });

			if (merchant && activeLoans.length === 0) {
				return res.status(404).json({ message: "No active dues found for this merchant" });
			}

			for (let loan of activeLoans) {
				if (remainingPayment <= 0) break;
				rewardLoanId = rewardLoanId || loan._id;

				for (let installment of loan.installments) {
					if (installment.status === "PENDING" && remainingPayment > 0) {
						if (!rewardDueDate) {
							rewardDueDate = installment.dueDate;
							rewardInstallmentNumber = installment.installmentNumber;
						}
						const amountDue = installment.amount - installment.paidAmount;
						const paymentForThis = Math.min(remainingPayment, amountDue);

						installment.paidAmount += paymentForThis;
						remainingPayment -= paymentForThis;

						if (installment.paidAmount >= installment.amount) {
							installment.status = "PAID";
							installment.paidDate = new Date();
						}

						paidInstallments.push(`${loan.merchant}-${installment.installmentNumber}`);
					}
				}

				loan.totalPaid = loan.installments.reduce((sum, inst) => sum + inst.paidAmount, 0);

				if (loan.totalPaid >= loan.bnplAmount) {
					loan.status = "COMPLETED";
				}

				await loan.save();
			}

			const repaidAmount = payable - remainingPayment;
			if (repaidAmount <= 0) {
				return res.status(400).json({ message: "No pending dues available for repayment" });
			}

			await Transaction.create({
				user: user._id,
				type: "REPAYMENT",
				merchant: merchant || "Multiple Merchants",
				totalAmount: repaidAmount,
				upfrontPaid: repaidAmount,
				bnplAmount: 0,
				paymentMethod,
				note: merchant ? `Repayment for ${merchant}` : "General repayment",
			});

			user.outstandingBalance -= repaidAmount;
		}

		await user.save();

			const rewardResult = await applyRepaymentCashback({
				userId: user._id,
				loanId: rewardLoanId,
				paymentAmount: payable - remainingPayment,
				dueDate: rewardDueDate,
				installmentNumber: rewardInstallmentNumber,
				note: "Cashback earned on BNPL repayment",
			});

		return res.json({
			message: "Repayment successful",
			repaidAmount: payable - remainingPayment,
			cashPaidAmount: Number(amount || 0),
			rewardRedeemedAmount: Number(redemptionResult.amount || 0),
			paidInstallments,
				rewards: rewardResult,
			user: toPublicUser(user),
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({ message: "Error repaying BNPL" });
	}
};

exports.getLoans = async (req, res) => {
	try {
		const loans = await Loan.find({ user: req.user.id })
			.sort({ createdAt: -1 })
			.lean();

		return res.json(loans);
	} catch (err) {
		return res.status(500).json({ message: "Error fetching loans" });
	}
};

exports.getActiveLoans = async (req, res) => {
	try {
		const loans = await Loan.find({ user: req.user.id, status: "ACTIVE" })
			.sort({ createdAt: -1 })
			.lean();

		await createUpcomingPaymentReminders(req.user.id, loans);

		return res.json(loans);
	} catch (err) {
		return res.status(500).json({ message: "Error fetching active loans" });
	}
};

exports.getHistory = async (req, res) => {
	try {
		const history = await Transaction.find({ user: req.user.id })
			.sort({ createdAt: -1 })
			.lean();

		return res.json(history);
	} catch (err) {
		return res.status(500).json({ message: "Error fetching transaction history" });
	}
};
