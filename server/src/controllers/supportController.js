/**
 * Support Ticket Controller
 */

const SupportTicket = require("../models/SupportTicket");
const crypto = require("crypto");

exports.createTicket = async (req, res) => {
	try {
		const { subject, category, description } = req.body;

		const ticketNumber = "TKT-" + crypto.randomBytes(4).toString("hex").toUpperCase();

		const ticket = await SupportTicket.create({
			ticketNumber,
			userId: req.user.id,
			subject,
			category,
			description,
			messages: [
				{
					from: "user",
					message: description,
					timestamp: new Date(),
				},
			],
		});

		res.status(201).json({ message: "Ticket created", ticket });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.getTickets = async (req, res) => {
	try {
		const tickets = await SupportTicket.find({ userId: req.user.id }).sort({
			createdAt: -1,
		});
		res.json({ tickets });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.getTicketById = async (req, res) => {
	try {
		const { ticketId } = req.params;
		const ticket = await SupportTicket.findById(ticketId);

		if (!ticket || ticket.userId.toString() !== req.user.id) {
			return res.status(404).json({ message: "Ticket not found" });
		}

		res.json({ ticket });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.addMessage = async (req, res) => {
	try {
		const { ticketId } = req.params;
		const { message } = req.body;

		const ticket = await SupportTicket.findById(ticketId);
		if (!ticket) {
			return res.status(404).json({ message: "Ticket not found" });
		}

		ticket.messages.push({
			from: "user",
			message,
			timestamp: new Date(),
		});

		ticket.status = "awaiting_response";
		await ticket.save();

		res.json({ message: "Message added", ticket });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.closeTicket = async (req, res) => {
	try {
		const { ticketId } = req.params;

		const ticket = await SupportTicket.findByIdAndUpdate(
			ticketId,
			{ status: "closed", closedAt: new Date() },
			{ new: true }
		);

		res.json({ message: "Ticket closed", ticket });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
