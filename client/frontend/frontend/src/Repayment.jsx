import { useEffect, useMemo, useRef, useState } from "react";
import API from "./services/api";
import PartialPaymentModal from "./PartialPaymentModal";
import EMISelectionModal from "./EMISelectionModal";

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

function fmt(n) { return Number(n).toLocaleString("en-IN"); }

function fmtDate(d, withYear = false) {
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}),
  });
}

/* ── step indicator ──────────────────────────────────────── */
function StepIndicator({ step }) {
  const steps = ["Select", "Method", "Amount", "Confirm"];
  return (
    <div className="step-indicator">
      {steps.map((label, i) => {
        const n    = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={label} className="step">
            <div className={`step-circle${done ? " step-circle--done" : active ? " step-circle--active" : ""}`}>
              {done ? "✓" : n}
            </div>
            <span className={`step-label${active ? " step-label--active" : ""}`}>{label}</span>
            {i < steps.length - 1 && (
              <div className={`step-connector${done ? " step-connector--done" : ""}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── loan progress bar ───────────────────────────────────── */
function LoanCard({ loan, onInstallmentClick }) {
  const paidPct = loan.bnplAmount > 0
    ? Math.round((loan.totalPaid / loan.bnplAmount) * 100)
    : 0;

  const statusMap = {
    ACTIVE:    "badge badge--pending",
    COMPLETED: "badge badge--paid",
    OVERDUE:   "badge badge--overdue",
  };

  return (
    <div className="loan-card">
      <div className="loan-card-header">
        <div>
          <div className="loan-merchant-name">{loan.merchant || "Generic Merchant"}</div>
          <div className="loan-plan">{loan.installmentPlan}-month EMI plan</div>
        </div>
        <span className={statusMap[loan.status] || "badge badge--info"}>
          {loan.status}
        </span>
      </div>

      <div className="loan-stats">
        <div className="loan-stat">
          <div className="loan-stat-label">Total</div>
          <div className="loan-stat-value">₹{fmt(loan.bnplAmount)}</div>
        </div>
        <div className="loan-stat">
          <div className="loan-stat-label">Paid</div>
          <div className="loan-stat-value loan-stat-value--green">₹{fmt(loan.totalPaid)}</div>
        </div>
        <div className="loan-stat">
          <div className="loan-stat-label">Remaining</div>
          <div className="loan-stat-value loan-stat-value--orange">₹{fmt(loan.remainingAmount)}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 5 }}>
          <span>Repayment progress</span>
          <span style={{ fontWeight: 700, color: "var(--status-paid)" }}>{paidPct}%</span>
        </div>
        <div className="progress-bar-track">
          <div className="progress-bar-fill progress-bar-fill--green" style={{ width: `${paidPct}%` }} />
        </div>
        {loan.installments.filter(i => i.status === "PAID").length > 0 && (
          <div style={{ fontSize: 11, color: "var(--status-paid)", marginTop: 4, fontWeight: 600 }}>
            ✓ {loan.installments.filter(i => i.status === "PAID").length} of {loan.installments.length} installments paid
          </div>
        )}
      </div>

      {/* Pending installments */}
      {loan.installments.filter(i => i.status === "PENDING" || i.status === "PARTIALLY_PAID").length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Pending Installments
          </div>
          {loan.installments
            .filter(i => i.status === "PENDING" || i.status === "PARTIALLY_PAID")
            .slice(0, 4)
            .map(inst => (
              <div
                key={inst.installmentNumber}
                className="installment-chip"
                role="button"
                tabIndex={0}
                onClick={() => onInstallmentClick(loan, inst)}
                onKeyDown={e => e.key === "Enter" && onInstallmentClick(loan, inst)}
              >
                <div className="installment-chip-left">
                  <div className="installment-chip-num">
                    EMI {inst.installmentNumber}
                    {inst.status === "PARTIALLY_PAID" && " (Partial ✓)"}
                  </div>
                  <div className="installment-chip-date">Due {fmtDate(inst.dueDate, true)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="installment-chip-amount">₹{fmt(inst.amount)}</div>
                  <span style={{ fontSize: 11, color: "var(--brand-orange)", fontWeight: 700 }}>Pay →</span>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ── payment method button ───────────────────────────────── */
function PayMethodBtn({ icon, label, active, onClick }) {
  return (
    <button
      type="button"
      className={`pay-method-btn${active ? " pay-method-btn--active" : ""}`}
      onClick={onClick}
    >
      <span className="pay-method-icon">{icon}</span>
      <span className="pay-method-label">{label}</span>
    </button>
  );
}

/* ── main component ──────────────────────────────────────── */
function Repayment({ user, onUpdate }) {
  const [activeLoans,  setActiveLoans]  = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [rewardWallet, setRewardWallet] = useState(null);
  const [repayAmount,  setRepayAmount]  = useState("");
  const [rewardRedeemAmount, setRewardRedeemAmount] = useState("");
  const [merchant,     setMerchant]     = useState("");
  const [instKey,      setInstKey]      = useState("");
  const [payMethod,    setPayMethod]    = useState("UPI");
  const [message,      setMessage]      = useState("");
  const [msgType,      setMsgType]      = useState("info");
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [isPaying,     setIsPaying]     = useState(false);
  const [rpLoaded,     setRpLoaded]     = useState(
    typeof window !== "undefined" && Boolean(window.Razorpay)
  );
  
  /* Partial Payment Modal State */
  const [isPartialPaymentOpen, setIsPartialPaymentOpen] = useState(false);
  const [selectedLoanForPartial, setSelectedLoanForPartial] = useState(null);
  const [selectedInstallmentForPartial, setSelectedInstallmentForPartial] = useState(null);
  
  /* EMI Selection Modal State */
  const [isEMISelectionOpen, setIsEMISelectionOpen] = useState(false);

  const payFormRef = useRef(null);

  /* ── data fetching ─────────────────────────────────────── */
  useEffect(() => {
    Promise.all([
      API.get("/loans/active"),
      API.get("/history"),
      API.get("/rewards/me"),
    ])
      .then(([loansRes, historyRes, rewardsRes]) => {
        setActiveLoans(loansRes.data || []);
        setTransactions(Array.isArray(historyRes.data) ? historyRes.data : []);
        setRewardWallet(rewardsRes.data?.wallet || null);
      })
      .catch(() => {});
  }, [refreshKey]);

  /* ── Razorpay loader ───────────────────────────────────── */
  useEffect(() => {
    if (window.Razorpay) { setRpLoaded(true); return; }
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    const onLoad  = () => setRpLoaded(true);
    const onError = () => { setRpLoaded(false); setMessage("Unable to load Razorpay. Check internet and refresh."); setMsgType("error"); };
    if (existing) { existing.addEventListener("load", onLoad); existing.addEventListener("error", onError); return () => { existing.removeEventListener("load", onLoad); existing.removeEventListener("error", onError); }; }
    const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.async = true; s.onload = onLoad; s.onerror = onError;
    document.body.appendChild(s);
    return () => { s.onload = null; s.onerror = null; };
  }, []);

  /* ── derived data ──────────────────────────────────────── */
  const merchantDues = useMemo(() => {
    const map = {};
    activeLoans.forEach(l => {
      const m = (l.merchant || "Generic Merchant").trim() || "Generic Merchant";
      const rem = Number(l.remainingAmount || 0);
      if (rem > 0) map[m] = (map[m] || 0) + rem;
    });
    return Object.entries(map).map(([m, r]) => ({ merchant: m, remaining: r })).sort((a, b) => b.remaining - a.remaining);
  }, [activeLoans]);

  const instOptions = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return activeLoans
      .filter(l => !merchant || ((l.merchant || "Generic Merchant").trim() || "Generic Merchant") === merchant)
      .flatMap(l => (l.installments || [])
        .filter(i => i.status === "PENDING")
        .map(i => {
          const due = new Date(i.dueDate); due.setHours(0, 0, 0, 0);
          return {
            key: `${l._id}-${i.installmentNumber}`,
            loanId: l._id,
            merchant: (l.merchant || "Generic Merchant").trim() || "Generic Merchant",
            installmentNumber: i.installmentNumber,
            dueDate: i.dueDate,
            amountDue: Math.max(0, Number(i.amount || 0) - Number(i.paidAmount || 0)),
            daysUntilDue: Math.ceil((due - today) / 86400000),
          };
        })
        .filter(i => i.amountDue > 0)
      )
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [activeLoans, merchant]);

  const selectedInst = instKey ? instOptions.find(i => i.key === instKey) || null : null;
  const dueSoon = instOptions.filter(i => i.daysUntilDue >= 0 && i.daysUntilDue <= 3).slice(0, 3);
  const targetSettlementAmount = Number(repayAmount || 0);
  const maxPayableTarget = selectedInst ? selectedInst.amountDue
    : merchant ? Number(merchantDues.find(e => e.merchant === merchant)?.remaining || 0)
    : Number(user?.outstandingBalance || 0);
  const walletBalance = Number(rewardWallet?.balance || 0);
  const maxRedeemAllowed = Math.max(
    0,
    Math.min(walletBalance, Number(maxPayableTarget || 0), Number(targetSettlementAmount || 0))
  );
  const redeemAmount = Math.max(0, Math.min(Number(rewardRedeemAmount || 0), maxRedeemAllowed));
  const cashAmount = Math.max(0, targetSettlementAmount - redeemAmount);
  const totalSettlement = targetSettlementAmount;

  useEffect(() => {
    if (instKey && !instOptions.some(i => i.key === instKey)) setInstKey("");
  }, [instOptions, instKey]);

  useEffect(() => {
    if (selectedInst) setRepayAmount(String(selectedInst.amountDue));
  }, [selectedInst]);

  useEffect(() => { setInstKey(""); }, [merchant]);

  useEffect(() => {
    if (Number(rewardRedeemAmount || 0) > maxRedeemAllowed) {
      setRewardRedeemAmount(String(maxRedeemAllowed));
    }
  }, [maxRedeemAllowed, rewardRedeemAmount]);

  /* ── click on installment chip ─────────────────────────── */
  const handleInstClick = (loan, inst) => {
    const key = `${loan._id}-${inst.installmentNumber}`;
    const m   = (loan.merchant || "Generic Merchant").trim() || "Generic Merchant";
    setMerchant(m); setInstKey(key);
    setRepayAmount(String(Math.max(0, Number(inst.amount || 0) - Number(inst.paidAmount || 0))));
    payFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ── open partial payment modal ─────────────────────────── */
  const handleOpenPartialPayment = (loan, installment) => {
    setSelectedLoanForPartial(loan);
    setSelectedInstallmentForPartial(installment);
    setIsPartialPaymentOpen(true);
  };

  const handleClosePartialPayment = () => {
    setIsPartialPaymentOpen(false);
    setTimeout(() => {
      setSelectedLoanForPartial(null);
      setSelectedInstallmentForPartial(null);
    }, 300);
  };

  const handlePartialPaymentSuccess = () => {
    setRefreshKey(k => k + 1);
    if (onUpdate) onUpdate();
  };

  /* ── open EMI selection modal for partial payment ─────────────────────────── */
  const handleOpenEMISelection = () => {
    setIsEMISelectionOpen(true);
  };

  const handleCloseEMISelection = () => {
    setIsEMISelectionOpen(false);
  };

  const handleEMISelected = (loan, installment) => {
    handleOpenPartialPayment(loan, installment);
  };

  /* ── payment ───────────────────────────────────────────── */
  const handleRepay = async () => {
    const amount = Number(repayAmount || 0);
    if (amount <= 0) {
      setMessage("Enter a valid settlement amount");
      setMsgType("error");
      return;
    }

    if (merchant && maxPayableTarget <= 0) { setMessage(`No pending dues for ${merchant}`); setMsgType("error"); return; }
    if (maxPayableTarget > 0 && totalSettlement > maxPayableTarget) {
      setMessage(selectedInst ? `Exceeds EMI ${selectedInst.installmentNumber} due (₹${maxPayableTarget})` : `Exceeds pending dues (₹${maxPayableTarget})`);
      setMsgType("error"); return;
    }

    try {
      setIsPaying(true); setMessage("");
      if (cashAmount <= 0) {
        const res = await API.post("/repay", {
          amount: 0,
          rewardRedeemAmount: redeemAmount,
          paymentMethod: "WALLET",
          loanId: selectedInst?.loanId,
          installmentNumber: selectedInst?.installmentNumber,
          merchant: selectedInst ? undefined : merchant || undefined,
        });

        const redeemed = Number(res.data?.rewardRedeemedAmount || 0);
        const cashback = Number(res.data?.rewards?.cashbackEarned || 0);
        setMessage(`Repayment successful. You saved ₹${fmt(redeemed)} using rewards${cashback > 0 ? ` and earned ₹${fmt(cashback)} cashback` : ""}.`);
        setMsgType("success");
        setRepayAmount("");
        setRewardRedeemAmount("");
        setMerchant("");
        setInstKey("");
        setRefreshKey(k => k + 1);
        if (onUpdate) onUpdate();
        setIsPaying(false);
        return;
      }

      if (!RAZORPAY_KEY_ID) { setMessage("Missing Razorpay key. Set VITE_RAZORPAY_KEY_ID in .env"); setMsgType("error"); setIsPaying(false); return; }
      if (!rpLoaded || !window.Razorpay) { setMessage("Razorpay is loading. Please wait and retry."); setMsgType("error"); setIsPaying(false); return; }

      const order = (await API.post("/payment/create-order", {
        amount: cashAmount, paymentMethod: payMethod,
        loanId: selectedInst?.loanId, installmentNumber: selectedInst?.installmentNumber, merchant: merchant || "",
      })).data;

      const rp = new window.Razorpay({
        key: RAZORPAY_KEY_ID, amount: order.amount, currency: order.currency,
        name: "SnapCredit",
        description: selectedInst ? `EMI ${selectedInst.installmentNumber} repayment` : merchant ? `Repayment for ${merchant}` : "BNPL Repayment",
        order_id: order.id,
        prefill: { name: user?.name || "", email: user?.email || "" },
        notes: { loanId: selectedInst?.loanId || "", installmentNumber: selectedInst?.installmentNumber || "", merchant: merchant || "all", paymentMethod: payMethod },
        theme: { color: "#FF6635" },
        modal: { ondismiss: () => { setIsPaying(false); setMessage("Payment cancelled"); setMsgType("info"); } },
        handler: async resp => {
          try {
            await API.post("/payment/verify", resp);
            const res = await API.post("/repay", {
              amount: cashAmount, paymentMethod: payMethod,
              rewardRedeemAmount: redeemAmount,
              loanId: selectedInst?.loanId,
              installmentNumber: selectedInst?.installmentNumber,
              merchant: selectedInst ? undefined : merchant || undefined,
            });
            const redeemed = Number(res.data?.rewardRedeemedAmount || 0);
            const cashback = Number(res.data?.rewards?.cashbackEarned || 0);
            setMessage(`Repayment successful. You saved ₹${fmt(redeemed)} using rewards${cashback > 0 ? ` and earned ₹${fmt(cashback)} cashback` : ""}.`);
            setMsgType("success");
            setRepayAmount("");
            setRewardRedeemAmount("");
            setMerchant("");
            setInstKey("");
            setRefreshKey(k => k + 1);
            if (onUpdate) onUpdate();
          } catch (err) {
            setMessage(err.response?.data?.message || "Payment verification failed"); setMsgType("error");
          } finally { setIsPaying(false); }
        },
      });
      rp.on("payment.failed", r => { setIsPaying(false); setMessage(r.error?.description || "Payment failed"); setMsgType("error"); });
      rp.open();
    } catch (err) {
      setIsPaying(false); setMessage(err.response?.data?.message || "Unable to start payment"); setMsgType("error");
    }
  };

  /* ── compute active step ───────────────────────────────── */
  const activeStep = merchant || instKey ? (payMethod ? (repayAmount ? 4 : 3) : 2) : 1;

  const msgClass = msgType === "error" ? "status-alert status-alert--error"
    : msgType === "success" ? "status-alert status-alert--success"
    : "status-alert status-alert--info";

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="repayment-page">

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(24px, 3.5vw, 32px)", fontWeight: 800, color: "var(--navy)", marginBottom: 6 }}>
          Repayment Center
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)" }}>Manage your loans and pay installments securely</p>
      </div>

      {/* Summary stats */}
      {user && (
        <div className="stat-grid" style={{ marginBottom: 28 }}>
          <div className="stat-card stat-card--navy">
            <div className="stat-card-icon stat-card-icon--orange-light">📤</div>
            <div className="stat-label stat-label--light">Total Outstanding</div>
            <div className="stat-value stat-value--white">₹{fmt(user.outstandingBalance)}</div>
            <div className="stat-sub stat-sub--light">Pay back anytime</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon stat-card-icon--green">💳</div>
            <div className="stat-label">Available BNPL</div>
            <div className="stat-value stat-value--green">₹{fmt(user.availableCredit)}</div>
            <div className="stat-sub">Limit ₹{fmt(user.creditLimit)}</div>
          </div>
        </div>
      )}

      <div className="page-grid-sidebar">
        {/* ── LEFT: payment form ─────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Due-soon reminder */}
          {dueSoon.length > 0 && (
            <div className="due-soon-banner">
              <span className="due-soon-icon">⚠️</span>
              <div>
                <div className="due-soon-title">Upcoming EMI Reminder</div>
                {dueSoon.map(i => (
                  <div key={i.key} className="due-soon-item">
                    <span>{i.merchant} — EMI {i.installmentNumber}</span>
                    <strong>Due {fmtDate(i.dueDate, true)} ({i.daysUntilDue}d left)</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment form card */}
          <div className="pay-card" ref={payFormRef}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 800, color: "var(--navy)" }}>Make a Payment</h2>
              <span className={`badge ${rpLoaded ? "badge--paid" : "badge--pending"}`}>
                {rpLoaded ? "Razorpay Ready" : "Loading Razorpay"}
              </span>
            </div>

            {/* Partial Payment Quick Access - Always visible */}
            <button
              type="button"
              onClick={handleOpenEMISelection}
              style={{
                width: "100%",
                padding: "12px 16px",
                marginBottom: 20,
                background: "linear-gradient(135deg, var(--brand-orange), #E55A24)",
                border: "none",
                borderRadius: "var(--radius-md)",
                color: "white",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                transition: "transform 0.2s, box-shadow 0.2s",
                boxShadow: "0 4px 12px rgba(255, 102, 53, 0.2)",
                opacity: activeLoans.some(l => (l.installments || []).some(i => (i.status === "PENDING" || i.status === "PARTIALLY_PAID") && i.amount - (i.paidAmount || 0) > 0)) ? 1 : 0.5,
              }}
              disabled={!activeLoans.some(l => (l.installments || []).some(i => (i.status === "PENDING" || i.status === "PARTIALLY_PAID") && i.amount - (i.paidAmount || 0) > 0))}
              onMouseEnter={e => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(255, 102, 53, 0.3)";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 102, 53, 0.2)";
              }}
            >
              💳 Pay Partial Amount on EMI
              {activeLoans.length === 0 && " (No pending EMIs)"}
            </button>

            {/* Step indicator */}
            <StepIndicator step={activeStep} />

            {/* Step 1 — Select merchant / installment */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 10 }}>
                Step 1 — Select merchant & installment (optional)
              </div>

              {merchantDues.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">Merchant / Website</label>
                  <select className="repay-select" value={merchant} onChange={e => setMerchant(e.target.value)}>
                    <option value="">All merchants — auto-allocate by due date</option>
                    {merchantDues.map(e => (
                      <option key={e.merchant} value={e.merchant}>{e.merchant} — ₹{fmt(e.remaining)} pending</option>
                    ))}
                  </select>
                </div>
              )}

              {instOptions.length > 0 && (
                <div>
                  <label className="form-label">Specific installment (optional)</label>
                  <select className="repay-select" value={instKey} onChange={e => setInstKey(e.target.value)}>
                    <option value="">Auto-allocate by due date</option>
                    {instOptions.map(i => (
                      <option key={i.key} value={i.key}>
                        {i.merchant} — EMI {i.installmentNumber} — ₹{fmt(i.amountDue)} — Due {fmtDate(i.dueDate, true)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedInst && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--brand-orange-bg)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--brand-orange-dark)", fontWeight: 500 }}>
                  📅 Last date to pay: <strong>{fmtDate(selectedInst.dueDate, true)}</strong>
                </div>
              )}
            </div>

            {/* Step 2 — Payment method */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 10 }}>
                Step 2 — Payment method
              </div>
              <div className="pay-method-group">
                <PayMethodBtn icon="🔵" label="UPI"         active={payMethod === "UPI"}         onClick={() => setPayMethod("UPI")} />
                <PayMethodBtn icon="💳" label="Card"        active={payMethod === "CARD"}        onClick={() => setPayMethod("CARD")} />
                <PayMethodBtn icon="🏦" label="Net Banking" active={payMethod === "NET_BANKING"} onClick={() => setPayMethod("NET_BANKING")} />
              </div>
            </div>

            {/* Step 3 — Amount */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 10 }}>
                Step 3 — Amount (₹)
              </div>
              <div className="amount-input-wrap">
                <span className="amount-currency">₹</span>
                <input
                  type="number"
                  className="amount-input"
                  value={repayAmount}
                  onChange={e => setRepayAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label className="form-label">Redeem Rewards (optional)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                  <input
                    type="number"
                    className="repay-select"
                    value={rewardRedeemAmount}
                    onChange={(e) => setRewardRedeemAmount(e.target.value)}
                    min="0"
                    max={maxRedeemAllowed}
                    placeholder="0"
                  />
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setRewardRedeemAmount(String(maxRedeemAllowed))}
                    disabled={maxRedeemAllowed <= 0}
                  >
                    Use Max
                  </button>
                </div>
                <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
                  Wallet: ₹{fmt(walletBalance)} | Max redeem now: ₹{fmt(maxRedeemAllowed)}
                </p>
                <p style={{ marginTop: 4, fontSize: 12, color: "var(--brand-orange-dark)", fontWeight: 600 }}>
                  Total settlement: ₹{fmt(totalSettlement)}
                </p>
                <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
                  Cash to pay now: ₹{fmt(cashAmount)}
                </p>
              </div>
            </div>

            {/* Step 4 — Pay CTA */}
            <button
              className="pay-cta"
              type="button"
              onClick={handleRepay}
              disabled={isPaying || totalSettlement <= 0 || (cashAmount > 0 && !rpLoaded)}
            >
              {isPaying ? (
                <>
                  <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
                  Processing…
                </>
              ) : cashAmount > 0 ? `Pay ₹${fmt(cashAmount)} with Razorpay 🔒` : "Settle using Rewards"}
            </button>
            <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
              {rpLoaded ? "🔒 Secure checkout powered by Razorpay" : "⏳ Preparing Razorpay checkout…"}
            </p>

            {message && <p className={msgClass} style={{ marginTop: 10 }}>{message}</p>}
          </div>

          {/* Recent transactions */}
          <div className="pay-card">
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 800, color: "var(--navy)" }}>Recent Transactions</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>Where your money was used</p>
            </div>
            {transactions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🧾</div>
                <div className="empty-state-title">No transactions yet</div>
                <div className="empty-state-desc">Start using BNPL to see your history here</div>
              </div>
            ) : (
              <div className="txn-list">
                {transactions.slice(0, 8).map(txn => (
                  <div key={txn._id} className="txn-item">
                    <div className={`txn-icon txn-icon--${txn.type === "PURCHASE" ? "purchase" : "repayment"}`}>
                      {txn.type === "PURCHASE" ? "🛒" : "💰"}
                    </div>
                    <div className="txn-details">
                      <div className="txn-merchant">
                        {txn.type === "PURCHASE" ? txn.merchant || "Purchase" : "Repayment"}
                      </div>
                      <div className="txn-date">
                        {new Date(txn.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <div>
                      {txn.type === "PURCHASE" ? (
                        <div className="txn-amount txn-amount--negative">-₹{fmt(txn.bnplAmount || txn.amount)}</div>
                      ) : (
                        <div className="txn-amount txn-amount--positive">+₹{fmt(txn.amount)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: active loans sidebar ────────────────── */}
        <div>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 800, color: "var(--navy)" }}>Active Loans</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>Click any installment to pay it</p>
          </div>

          {activeLoans.length === 0 ? (
            <div className="loan-card">
              <div className="empty-state" style={{ padding: "24px 0" }}>
                <div className="empty-state-icon">🎉</div>
                <div className="empty-state-title">No active loans</div>
                <div className="empty-state-desc">You have no pending loans. Start shopping!</div>
              </div>
            </div>
          ) : (
            activeLoans.map(loan => (
              <LoanCard 
                key={loan._id} 
                loan={loan} 
                onInstallmentClick={handleInstClick}
              />
            ))
          )}
        </div>
      </div>

      {/* spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* EMI Selection Modal */}
      <EMISelectionModal
        isOpen={isEMISelectionOpen}
        activeLoans={activeLoans}
        onClose={handleCloseEMISelection}
        onSelectEMI={handleEMISelected}
      />

      {/* Partial Payment Modal */}
      <PartialPaymentModal
        isOpen={isPartialPaymentOpen}
        loan={selectedLoanForPartial}
        installment={selectedInstallmentForPartial}
        onClose={handleClosePartialPayment}
        onSuccess={handlePartialPaymentSuccess}
        user={user}
      />
    </div>
  );
}

export default Repayment;
