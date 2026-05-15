const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
	getSettings,
	updateSettings,
	enable2FA,
	disable2FA,
} = require("../controllers/settingsController");

const router = express.Router();

router.get("/", authMiddleware, getSettings);
router.put("/", authMiddleware, updateSettings);
router.post("/2fa/enable", authMiddleware, enable2FA);
router.post("/2fa/disable", authMiddleware, disable2FA);

module.exports = router;
