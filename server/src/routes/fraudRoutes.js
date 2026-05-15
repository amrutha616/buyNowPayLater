const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
	checkFraudRisk,
	reportSuspiciousActivity,
	getFraudAlerts,
	resolveFraudAlert,
} = require("../controllers/fraudController");

const router = express.Router();

router.post("/check", authMiddleware, checkFraudRisk);
router.post("/report", authMiddleware, reportSuspiciousActivity);
router.get("/alerts", authMiddleware, getFraudAlerts);
router.put("/alerts/:alertId/resolve", authMiddleware, resolveFraudAlert);

module.exports = router;
