const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		type: {
			type: String,
			enum: ["PURCHASE", "REPAYMENT"],
			required: true,
		},
		merchant: {
			type: String,
			trim: true,
			default: "Generic Merchant",
		},
		totalAmount: {
			type: Number,
			required: true,
			min: 0,
		},
		upfrontPaid: {
			type: Number,
			default: 0,
			min: 0,
		},
		bnplAmount: {
			type: Number,
			default: 0,
			min: 0,
		},
		loan: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Loan",
		},
		installmentNumber: {
			type: Number,
		},
		paymentMethod: {
			type: String,
			enum: ["UPI", "CARD", "NET_BANKING", "NONE"],
			default: "UPI",
		},
		status: {
			type: String,
			enum: ["SUCCESS", "FAILED"],
			default: "SUCCESS",
		},
		note: {
			type: String,
			trim: true,
			default: "",
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("Transaction", transactionSchema);
