/**
 * OTP Service
 * Generates, sends, and verifies OTPs
 */

const OTP = require("../models/OTP");
const { sendSMS, normalizePhone } = require("./smsService");
const { sendEmail } = require("./emailService");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_EXPIRY_MINUTES = Math.max(1, Number(process.env.OTP_EXPIRY_MINUTES || 10));
const OTP_SEND_COOLDOWN_SECONDS = Math.max(0, Number(process.env.OTP_SEND_COOLDOWN_SECONDS || 30));
const OTP_MAX_SENDS_PER_WINDOW = Math.max(1, Number(process.env.OTP_MAX_SENDS_PER_WINDOW || 5));
const OTP_SEND_WINDOW_MINUTES = Math.max(1, Number(process.env.OTP_SEND_WINDOW_MINUTES || 15));

const isValidEmail = (email) => EMAIL_REGEX.test(String(email || "").trim().toLowerCase());

const generateOTP = () => {
	return Math.floor(100000 + Math.random() * 900000).toString();
};

const buildIdentityQuery = ({ email, phone }) => {
	const clauses = [];
	if (email) clauses.push({ email });
	if (phone) clauses.push({ phone });
	if (!clauses.length) return null;
	return clauses.length === 1 ? clauses[0] : { $or: clauses };
};

const createOTP = async (email, phone, purpose, userId) => {
	try {
		const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
		const normalizedPhone = phone ? normalizePhone(phone) : null;
		const purposeKey = String(purpose || "registration").trim();
		const identityQuery = buildIdentityQuery({
			email: normalizedEmail,
			phone: normalizedPhone,
		});

		if (!identityQuery) {
			return {
				success: false,
				message: "Email or phone is required to send OTP",
				statusCode: 400,
			};
		}

		if (normalizedEmail && !isValidEmail(normalizedEmail)) {
			return {
				success: false,
				message: "Enter a valid email address",
				statusCode: 400,
			};
		}

		if (normalizedPhone && normalizedPhone.length < 10) {
			return {
				success: false,
				message: "Enter a valid phone number",
				statusCode: 400,
			};
		}

		const identityWithPurposeQuery = {
			...identityQuery,
			purpose: purposeKey,
		};

		const latestOtp = await OTP.findOne(identityWithPurposeQuery).sort({ createdAt: -1 });
		if (latestOtp && OTP_SEND_COOLDOWN_SECONDS > 0) {
			const secondsSinceLastSend = Math.floor((Date.now() - latestOtp.createdAt.getTime()) / 1000);
			if (secondsSinceLastSend < OTP_SEND_COOLDOWN_SECONDS) {
				return {
					success: false,
					message: `Please wait ${OTP_SEND_COOLDOWN_SECONDS - secondsSinceLastSend}s before requesting another OTP`,
					statusCode: 429,
				};
			}
		}

		const windowStart = new Date(Date.now() - OTP_SEND_WINDOW_MINUTES * 60 * 1000);
		const sendsInWindow = await OTP.countDocuments({
			...identityWithPurposeQuery,
			createdAt: { $gte: windowStart },
		});
		if (sendsInWindow >= OTP_MAX_SENDS_PER_WINDOW) {
			return {
				success: false,
				message: `Too many OTP requests. Try again after ${OTP_SEND_WINDOW_MINUTES} minutes`,
				statusCode: 429,
			};
		}

		// Delete existing non-verified OTPs
		await OTP.deleteMany({
			...identityWithPurposeQuery,
			verified: false,
		});

		const otpCode = generateOTP();
		const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

		const otp = await OTP.create({
			userId: userId || null,
			email: normalizedEmail,
			phone: normalizedPhone,
			otpCode,
			purpose: purposeKey,
			expiresAt,
		});

		const destination = normalizedPhone || normalizedEmail;
		const message = `${otpCode} is your OTP for ${purposeKey}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`;

		if (normalizedPhone) {
			await sendSMS({
				to: normalizedPhone,
				message,
				otpCode,
			});
		} else if (normalizedEmail) {
			const emailResult = await sendEmail({
				to: normalizedEmail,
				subject: "Your OTP Code",
				text: message,
				html: `<p>${message}</p>`,
			});

			if (!emailResult?.success) {
				await OTP.deleteOne({ _id: otp._id });
				console.error("[OTP:EMAIL] OTP email send failed", {
					destination,
					provider: emailResult?.provider,
					warning: emailResult?.warning,
				});
				return {
					success: false,
					message: emailResult.warning || "Unable to send OTP email. Check email provider configuration.",
					statusCode: 502,
				};
			}

			console.log("[OTP:EMAIL] OTP email provider response", {
				destination,
				provider: emailResult.provider,
				messageId: emailResult.messageId || null,
				simulated: !!emailResult.simulated,
			});
		}

		console.log(`[OTP] ${otpCode} sent to ${destination}`);

		return {
			success: true,
			message: "OTP sent successfully",
			expiresIn: OTP_EXPIRY_MINUTES * 60,
			destination,
			purpose: otp.purpose,
		};
	} catch (err) {
		console.error("OTP creation error:", err);
		throw err;
	}
};

const verifyOTP = async (email, phone, otpCode, purpose) => {
	try {
		const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
		const normalizedPhone = phone ? normalizePhone(phone) : null;
		const purposeKey = String(purpose || "registration").trim();
		const identityQuery = buildIdentityQuery({
			email: normalizedEmail,
			phone: normalizedPhone,
		});

		if (!identityQuery) {
			return { success: false, message: "Email or phone is required" };
		}

		if (normalizedEmail && !isValidEmail(normalizedEmail)) {
			return { success: false, message: "Enter a valid email address" };
		}

		const otp = await OTP.findOne({
			...identityQuery,
			otpCode,
			purpose: purposeKey,
			verified: false,
		});

		if (!otp) {
			return { success: false, message: "Invalid OTP" };
		}

		if (new Date() > otp.expiresAt) {
			await OTP.deleteOne({ _id: otp._id });
			return { success: false, message: "OTP expired" };
		}

		if (otp.attempts >= otp.maxAttempts) {
			return { success: false, message: "Too many attempts. Request new OTP." };
		}

		// Mark as verified
		otp.verified = true;
		await otp.save();

		return { success: true, message: "OTP verified", userId: otp.userId };
	} catch (err) {
		console.error("OTP verification error:", err);
		throw err;
	}
};

const incrementAttempts = async (email, phone, otpCode) => {
	const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
	const normalizedPhone = phone ? normalizePhone(phone) : null;
	const identityQuery = buildIdentityQuery({
		email: normalizedEmail,
		phone: normalizedPhone,
	});

	if (!identityQuery) return;

	const otp = await OTP.findOne({
		...identityQuery,
		otpCode,
		verified: false,
	});

	if (otp) {
		otp.attempts += 1;
		await otp.save();
	}
};

module.exports = {
	generateOTP,
	createOTP,
	verifyOTP,
	incrementAttempts,
};
