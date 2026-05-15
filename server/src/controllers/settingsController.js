/**
 * Settings Controller
 */

const UserSettings = require("../models/UserSettings");

exports.getSettings = async (req, res) => {
	try {
		let settings = await UserSettings.findOne({ userId: req.user.id });

		if (!settings) {
			settings = await UserSettings.create({ userId: req.user.id });
		}

		res.json({ settings });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.updateSettings = async (req, res) => {
	try {
		const { notificationPreferences, bankAccount, emergencyContact, autoPayEnabled, language } =
			req.body;

		let settings = await UserSettings.findOne({ userId: req.user.id });
		if (!settings) {
			settings = new UserSettings({ userId: req.user.id });
		}

		if (notificationPreferences) settings.notificationPreferences = notificationPreferences;
		if (bankAccount) settings.bankAccount = bankAccount;
		if (emergencyContact) settings.emergencyContact = emergencyContact;
		if (autoPayEnabled !== undefined) settings.autoPayEnabled = autoPayEnabled;
		if (language) settings.language = language;

		await settings.save();
		res.json({ message: "Settings updated", settings });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.enable2FA = async (req, res) => {
	try {
		const { method } = req.body; // sms or email

		let settings = await UserSettings.findOne({ userId: req.user.id });
		if (!settings) {
			settings = new UserSettings({ userId: req.user.id });
		}

		settings.twoFactorAuth = { enabled: true, method };
		await settings.save();

		res.json({ message: "2FA enabled", settings });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.disable2FA = async (req, res) => {
	try {
		const settings = await UserSettings.findOneAndUpdate(
			{ userId: req.user.id },
			{ "twoFactorAuth.enabled": false },
			{ new: true }
		);
		res.json({ message: "2FA disabled", settings });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
