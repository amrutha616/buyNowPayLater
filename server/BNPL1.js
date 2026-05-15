require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./src/models/userModel");
const Transaction = require("./src/models/Transaction");
const Loan = require("./src/models/Loan");

const dropLegacyUserIndexes = async () => {
	try {
		const indexes = await User.collection.indexes();
		const mobileNumberIndex = indexes.find(
			(index) => index.name === "mobileNumber_1"
		);

		if (mobileNumberIndex) {
			await User.collection.dropIndex("mobileNumber_1");
			console.log("Dropped legacy users index: mobileNumber_1");
		}
	} catch (err) {
		if (err.codeName === "NamespaceNotFound") return;
		throw err;
	}
};

const seedDatabase = async () => {
	try {
		await mongoose.connect("mongodb://127.0.0.1:27017/bnplDB");
		console.log("MongoDB Connected ✅\n");

		await dropLegacyUserIndexes();

		// Clear existing data
		await User.deleteMany({});
		await Transaction.deleteMany({});
		await Loan.deleteMany({});
		console.log("Cleared existing data\n");

		// Create demo users
		const hashedPassword = await bcrypt.hash("password123", 10);

		const demoUser = await User.create({
			name: "Demo User",
			email: "demo@phonepay.com",
			password: hashedPassword,
			creditLimit: 15000,
			outstandingBalance: 0,
		});

		const testUser = await User.create({
			name: "Test User",
			email: "test@phonepay.com",
			password: hashedPassword,
			creditLimit: 10000,
			outstandingBalance: 2500,
		});

		console.log("✅ Created Demo Users:");
		console.log("   Email: demo@phonepay.com | Password: password123");
		console.log("   Credit Limit: ₹15,000 | Outstanding: ₹0\n");
		console.log("   Email: test@phonepay.com | Password: password123");
		console.log("   Credit Limit: ₹10,000 | Outstanding: ₹2,500\n");

		// Create sample loans for test user
		const today = new Date();
		
		const loan1 = await Loan.create({
			user: testUser._id,
			merchant: "Amazon",
			principalAmount: 1500,
			upfrontPaid: 500,
			bnplAmount: 1000,
			installmentPlan: 3,
			installments: [
				{
					installmentNumber: 1,
					amount: 334,
					dueDate: new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()),
					paidAmount: 334,
					status: "PAID",
					paidDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 15),
				},
				{
					installmentNumber: 2,
					amount: 333,
					dueDate: new Date(today.getFullYear(), today.getMonth() + 2, today.getDate()),
					paidAmount: 0,
					status: "PENDING",
				},
				{
					installmentNumber: 3,
					amount: 333,
					dueDate: new Date(today.getFullYear(), today.getMonth() + 3, today.getDate()),
					paidAmount: 0,
					status: "PENDING",
				},
			],
			totalPaid: 334,
			status: "ACTIVE",
		});

		const loan2 = await Loan.create({
			user: testUser._id,
			merchant: "Flipkart",
			principalAmount: 1500,
			upfrontPaid: 0,
			bnplAmount: 1500,
			installmentPlan: 3,
			installments: [
				{
					installmentNumber: 1,
					amount: 500,
					dueDate: new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()),
					paidAmount: 0,
					status: "PENDING",
				},
				{
					installmentNumber: 2,
					amount: 500,
					dueDate: new Date(today.getFullYear(), today.getMonth() + 2, today.getDate()),
					paidAmount: 0,
					status: "PENDING",
				},
				{
					installmentNumber: 3,
					amount: 500,
					dueDate: new Date(today.getFullYear(), today.getMonth() + 3, today.getDate()),
					paidAmount: 0,
					status: "PENDING",
				},
			],
			totalPaid: 0,
			status: "ACTIVE",
		});

		// Create sample transactions for test user
		await Transaction.create([
			{
				user: testUser._id,
				type: "PURCHASE",
				merchant: "Amazon",
				totalAmount: 1500,
				upfrontPaid: 500,
				bnplAmount: 1000,
				loan: loan1._id,
				paymentMethod: "UPI",
				status: "SUCCESS",
				note: "Mode: SPLIT, Installments: 3 months",
			},
			{
				user: testUser._id,
				type: "PURCHASE",
				merchant: "Flipkart",
				totalAmount: 1500,
				upfrontPaid: 0,
				bnplAmount: 1500,
				loan: loan2._id,
				paymentMethod: "NONE",
				status: "SUCCESS",
				note: "Mode: FULL_BNPL, Installments: 3 months",
			},
			{
				user: testUser._id,
				type: "REPAYMENT",
				merchant: "Amazon",
				totalAmount: 334,
				upfrontPaid: 334,
				bnplAmount: 0,
				loan: loan1._id,
				installmentNumber: 1,
				paymentMethod: "UPI",
				status: "SUCCESS",
				note: "Installment payment for 1",
			},
		]);

		console.log("✅ Added sample loans and transactions for test@phonepay.com");
		console.log("   - Amazon: ₹1,000 BNPL (3 months) - 1 installment paid");
		console.log("   - Flipkart: ₹1,500 BNPL (3 months) - All pending\n");
		console.log("🎉 Seed completed successfully!\n");
		console.log("You can now login with:");
		console.log("   - demo@phonepay.com (Fresh account, no dues)");
		console.log("   - test@phonepay.com (Has 2 active loans with installments)\n");

		process.exit(0);
	} catch (err) {
		console.error("❌ Error seeding database:", err);
		process.exit(1);
	}
};

seedDatabase();
