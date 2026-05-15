const express = require("express");
const cors = require("cors");

const app = express();   // ✅ FIRST create app

app.use(express.json());
app.use(cors());

// Import Routes AFTER creating app
const authRoutes = require("./routes/authRoutes");
const loanRoutes = require("./routes/loanRoutes");
const repayRoutes = require("./routes/repayRoutes");
const walletRoutes = require("./routes/walletRoutes");
const emiRoutes = require("./routes/emiRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const referralRoutes = require("./routes/referralRoutes");
const supportRoutes = require("./routes/supportRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const fraudRoutes = require("./routes/fraudRoutes");
const pricingRoutes = require("./routes/pricingRoutes");
const otpRoutes = require("./routes/otpRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const shopCheckoutRoutes = require("./routes/shopCheckoutRoutes");
const adminRoutes = require("./routes/adminRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const rewardRoutes = require("./routes/rewardRoutes");
const kycRoutes = require("./routes/kycRoutes");
const studentVerificationRoutes = require("./routes/studentVerificationRoutes");

app.use("/api/payment", paymentRoutes);
app.use("/api/payment", shopCheckoutRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/rewards", rewardRoutes);
// Use Routes
app.use("/api", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/repayments", repayRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/emi", emiRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/fraud", fraudRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/student-verification", studentVerificationRoutes);

// Health check & test routes
app.get("/", (req, res) => {
  res.send("BNPL Backend Running 🚀");
});

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Backend is running",
    timestamp: new Date().toISOString()
  });
});

module.exports = app;