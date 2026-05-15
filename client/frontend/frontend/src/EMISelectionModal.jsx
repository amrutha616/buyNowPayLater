import { useMemo } from "react";

function fmt(n) { return Number(n).toLocaleString("en-IN"); }

function fmtDate(d, withYear = false) {
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}),
  });
}

export default function EMISelectionModal({ isOpen, activeLoans, onClose, onSelectEMI }) {
  // Get available EMIs for partial payment (PENDING or PARTIALLY_PAID)
  const availableEMIs = useMemo(() => {
    const result = [];
    activeLoans.forEach(loan => {
      const pendingEMIs = (loan.installments || []).filter(
        inst => (inst.status === "PENDING" || inst.status === "PARTIALLY_PAID") && 
                 (inst.amount - (inst.paidAmount || 0)) > 0
      );
      
      pendingEMIs.forEach(inst => {
        result.push({
          loanId: loan._id,
          merchant: loan.merchant || "Generic Merchant",
          installmentNumber: inst.installmentNumber,
          dueDate: inst.dueDate,
          amount: inst.amount,
          paidAmount: inst.paidAmount || 0,
          remainingAmount: inst.amount - (inst.paidAmount || 0),
          status: inst.status,
          installment: inst,
          loan: loan,
        });
      });
    });
    return result.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [activeLoans]);

  const handleSelectEMI = (emi) => {
    onSelectEMI(emi.loan, emi.installment);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="emi-selection-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 style={{
            fontFamily: "Fraunces, serif",
            fontSize: 22,
            fontWeight: 800,
            color: "var(--navy)",
          }}>
            📋 Select EMI for Partial Payment
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {availableEMIs.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "var(--text-muted)",
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No EMIs available</div>
              <div style={{ fontSize: 13 }}>All your EMIs are fully paid!</div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {availableEMIs.map((emi) => (
                <button
                  key={`${emi.loanId}-${emi.installmentNumber}`}
                  type="button"
                  onClick={() => handleSelectEMI(emi)}
                  style={{
                    padding: "16px",
                    background: "var(--surface-white)",
                    border: "2px solid var(--surface-border)",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    textAlign: "left",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = "var(--brand-orange)";
                    e.currentTarget.style.background = "var(--brand-orange-bg)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = "var(--surface-border)";
                    e.currentTarget.style.background = "var(--surface-white)";
                  }}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "start",
                    marginBottom: 12,
                  }}>
                    <div>
                      <div style={{
                        fontSize: 13,
                        color: "var(--text-muted)",
                        fontWeight: 500,
                        marginBottom: 4,
                      }}>
                        {emi.merchant}
                      </div>
                      <div style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "var(--navy)",
                      }}>
                        EMI {emi.installmentNumber}
                      </div>
                    </div>
                    <span style={{
                      background: emi.status === "PARTIALLY_PAID" ? "var(--brand-orange-bg)" : "var(--surface-soft)",
                      color: emi.status === "PARTIALLY_PAID" ? "var(--brand-orange-dark)" : "var(--text-secondary)",
                      padding: "4px 10px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}>
                      {emi.status === "PARTIALLY_PAID" ? "Partial ✓" : "Pending"}
                    </span>
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    marginBottom: 12,
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500, marginBottom: 2 }}>
                        Total Due
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>
                        ₹{fmt(emi.amount)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500, marginBottom: 2 }}>
                        Remaining
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--brand-orange)" }}>
                        ₹{fmt(emi.remainingAmount)}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}>
                    <span>📅 Due {fmtDate(emi.dueDate, true)}</span>
                    <span style={{ fontSize: 14, color: "var(--brand-orange)", fontWeight: 700 }}>
                      Select →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn btn--secondary"
            style={{ flex: 1 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
