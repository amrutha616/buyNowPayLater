const Loan = require("../models/Loan");
const StudentVerification = require("../models/StudentVerification");

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

const parseIncomeRange = (value) => {
	const normalized = String(value || "").trim().toLowerCase();
	const map = {
		"0-25000": 12,
		"25000-50000": 30,
		"50000-100000": 55,
		"100000-200000": 75,
		"200000+": 90,
		"above 200000": 90,
	};

	if (map[normalized] !== undefined) return map[normalized];
	return 35;
};

const scorePresence = (value, points) => (String(value || "").trim() ? points : 0);

const scoreParentSection = (parent = {}) => {
	const subScores = [];
	const reasons = [];

	const nameScore = scorePresence(parent.fullName, 12);
	const mobileScore = parent.mobileOtpVerified ? 20 : 0;
	const idScore = scorePresence(parent.aadhaarOrIdNumber, 18);
	const incomeScore = parseIncomeRange(parent.incomeRange);
	const consentScore = parent.digitalConsent ? 15 : 0;
	const emergencyScore = scorePresence(parent.emergencyContactName, 10) + scorePresence(parent.emergencyContactPhone, 5);
	const esignScore = scorePresence(parent.esignName, 10);

	subScores.push(nameScore, mobileScore, idScore, incomeScore, consentScore, emergencyScore, esignScore);

	if (!parent.mobileOtpVerified) reasons.push("Parent mobile OTP is not verified");
	if (!parent.digitalConsent) reasons.push("Parent digital consent is missing");
	if (!parent.aadhaarOrIdNumber) reasons.push("Parent Aadhaar / ID is missing");
	if (!parent.emergencyContactPhone) reasons.push("Emergency contact is missing");

	return {
		score: clamp(subScores.reduce((sum, score) => sum + score, 0), 0, 100),
		reasons,
	};
};

const scoreCollegeSection = (college = {}) => {
	const cgpa = clamp(college.cgpa, 0, 10);
	const attendance = clamp(college.attendance, 0, 100);
	const fileScore = [college.collegeIdFile, college.bonafideCertificateFile].filter(Boolean).length * 18;
	const emailScore = college.officialEmailVerified ? 18 : 0;
	const rollScore = scorePresence(college.rollNumber, 10);
	const academicMetaScore = scorePresence(college.course, 6) + scorePresence(college.year, 4);
	const academicScore = Math.round((cgpa / 10) * 20 + (attendance / 100) * 14);
	const reasons = [];

	if (!college.officialEmailVerified) reasons.push("Official college email is not verified");
	if (!college.collegeIdFile) reasons.push("College ID upload is missing");
	if (!college.bonafideCertificateFile) reasons.push("Bonafide certificate is missing");
	if (!college.rollNumber) reasons.push("Roll number is missing");

	return {
		score: clamp(fileScore + emailScore + rollScore + academicMetaScore + academicScore, 0, 100),
		reasons,
	};
};

const scoreAcademicSection = (college = {}) => {
	const cgpa = clamp(college.cgpa, 0, 10);
	const attendance = clamp(college.attendance, 0, 100);
	const score = Math.round((cgpa / 10) * 60 + (attendance / 100) * 40);
	const reasons = [];

	if (cgpa < 6) reasons.push("CGPA is below the preferred threshold");
	if (attendance < 75) reasons.push("Attendance is below the preferred threshold");

	return { score: clamp(score, 0, 100), reasons };
};

const scoreFinancialSection = (financial = {}) => {
	const allowance = clamp(financial.monthlyAllowance, 0, Number.MAX_SAFE_INTEGER);
	const deposit = clamp(financial.securityDepositAmount, 0, Number.MAX_SAFE_INTEGER);
	const allowanceScore = allowance <= 1000 ? 8 : allowance <= 3000 ? 20 : allowance <= 6000 ? 35 : allowance <= 10000 ? 48 : 60;
	const bankScore = financial.bankVerified ? 20 : 0;
	const upiScore = String(financial.upiHandle || "").trim() ? 8 : 0;
	const autopayScore = financial.autopayMandateStatus === "active" ? 18 : financial.autopayMandateStatus === "pending" ? 8 : 0;
	const depositScore = deposit > 0 ? Math.min(18, Math.round(deposit / 1000) * 2) : 0;
	const reasons = [];

	if (!financial.bankVerified) reasons.push("Bank account verification is pending");
	if (financial.autopayMandateStatus !== "active") reasons.push("UPI AutoPay mandate is not active");
	if (!deposit) reasons.push("No refundable security deposit has been offered");

	return {
		score: clamp(allowanceScore + bankScore + upiScore + autopayScore + depositScore, 0, 100),
		reasons,
	};
};

