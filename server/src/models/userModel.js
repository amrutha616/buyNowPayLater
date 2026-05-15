const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
		},
		phone: {
			type: String,
			unique: true,
			sparse: true,
			trim: true,
		},
		occupation: {
			type: String,
			trim: true,
		},
		yearsEmployed: {
			type: Number,
			min: 0,
			default: 0,
		},
		existingEmi: {
			type: Number,
			min: 0,
			default: 0,
		},
		cityTier: {
			type: String,
			trim: true,
		},
		guarantorName: {
			type: String,
			trim: true,
		},
		guarantorPhone: {
			type: String,
			trim: true,
		},
		password: {
			type: String,
			required: true,
		},
		verified: {
			type: Boolean,
			default: false,
		},
		phoneVerifiedAt: {
			type: Date,
		},
		resetPasswordTokenHash: {
			type: String,
		},
		resetPasswordExpiresAt: {
			type: Date,
		},
		creditLimit: {
			type: Number,
			default: 10000,
			min: 0,
		},
		outstandingBalance: {
			type: Number,
			default: 0,
			min: 0,
		},
		creditScore: {
			type: Number,
			default: 0,
			min: 0,
			max: 1000,
		},
		bureauScore: {
			type: Number,
			default: 0,
			min: 0,
			max: 900,
		},
		bureauScoreRating: {
			type: String,
			enum: ["EXCELLENT", "GOOD", "FAIR", "POOR"],
		},
		isEligible: {
			type: Boolean,
			default: false,
		},
		studentVerificationStatus: {
			type: String,
			enum: ["draft", "pending_review", "approved", "small_limit", "deposit_required", "rejected"],
			default: "draft",
		},
		studentTrustScore: {
			type: Number,
			default: 0,
			min: 0,
			max: 100,
		},
		studentRiskLevel: {
			type: String,
			enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
			default: "CRITICAL",
		},
		studentSuggestedBnplLimit: {
			type: Number,
			default: 0,
			min: 0,
		},
		studentApprovalDecision: {
			type: String,
			enum: ["APPROVED_HIGH_LIMIT", "APPROVED_SMALL_LIMIT", "REQUIRE_DEPOSIT_OR_GUARANTOR", "REJECTED"],
			default: "REJECTED",
		},
		studentVerificationUpdatedAt: {
			type: Date,
		},
		aadhaarVerificationStatus: { type: String, trim: true, default: "not_started" },
		aadhaarMaskedNumber: { type: String, trim: true },
		aadhaarVerificationReferenceId: { type: String, trim: true },
		aadhaarVerificationTokenHash: { type: String, trim: true },
		aadhaarVerifiedName: { type: String, trim: true },
		aadhaarKycScore: { type: Number, min: 0, max: 100, default: 0 },
		aadhaarFraudScore: { type: Number, min: 0, max: 100, default: 0 },
		aadhaarBnplEligibility: { type: String, trim: true, default: "not_available" },
		aadhaarConsentGiven: { type: Boolean, default: false },
		aadhaarVerifiedAt: { type: Date },
		riskLevel: {
			type: String,
			enum: ["Low", "Medium", "High"],
			default: "High",
		},
		riskScore: {
			type: Number,
			default: 0,
			min: 0,
			max: 100,
		},
		riskReasons: {
			type: [String],
			default: [],
		},
		lastRiskAssessedAt: {
			type: Date,
		},
		pan: {
			type: String,
			unique: true,
			sparse: true,
			uppercase: true,
			trim: true,
		},
		monthlyIncome: {
			type: Number,
			default: 0,
			min: 0,
		},
		employmentType: {
			type: String,
			enum: ["salaried", "self-employed", "student", "unemployed"],
			default: "unemployed",
		},
		age: {
			type: Number,
			min: 18,
			max: 100,
		},
		employer: {
			type: String,
			trim: true,
		},
		isAdmin: {
			type: Boolean,
			default: false,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("User", userSchema);
