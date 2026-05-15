import { useMemo, useState, useEffect } from "react";
import API from "./services/api";

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const monthFormatter = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });

export default function EMISchedule() {
  const [schedule, setSchedule] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("due-date-asc");

  useEffect(() => {
    fetchEMISchedule();
  }, []);

  const fetchEMISchedule = async () => {
    try {
      const res = await API.get("/emi/user");
      setSchedule(res.data.emis || []);
      setStats(res.data.stats);
    } catch (err) {
      console.error("EMI fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusClass = (status) => {
    const key = String(status || "").toLowerCase();
    if (key.includes("paid") || key.includes("success") || key.includes("completed")) return "emi-status--paid";
    if (key.includes("pending")) return "emi-status--pending";
    if (key.includes("overdue") || key.includes("failed")) return "emi-status--overdue";
    return "emi-status--neutral";
  };

  const groupedSchedule = useMemo(() => {
    const sorted = [...schedule].sort((a, b) => {
      const dateA = new Date(a.dueDate).getTime();
      const dateB = new Date(b.dueDate).getTime();

      if (sortBy === "due-date-desc") return dateB - dateA;
      if (sortBy === "amount-desc") return Number(b.amount || 0) - Number(a.amount || 0);
      if (sortBy === "amount-asc") return Number(a.amount || 0) - Number(b.amount || 0);
      if (sortBy === "status") return String(a.status || "").localeCompare(String(b.status || ""));
      return dateA - dateB;
    });

    return sorted.reduce((acc, emi) => {
      const key = monthFormatter.format(new Date(emi.dueDate));
      if (!acc[key]) acc[key] = [];
      acc[key].push(emi);
      return acc;
    }, {});
  }, [schedule, sortBy]);

  const monthGroups = Object.entries(groupedSchedule);

  if (loading) return <div className="emi-loading">Loading EMI schedule...</div>;

  return (
    <div className="emi-schedule-page">
      <section className="emi-hero">
        <div>
          <h2 className="emi-hero-title">EMI Schedule</h2>
          <p className="emi-hero-subtitle">Your month-wise repayment plan with status tracking.</p>
        </div>
        <button type="button" className="emi-refresh-btn" onClick={fetchEMISchedule}>
          Refresh
        </button>
      </section>

      <div className="emi-toolbar">
        <label className="emi-sort-label" htmlFor="emi-sort">Sort</label>
        <select id="emi-sort" className="emi-sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="due-date-asc">Due Date: Earliest First</option>
          <option value="due-date-desc">Due Date: Latest First</option>
          <option value="amount-desc">Amount: High to Low</option>
          <option value="amount-asc">Amount: Low to High</option>
          <option value="status">Status</option>
        </select>
      </div>

      {stats && (
        <div className="emi-stats-grid emi-anim-enter" style={{ animationDelay: "60ms" }}>
          <div className="emi-stat-card emi-stat-card--pending emi-anim-enter" style={{ animationDelay: "80ms" }}>
            <p className="emi-stat-label">Pending</p>
            <h3 className="emi-stat-value">{stats.pending}</h3>
          </div>
          <div className="emi-stat-card emi-stat-card--paid emi-anim-enter" style={{ animationDelay: "120ms" }}>
            <p className="emi-stat-label">Paid</p>
            <h3 className="emi-stat-value">{stats.paid}</h3>
          </div>
          <div className="emi-stat-card emi-stat-card--overdue emi-anim-enter" style={{ animationDelay: "160ms" }}>
            <p className="emi-stat-label">Overdue</p>
            <h3 className="emi-stat-value">{stats.overdue}</h3>
          </div>
          <div className="emi-stat-card emi-stat-card--due emi-anim-enter" style={{ animationDelay: "200ms" }}>
            <p className="emi-stat-label">Total Due</p>
            <h3 className="emi-stat-value">{formatCurrency(stats.totalDue)}</h3>
          </div>
        </div>
      )}

      {schedule.length === 0 ? (
        <div className="emi-empty">No EMI records found for this account.</div>
      ) : (
        <div className="emi-group-list">
          {monthGroups.map(([monthLabel, emis], monthIdx) => (
            <section key={monthLabel} className="emi-group emi-anim-enter" style={{ animationDelay: `${220 + monthIdx * 60}ms` }}>
              <header className="emi-group-title">{monthLabel}</header>

              <div className="emi-table-wrap emi-desktop-only">
                <table className="emi-table">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">EMI #</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3">Principal</th>
                      <th className="px-4 py-3">Interest</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emis.map((emi) => (
                      <tr key={emi._id}>
                        <td className="px-4 py-3">{emi.installmentNumber}</td>
                        <td className="px-4 py-3">{new Date(emi.dueDate).toLocaleDateString("en-IN")}</td>
                        <td className="px-4 py-3">{formatCurrency(emi.principal)}</td>
                        <td className="px-4 py-3">{formatCurrency(emi.interest)}</td>
                        <td className="px-4 py-3" style={{ fontWeight: 700 }}>{formatCurrency(emi.amount)}</td>
                        <td className="px-4 py-3">
                          <span className={`emi-status-chip ${getStatusClass(emi.status)}`}>{emi.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="emi-mobile-list emi-mobile-only">
                {emis.map((emi, idx) => (
                  <article key={emi._id} className="emi-mobile-card emi-anim-enter" style={{ animationDelay: `${260 + idx * 35}ms` }}>
                    <div className="emi-mobile-row">
                      <span>EMI #{emi.installmentNumber}</span>
                      <span className={`emi-status-chip ${getStatusClass(emi.status)}`}>{emi.status}</span>
                    </div>
                    <div className="emi-mobile-row emi-mobile-row--muted">
                      <span>Due: {new Date(emi.dueDate).toLocaleDateString("en-IN")}</span>
                      <strong>{formatCurrency(emi.amount)}</strong>
                    </div>
                    <div className="emi-mobile-meta">
                      <span>Principal: {formatCurrency(emi.principal)}</span>
                      <span>Interest: {formatCurrency(emi.interest)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
