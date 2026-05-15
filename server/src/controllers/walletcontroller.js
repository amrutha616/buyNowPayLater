/**
 * Wallet Controller
 */

const Transaction = require("../models/Transaction");
const User = require("../models/userModel");

exports.getWalletBalance = async (req, res) => {
	try {
		const user = await User.findById(req.user.id);
		const transactions = await Transaction.find({ userId: req.user.id })
			.sort({ createdAt: -1 })
			.limit(10);

		res.json({
			balance: user.creditLimit - user.outstandingBalance,
			transactions,
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.addMoney = async (req, res) => {
	try {
		const { amount, source } = req.body;

		const transaction = await Transaction.create({
			userId: req.user.id,
			type: "wallet_topup",
			amount,
			source,
		});

		res.json({ message: "Money added to wallet", transaction });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
