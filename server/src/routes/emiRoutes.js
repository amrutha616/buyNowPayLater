const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
	getEMISchedule,
	getUserEMIs,
	payEMI,
	checkOverdue,
} = require("../controllers/emiController");

const router = express.Router();

router.get("/schedule/:loanId", authMiddleware, getEMISchedule);
router.get("/user", authMiddleware, getUserEMIs);
router.post("/pay", authMiddleware, payEMI);
router.get("/overdue", authMiddleware, checkOverdue);

module.exports = router;
