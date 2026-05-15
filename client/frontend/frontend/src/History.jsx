import { useEffect, useMemo, useState } from "react";
import API from "./services/api";

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const normalize = (value) => String(value || "").toLowerCase();

function History() {
  const [history, setHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await API.get("/history");
      setHistory(res.data || []);
    } catch (err) {
      console.log(err);
    }
  };

  const filteredHistory = useMemo(() => {
    const q = normalize(searchTerm.trim());
    const matchesSearch = (item) => {
      if (!q) return true;
      return [item.type, item.merchant, item.paymentMethod, item.status, item.totalAmount]
        .some((field) => normalize(field).includes(q));
    };

    const matchesType = (item) => typeFilter === "all" || normalize(item.type) === typeFilter;
    const matchesStatus = (item) => statusFilter === "all" || normalize(item.status) === statusFilter;

    return [...history]
      .filter((item) => matchesSearch(item) && matchesType(item) && matchesStatus(item))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [history, searchTerm, typeFilter, statusFilter]);

  const summary = useMemo(() => {
    const totalTransactions = filteredHistory.length;
    const purchases = filteredHistory.filter((item) => item.type?.toLowerCase() === "purchase").length;
    const repayments = filteredHistory.filter((item) => item.type?.toLowerCase() === "repayment").length;
    const totalVolume = filteredHistory.reduce((acc, item) => acc + Number(item.totalAmount || 0), 0);

    return { totalTransactions, purchases, repayments, totalVolume };
  }, [filteredHistory]);

  const getStatusClass = (status) => {
    const key = String(status || "").toLowerCase();
    if (key.includes("paid") || key.includes("success") || key.includes("completed")) return "history-status--paid";
    if (key.includes("pending")) return "history-status--pending";
    if (key.includes("overdue") || key.includes("failed")) return "history-status--overdue";
    return "history-status--neutral";
  };

  return (
    <div className="history-page">
      <div className="history-topbar">
        <div>
          <h2 className="history-title">Transaction History</h2>
          <p className="history-subtitle">Track all your purchases, repayments, and payment methods.</p>
        </div>
        <button className="history-refresh-btn" type="button" onClick={fetchHistory}>
          Refresh
        </button>
      </div>

      <div className="history-filter-bar">
        <div className="history-search-wrap">
          <input
            className="history-search-input"
            placeholder="Search merchant, type, status or amount"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select className="history-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          <option value="purchase">Purchase</option>
          <option value="repayment">Repayment</option>
        </select>

        <select className="history-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="history-summary-grid">
        <div className="history-summary-card history-anim-enter" style={{ animationDelay: "40ms" }}>
          <p className="history-summary-label">Total Transactions</p>
          <p className="history-summary-value">{summary.totalTransactions}</p>
        </div>
        <div className="history-summary-card history-anim-enter" style={{ animationDelay: "90ms" }}>
          <p className="history-summary-label">Purchases</p>
          <p className="history-summary-value history-summary-value--orange">{summary.purchases}</p>
        </div>
        <div className="history-summary-card history-anim-enter" style={{ animationDelay: "140ms" }}>
          <p className="history-summary-label">Repayments</p>
          <p className="history-summary-value history-summary-value--green">{summary.repayments}</p>
        </div>
        <div className="history-summary-card history-anim-enter" style={{ animationDelay: "190ms" }}>
          <p className="history-summary-label">Total Volume</p>
          <p className="history-summary-value history-summary-value--blue">{formatCurrency(summary.totalVolume)}</p>
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="history-empty">No transactions yet.</div>
      ) : (
        <>
        <div className="history-table-wrap history-desktop-only history-anim-enter" style={{ animationDelay: "220ms" }}>
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Merchant</th>
                <th>Total</th>
                <th>Upfront</th>
                <th>BNPL</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((item) => {
                const typeKey = String(item.type || "").toLowerCase();
                return (
                  <tr key={item._id}>
                    <td>{new Date(item.createdAt).toLocaleString("en-IN")}</td>
                    <td>
                      <span className={`history-type-chip ${typeKey === "repayment" ? "history-type-chip--repay" : "history-type-chip--purchase"}`}>
                        {item.type || "-"}
                      </span>
                    </td>
                    <td>{item.merchant || "-"}</td>
                    <td className="history-amount-cell">{formatCurrency(item.totalAmount)}</td>
                    <td>{formatCurrency(item.upfrontPaid)}</td>
                    <td>{formatCurrency(item.bnplAmount)}</td>
                    <td>{item.paymentMethod || "-"}</td>
                    <td>
                      <span className={`history-status-chip ${getStatusClass(item.status)}`}>
                        {item.status || "Unknown"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="history-mobile-list history-mobile-only">
          {filteredHistory.map((item, idx) => {
            const typeKey = String(item.type || "").toLowerCase();
            return (
              <article key={item._id} className="history-mobile-card history-anim-enter" style={{ animationDelay: `${220 + idx * 35}ms` }}>
                <div className="history-mobile-row">
                  <span className="history-mobile-date">{new Date(item.createdAt).toLocaleString("en-IN")}</span>
                  <span className={`history-status-chip ${getStatusClass(item.status)}`}>{item.status || "Unknown"}</span>
                </div>
                <div className="history-mobile-row" style={{ marginTop: 10 }}>
                  <span className={`history-type-chip ${typeKey === "repayment" ? "history-type-chip--repay" : "history-type-chip--purchase"}`}>
                    {item.type || "-"}
                  </span>
                  <strong className="history-amount-cell">{formatCurrency(item.totalAmount)}</strong>
                </div>
                <div className="history-mobile-meta">
                  <span>Merchant: {item.merchant || "-"}</span>
                  <span>Method: {item.paymentMethod || "-"}</span>
                  <span>Upfront: {formatCurrency(item.upfrontPaid)}</span>
                  <span>BNPL: {formatCurrency(item.bnplAmount)}</span>
                </div>
              </article>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}

export default History;
