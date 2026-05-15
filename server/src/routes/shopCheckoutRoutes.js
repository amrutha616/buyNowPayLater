const express = require("express");
const router = express.Router();
const {
  createShopOrder,
  verifyShopPayment,
} = require("../controllers/shopCheckoutController");

// No auth required - shop orders use email-based verification
router.post("/shop/create-order", createShopOrder);
router.post("/shop/verify-payment", verifyShopPayment);

module.exports = router;
