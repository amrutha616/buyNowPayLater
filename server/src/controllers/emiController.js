/**
 * EMI Controller
 * Manages EMI schedule and payment tracking
 */

const EMISchedule = require("../models/EMISchedule");
const { getEMISchedule, markEMIPaid, checkOverdueEMIs } = require("../services/emiService");

exports.getEMISchedule = async (req, res) => {
	try {
		const { loanId } = req.params;
		const schedule = await getEMISchedule(loanId);
		res.json({ schedule });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.getUserEMIs = async (req, res) => {
	try {
		const emis = await EMISchedule.find({ userId: req.user.id }).sort({
			dueDate: 1,
		});
		const stats = {
			pending: emis.filter((e) => e.status === "pending").length,
			paid: emis.filter((e) => e.status === "paid").length,
			overdue: emis.filter((e) => e.status === "overdue").length,
			totalDue: emis
				.filter((e) => e.status !== "paid")
				.reduce((sum, e) => sum + e.amount, 0),
		};
		res.json({ emis, stats });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.payEMI = async (req, res) => {
	try {
		const { emiScheduleId, amount } = req.body;
		const emi = await markEMIPaid(emiScheduleId, amount);
		res.json({ message: "EMI payment processed", emi });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.checkOverdue = async (req, res) => {
	try {
		const overdueEMIs = await checkOverdueEMIs(req.user.id);
		res.json({ overdue: overdueEMIs, count: overdueEMIs.length });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
