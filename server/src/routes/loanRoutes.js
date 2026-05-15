const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { requestLoan, getLoans, getLoanDetails } = require("../controllers/loancontroller");

const router = express.Router();

router.post("/", authMiddleware, requestLoan);
router.get("/", authMiddleware, getLoans);
router.get("/:loanId", authMiddleware, getLoanDetails);

module.exports = router;
