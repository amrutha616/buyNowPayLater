const mongoose = require("mongoose");

const fileMetaSchema = new mongoose.Schema(
	{
		fieldName: { type: String, trim: true },
		originalName: { type: String, trim: true },
		mimeType: { type: String, trim: true },
		size: { type: Number, min: 0 },
	},
	{ _id: false }
);

const studentVerificationSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			unique: true,
		},
		status: {
			type: String,
			enum: ["draft", "pending_review", "approved", "small_limit", "deposit_required", "rejected"],
			default: "draft",
		},
		parent: {
			fullName: { type: String, trim: true },
			mobileNumber: { type: String, trim: true },
			mobileOtpVerified: { type: Boolean, default: false },
			mobileOtpVerifiedAt: { type: Date },
			aadhaarOrIdNumber: { type: String, trim: true },
			incomeRange: { type: String, trim: true },
			digitalConsent: { type: Boolean, default: false },
			esignName: { type: String, trim: true },
			emergencyContactName: { type: String, trim: true },
			emergencyContactPhone: { type: String, trim: true },
		},
		college: {
			collegeIdFile: fileMetaSchema,
			rollNumber: { type: String, trim: true },
			bonafideCertificateFile: fileMetaSchema,
			officialEmail: { type: String, trim: true, lowercase: true },
			officialEmailVerified: { type: Boolean, default: false },
			officialEmailVerifiedAt: { type: Date },
			course: { type: String, trim: true },
			year: { type: String, trim: true },
			cgpa: { type: Number, min: 0, max: 10 },
			attendance: { type: Number, min: 0, max: 100 },
		},
		financial: {
			monthlyAllowance: { type: Number, min: 0, default: 0 },
			bankAccountLast4: { type: String, trim: true },
			ifscCode: { type: String, trim: true },
			bankVerified: { type: Boolean, default: false },
			bankVerifiedAt: { type: Date },
			upiHandle: { type: String, trim: true, lowercase: true },
			autopayMandateStatus: {
				type: String,
				enum: ["not_started", "pending", "active", "failed"],
				default: "not_started",
			},
			autopayMandateId: { type: String, trim: true },
			securityDepositAmount: { type: Number, min: 0, default: 0 },
			securityDepositRefundable: { type: Boolean, default: true },
		},
		identity: {
			studentSelfieFile: fileMetaSchema,
			govtIdFile: fileMetaSchema,
			govtIdNumberLast4: { type: String, trim: true },
			faceMatchScore: { type: Number, min: 0, max: 100, default: 0 },
			deviceFingerprint: { type: String, trim: true },
			simVerified: { type: Boolean, default: false },
			locationConsistencyScore: { type: Number, min: 0, max: 100, default: 0 },
			duplicateAccountFlag: { type: Boolean, default: false },
			duplicateAccountMatches: { type: [String], default: [] },
			aadhaarVerification: {
				aadhaarMaskedNumber: { type: String, trim: true },
				aadhaarVerificationStatus: {
					type: String,
					enum: ["not_started", "pending_otp", "verified", "failed"],
					default: "not_started",
				},
				aadhaarVerificationReferenceId: { type: String, trim: true },
				aadhaarVerificationTokenHash: { type: String, trim: true },
				aadhaarVerifiedName: { type: String, trim: true },
				aadhaarKycScore: { type: Number, min: 0, max: 100, default: 0 },
				aadhaarFraudScore: { type: Number, min: 0, max: 100, default: 0 },
				aadhaarBnplEligibility: { type: String, trim: true },
				aadhaarConsentGiven: { type: Boolean, default: false },
				aadhaarInitiatedAt: { type: Date },
				aadhaarVerifiedAt: { type: Date },
				aadhaarOtpChannel: { type: String, trim: true },
				aadhaarOtpPurpose: { type: String, trim: true },
			},
		},
		risk: {
			trustScore: { type: Number, min: 0, max: 100, default: 0 },
			riskLevel: {
				type: String,
				enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
				default: "CRITICAL",
			},
			suggestedBnplLimit: { type: Number, min: 0, default: 0 },
			decision: {
				type: String,
				enum: ["APPROVED_HIGH_LIMIT", "APPROVED_SMALL_LIMIT", "REQUIRE_DEPOSIT_OR_GUARANTOR", "REJECTED"],
				default: "REJECTED",
			},
			approvalReason: { type: String, trim: true },
			rejectionReasons: { type: [String], default: [] },
			componentScores: {
				parentGuarantee: { type: Number, min: 0, max: 100, default: 0 },
				collegeVerification: { type: Number, min: 0, max: 100, default: 0 },
				academicPerformance: { type: Number, min: 0, max: 100, default: 0 },
				financialStability: { type: Number, min: 0, max: 100, default: 0 },
				identityVerification: { type: Number, min: 0, max: 100, default: 0 },
				behavioralHistory: { type: Number, min: 0, max: 100, default: 0 },
			},
			evaluatedAt: { type: Date },
			engineVersion: { type: String, trim: true, default: "student-trust-v1" },
		},
		verificationNotes: { type: String, trim: true },
	},
	{ timestamps: true }
);

module.exports = mongoose.model("StudentVerification", studentVerificationSchema);