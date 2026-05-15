const StudentVerification = require("../models/StudentVerification");
const User = require("../models/userModel");
const AuditLog = require("../models/AuditLog");
const { createOTP, verifyOTP } = require("../services/otpService");
const {
	normalizeAadhaar,
	maskAadhaar,
	hashToken,
	generateToken,
	generateReferenceId,
	buildDemoAadhaarResult,
} = require("../services/aadhaarKycService");

const parseBoolean = (value) => {
	const normalized = String(value || "").trim().toLowerCase();
	return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
};

const pickOtpTarget = (user) => {
	if (String(user?.phone || "").trim()) {
		return { email: null, mobile: String(user.phone).replace(/\D/g, "").slice(0, 10), channel: "mobile" };
	}

	return { email: String(user?.email || "").trim().toLowerCase(), mobile: null, channel: "email" };
};

const loadLatestAadhaarState = async (userId) => {
	const verification = await StudentVerification.findOne({ userId }).lean();
	return verification?.identity?.aadhaarVerification || null;
};

const persistAadhaarState = async (userId, aadhaarVerification) => {
	const verification = await StudentVerification.findOneAndUpdate(
		{ userId },
		{
			$set: {
				"identity.aadhaarVerification": aadhaarVerification,
				status: "draft",
			},
			$setOnInsert: { userId },
		},
		{ upsert: true, new: true, setDefaultsOnInsert: true }
	);

	return verification;
};

const recordAudit = async ({ userId, action, referenceId, maskedAadhaar, status, message, req, metadata = {} }) => {
	try {
		await AuditLog.create({
			userId,
			action,
			entityType: "aadhaar_kyc",
			referenceId,
			maskedAadhaar,
			status,
			message,
			ipAddress: req.ip,
			userAgent: req.headers["user-agent"],
			metadata,
		});
	} catch (err) {
		console.error("Aadhaar audit log failed:", err.message);
	}
};

exports.initiateAadhaarVerification = async (req, res) => {
	try {
		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const aadhaarNumber = normalizeAadhaar(req.body?.aadhaarNumber || req.body?.aadhaar || req.body?.number);
		const consentGiven = parseBoolean(req.body?.consentGiven ?? req.body?.consent);

		if (aadhaarNumber.length !== 12) {
			return res.status(400).json({ message: "Aadhaar number must contain exactly 12 digits" });
		}

		if (!consentGiven) {
			return res.status(400).json({ message: "Explicit consent is required to start Aadhaar KYC" });
		}

		const maskedAadhaar = maskAadhaar(aadhaarNumber);
		const referenceId = generateReferenceId();
		const verificationToken = generateToken();
		const otpTarget = pickOtpTarget(user);
		const otpPurpose = "aadhaar_kyc";

		const otpResult = await createOTP(otpTarget.email, otpTarget.mobile, otpPurpose, req.user.id);
		if (!otpResult.success) {
			return res.status(400).json({ message: otpResult.message || "Unable to send Aadhaar OTP" });
		}

		const aadhaarVerification = {
			aadhaarMaskedNumber: maskedAadhaar,
			aadhaarVerificationStatus: "pending_otp",
			aadhaarVerificationReferenceId: referenceId,
			aadhaarVerificationTokenHash: hashToken(verificationToken),
			aadhaarVerifiedName: null,
			aadhaarKycScore: 0,
			aadhaarFraudScore: 0,
			aadhaarBnplEligibility: "pending",
			aadhaarConsentGiven: true,
			aadhaarInitiatedAt: new Date(),
			aadhaarOtpChannel: otpTarget.channel,
			aadhaarOtpPurpose: otpPurpose,
		};

		await persistAadhaarState(req.user.id, aadhaarVerification);

		await User.findByIdAndUpdate(req.user.id, {
			aadhaarVerificationStatus: "pending_otp",
			aadhaarMaskedNumber: maskedAadhaar,
			aadhaarVerificationReferenceId: referenceId,
			aadhaarVerificationTokenHash: hashToken(verificationToken),
			aadhaarVerifiedName: null,
			aadhaarKycScore: 0,
			aadhaarFraudScore: 0,
			aadhaarBnplEligibility: "pending",
			aadhaarConsentGiven: true,
			aadhaarVerifiedAt: null,
		});

		await recordAudit({
			userId: req.user.id,
			action: "aadhaar_initiated",
			referenceId,
			maskedAadhaar,
			status: "pending_otp",
			message: "Aadhaar verification initiated",
			req,
			metadata: { otpChannel: otpTarget.channel },
		});

		return res.json({
			message: "Aadhaar verification initiated",
			status: "pending_otp",
			maskedAadhaar,
			referenceId,
			otpDestination: otpResult.destination,
			consentGiven: true,
		});
	} catch (err) {
		console.error("initiateAadhaarVerification error:", err);
		return res.status(500).json({ message: "Failed to initiate Aadhaar verification" });
	}
};

