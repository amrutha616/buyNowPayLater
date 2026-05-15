import { useEffect, useMemo, useState } from "react";
import API from "./services/api";

export default function SupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [toast, setToast] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    subject: "",
    category: "payment_issue",
    description: "",
  });
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await API.get("/support");
      setTickets(res.data.tickets);
    } catch (err) {
      setToast("Failed to load tickets");
    } finally {
      setLoading(false);
    }
  };

  const createTicket = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post("/support", formData);
      setToast("Ticket created: " + res.data.ticket.ticketNumber);
      setFormData({ subject: "", category: "payment_issue", description: "" });
      setShowForm(false);
      fetchTickets();
    } catch (err) {
      setToast("Failed to create ticket");
    }
  };

  const addMessage = async () => {
    try {
      const res = await API.post(`/support/${selectedTicket._id}/message`, {
        message: newMessage,
      });
      setSelectedTicket(res.data.ticket);
      setNewMessage("");
      setToast("Message added");
    } catch (err) {
      setToast("Failed to add message");
    }
  };

  const filteredTickets = useMemo(() => {
    const q = String(searchTerm || "").trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((ticket) =>
      [ticket.ticketNumber, ticket.subject, ticket.status, ticket.category]
        .some((field) => String(field || "").toLowerCase().includes(q))
    );
  }, [tickets, searchTerm]);

  const ticketStats = useMemo(() => {
    const open = tickets.filter((t) => String(t.status || "").toLowerCase() === "open").length;
    const inProgress = tickets.filter((t) => String(t.status || "").toLowerCase().includes("progress")).length;
    const closed = tickets.filter((t) => String(t.status || "").toLowerCase() === "closed").length;
    return { total: tickets.length, open, inProgress, closed };
  }, [tickets]);

  const ticketStatusClass = (status) => {
    const key = String(status || "").toLowerCase();
    if (key === "closed" || key.includes("resolved")) return "support-status-chip--closed";
    if (key.includes("progress")) return "support-status-chip--progress";
    if (key === "open" || key.includes("pending")) return "support-status-chip--open";
    return "support-status-chip--neutral";
  };

  if (loading) return <div className="support-loading">Loading tickets...</div>;

  return (
    <div className="support-page">
      <section className="support-hero support-anim-enter" style={{ animationDelay: "30ms" }}>
        <div>
          <h2 className="support-title">Customer Support</h2>
          <p className="support-subtitle">Create and track support requests with quick updates from our team.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="support-primary-btn" type="button">
          {showForm ? "Cancel" : "Create New Ticket"}
        </button>
      </section>

      <div className="support-stats-grid support-anim-enter" style={{ animationDelay: "80ms" }}>
        <div className="support-stat-card">
          <p className="support-stat-label">Total Tickets</p>
          <p className="support-stat-value">{ticketStats.total}</p>
        </div>
        <div className="support-stat-card support-stat-card--open">
          <p className="support-stat-label">Open</p>
          <p className="support-stat-value">{ticketStats.open}</p>
        </div>
        <div className="support-stat-card support-stat-card--progress">
          <p className="support-stat-label">In Progress</p>
          <p className="support-stat-value">{ticketStats.inProgress}</p>
        </div>
        <div className="support-stat-card support-stat-card--closed">
          <p className="support-stat-label">Closed</p>
          <p className="support-stat-value">{ticketStats.closed}</p>
        </div>
      </div>

      <div className="support-toolbar support-anim-enter" style={{ animationDelay: "110ms" }}>
        <input
          className="support-search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by ticket ID, subject, status"
        />
      </div>

      {showForm && (
        <div className="support-form-card support-anim-enter" style={{ animationDelay: "140ms" }}>
          <form onSubmit={createTicket}>
            <label className="support-field">
              Subject
              <input
                className="support-input"
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
              />
            </label>
            <label className="support-field">
              Category
              <select
                className="support-input"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="payment_issue">Payment Issue</option>
                <option value="loan_inquiry">Loan Inquiry</option>
                <option value="refund">Refund</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="support-field">
              Description
              <textarea
                className="support-input support-textarea"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
              />
            </label>
            <button type="submit" className="support-primary-btn">
              Create Ticket
            </button>
          </form>
        </div>
      )}

      {selectedTicket ? (
        <div className="support-ticket-details support-anim-enter" style={{ animationDelay: "170ms" }}>
          <div className="support-ticket-head">
            <div>
              <h3 className="support-ticket-id">{selectedTicket.ticketNumber}</h3>
              <p className="support-ticket-subject">{selectedTicket.subject}</p>
            </div>
            <span className={`support-status-chip ${ticketStatusClass(selectedTicket.status)}`}>{selectedTicket.status}</span>
          </div>

          <div className="support-message-thread">
            {selectedTicket.messages.map((msg, idx) => {
              const userMsg = String(msg.from || "").toLowerCase() === "user";
              return (
              <div key={idx} className={`support-message-item ${userMsg ? "support-message-item--user" : "support-message-item--admin"}`}>
                <p className="support-message-from">{msg.from}</p>
                <p className="support-message-text">{msg.message}</p>
              </div>
            )})}
          </div>

          {selectedTicket.status !== "closed" && (
            <div className="support-reply-box">
              <textarea
                className="support-input support-textarea"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Add a message..."
              />
              <button onClick={addMessage} className="support-primary-btn support-send-btn" type="button">
                Send
              </button>
            </div>
          )}

          <button
            onClick={() => setSelectedTicket(null)}
            className="support-ghost-btn"
            type="button"
          >
            Back to Tickets
          </button>
        </div>
      ) : (
        <div className="support-ticket-grid support-anim-enter" style={{ animationDelay: "170ms" }}>
          {filteredTickets.map((ticket) => (
            <div
              key={ticket._id}
              className="support-ticket-card"
              onClick={() => setSelectedTicket(ticket)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedTicket(ticket);
                }
              }}
            >
              <div className="support-ticket-card-head">
                <h4 className="support-ticket-card-id">{ticket.ticketNumber}</h4>
                <span className={`support-status-chip ${ticketStatusClass(ticket.status)}`}>{ticket.status}</span>
              </div>
              <p className="support-ticket-card-subject">{ticket.subject}</p>
              <div className="support-ticket-card-meta">
                <span>{String(ticket.category || "general").replaceAll("_", " ")}</span>
                <span>Updated: {new Date(ticket.updatedAt).toLocaleDateString("en-IN")}</span>
              </div>
            </div>
          ))}
          {filteredTickets.length === 0 && (
            <div className="support-empty">No tickets match your search.</div>
          )}
        </div>
      )}

      {toast && <p className="support-toast">{toast}</p>}
    </div>
  );
}
