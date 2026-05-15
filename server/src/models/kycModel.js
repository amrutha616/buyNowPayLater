const mongoose = require("mongoose");

const kycSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  fullName: {
    type: String,
    trim: true,
  },
  age: {
    type: Number,
    min: 18,
    max: 100,
  },
  panNumber: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    trim: true,
  },
  occupation: {
    type: String,
    trim: true,
  },
  monthlyIncome: {
    type: Number,
    required: true,
    min: 0,
  },
  employmentType: {
    type: String,
    enum: ["salaried", "self-employed", "student", "unemployed"],
    required: true,
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
  verificationStatus: {
    type: String,
    enum: ["pending", "verified", "rejected"],
    default: "pending",
  },
  simulatedCreditScore: {
    type: Number,
    min: 300,
    max: 900,
    default: 300,
  },
  creditBand: {
    type: String,
    enum: ["VERY_HIGH_RISK", "HIGH_RISK", "MEDIUM_RISK", "LOW_RISK"],
    default: "VERY_HIGH_RISK",
  },
  eligibilityStatus: {
    type: String,
    enum: ["approved", "manual_review", "rejected"],
    default: "manual_review",
  },
  assignedCreditLimit: {
    type: Number,
    default: 0,
    min: 0,
  },
  modelRiskPercent: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  modelRiskThreshold: {
    type: Number,
    min: 20,
    max: 95,
    default: 72,
  },
  thresholdBreach: {
    type: Boolean,
    default: false,
  },
  decisionSource: {
    type: String,
    trim: true,
    default: "local_fallback",
  },
  rejectionReasons: {
    type: [String],
    default: [],
  },
  verifiedAt: {
    type: Date,
  },
}, { timestamps: true });

module.exports = mongoose.model("KYC", kycSchema);