const scoreAadhaarVerification = (aadhaarVerification = {}) => {
	if (String(aadhaarVerification?.aadhaarVerificationStatus || "").toLowerCase() !== "verified") {
		return { score: 0, reasons: ["Aadhaar KYC verification is pending"] };
	}

	const kycScore = clamp(aadhaarVerification.aadhaarKycScore, 0, 100);
	const fraudScore = clamp(aadhaarVerification.aadhaarFraudScore, 0, 100);
	const score = clamp(Math.round(kycScore * 0.7 + (100 - fraudScore) * 0.3), 0, 100);
	const reasons = [];

	if (kycScore < 70) reasons.push("Aadhaar KYC score is below the preferred threshold");
	if (fraudScore > 40) reasons.push("Aadhaar fraud score is elevated");

	return { score, reasons };
};

const scoreIdentitySection = (identity = {}, duplicateAccountFlag = false, aadhaarVerification = {}) => {
	const selfieScore = identity.studentSelfieFile ? 20 : 0;
	const govtIdScore = identity.govtIdFile ? 18 : 0;
	const faceScore = clamp(identity.faceMatchScore, 0, 100) * 0.25;
	const simScore = identity.simVerified ? 15 : 0;
	const deviceScore = String(identity.deviceFingerprint || "").trim() ? 15 : 0;
	const locationScore = clamp(identity.locationConsistencyScore, 0, 100) * 0.15;
	const duplicateScore = duplicateAccountFlag ? 0 : 12;
	const aadhaarScore = scoreAadhaarVerification(aadhaarVerification);
	const reasons = [];

	if (!identity.studentSelfieFile) reasons.push("Student selfie is missing");
	if (!identity.govtIdFile) reasons.push("Student government ID upload is missing");
	if (!identity.simVerified) reasons.push("SIM verification is not complete");
	if (!identity.deviceFingerprint) reasons.push("Device fingerprint is missing");
	if (duplicateAccountFlag) reasons.push("Duplicate account indicators were detected");
	if (aadhaarScore.reasons.length) reasons.push(...aadhaarScore.reasons);

	return {
		score: clamp(Math.round(selfieScore + govtIdScore + faceScore + simScore + deviceScore + locationScore + duplicateScore + aadhaarScore.score * 0.25), 0, 100),
		reasons,
		aadhaarScore: aadhaarScore.score,
	};
};

const scoreBehavioralSection = async (userId) => {
	const loans = await Loan.find({ user: userId }).select("status totalPaid bnplAmount installments.status installments.dueDate installments.paidDate").lean();

	let completedLoans = 0;
	let defaultedLoans = 0;
	let onTimePayments = 0;
	let latePayments = 0;

	for (const loan of loans || []) {
		if (loan.status === "COMPLETED") completedLoans += 1;
		if (loan.status === "DEFAULTED") defaultedLoans += 1;

		for (const installment of loan.installments || []) {
			if (String(installment?.status || "").toUpperCase() !== "PAID") continue;

			const dueDate = installment?.dueDate ? new Date(installment.dueDate) : null;
			const paidDate = installment?.paidDate ? new Date(installment.paidDate) : null;
			if (!dueDate || Number.isNaN(dueDate.getTime()) || !paidDate || Number.isNaN(paidDate.getTime())) continue;

			if (paidDate.getTime() <= dueDate.getTime()) onTimePayments += 1;
			else latePayments += 1;
		}
	}

	const totalPaidInstallments = onTimePayments + latePayments;
	const punctuality = totalPaidInstallments === 0 ? 55 : Math.round((onTimePayments / totalPaidInstallments) * 100);
	const loanHistoryBonus = Math.min(20, completedLoans * 5);
	const defaultPenalty = Math.min(30, defaultedLoans * 15);
	const historyScore = clamp(punctuality + loanHistoryBonus - defaultPenalty, 0, 100);
	const reasons = [];

	if (defaultedLoans > 0) reasons.push("Prior defaults reduce behavioral confidence");
	if (latePayments > onTimePayments) reasons.push("Repayment history shows more late payments than on-time payments");

	return {
		score: historyScore,
		reasons,
		snapshot: {
			completedLoans,
			defaultedLoans,
			onTimePayments,
			latePayments,
		},
	};
};

