const mongoose = require("mongoose");

const CreditReportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    panNumber: { type: String, required: true, uppercase: true, trim: true },
    panVerified: { type: Boolean, default: false },
    panVerificationProvider: { type: String, enum: ["mock", "idfy"], default: "mock" },
    panVerificationReferenceId: { type: String },
    panVerificationStatus: { type: String, enum: ["VALID", "INVALID"], default: "INVALID" },
    panVerifiedName: { type: String },
    panNameMatch: { type: Boolean, default: false },
    panVerificationMessage: { type: String },

    // Bureau simulation data
    bureauScore: { type: Number },
    scoreRating: { type: String, enum: ["EXCELLENT", "GOOD", "FAIR", "POOR"] },
    totalLoans: { type: Number, default: 0 },
    activeLoans: { type: Number, default: 0 },
    closedLoans: { type: Number, default: 0 },
    loanHistory: [
      {
        loanType: String,
        bank: String,
        sanctionedAmount: Number,
        outstandingAmount: Number,
        status: String,
        onTimePct: Number,
        openedYear: Number,
      },
    ],
    creditCards: [
      {
        bank: String,
        limit: Number,
        currentBalance: Number,
        utilization: Number,
        status: String,
      },
    ],
    repaymentHistory: {
      onTime: Number,
      late: Number,
      missed: Number,
    },
    creditUtilization: { type: Number, default: 0 },
    oldestAccountAge: { type: String },
    recentEnquiries: { type: Number, default: 0 },

    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CreditReport", CreditReportSchema);
