const express = require("express");
const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");
const {
	getMyRewards,
	getMyRewardHistory,
	getAdminRewardSummary,
	getAdminRewardConfig,
	updateAdminRewardConfig,
	grantCampaignReward,
} = require("../controllers/rewardController");

const router = express.Router();

router.get("/me", auth, getMyRewards);
router.get("/history", auth, getMyRewardHistory);
router.get("/admin/summary", auth, adminOnly, getAdminRewardSummary);
router.get("/admin/config", auth, adminOnly, getAdminRewardConfig);
router.patch("/admin/config", auth, adminOnly, updateAdminRewardConfig);
router.post("/admin/campaign-grant", auth, adminOnly, grantCampaignReward);

module.exports = router;
