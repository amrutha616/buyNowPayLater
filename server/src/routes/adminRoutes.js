const express = require("express");
const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");
const {
	getAdminOverview,
	getAdminStats,
	getAdminUsers,
	downloadUsersCsv,
	updateUserAdmin,
	getAdminLoans,
	getAdminLoanStats,
	getAdminTransactions,
	getAdminFraudAlerts,
	resolveAdminFraudAlert,
	getAdminReports,
	getSubscriptionCatalogAdmin,
	createSubscriptionPlanAdmin,
	updateSubscriptionPlanAdmin,
	deleteSubscriptionPlanAdmin,
} = require("../controllers/adminController");

const router = express.Router();
router.use(auth, adminOnly);

// Users
router.get("/overview", getAdminOverview);
router.get("/stats", getAdminStats);
router.get("/users", getAdminUsers);
router.get("/users/export", downloadUsersCsv);
router.patch("/users/:userId", updateUserAdmin);

// Loans
router.get("/loans", getAdminLoans);
router.get("/loans/stats", getAdminLoanStats);

// Transactions
router.get("/transactions", getAdminTransactions);

// Fraud Alerts
router.get("/fraud-alerts", getAdminFraudAlerts);
router.patch("/fraud-alerts/:alertId/resolve", resolveAdminFraudAlert);

// Reports
router.get("/reports", getAdminReports);

// Subscription Catalog
router.get("/subscriptions/catalog", getSubscriptionCatalogAdmin);
router.post("/subscriptions/catalog", createSubscriptionPlanAdmin);
router.patch("/subscriptions/catalog/:planId", updateSubscriptionPlanAdmin);
router.delete("/subscriptions/catalog/:planId", deleteSubscriptionPlanAdmin);

module.exports = router;
