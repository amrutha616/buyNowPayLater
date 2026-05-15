/**
 * Fraud Detection Controller
 */

const FraudAlert = require("../models/FraudAlert");
const User = require("../models/userModel");

exports.checkFraudRisk = async (req, res) => {
	try {
		const { transactionAmount, location, device } = req.body;

		const user = await User.findById(req.user.id);
		const alerts = [];

		// Check 1: Unusual amount
		if (transactionAmount > user.creditLimit * 0.8) {
			alerts.push({
				type: "unusual_amount",
				severity: "medium",
				description: "Transaction exceeds 80% of credit limit",
			});
		}

		// Check 2: Rapid transactions (mock)
		alerts.push({
			type: "transaction_pattern",
			severity: "low",
			description: "Normal transaction pattern",
		});

		res.json({ riskLevel: alerts.length > 0 ? "medium" : "low", alerts });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.reportSuspiciousActivity = async (req, res) => {
	try {
		const { description, transactionData } = req.body;

		const alert = await FraudAlert.create({
			userId: req.user.id,
			alertType: "user_reported",
			severity: "high",
			description,
			transactionData,
		});

		res.json({ message: "Suspicious activity reported", alert });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.getFraudAlerts = async (req, res) => {
	try {
		const alerts = await FraudAlert.find({ userId: req.user.id }).sort({
			createdAt: -1,
		});
		res.json({ alerts });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.resolveFraudAlert = async (req, res) => {
	try {
		const { alertId } = req.params;
		const { action } = req.body; // approve, dispute, etc.

		const alert = await FraudAlert.findByIdAndUpdate(
			alertId,
			{
				resolved: true,
				resolutionAction: action,
				resolvedAt: new Date(),
			},
			{ new: true }
		);

		res.json({ message: "Alert resolved", alert });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