exports.verifyAadhaarOtp = async (req, res) => {
	try {
		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const otpCode = String(req.body?.otpCode || req.body?.otp || "").trim();
		if (!otpCode) {
			return res.status(400).json({ message: "OTP code is required" });
		}

		const current = await loadLatestAadhaarState(req.user.id);
		if (!current || current.aadhaarVerificationStatus !== "pending_otp") {
			return res.status(400).json({ message: "Aadhaar verification has not been initiated" });
		}

		const otpTarget = pickOtpTarget(user);
		const otpVerification = await verifyOTP(otpTarget.email, otpTarget.mobile, otpCode, "aadhaar_kyc");
		if (!otpVerification.success) {
			await recordAudit({
				userId: req.user.id,
				action: "aadhaar_otp_failed",
				referenceId: current.aadhaarVerificationReferenceId,
				maskedAadhaar: current.aadhaarMaskedNumber,
				status: "failed",
				message: otpVerification.message || "Aadhaar OTP verification failed",
				req,
			});
			return res.status(400).json({ message: otpVerification.message || "Aadhaar OTP verification failed" });
		}

		const providerResult = buildDemoAadhaarResult({ aadhaarNumber: current.aadhaarMaskedNumber, user });
		const aadhaarVerification = {
			...current,
			aadhaarVerificationStatus: providerResult.status,
			aadhaarVerifiedName: providerResult.verifiedName,
			aadhaarMaskedNumber: providerResult.maskedAadhaar,
			aadhaarVerificationReferenceId: current.aadhaarVerificationReferenceId || providerResult.referenceId,
			aadhaarVerificationTokenHash: current.aadhaarVerificationTokenHash,
			aadhaarKycScore: providerResult.kycScore,
			aadhaarFraudScore: providerResult.fraudScore,
			aadhaarBnplEligibility: providerResult.bnplEligibility,
			aadhaarVerifiedAt: new Date(),
		};

		await persistAadhaarState(req.user.id, aadhaarVerification);
		await User.findByIdAndUpdate(req.user.id, {
			aadhaarVerificationStatus: aadhaarVerification.aadhaarVerificationStatus,
			aadhaarMaskedNumber: aadhaarVerification.aadhaarMaskedNumber,
			aadhaarVerificationReferenceId: aadhaarVerification.aadhaarVerificationReferenceId,
			aadhaarVerificationTokenHash: aadhaarVerification.aadhaarVerificationTokenHash,
			aadhaarVerifiedName: aadhaarVerification.aadhaarVerifiedName,
			aadhaarKycScore: aadhaarVerification.aadhaarKycScore,
			aadhaarFraudScore: aadhaarVerification.aadhaarFraudScore,
			aadhaarBnplEligibility: aadhaarVerification.aadhaarBnplEligibility,
			aadhaarVerifiedAt: aadhaarVerification.aadhaarVerifiedAt,
		});

		await recordAudit({
			userId: req.user.id,
			action: "aadhaar_verified",
			referenceId: aadhaarVerification.aadhaarVerificationReferenceId,
			maskedAadhaar: aadhaarVerification.aadhaarMaskedNumber,
			status: "verified",
			message: "Aadhaar OTP verified",
			req,
			metadata: {
				kycScore: aadhaarVerification.aadhaarKycScore,
				fraudScore: aadhaarVerification.aadhaarFraudScore,
				bnplEligibility: aadhaarVerification.aadhaarBnplEligibility,
			},
		});

		return res.json({
			message: "Aadhaar verified successfully",
			status: aadhaarVerification.aadhaarVerificationStatus,
			verifiedName: aadhaarVerification.aadhaarVerifiedName,
			maskedAadhaar: aadhaarVerification.aadhaarMaskedNumber,
			referenceId: aadhaarVerification.aadhaarVerificationReferenceId,
			kycScore: aadhaarVerification.aadhaarKycScore,
			fraudScore: aadhaarVerification.aadhaarFraudScore,
			bnplEligibility: aadhaarVerification.aadhaarBnplEligibility,
		});
	} catch (err) {
		console.error("verifyAadhaarOtp error:", err);
		return res.status(500).json({ message: "Failed to verify Aadhaar OTP" });
	}
};

exports.getAadhaarVerificationStatus = async (req, res) => {
	try {
		const current = await loadLatestAadhaarState(req.user.id);
		if (!current) {
			return res.json({
				status: "not_started",
				aadhaarVerified: false,
				bnplEligibility: "not_available",
			});
		}

		return res.json({
			status: current.aadhaarVerificationStatus || "draft",
			aadhaarVerified: current.aadhaarVerificationStatus === "verified",
			aadhaarMaskedNumber: current.aadhaarMaskedNumber || null,
			aadhaarVerifiedName: current.aadhaarVerifiedName || null,
			referenceId: current.aadhaarVerificationReferenceId || null,
			kycScore: Number(current.aadhaarKycScore || 0),
			fraudScore: Number(current.aadhaarFraudScore || 0),
			bnplEligibility: current.aadhaarBnplEligibility || "not_available",
			consentGiven: Boolean(current.aadhaarConsentGiven),
			verifiedAt: current.aadhaarVerifiedAt || null,
		});
	} catch (err) {
		console.error("getAadhaarVerificationStatus error:", err);
		return res.status(500).json({ message: "Failed to fetch Aadhaar verification status" });
	}
};