const Razorpay = require("razorpay");
const crypto = require("crypto");
const Transaction = require("../models/Transaction");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create order for shop checkout
exports.createShopOrder = async (req, res) => {
  try {
    const { amount, userEmail, orderId } = req.body;

    if (!amount || !userEmail || !orderId) {
      return res
        .status(400)
        .json({ error: "Missing amount, userEmail, or orderId" });
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency: "INR",
      receipt: orderId,
      notes: {
        userEmail,
        orderId,
        source: "shop",
      },
    });

    res.json({
      orderId: order.id,
      amount: order.amount / 100,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Error creating shop order:", error);
    res.status(500).json({ error: error.message });
  }
};

// Verify payment for shop checkout
exports.verifyShopPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userEmail,
      orderId,
      amount,
    } = req.body;

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    // Log transaction (optional - for record keeping)
    try {
      await Transaction.create({
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        amount,
        currency: "INR",
        paymentMethod: "BNPL",
        status: "SUCCESS",
        type: "PURCHASE",
        notes: {
          userEmail,
          orderId,
          source: "shop",
        },
      });
    } catch (txnError) {
      console.log("Transaction logging failed (non-critical):", txnError.message);
    }

    res.json({
      success: true,
      message: "Payment verified successfully",
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });
  } catch (error) {
    console.error("Error verifying shop payment:", error);
    res.status(500).json({ error: error.message });
  }
};
