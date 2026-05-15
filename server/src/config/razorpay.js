const Razorpay = require("razorpay");

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

const razorpay = keyId && keySecret
  ? new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  })
  : null;

module.exports = razorpay;