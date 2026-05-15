const razorpay = require("../config/razorpay");
const crypto = require("crypto");

exports.createOrder = async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const loanId = req.body.loanId || "";
    const installmentNumber = req.body.installmentNumber || "";
    const merchant = req.body.merchant || "";
    const paymentMethod = req.body.paymentMethod || "UPI";

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ message: "Razorpay keys are not configured" });
    }

    if (!razorpay) {
      return res.status(500).json({ message: "Razorpay client is unavailable" });
    }

    const userSuffix = String(req.user.id).slice(-8);
    const timeSuffix = String(Date.now()).slice(-10);

    const options = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `receipt_${userSuffix}_${timeSuffix}`,
      notes: {
        userId: String(req.user.id),
        loanId: String(loanId),
        installmentNumber: String(installmentNumber),
        merchant: String(merchant),
        paymentMethod,
      },
    };

    const order = await razorpay.orders.create(options);

    res.json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ message: "Error creating order" });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Payment verification details are required" });
    }

    if (!process.env.RAZORPAY_KEY_SECRET || !razorpay) {
      return res.status(500).json({ message: "Razorpay keys are not configured" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    const order = await razorpay.orders.fetch(razorpay_order_id);

    if (order?.notes?.userId && order.notes.userId !== String(req.user.id)) {
      return res.status(403).json({ message: "Order does not belong to this user" });
    }

    return res.json({
      message: "Payment verified successfully",
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    return res.status(500).json({ message: "Error verifying payment" });
  }
};