const express = require("express");

const auth = require("../middleware/authMiddleware");
const { createOrder, verifyPayment } = require("../controllers/paymentController");
const {
	sendRegistrationOTP,
	register,
	login,
	adminLogin,
	forgotPassword,
	resetPassword,
	predictRisk,
	getDashboard,
	purchase,
	repay,
	getHistory,
	getLoans,
	getActiveLoans,
} = require("../controllers/authcontroller");

const router = express.Router();

router.post("/register/send-otp", sendRegistrationOTP);
router.post("/register", register);
router.post("/login", login);
router.post("/admin/login", adminLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/dashboard", auth, getDashboard);
router.post("/predict-risk", auth, predictRisk);

router.post("/purchase", auth, purchase);
router.post("/repay", auth, repay);
router.post("/payment/create-order", auth, createOrder);
router.post("/payment/verify", auth, verifyPayment);
router.get("/history", auth, getHistory);
router.get("/loans", auth, getLoans);
router.get("/loans/active", auth, getActiveLoans);

module.exports = router;
