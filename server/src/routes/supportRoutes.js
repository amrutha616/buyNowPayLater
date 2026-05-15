const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
	createTicket,
	getTickets,
	getTicketById,
	addMessage,
	closeTicket,
} = require("../controllers/supportController");

const router = express.Router();

router.post("/", authMiddleware, createTicket);
router.get("/", authMiddleware, getTickets);
router.get("/:ticketId", authMiddleware, getTicketById);
router.post("/:ticketId/message", authMiddleware, addMessage);
router.put("/:ticketId/close", authMiddleware, closeTicket);

module.exports = router;
