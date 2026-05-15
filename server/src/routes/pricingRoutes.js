const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
	calculateDynamicRate,
	getPricingHistory,
} = require("../controllers/pricingController");

const router = express.Router();

router.get("/calculate", authMiddleware, calculateDynamicRate);
router.get("/history", authMiddleware, getPricingHistory);

module.exports = router;