const detectDuplicates = async ({ userId, parent = {}, college = {}, financial = {}, identity = {} }) => {
	const duplicateCriteria = [];

	if (parent.mobileNumber) duplicateCriteria.push({ "parent.mobileNumber": String(parent.mobileNumber).trim() });
	if (parent.aadhaarOrIdNumber) duplicateCriteria.push({ "parent.aadhaarOrIdNumber": String(parent.aadhaarOrIdNumber).trim() });
	if (college.officialEmail) duplicateCriteria.push({ "college.officialEmail": String(college.officialEmail).trim().toLowerCase() });
	if (financial.bankAccountLast4) duplicateCriteria.push({ "financial.bankAccountLast4": String(financial.bankAccountLast4).trim() });
	if (identity.deviceFingerprint) duplicateCriteria.push({ "identity.deviceFingerprint": String(identity.deviceFingerprint).trim() });

	if (!duplicateCriteria.length) {
		return { duplicateAccountFlag: false, duplicateAccountMatches: [] };
	}

	const matches = await StudentVerification.find({
		userId: { $ne: userId },
		$or: duplicateCriteria,
	})
		.select("userId parent.mobileNumber parent.aadhaarOrIdNumber college.officialEmail financial.bankAccountLast4 identity.deviceFingerprint")
		.lean();

	return {
		duplicateAccountFlag: matches.length > 0,
		duplicateAccountMatches: matches.map((match) => String(match.userId)),
	};
};

const buildDecision = (trustScore, financial = {}) => {
	if (trustScore >= 80) {
		return {
			riskLevel: "LOW",
			decision: "APPROVED_HIGH_LIMIT",
			suggestedBnplLimit: clamp(Math.round((financial.monthlyAllowance || 0) * 6 + (financial.securityDepositAmount || 0) * 4), 15000, 150000),
			approvalReason: "Strong guarantor, college, and repayment profile",
			rejectionReasons: [],
		};
	}

	if (trustScore >= 60) {
		return {
			riskLevel: "MEDIUM",
			decision: "APPROVED_SMALL_LIMIT",
			suggestedBnplLimit: clamp(Math.round((financial.monthlyAllowance || 0) * 2.5 + (financial.securityDepositAmount || 0) * 2), 3000, 30000),
			approvalReason: "Profile is acceptable for a smaller BNPL limit",
			rejectionReasons: [],
		};
	}

	if (trustScore >= 40) {
		return {
			riskLevel: "HIGH",
			decision: "REQUIRE_DEPOSIT_OR_GUARANTOR",
			suggestedBnplLimit: 0,
			approvalReason: "A refundable deposit or stronger guarantor is required",
			rejectionReasons: ["Deposit or guarantor required before approval"],
		};
	}

	return {
		riskLevel: "CRITICAL",
		decision: "REJECTED",
		suggestedBnplLimit: 0,
		approvalReason: "Trust score is below the minimum acceptable threshold",
		rejectionReasons: ["Trust score below 40"],
	};
};

const calculateStudentTrustProfile = async ({ userId, parent = {}, college = {}, financial = {}, identity = {}, aadhaarVerification = {}, user = null }) => {
	const [duplicateDetails, behavioral] = await Promise.all([
		detectDuplicates({ userId, parent, college, financial, identity }),
		scoreBehavioralSection(userId),
	]);

	const parentSection = scoreParentSection(parent);
	const collegeSection = scoreCollegeSection(college);
	const academicSection = scoreAcademicSection(college);
	const financialSection = scoreFinancialSection(financial);
	const identitySection = scoreIdentitySection(identity, duplicateDetails.duplicateAccountFlag, aadhaarVerification);

	const weightedScore = Math.round(
		parentSection.score * 0.25 +
		collegeSection.score * 0.2 +
		academicSection.score * 0.15 +
		financialSection.score * 0.2 +
		identitySection.score * 0.1 +
		behavioral.score * 0.1
	);

	const trustScore = clamp(weightedScore, 0, 100);
	const decision = buildDecision(trustScore, financial);
	const rejectionReasons = Array.from(new Set([
		...parentSection.reasons,
		...collegeSection.reasons,
		...academicSection.reasons,
		...financialSection.reasons,
		...identitySection.reasons,
		...behavioral.reasons,
		...(decision.rejectionReasons || []),
	]));

	return {
		trustScore,
		riskLevel: decision.riskLevel,
		decision: decision.decision,
		suggestedBnplLimit: decision.suggestedBnplLimit,
		approvalReason: decision.approvalReason,
		rejectionReasons,
		componentScores: {
			parentGuarantee: parentSection.score,
			collegeVerification: collegeSection.score,
			academicPerformance: academicSection.score,
			financialStability: financialSection.score,
			identityVerification: identitySection.score,
			aadhaarVerification: identitySection.aadhaarScore,
			behavioralHistory: behavioral.score,
		},
		duplicateAccountFlag: duplicateDetails.duplicateAccountFlag,
		duplicateAccountMatches: duplicateDetails.duplicateAccountMatches,
		behavioralSnapshot: behavioral.snapshot,
		weightedFactors: {
			parentGuarantee: 0.25,
			collegeVerification: 0.2,
			academicPerformance: 0.15,
			financialStability: 0.2,
			identityVerification: 0.1,
			behavioralHistory: 0.1,
		},
		engineVersion: "student-trust-v1",
	};
};

module.exports = {
	calculateStudentTrustProfile,
};