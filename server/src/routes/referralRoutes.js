const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
	getReferralInfo,
	referUser,
	claimReferralBonus,
} = require("../controllers/referralController");

const router = express.Router();

router.get("/", authMiddleware, getReferralInfo);
router.post("/refer", referUser);
router.post("/claim-bonus", authMiddleware, claimReferralBonus);

module.exports = router;
