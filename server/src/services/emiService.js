/**
 * EMI Schedule Service
 * Generates, calculates, and manages EMI schedules
 */

const EMISchedule = require("../models/EMISchedule");
const Loan = require("../models/Loan");

const generateEMISchedule = async (loanId, userId, principal, monthlyRate, months) => {
	try {
		// Clear existing schedule
		await EMISchedule.deleteMany({ loanId });

		const emiAmount = calculateEMI(principal, monthlyRate, months);
		const schedules = [];

		let remainingPrincipal = principal;
		let dueDate = new Date();

		for (let i = 1; i <= months; i++) {
			dueDate.setMonth(dueDate.getMonth() + 1);

			const interestAmount = (remainingPrincipal * monthlyRate) / 100;
			const principalAmount = emiAmount - interestAmount;

			remainingPrincipal -= principalAmount;

			schedules.push({
				loanId,
				userId,
				installmentNumber: i,
				dueDate: new Date(dueDate),
				amount: emiAmount,
				principal: principalAmount,
				interest: interestAmount,
				status: "pending",
			});
		}

		await EMISchedule.insertMany(schedules);
		return schedules;
	} catch (err) {
		console.error("EMI Schedule generation error:", err);
		throw err;
	}
};

const calculateEMI = (principal, monthlyRate, months) => {
	const rate = monthlyRate / 100;
	if (rate === 0) return Math.ceil(principal / months);

	const emi =
		(principal * rate * Math.pow(1 + rate, months)) /
		(Math.pow(1 + rate, months) - 1);

	return Math.ceil(emi);
};

const getEMISchedule = async (loanId) => {
	try {
		return await EMISchedule.find({ loanId }).sort({ installmentNumber: 1 });
	} catch (err) {
		console.error("Get EMI schedule error:", err);
		throw err;
	}
};

const markEMIPaid = async (emiScheduleId, paidAmount) => {
	try {
		const emi = await EMISchedule.findById(emiScheduleId);
		if (!emi) throw new Error("EMI not found");

		emi.paidAmount = paidAmount;
		if (paidAmount >= emi.amount) {
			emi.status = "paid";
			emi.paidDate = new Date();
		} else if (paidAmount > 0) {
			emi.status = "partially_paid";
		}

		await emi.save();
		return emi;
	} catch (err) {
		console.error("Mark EMI paid error:", err);
		throw err;
	}
};

const checkOverdueEMIs = async (userId) => {
	try {
		const today = new Date();
		return await EMISchedule.find({
			userId,
			dueDate: { $lt: today },
			status: { $in: ["pending", "partially_paid"] },
		});
	} catch (err) {
		console.error("Check overdue EMIs error:", err);
		throw err;
	}
};

module.exports = {
	generateEMISchedule,
	calculateEMI,
	getEMISchedule,
	markEMIPaid,
	checkOverdueEMIs,
};
