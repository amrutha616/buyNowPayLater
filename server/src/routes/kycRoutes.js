const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
  submitKyc,
  getKycStatus,
  verifyPAN,
  getCreditReport,
  uploadBankStatement,
  getBankStatement,
} = require("../controllers/kyccontroller");
const {
  initiateAadhaarVerification,
  verifyAadhaarOtp,
  getAadhaarVerificationStatus,
} = require("../controllers/aadhaarVerificationController");

const {
  uploadKYCDocument,
  getKYCDocuments,
  verifyKYCDocument,
} = require("../controllers/kycDocumentController");

const auth = require("../middleware/authMiddleware");

// Use memory storage so we can read file.buffer for CSV parsing
const memoryUpload = multer({ storage: multer.memoryStorage() });

// ─── Legacy ───────────────────────────────────────────────────────────────────
router.post("/submit", auth, submitKyc);
router.get("/status", auth, getKycStatus);

// ─── PAN Verification & Credit Report ────────────────────────────────────────
router.post("/verify-pan", auth, verifyPAN);
router.get("/credit-report", auth, getCreditReport);

// ─── Aadhaar KYC Verification ────────────────────────────────────────────────
router.post("/verify-aadhaar/initiate", auth, initiateAadhaarVerification);
router.post("/verify-aadhaar/otp", auth, verifyAadhaarOtp);
router.get("/verify-aadhaar/status", auth, getAadhaarVerificationStatus);

// ─── Bank Statement ───────────────────────────────────────────────────────────
router.post("/bank-statement", auth, memoryUpload.single("statement"), uploadBankStatement);
router.get("/bank-statement", auth, getBankStatement);

// ─── KYC Document Upload (used by KYCUpload.jsx) ─────────────────────────────
router.post("/upload", auth, memoryUpload.single("file"), uploadKYCDocument);
router.get("/", auth, getKYCDocuments);
router.patch("/verify/:documentId", auth, verifyKYCDocument);

module.exports = router;
