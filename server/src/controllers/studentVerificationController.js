const StudentVerification = require("../models/StudentVerification");
const User = require("../models/userModel");
const { createOTP, verifyOTP } = require("../services/otpService");
const { sendEmail } = require("../services/emailService");
const { calculateStudentTrustProfile } = require("../services/studentTrustScoreService");

const normalizePhone = (value) => String(value || "").replace(/\D/g, "").slice(0, 10);
const maskLast4 = (value) => String(value || "").replace(/\D/g, "").slice(-4);
const trimString = (value) => String(value || "").trim();

const fileMeta = (file) => {
	if (!file) return null;
	return {
		fieldName: file.fieldname,
		originalName: file.originalname,
		mimeType: file.mimetype,
		size: file.size,
	};
};

const parseBoolean = (value) => {
	const normalized = String(value || "").trim().toLowerCase();
	return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
};

const parseNumber = (value, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const getLatestVerification = async (userId) => {
	const verification = await StudentVerification.findOne({ userId }).lean();
	return verification || null;
};

const upsertDraftVerification = async (userId, updates) => {
	return StudentVerification.findOneAndUpdate(
		{ userId },
		{ $set: updates, $setOnInsert: { userId } },
		{ upsert: true, new: true, setDefaultsOnInsert: true }
	);
};

exports.sendParentOtp = async (req, res) => {
	try {
		const userId = req.user.id;
		const parentMobile = normalizePhone(req.body?.parentMobile || req.body?.mobileNumber);
		const parentName = trimString(req.body?.parentFullName || req.body?.parentName);

		if (parentMobile.length !== 10) {
			return res.status(400).json({ message: "Parent mobile number must be exactly 10 digits" });
		}

		await upsertDraftVerification(userId, {
			"parent.fullName": parentName || undefined,
			"parent.mobileNumber": parentMobile,
			status: "draft",
		});

		const result = await createOTP(null, parentMobile, "student_parent_guarantee", userId);
		if (!result.success) {
			return res.status(result.statusCode || 400).json({ message: result.message });
		}

		return res.json({ message: result.message, destination: result.destination, purpose: result.purpose });
	} catch (err) {
		console.error("sendParentOtp error:", err);
		return res.status(500).json({ message: err.message || "Failed to send parent OTP" });
	}
};

exports.verifyParentOtp = async (req, res) => {
	try {
		const userId = req.user.id;
		const parentMobile = normalizePhone(req.body?.parentMobile || req.body?.mobileNumber);
		const otpCode = trimString(req.body?.otpCode);

		if (parentMobile.length !== 10 || !otpCode) {
			return res.status(400).json({ message: "Parent mobile and OTP code are required" });
		}

		const verification = await verifyOTP(null, parentMobile, otpCode, "student_parent_guarantee");
		if (!verification.success) {
			return res.status(400).json({ message: verification.message || "Parent OTP verification failed" });
		}

		const updated = await upsertDraftVerification(userId, {
			"parent.mobileNumber": parentMobile,
			"parent.mobileOtpVerified": true,
			"parent.mobileOtpVerifiedAt": new Date(),
			status: "draft",
		});

		return res.json({ message: "Parent mobile verified", verification: updated?.parent || null });
	} catch (err) {
		console.error("verifyParentOtp error:", err);
		return res.status(500).json({ message: err.message || "Failed to verify parent mobile" });
	}
};

exports.sendCollegeEmailOtp = async (req, res) => {
	try {
		const userId = req.user.id;
		const officialEmail = String(req.body?.officialEmail || "").toLowerCase().trim();

		if (!officialEmail || !officialEmail.includes("@")) {
			return res.status(400).json({ message: "A valid official college email is required" });
		}

		await upsertDraftVerification(userId, {
			"college.officialEmail": officialEmail,
			status: "draft",
		});

		console.log(`[COLLEGE_EMAIL_OTP] Sending OTP to ${officialEmail} for userId ${userId}`);
		const result = await createOTP(officialEmail, null, "student_college_email", userId);
		
		if (!result.success) {
			console.error(`[COLLEGE_EMAIL_OTP] Failed to create/send OTP:`, {
				email: officialEmail,
				resultMessage: result.message,
				statusCode: result.statusCode,
				fullResult: result,
			});
			return res.status(result.statusCode || 400).json({ message: result.message });
		}

		console.log(`[COLLEGE_EMAIL_OTP] OTP sent successfully to ${officialEmail}`);
		return res.json({ message: result.message, destination: result.destination, purpose: result.purpose });
	} catch (err) {
		console.error("sendCollegeEmailOtp error:", err.message || err);
		return res.status(500).json({ message: `Server error: ${err.message || "Failed to send college email verification"}` });
	}
};

exports.verifyCollegeEmailOtp = async (req, res) => {
	try {
		const userId = req.user.id;
		const officialEmail = String(req.body?.officialEmail || "").toLowerCase().trim();
		const otpCode = trimString(req.body?.otpCode);

		if (!officialEmail || !otpCode) {
			return res.status(400).json({ message: "Official email and OTP code are required" });
		}

		const verification = await verifyOTP(officialEmail, null, otpCode, "student_college_email");
		if (!verification.success) {
			return res.status(400).json({ message: verification.message || "College email verification failed" });
		}

		const updated = await upsertDraftVerification(userId, {
			"college.officialEmail": officialEmail,
			"college.officialEmailVerified": true,
			"college.officialEmailVerifiedAt": new Date(),
			status: "draft",
		});

		return res.json({ message: "College email verified", verification: updated?.college || null });
	} catch (err) {
		console.error("verifyCollegeEmailOtp error:", err);
		return res.status(500).json({ message: "Failed to verify college email" });
	}
};

exports.evaluateStudentVerification = async (req, res) => {
	try {
		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const draft = await getLatestVerification(req.user.id);
		const parent = {
			...(draft?.parent || {}),
			fullName: trimString(req.body?.parentFullName || draft?.parent?.fullName),
			mobileNumber: normalizePhone(req.body?.parentMobile || draft?.parent?.mobileNumber),
			aadhaarOrIdNumber: trimString(req.body?.parentAadhaarOrId || draft?.parent?.aadhaarOrIdNumber),
			incomeRange: trimString(req.body?.parentIncomeRange || draft?.parent?.incomeRange),
			digitalConsent: parseBoolean(req.body?.digitalConsent ?? draft?.parent?.digitalConsent),
			esignName: trimString(req.body?.esignName || draft?.parent?.esignName),
			emergencyContactName: trimString(req.body?.emergencyContactName || draft?.parent?.emergencyContactName),
			emergencyContactPhone: normalizePhone(req.body?.emergencyContactPhone || draft?.parent?.emergencyContactPhone),
			mobileOtpVerified: Boolean(draft?.parent?.mobileOtpVerified),
		};

		const college = {
			...(draft?.college || {}),
			rollNumber: trimString(req.body?.rollNumber || draft?.college?.rollNumber),
			officialEmail: String(req.body?.officialEmail || draft?.college?.officialEmail || "").toLowerCase().trim(),
			course: trimString(req.body?.course || draft?.college?.course),
			year: trimString(req.body?.year || draft?.college?.year),
			cgpa: parseNumber(req.body?.cgpa, draft?.college?.cgpa || 0),
			attendance: parseNumber(req.body?.attendance, draft?.college?.attendance || 0),
			collegeIdFile: fileMeta(req.files?.collegeIdUpload?.[0]) || draft?.college?.collegeIdFile || null,
			bonafideCertificateFile: fileMeta(req.files?.bonafideCertificateUpload?.[0]) || draft?.college?.bonafideCertificateFile || null,
			officialEmailVerified: Boolean(draft?.college?.officialEmailVerified),
		};

		const financial = {
			...(draft?.financial || {}),
			monthlyAllowance: parseNumber(req.body?.monthlyAllowance, draft?.financial?.monthlyAllowance || 0),
			bankAccountLast4: maskLast4(req.body?.bankAccountNumber || req.body?.bankAccountLast4 || draft?.financial?.bankAccountLast4),
			ifscCode: trimString(req.body?.ifscCode || draft?.financial?.ifscCode),
			bankVerified: parseBoolean(req.body?.bankVerified ?? draft?.financial?.bankVerified),
			upiHandle: trimString(req.body?.upiHandle || draft?.financial?.upiHandle).toLowerCase(),
			autopayMandateStatus: trimString(req.body?.autopayMandateStatus || draft?.financial?.autopayMandateStatus || "not_started") || "not_started",
			autopayMandateId: trimString(req.body?.autopayMandateId || draft?.financial?.autopayMandateId),
			securityDepositAmount: parseNumber(req.body?.securityDepositAmount, draft?.financial?.securityDepositAmount || 0),
			securityDepositRefundable: parseBoolean(req.body?.securityDepositRefundable ?? draft?.financial?.securityDepositRefundable),
		};

		const aadhaarVerification = draft?.identity?.aadhaarVerification || null;
		const identity = {
			...(draft?.identity || {}),
			govtIdNumberLast4: maskLast4(req.body?.govtIdNumber || req.body?.govtIdLast4 || draft?.identity?.govtIdNumberLast4),
			faceMatchScore: parseNumber(req.body?.faceMatchScore, draft?.identity?.faceMatchScore || 0),
			deviceFingerprint: trimString(req.body?.deviceFingerprint || draft?.identity?.deviceFingerprint),
			simVerified: parseBoolean(req.body?.simVerified ?? draft?.identity?.simVerified),
			locationConsistencyScore: parseNumber(req.body?.locationConsistencyScore, draft?.identity?.locationConsistencyScore || 0),
			studentSelfieFile: fileMeta(req.files?.studentSelfie?.[0]) || draft?.identity?.studentSelfieFile || null,
			govtIdFile: fileMeta(req.files?.govtIdUpload?.[0]) || draft?.identity?.govtIdFile || null,
			aadhaarVerification,
		};

		const trustProfile = await calculateStudentTrustProfile({ userId: user._id, parent, college, financial, identity, aadhaarVerification, user });

		const verification = await StudentVerification.findOneAndUpdate(
			{ userId: user._id },
			{
				userId: user._id,
				status: trustProfile.decision === "APPROVED_HIGH_LIMIT"
					? "approved"
					: trustProfile.decision === "APPROVED_SMALL_LIMIT"
						? "small_limit"
						: trustProfile.decision === "REQUIRE_DEPOSIT_OR_GUARANTOR"
							? "deposit_required"
							: "rejected",
				parent,
				college,
				financial,
				identity: {
					...identity,
					aadhaarVerification,
					duplicateAccountFlag: trustProfile.duplicateAccountFlag,
					duplicateAccountMatches: trustProfile.duplicateAccountMatches,
				},
				risk: {
					trustScore: trustProfile.trustScore,
					riskLevel: trustProfile.riskLevel,
					suggestedBnplLimit: trustProfile.suggestedBnplLimit,
					decision: trustProfile.decision,
					approvalReason: trustProfile.approvalReason,
					rejectionReasons: trustProfile.rejectionReasons,
					componentScores: trustProfile.componentScores,
					evaluatedAt: new Date(),
					engineVersion: trustProfile.engineVersion,
				},
				verificationNotes: trimString(req.body?.verificationNotes),
			},
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		);

		await User.findByIdAndUpdate(user._id, {
			studentVerificationStatus: verification.status,
			studentTrustScore: trustProfile.trustScore,
			studentRiskLevel: trustProfile.riskLevel,
			studentSuggestedBnplLimit: trustProfile.suggestedBnplLimit,
			studentApprovalDecision: trustProfile.decision,
			studentVerificationUpdatedAt: new Date(),
			aadhaarVerificationStatus: aadhaarVerification?.aadhaarVerificationStatus || user.aadhaarVerificationStatus || "not_started",
			aadhaarMaskedNumber: aadhaarVerification?.aadhaarMaskedNumber || user.aadhaarMaskedNumber || null,
			aadhaarVerificationReferenceId: aadhaarVerification?.aadhaarVerificationReferenceId || user.aadhaarVerificationReferenceId || null,
			aadhaarVerificationTokenHash: aadhaarVerification?.aadhaarVerificationTokenHash || user.aadhaarVerificationTokenHash || null,
			aadhaarVerifiedName: aadhaarVerification?.aadhaarVerifiedName || user.aadhaarVerifiedName || null,
			aadhaarKycScore: aadhaarVerification?.aadhaarKycScore || user.aadhaarKycScore || 0,
			aadhaarFraudScore: aadhaarVerification?.aadhaarFraudScore || user.aadhaarFraudScore || 0,
			aadhaarBnplEligibility: aadhaarVerification?.aadhaarBnplEligibility || user.aadhaarBnplEligibility || "not_available",
			aadhaarConsentGiven: aadhaarVerification?.aadhaarConsentGiven ?? user.aadhaarConsentGiven ?? false,
			aadhaarVerifiedAt: aadhaarVerification?.aadhaarVerifiedAt || user.aadhaarVerifiedAt || null,
			creditLimit: Math.max(Number(user.creditLimit || 0), trustProfile.suggestedBnplLimit || 0),
			isEligible: trustProfile.trustScore >= 60,
			riskScore: Math.max(0, 100 - trustProfile.trustScore),
			riskLevel: trustProfile.riskLevel === "LOW" ? "Low" : trustProfile.riskLevel === "MEDIUM" ? "Medium" : "High",
			riskReasons: trustProfile.rejectionReasons,
		});

		return res.json({
			message: "Student verification saved",
			verification,
			decision: {
				trustScore: trustProfile.trustScore,
				riskLevel: trustProfile.riskLevel,
				recommendation: trustProfile.decision,
				suggestedBnplLimit: trustProfile.suggestedBnplLimit,
				approvalReason: trustProfile.approvalReason,
				rejectionReasons: trustProfile.rejectionReasons,
				componentScores: trustProfile.componentScores,
				duplicateAccountFlag: trustProfile.duplicateAccountFlag,
				behavioralSnapshot: trustProfile.behavioralSnapshot,
				engineVersion: trustProfile.engineVersion,
			},
		});
	} catch (err) {
		console.error("submitStudentVerification error:", err);
		return res.status(500).json({ message: "Failed to submit student verification" });
	}
};

exports.getStudentVerification = async (req, res) => {
	try {
		const verification = await getLatestVerification(req.user.id);
		return res.json({
			verification,
			decision: verification?.risk || null,
		});
	} catch (err) {
		console.error("getStudentVerification error:", err);
		return res.status(500).json({ message: "Failed to load student verification" });
	}
};

exports.getStudentVerificationDashboard = async (req, res) => {
	try {
		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const verification = await getLatestVerification(req.user.id);
		return res.json({
			user: {
				id: user._id,
				name: user.name,
				email: user.email,
				studentVerificationStatus: user.studentVerificationStatus || verification?.status || "draft",
				studentTrustScore: Number(user.studentTrustScore || verification?.risk?.trustScore || 0),
				studentRiskLevel: user.studentRiskLevel || verification?.risk?.riskLevel || "CRITICAL",
				studentSuggestedBnplLimit: Number(user.studentSuggestedBnplLimit || verification?.risk?.suggestedBnplLimit || 0),
				studentApprovalDecision: user.studentApprovalDecision || verification?.risk?.decision || "REJECTED",
				studentVerificationUpdatedAt: user.studentVerificationUpdatedAt || verification?.updatedAt || null,
				aadhaarVerificationStatus: user.aadhaarVerificationStatus || verification?.identity?.aadhaarVerification?.aadhaarVerificationStatus || "not_started",
				aadhaarMaskedNumber: user.aadhaarMaskedNumber || verification?.identity?.aadhaarVerification?.aadhaarMaskedNumber || null,
				aadhaarVerificationReferenceId: user.aadhaarVerificationReferenceId || verification?.identity?.aadhaarVerification?.aadhaarVerificationReferenceId || null,
				aadhaarVerifiedName: user.aadhaarVerifiedName || verification?.identity?.aadhaarVerification?.aadhaarVerifiedName || null,
				aadhaarKycScore: Number(user.aadhaarKycScore || verification?.identity?.aadhaarVerification?.aadhaarKycScore || 0),
				aadhaarFraudScore: Number(user.aadhaarFraudScore || verification?.identity?.aadhaarVerification?.aadhaarFraudScore || 0),
				aadhaarBnplEligibility: user.aadhaarBnplEligibility || verification?.identity?.aadhaarVerification?.aadhaarBnplEligibility || "not_available",
			},
			verification,
			decision: verification?.risk || null,
			aadhaarVerification: verification?.identity?.aadhaarVerification || null,
		});
	} catch (err) {
		console.error("getStudentVerificationDashboard error:", err);
		return res.status(500).json({ message: "Failed to load student verification dashboard" });
	}
};

exports.sendStudentVerificationSummary = async (req, res) => {
	try {
		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const verification = await getLatestVerification(req.user.id);
		const subject = "Your Student BNPL Verification Summary";
		const body = `Trust score: ${verification?.risk?.trustScore || 0}/100. Risk level: ${verification?.risk?.riskLevel || "CRITICAL"}. Suggested limit: ₹${Number(verification?.risk?.suggestedBnplLimit || 0).toLocaleString("en-IN")}.`;

		const result = await sendEmail({
			to: user.email,
			subject,
			text: body,
			html: `<p>${body}</p>`,
		});

		if (!result?.success) {
			return res.status(502).json({ message: result?.warning || result?.message || "Unable to send summary email" });
		}

		return res.json({ message: "Summary sent to your email address" });
	} catch (err) {
		console.error("sendStudentVerificationSummary error:", err);
		return res.status(500).json({ message: "Failed to send summary email" });
	}
};

// Backwards-compatible alias: some routes expect `submitStudentVerification`
// but the main handler is implemented as `evaluateStudentVerification`.
exports.submitStudentVerification = exports.evaluateStudentVerification;