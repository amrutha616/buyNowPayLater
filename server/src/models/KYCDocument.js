const mongoose = require("mongoose");

const kycDocumentSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		documentType: {
			type: String,
			enum: ["pan", "aadhaar", "driving_license", "passport", "selfie"],
			required: true,
		},
		documentNumber: {
			type: String,
			sparse: true,
		},
		fileUrl: {
			type: String,
			required: true,
		},
		verificationStatus: {
			type: String,
			enum: ["pending", "verified", "rejected", "expired"],
			default: "pending",
		},
		verifiedAt: {
			type: Date,
		},
		expiryDate: {
			type: Date,
		},
		rejectionReason: {
			type: String,
		},
		ocrData: {
			type: mongoose.Schema.Types.Mixed,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("KYCDocument", kycDocumentSchema);
