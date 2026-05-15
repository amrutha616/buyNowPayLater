const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { makeRepayment, getRepayments, makePartialRepayment, getPartialPaymentHistory } = require("../controllers/repaymentcontroller");

const router = express.Router();

router.post("/", authMiddleware, makeRepayment);
router.get("/", authMiddleware, getRepayments);
router.post("/partial", authMiddleware, makePartialRepayment);
router.get("/partial/:loanId", authMiddleware, getPartialPaymentHistory);

module.exports = router;
