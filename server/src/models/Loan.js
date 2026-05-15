const mongoose = require("mongoose");

const partialPaymentSchema = new mongoose.Schema({
	amount: {
		type: Number,
		required: true,
		min: 0,
	},
	paidDate: {
		type: Date,
		default: Date.now,
	},
	paymentMethod: {
		type: String,
		default: "UPI",
	},
	transactionId: {
		type: String,
	},
});

const installmentSchema = new mongoose.Schema({
	installmentNumber: {
		type: Number,
		required: true,
	},
	amount: {
		type: Number,
		required: true,
		min: 0,
	},
	dueDate: {
		type: Date,
		required: true,
	},
	paidAmount: {
		type: Number,
		default: 0,
		min: 0,
	},
	partialPayments: [partialPaymentSchema],
	status: {
		type: String,
		enum: ["PENDING", "PAID", "OVERDUE", "PARTIALLY_PAID"],
		default: "PENDING",
	},
	paidDate: {
		type: Date,
	},
	lastPartialPaymentDate: {
		type: Date,
	},
});

const loanSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		merchant: {
			type: String,
			trim: true,
			default: "Generic Merchant",
		},
		category: {
			type: String,
			enum: ["GENERAL_PURCHASE", "SUBSCRIPTION_BUNDLE"],
			default: "GENERAL_PURCHASE",
		},
		principalAmount: {
			type: Number,
			required: true,
			min: 0,
		},
		annualInterestRate: {
			type: Number,
			default: 0,
			min: 0,
		},
		totalPayable: {
			type: Number,
			min: 0,
		},
		emiAmount: {
			type: Number,
			min: 0,
		},
		bundleDurationMonths: {
			type: Number,
			min: 1,
		},
		bundleItems: [
			{
				code: {
					type: String,
					required: true,
					trim: true,
				},
				name: {
					type: String,
					required: true,
					trim: true,
				},
				yearlyPrice: {
					type: Number,
					required: true,
					min: 0,
				},
			},
		],
		upfrontPaid: {
			type: Number,
			default: 0,
			min: 0,
		},
		bnplAmount: {
			type: Number,
			required: true,
			min: 0,
		},
		installmentPlan: {
			type: Number,
			enum: [1, 3, 6, 9, 12],
			default: 3,
		},
		installments: [installmentSchema],
		totalPaid: {
			type: Number,
			default: 0,
			min: 0,
		},
		remainingAmount: {
			type: Number,
			min: 0,
		},
		status: {
			type: String,
			enum: ["ACTIVE", "COMPLETED", "DEFAULTED"],
			default: "ACTIVE",
		},
		beneficiaryEmail: {
			type: String,
			trim: true,
			lowercase: true,
		},
		activationCode: {
			type: String,
			unique: true,
			sparse: true,
			trim: true,
		},
	},
	{
		timestamps: true,
	}
);

// Calculate remaining amount before saving
loanSchema.pre("save", function (next) {
	this.remainingAmount = this.bnplAmount - this.totalPaid;
	next();
});

module.exports = mongoose.model("Loan", loanSchema);
