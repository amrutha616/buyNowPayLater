const mongoose = require("mongoose");

const emiScheduleSchema = new mongoose.Schema(
	{
		loanId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Loan",
			required: true,
		},
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		installmentNumber: {
			type: Number,
			required: true,
		},
		dueDate: {
			type: Date,
			required: true,
		},
		amount: {
			type: Number,
			required: true,
		},
		principal: {
			type: Number,
			required: true,
		},
		interest: {
			type: Number,
			required: true,
		},
		status: {
			type: String,
			enum: ["pending", "paid", "overdue", "partially_paid"],
			default: "pending",
		},
		paidDate: {
			type: Date,
		},
		paidAmount: {
			type: Number,
			default: 0,
		},
		penaltyCharges: {
			type: Number,
			default: 0,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("EMISchedule", emiScheduleSchema);
