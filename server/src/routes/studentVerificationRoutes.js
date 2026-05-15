const express = require("express");
const multer = require("multer");

const auth = require("../middleware/authMiddleware");
const {
	sendParentOtp,
	verifyParentOtp,
	sendCollegeEmailOtp,
	verifyCollegeEmailOtp,
	evaluateStudentVerification,
	submitStudentVerification,
	getStudentVerification,
	getStudentVerificationDashboard,
	sendStudentVerificationSummary,
} = require("../controllers/studentVerificationController");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const studentUpload = upload.fields([
	{ name: "collegeIdUpload", maxCount: 1 },
	{ name: "bonafideCertificateUpload", maxCount: 1 },
	{ name: "studentSelfie", maxCount: 1 },
	{ name: "govtIdUpload", maxCount: 1 },
]);

router.post("/parent-otp/send", auth, sendParentOtp);
router.post("/parent-otp/verify", auth, verifyParentOtp);
router.post("/college-email/send", auth, sendCollegeEmailOtp);
router.post("/college-email/verify", auth, verifyCollegeEmailOtp);
router.post("/evaluate", auth, evaluateStudentVerification);
router.post("/submit", auth, studentUpload, submitStudentVerification);
router.get("/me", auth, getStudentVerification);
router.get("/dashboard", auth, getStudentVerificationDashboard);
router.post("/summary", auth, sendStudentVerificationSummary);

module.exports = router;