const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { getWalletBalance, addMoney } = require("../controllers/walletcontroller");

const router = express.Router();

router.get("/balance", authMiddleware, getWalletBalance);
router.post("/add", authMiddleware, addMoney);

module.exports = router;
