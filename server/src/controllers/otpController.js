/**
 * OTP & 2FA Controller
 */

const { createOTP, verifyOTP, incrementAttempts } = require("../services/otpService");

exports.sendOTP = async (req, res) => {
	try {
		const { email, phone } = req.body;
		const purpose = req.body?.purpose || "registration";
		// purpose: registration, login, 2fa, kyc_verify, payment_confirm

		if (!email && !phone) {
			return res.status(400).json({ message: "Email or phone required" });
		}

		const result = await createOTP(email, phone, purpose, req.user?.id || null);
		if (!result.success) {
			return res.status(result.statusCode || 400).json(result);
		}

		res.json(result);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.verifyOTP = async (req, res) => {
	try {
		const { email, phone, otpCode, purpose } = req.body;

		const result = await verifyOTP(email, phone, otpCode, purpose);

		if (!result.success) {
			// Increment attempts for security
			incrementAttempts(email, phone, otpCode);
			return res.status(400).json(result);
		}

		res.json(result);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
