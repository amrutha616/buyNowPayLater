const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema(
	{
		ticketNumber: {
			type: String,
			unique: true,
			required: true,
		},
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		subject: {
			type: String,
			required: true,
		},
		category: {
			type: String,
			enum: ["payment_issue", "loan_inquiry", "refund", "other"],
			required: true,
		},
		description: {
			type: String,
			required: true,
		},
		priority: {
			type: String,
			enum: ["low", "medium", "high"],
			default: "medium",
		},
		status: {
			type: String,
			enum: ["open", "in_progress", "awaiting_response", "resolved", "closed"],
			default: "open",
		},
		messages: [
			{
				from: String,
				message: String,
				timestamp: { type: Date, default: Date.now },
				attachments: [String],
			},
		],
		assignedTo: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		resolutionNotes: String,
		closedAt: Date,
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
