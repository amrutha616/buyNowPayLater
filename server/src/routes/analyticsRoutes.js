const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
	getSpendingAnalytics,
	getCreditScore,
	getLoanAnalytics,
} = require("../controllers/analyticsController");

const router = express.Router();

router.get("/spending", authMiddleware, getSpendingAnalytics);
router.get("/credit-score", authMiddleware, getCreditScore);
router.get("/loans", authMiddleware, getLoanAnalytics);

module.exports = router;
