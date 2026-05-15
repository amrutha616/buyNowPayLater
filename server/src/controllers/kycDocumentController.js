/**
 * KYC Controller
 * Handles document upload and verification
 */

const KYCDocument = require("../models/KYCDocument");

exports.uploadKYCDocument = async (req, res) => {
	try {
		const { documentType, documentNumber, expiryDate } = req.body;

		if (!documentType || !req.file) {
			return res.status(400).json({ message: "Document type and file required" });
		}

		// With memory storage the file isn't saved to disk.
		// Store the original filename as a reference; in production use S3 / cloud storage.
		const fileUrl = `/uploads/${req.file.originalname}`;

		const doc = await KYCDocument.create({
			userId: req.user.id,
			documentType,
			documentNumber: documentNumber || null,
			fileUrl,
			expiryDate: expiryDate ? new Date(expiryDate) : null,
			verificationStatus: "pending",
		});

		res.status(201).json({
			message: "Document uploaded for verification",
			document: doc,
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.getKYCDocuments = async (req, res) => {
	try {
		const documents = await KYCDocument.find({ userId: req.user.id });
		const verificationStatus = {
			verified: documents.filter((d) => d.verificationStatus === "verified"),
			pending: documents.filter((d) => d.verificationStatus === "pending"),
			rejected: documents.filter((d) => d.verificationStatus === "rejected"),
		};
		res.json({ documents, verificationStatus });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.verifyKYCDocument = async (req, res) => {
	try {
		const { documentId } = req.params;
		const { status, rejectionReason } = req.body;

		const doc = await KYCDocument.findByIdAndUpdate(
			documentId,
			{
				verificationStatus: status,
				rejectionReason: status === "rejected" ? rejectionReason : null,
				verifiedAt: status === "verified" ? new Date() : null,
			},
			{ new: true }
		);

		res.json({ message: `Document ${status}`, document: doc });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
