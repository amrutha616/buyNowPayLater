/**
 * Repayment Controller
 */

const Repayment = require("../models/Repayment");
const Loan = require("../models/Loan");
const { applyRepaymentCashback, redeemReward } = require("../services/rewardService");

// Full repayment of installment
exports.makeRepayment = async (req, res) => {
	try {
		const { loanId, amount } = req.body;

		const loan = await Loan.findById(loanId);
		if (!loan) return res.status(404).json({ message: "Loan not found" });

		const repayment = await Repayment.create({
			userId: req.user.id,
			loanId,
			amount,
			paymentMethod: "wallet",
		});

		loan.repaidAmount += amount;
		if (loan.repaidAmount >= loan.amount) {
			loan.status = "closed";
		}
		await loan.save();

		res.json({ message: "Repayment successful", repayment, loan });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// Partial payment on an installment
exports.makePartialRepayment = async (req, res) => {
	try {
		const { loanId, installmentNumber, amount, paymentMethod = "UPI", transactionId = "", rewardRedeemAmount = 0 } = req.body;

		if (!loanId || !installmentNumber) {
			return res.status(400).json({ message: "Missing required fields: loanId, installmentNumber" });
		}

		const partialAmount = Number(amount || 0);
		if (partialAmount <= 0 && Number(rewardRedeemAmount || 0) <= 0) {
			return res.status(400).json({ message: "Amount or reward redemption must be greater than 0" });
		}

		const loan = await Loan.findById(loanId);
		if (!loan) return res.status(404).json({ message: "Loan not found" });

		const installment = loan.installments.find(i => i.installmentNumber === installmentNumber);
		if (!installment) {
			return res.status(404).json({ message: "Installment not found" });
		}

		const redemption = Number(rewardRedeemAmount || 0) > 0
			? await redeemReward({
				userId: req.user.id,
				amount: Number(rewardRedeemAmount || 0),
				source: "EMI_REDEMPTION",
				note: `Rewards redeemed for EMI ${installmentNumber}`,
				loanId,
				metadata: { installmentNumber },
			})
			: { amount: 0, walletBalance: 0 };

		const effectivePaymentAmount = partialAmount + Number(redemption.amount || 0);
		const remainingAmount = installment.amount - installment.paidAmount;
		if (effectivePaymentAmount > remainingAmount) {
			return res.status(400).json({ 
				message: `Partial amount exceeds remaining balance. Remaining: ₹${remainingAmount}` 
			});
		}

		// Add partial payment to installment
		installment.partialPayments.push({
			amount: effectivePaymentAmount,
			paidDate: new Date(),
			paymentMethod,
			transactionId,
		});

		// Update paidAmount
		installment.paidAmount += effectivePaymentAmount;
		installment.lastPartialPaymentDate = new Date();

		// Update installment status
		if (installment.paidAmount >= installment.amount) {
			installment.status = "PAID";
			installment.paidDate = new Date();
		} else if (installment.paidAmount > 0) {
			installment.status = "PARTIALLY_PAID";
		}

		// Update loan totals
		loan.totalPaid += effectivePaymentAmount;
		loan.remainingAmount = loan.bnplAmount - loan.totalPaid;

		// Check if loan is completed
		if (loan.totalPaid >= loan.bnplAmount) {
			loan.status = "COMPLETED";
		}

		await loan.save();

		const rewardResult = await applyRepaymentCashback({
			userId: req.user.id,
			loanId: loan._id,
			paymentAmount: effectivePaymentAmount,
			dueDate: installment.dueDate,
			installmentNumber: installment.installmentNumber,
			note: `Cashback for EMI ${installment.installmentNumber} repayment`,
		});

		res.json({
			message: "Partial payment successful! 🎉",
			installment: {
				installmentNumber: installment.installmentNumber,
				amount: installment.amount,
				paidAmount: installment.paidAmount,
				remainingAmount: installment.amount - installment.paidAmount,
				status: installment.status,
				dueDate: installment.dueDate,
			},
			loan: {
				totalPaid: loan.totalPaid,
				remainingAmount: loan.remainingAmount,
				status: loan.status,
			},
			redeemedRewards: Number(redemption.amount || 0),
			cashPaidAmount: partialAmount,
			rewards: rewardResult,
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// Get partial payment history for a loan
exports.getPartialPaymentHistory = async (req, res) => {
	try {
		const { loanId } = req.params;
		const loan = await Loan.findById(loanId);
		if (!loan) return res.status(404).json({ message: "Loan not found" });

		const history = [];
		loan.installments.forEach(inst => {
			inst.partialPayments.forEach(pp => {
				history.push({
					installmentNumber: inst.installmentNumber,
					dueDate: inst.dueDate,
					amount: pp.amount,
					paidDate: pp.paidDate,
					paymentMethod: pp.paymentMethod,
					transactionId: pp.transactionId,
				});
			});
		});

		res.json({
			loanId,
			merchant: loan.merchant,
			totalPartialPayments: history.length,
			totalPartialAmountPaid: history.reduce((sum, p) => sum + p.amount, 0),
			history: history.sort((a, b) => new Date(b.paidDate) - new Date(a.paidDate)),
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.getRepayments = async (req, res) => {
	try {
		const repayments = await Repayment.find({ userId: req.user.id }).sort({
			createdAt: -1,
		});
		res.json({ repayments });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
