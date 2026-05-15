const mongoose = require("mongoose");

const paymentReminderSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		emiScheduleId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "EMISchedule",
			required: true,
		},
		dueDate: {
			type: Date,
			required: true,
		},
		reminderDaysBefore: {
			type: Number,
			default: 3,
		},
		reminderSentAt: {
			type: Date,
		},
		status: {
			type: String,
			enum: ["scheduled", "sent", "paid", "skipped"],
			default: "scheduled",
		},
		reminderChannel: {
			type: String,
			enum: ["email", "sms", "push"],
			default: "email",
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("PaymentReminder", paymentReminderSchema);
