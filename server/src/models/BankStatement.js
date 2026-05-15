const mongoose = require("mongoose");

const BankStatementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileName: { type: String },
    analysis: {
      totalTransactions: Number,
      monthsAnalyzed: Number,
      averageMonthlySalary: Number,
      inferredEmployer: String,
      incomeStability: { type: String, enum: ["Stable", "Moderate", "Variable"] },
      averageMonthlyCredit: Number,
      averageMonthlyDebit: Number,
      estimatedMonthlyEMI: Number,
      netMonthlyFlow: Number,
      salaryCreditsFound: Number,
      emiTransactionsFound: Number,
      dtiRatio: Number,
      analysedAt: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BankStatement", BankStatementSchema);
