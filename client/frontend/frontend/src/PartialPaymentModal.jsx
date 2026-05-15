import { useState, useEffect } from "react";
import API from "./services/api";

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

function fmtCurrency(amount) {
  return Number(amount).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });
}

function fmtDate(date, fullYear = false) {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(fullYear ? { year: "numeric" } : {}),
  });
}

export default function PartialPaymentModal({ isOpen, loan, installment, onClose, onSuccess, user }) {
  const [partialAmount, setPartialAmount] = useState("");
  const [rewardWallet, setRewardWallet] = useState(null);
  const [rewardRedeemAmount, setRewardRedeemAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState("info");
  const [rpLoaded, setRpLoaded] = useState(false);

  useEffect(() => {
    if (installment && isOpen) {
      setPartialAmount("");
      setRewardRedeemAmount("");
      setMessage("");
      setPaymentMethod("UPI");

      API.get("/rewards/me")
        .then((res) => setRewardWallet(res.data?.wallet || null))
        .catch(() => setRewardWallet(null));
    }
  }, [isOpen, installment]);

  // Load Razorpay script
  useEffect(() => {
    if (window.Razorpay) {
      setRpLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setRpLoaded(true);
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, []);

  if (!isOpen || !loan || !installment) return null;

  const amountDue = Math.max(0, installment.amount - (installment.paidAmount || 0));
  const targetAmount = Number(partialAmount) || 0;
  const walletBalance = Number(rewardWallet?.balance || 0);
  const maxRedeemAllowed = Math.max(0, Math.min(walletBalance, amountDue, targetAmount));
  const redeemAmount = Math.max(0, Math.min(Number(rewardRedeemAmount || 0), maxRedeemAllowed));
  const cashAmount = Math.max(0, targetAmount - redeemAmount);
  const remainingAfterPayment = amountDue - targetAmount;
  const isValidAmount = targetAmount > 0 && targetAmount <= amountDue;

  const handlePartialPayment = async () => {
    if (!isValidAmount) {
      setMessage("Enter a valid partial amount");
      setMsgType("error");
      return;
    }

      setIsProcessing(true);
      setMessage("");

      if (cashAmount <= 0) {
        const res = await API.post("/repayments/partial", {
          loanId: loan._id,
          installmentNumber: installment.installmentNumber,
          amount: 0,
          rewardRedeemAmount: redeemAmount,
          paymentMethod: "WALLET",
          transactionId: "reward-redemption",
        });

        const redeemed = Number(res.data?.redeemedRewards || 0);
        const cashback = Number(res.data?.rewards?.cashbackEarned || 0);
        setMessage(`Payment successful. You saved ${fmtCurrency(redeemed)}${cashback > 0 ? ` and earned ${fmtCurrency(cashback)} cashback` : ""}.`);
        setMsgType("success");
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 2000);
        setIsProcessing(false);
        return;
      }

      if (!RAZORPAY_KEY_ID) {
        setMessage("Missing Razorpay key. Set VITE_RAZORPAY_KEY_ID in .env");
        setMsgType("error");
        setIsProcessing(false);
        return;
      }

      if (!rpLoaded || !window.Razorpay) {
        setMessage("Razorpay is loading. Please wait and retry.");
        setMsgType("error");
        setIsProcessing(false);
        return;
      }

    try {

      // Step 1: Create Razorpay order
      const order = (await API.post("/payment/create-order", {
        amount: cashAmount,
        paymentMethod,
        loanId: loan._id,
        installmentNumber: installment.installmentNumber,
      })).data;

      // Step 2: Open Razorpay payment modal
      const rp = new window.Razorpay({
        key: RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "SnapCredit",
        description: `Partial payment for EMI ${installment.installmentNumber}`,
        order_id: order.id,
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
        },
        notes: {
          loanId: loan._id,
          installmentNumber: installment.installmentNumber,
          merchant: loan.merchant || "",
          paymentMethod,
        },
        theme: { color: "#FF6635" },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
            setMessage("Payment cancelled");
            setMsgType("info");
          },
        },
        handler: async (resp) => {
          try {
            // Step 3: Verify payment
            await API.post("/payment/verify", resp);

            // Step 4: Record partial payment in backend
            await API.post("/repayments/partial", {
              loanId: loan._id,
              installmentNumber: installment.installmentNumber,
              amount: cashAmount,
              rewardRedeemAmount: redeemAmount,
              paymentMethod,
              transactionId: resp.razorpay_payment_id,
            });

            setMessage(`Partial payment successful. You paid ${fmtCurrency(cashAmount)} and saved ${fmtCurrency(redeemAmount)} with rewards! 🎉`);
            setMsgType("success");

            // Auto-close after 2 seconds
            setTimeout(() => {
              if (onSuccess) onSuccess();
              onClose();
            }, 2000);
          } catch (err) {
            setMessage(err.response?.data?.message || "Payment verification failed");
            setMsgType("error");
          } finally {
            setIsProcessing(false);
          }
        },
      });

      rp.on("payment.failed", (resp) => {
        setIsProcessing(false);
        setMessage(resp.error?.description || "Payment failed");
        setMsgType("error");
      });

      rp.open();
    } catch (err) {
      setIsProcessing(false);
      setMessage(err.response?.data?.message || "Unable to start payment");
      setMsgType("error");
    }
  };

  const handleQuickAmount = (amount) => {
    setPartialAmount(String(Math.min(amount, amountDue)));
    setMessage("");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="partial-payment-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 style={{
            fontFamily: "Fraunces, serif",
            fontSize: 22,
            fontWeight: 800,
            color: "var(--navy)",
          }}>
            💳 Partial Payment
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Installment Info Card */}
          <div className="partial-payment-info-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {loan.merchant || "Generic Merchant"}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)", marginTop: 4 }}>
                  EMI {installment.installmentNumber}
                </div>
              </div>
              <span className="badge badge--pending">Due {fmtDate(installment.dueDate, true)}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
              <div className="partial-payment-stat">
                <div className="partial-payment-stat-label">Total Due</div>
                <div className="partial-payment-stat-value">{fmtCurrency(installment.amount)}</div>
              </div>
              <div className="partial-payment-stat">
                <div className="partial-payment-stat-label">Already Paid</div>
                <div className="partial-payment-stat-value partial-payment-stat-value--green">
                  {fmtCurrency(installment.paidAmount || 0)}
                </div>
              </div>
              <div className="partial-payment-stat">
                <div className="partial-payment-stat-label">Remaining</div>
                <div className="partial-payment-stat-value partial-payment-stat-value--orange">
                  {fmtCurrency(amountDue)}
                </div>
              </div>
              <div className="partial-payment-stat">
                <div className="partial-payment-stat-label">Original Due Date</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
                  {fmtDate(installment.dueDate, true)}
                </div>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div style={{ marginTop: 20 }}>
            <label style={{
              display: "block",
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}>
              How much do you want to pay?
            </label>

            <div style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              background: "var(--surface-white)",
              border: "2px solid var(--text-muted)",
              borderRadius: "var(--radius-md)",
              padding: "0 12px",
              transition: "border-color 0.2s",
            }}>
              <span style={{ fontSize: 18, color: "var(--brand-orange)", fontWeight: 700, marginRight: 8 }}>₹</span>
              <input
                type="number"
                value={partialAmount}
                onChange={e => {
                  setPartialAmount(e.target.value);
                  setMessage("");
                }}
                placeholder="0"
                min="0"
                max={amountDue}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--navy)",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                }}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                Redeem Rewards (optional)
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <input
                  type="number"
                  value={rewardRedeemAmount}
                  onChange={(e) => setRewardRedeemAmount(e.target.value)}
                  min="0"
                  max={maxRedeemAllowed}
                  placeholder="0"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--surface-border)",
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  className="partial-payment-btn"
                  onClick={() => setRewardRedeemAmount(String(maxRedeemAllowed))}
                  disabled={maxRedeemAllowed <= 0}
                >
                  Use Max
                </button>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
                Wallet balance: {fmtCurrency(walletBalance)} | Max redeem now: {fmtCurrency(maxRedeemAllowed)}
              </div>
            </div>

            {/* Quick Amount Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
              {[
                { label: "¼", amount: amountDue / 4 },
                { label: "½", amount: amountDue / 2 },
                { label: "¾", amount: (amountDue * 3) / 4 },
              ].map(({ label, amount }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleQuickAmount(amount)}
                  className="partial-payment-btn"
                >
                  {label} ({fmtCurrency(amount)})
                </button>
              ))}
            </div>
          </div>

          {/* Remaining Balance Preview */}
          {targetAmount > 0 && (
            <div style={{
              marginTop: 16,
              padding: "12px",
              background: "var(--surface-soft)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderLeft: "4px solid var(--brand-orange)",
            }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                  After this payment
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)", marginTop: 2 }}>
                  Remaining: {fmtCurrency(remainingAfterPayment)}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  Cash: {fmtCurrency(cashAmount)} + Rewards: {fmtCurrency(redeemAmount)}
                </div>
              </div>
              <div style={{
                fontSize: 28,
                fontWeight: 800,
                color: "var(--brand-orange)",
              }}>
                {fmtCurrency(targetAmount)}
              </div>
            </div>
          )}

          {/* Payment Method */}
          <div style={{ marginTop: 20 }}>
            <label style={{
              display: "block",
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}>
              Payment Method
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {["UPI", "Wallet", "Card"].map(method => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`partial-payment-method-btn ${paymentMethod === method ? "partial-payment-method-btn--active" : ""}`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          {message && (
            <div style={{ marginTop: 16 }} className={msgType === "error" ? "status-alert status-alert--error" : "status-alert status-alert--success"}>
              {message}
            </div>
          )}

          {/* Info Banner */}
          <div style={{
            marginTop: 16,
            padding: "12px",
            background: "var(--brand-orange-bg)",
            borderRadius: "var(--radius-sm)",
            fontSize: 13,
            color: "var(--brand-orange-dark)",
            lineHeight: 1.5,
          }}>
            ✅ <strong>Your remaining balance stays due on {fmtDate(installment.dueDate, true)}</strong> — no change to your original due date!
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn btn--secondary"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePartialPayment}
            disabled={!isValidAmount || isProcessing}
            className="btn btn--primary"
            style={{
              opacity: isValidAmount ? 1 : 0.6,
              cursor: isValidAmount && !isProcessing ? "pointer" : "not-allowed",
            }}
          >
            {isProcessing ? "Processing..." : cashAmount > 0 ? `Pay ${fmtCurrency(cashAmount)}` : `Settle ${fmtCurrency(targetAmount)} with Rewards`}
          </button>
        </div>
      </div>
    </div>
  );
}
