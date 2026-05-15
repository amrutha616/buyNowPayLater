const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");
const {
	getCatalog,
	getQuote,
	sendCheckoutOTP,
	checkoutBundle,
	getOrders,
	getActivatedSubscriptions,
	renewBundle,
} = require("../controllers/subscriptionController");

const router = express.Router();

router.get("/catalog", getCatalog);
router.post("/quote", getQuote);
router.post("/send-checkout-otp", authMiddleware, sendCheckoutOTP);
router.post("/checkout", authMiddleware, checkoutBundle);
router.post("/renew", authMiddleware, renewBundle);
router.get("/orders", authMiddleware, getOrders);
router.get("/activated", authMiddleware, getActivatedSubscriptions);

module.exports = router;
