/**
 * Loan Controller
 * Handles loan requests and approvals
 */

const Loan = require("../models/Loan");
const User = require("../models/userModel");

exports.requestLoan = async (req, res) => {
	try {
		const { amount, merchant, purpose } = req.body;

		const loan = await Loan.create({
			userId: req.user.id,
			amount,
			merchant,
			purpose,
		});

		res.status(201).json({ message: "Loan requested", loan });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.getLoans = async (req, res) => {
	try {
		const loans = await Loan.find({ userId: req.user.id }).sort({ createdAt: -1 });
		res.json({ loans });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.getLoanDetails = async (req, res) => {
	try {
		const { loanId } = req.params;
		const loan = await Loan.findById(loanId);

		if (!loan || loan.userId.toString() !== req.user.id) {
			return res.status(404).json({ message: "Loan not found" });
		}

		res.json({ loan });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
