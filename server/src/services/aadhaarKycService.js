const crypto = require("crypto");

const normalizeAadhaar = (value) => String(value || "").replace(/\D/g, "").slice(0, 12);

const maskAadhaar = (value) => {
	const digits = normalizeAadhaar(value);
	if (digits.length < 4) return "XXXX XXXX XXXX";
	return `XXXX XXXX ${digits.slice(-4)}`;
};

const hashToken = (value) =>
	crypto.createHash("sha256").update(String(value || "")).digest("hex");

const generateToken = () => crypto.randomBytes(24).toString("hex");

const generateReferenceId = () => `AAD-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

const encryptForTransport = (value) => {
	const keyMaterial = process.env.AADHAAR_KYC_ENCRYPTION_KEY || process.env.JWT_SECRET || "aadhaar-demo-key";
	const key = crypto.createHash("sha256").update(String(keyMaterial)).digest();
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([cipher.update(String(value || ""), "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

const buildDemoAadhaarResult = ({ aadhaarNumber, user }) => {
	const digits = normalizeAadhaar(aadhaarNumber);
	const last4 = Number(digits.slice(-4) || 0);
	const baseKyc = 72 + (last4 % 18);
	const fraudScore = Math.max(6, 34 - (last4 % 14));

	return {
		status: "verified",
		verifiedName: String(user?.name || "Student").trim(),
		maskedAadhaar: maskAadhaar(digits),
		referenceId: generateReferenceId(),
		verificationToken: generateToken(),
		kycScore: Math.min(100, baseKyc),
		fraudScore: Math.max(0, fraudScore),
		bnplEligibility: baseKyc >= 75 && fraudScore <= 30 ? "eligible" : "review",
	};
};

module.exports = {
	normalizeAadhaar,
	maskAadhaar,
	hashToken,
	generateToken,
	generateReferenceId,
	encryptForTransport,
	buildDemoAadhaarResult,
};