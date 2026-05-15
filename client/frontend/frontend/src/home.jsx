import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "./services/api";

/* ── data helpers ────────────────────────────────────────── */
const AMOUNT_OPTIONS = [5000, 10000, 25000, 50000, 100000, 150000, 200000];
const TENURE_OPTIONS = [3, 6, 9, 12, 18, 24];
const APR_OPTIONS    = [0, 8, 10, 12, 14, 16, 18, 20];

const DEFAULTS = { amount: 25000, tenure: 6, apr: 12 };

function calcEmi(principal, months, annualRate) {
  const r = Math.max(0, annualRate) / 1200;
  const emi = r === 0
    ? principal / months
    : (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return { emi, total: emi * months, interest: emi * months - principal };
}

function fmt(n) { return Math.round(n).toLocaleString("en-IN"); }

function getBillingWindow(dateValue = new Date()) {
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const cycleEndDay = Math.min(30, lastDay);

  return {
    start: new Date(year, month, 1, 0, 0, 0, 0),
    end: new Date(year, month, cycleEndDay, 23, 59, 59, 999),
    label: `1-${cycleEndDay}`,
  };
}

function StatusBadge({ status }) {
  const map = {
    paid:    "badge badge--paid",
    pending: "badge badge--pending",
    overdue: "badge badge--overdue",
  };
  const label = { paid: "Paid", pending: "Due Soon", overdue: "Overdue" };
  return <span className={map[status] || "badge badge--info"}>{label[status] || status}</span>;
}

/* ── score ring (SVG) ────────────────────────────────────── */
function MotionIllustration() {
  return (
    <div className="home-motion-art" aria-hidden="true">
      <div className="home-motion-blob home-motion-blob--one" />
      <div className="home-motion-blob home-motion-blob--two" />
      <div className="home-motion-images">
        <img
          src="/home/emi-card.svg"
          alt=""
          className="home-float-img home-float-img--main"
        />
        <img
          src="/home/secure-pay.svg"
          alt=""
          className="home-float-img home-float-img--secondary"
        />
      </div>
    </div>
  );
}

function FlyingElementsPreview() {
  return (
    <div className="card home-hero-photo-card" aria-hidden="true">
      <div className="home-hero-reel" role="presentation">
        <img src="/home/exact-home-image.png" alt="" className="home-hero-reel-phone" />

        <span className="home-reel-glow home-reel-glow--one" />
        <span className="home-reel-glow home-reel-glow--two" />
      </div>
    </div>
  );
}

function TodayAtGlanceCard({ billingWindow, rewardWallet, outstanding, dueTotal, futureDue, dueCount, nextEmi }) {
  return (
    <div className="card home-hero-side">
      <div className="home-hero-side-head">
        <div>
          <div className="home-hero-side-title">Today at a glance</div>
          <div className="home-hero-side-subtitle">Cycle {billingWindow.label} billing snapshot</div>
        </div>
        <span className="badge badge--pending">{rewardWallet?.tier || "BRONZE"}</span>
      </div>

      <div className="home-side-metrics">
        <div className="home-side-metric">
          <div className="home-side-metric-label">Total Outstanding</div>
          <div className="home-side-metric-value">₹{fmt(outstanding)}</div>
        </div>
        <div className="home-side-metric">
          <div className="home-side-metric-label">Current Due (Cycle {billingWindow.label})</div>
          <div className="home-side-metric-value">₹{fmt(dueTotal)}</div>
        </div>
        <div className="home-side-metric">
          <div className="home-side-metric-label">Future Due</div>
          <div className="home-side-metric-value">₹{fmt(futureDue)}</div>
        </div>
        <div className="home-side-metric">
          <div className="home-side-metric-label">EMIs in Current Due</div>
          <div className="home-side-metric-value">{dueCount}</div>
        </div>
      </div>

      <div className="home-next-emi">
        <div className="home-next-emi-label">Next EMI</div>
        {nextEmi ? (
          <div className="home-next-emi-row">
            <div>
              <div className="home-next-emi-merchant">{nextEmi.merchant} · EMI {nextEmi.installment}</div>
              <div className="home-next-emi-date">
                Due {new Date(nextEmi.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </div>
            </div>
            <div className="home-next-emi-amount">₹{fmt(nextEmi.amount)}</div>
          </div>
        ) : (
          <div className="home-next-emi-empty">No upcoming EMI at the moment.</div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
          Breakdown: Outstanding = Current Due + Future Due.
        </div>
      </div>
    </div>
  );
}

/* ── main component ──────────────────────────────────────── */
export default function Home({ user, onVerify }) {
  const navigate = useNavigate();
  
  // Redirect to checkout if bnplOrder exists
  useEffect(() => {
    const bnplOrder = localStorage.getItem("bnplOrder");
    if (bnplOrder) {
      console.log("Home.jsx - Detected bnplOrder, redirecting to /checkout");
      navigate("/checkout", { replace: true });
    }
  }, [navigate]);

  const creditLimit      = Number(user?.creditLimit      || 0);
  const availableCredit  = Number(user?.availableCredit  || 0);
  const outstanding      = Number(user?.outstandingBalance || 0);
  const isKycVerified = String(user?.verificationStatus || "").toLowerCase() === "verified";

  const [amount,  setAmount]  = useState(DEFAULTS.amount);
  const [tenure,  setTenure]  = useState(DEFAULTS.tenure);
  const [apr,     setApr]     = useState(DEFAULTS.apr);
  const [rewardWallet, setRewardWallet] = useState(null);
  const [rewardHistory, setRewardHistory] = useState([]);
  const [upcomingEmis, setUpcomingEmis] = useState([]);

  const { emi, total, interest } = useMemo(() => calcEmi(amount, tenure, apr), [amount, tenure, apr]);
  const actionableEmis = useMemo(() => {
    return upcomingEmis.filter((item) => item.status !== "paid");
  }, [upcomingEmis]);
  const billingWindow = useMemo(() => getBillingWindow(new Date()), []);
  const cycleDueEmis = useMemo(() => {
    return actionableEmis.filter((item) => {
      if (item.status === "overdue") return true;
      const due = new Date(item.dueDate);
      return due >= billingWindow.start && due <= billingWindow.end;
    });
  }, [actionableEmis, billingWindow]);
  const nextEmi = useMemo(() => {
    if (!actionableEmis.length) return null;
    return [...actionableEmis].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
  }, [actionableEmis]);
  const dueCount = cycleDueEmis.length;
  const dueTotal = cycleDueEmis.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const futureDue = Math.max(0, outstanding - dueTotal);

  const amortRows = useMemo(() => {
    const r = apr / 1200;
    return Array.from({ length: tenure }).reduce((rows, _, index) => {
      const prevBal = index === 0 ? amount : rows[index - 1].bal;
      const intPart = r === 0 ? 0 : prevBal * r;
      const prinPart = Math.min(prevBal, emi - intPart);
      const nextBal = Math.max(0, prevBal - prinPart);

      rows.push({
        month: index + 1,
        emi,
        prinPart,
        intPart,
        bal: nextBal,
      });

      return rows;
    }, []);
  }, [amount, tenure, apr, emi]);

  useEffect(() => {
    let ignore = false;

    const normalizeStatus = (status) => {
      const key = String(status || "").toLowerCase();
      if (key.includes("paid") && !key.includes("partial")) return "paid";
      if (key.includes("overdue")) return "overdue";
      return "pending";
    };

    Promise.allSettled([API.get("/rewards/me"), API.get("/loans/active")]).then(([rewardsResult, loansResult]) => {
      if (ignore) return;

      if (rewardsResult.status === "fulfilled") {
        const rewardsData = rewardsResult.value.data;
        setRewardWallet(rewardsData?.wallet || null);
        setRewardHistory(Array.isArray(rewardsData?.recentTransactions) ? rewardsData.recentTransactions : []);
      } else {
        setRewardWallet(null);
        setRewardHistory([]);
      }

      if (loansResult.status === "fulfilled") {
        const activeLoans = Array.isArray(loansResult.value.data) ? loansResult.value.data : [];
        const today = new Date();

        const realUpcoming = activeLoans
          .flatMap((loan) => {
            const merchant = loan?.merchant || "Merchant";
            const loanId = loan?._id || merchant;
            const installments = Array.isArray(loan?.installments) ? loan.installments : [];

            return installments
              .filter((inst) => {
                const status = normalizeStatus(inst?.status);
                const pendingAmount = Math.max(0, Number(inst?.amount || 0) - Number(inst?.paidAmount || 0));
                return status !== "paid" && pendingAmount > 0;
              })
              .map((inst) => {
                const rawDueDate = inst?.dueDate ? new Date(inst.dueDate) : null;
                const dueDate = rawDueDate && !Number.isNaN(rawDueDate.getTime()) ? rawDueDate : today;

                return {
                  id: `${loanId}-${inst?._id || inst?.installmentNumber || dueDate.toISOString()}`,
                  merchant,
                  installment: Number(inst?.installmentNumber || 0),
                  dueDate: dueDate.toISOString(),
                  amount: Math.max(0, Number(inst?.amount || 0) - Number(inst?.paidAmount || 0)),
                  status: normalizeStatus(inst?.status),
                };
              });
          })
          .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

        setUpcomingEmis(realUpcoming);
      } else {
        setUpcomingEmis([]);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  const rewardSourceLabel = (source) => {
    const map = {
      REPAYMENT_CASHBACK: "EMI Cashback",
      REFERRAL: "Referral Bonus",
      CAMPAIGN: "Campaign Reward",
      PURCHASE_REDEMPTION: "Purchase Redemption",
      EMI_REDEMPTION: "EMI Redemption",
      MANUAL: "Manual Adjustment",
    };
    return map[source] || String(source || "Reward");
  };

  const rewardTypeBadgeClass = (type) => {
    if (String(type || "").toUpperCase() === "REDEEMED") return "badge badge--overdue";
    return "badge badge--paid";
  };

  return (
    <div className="overview home-overview" style={{ gap: 28 }}>

      {/* ── PENDING SHOP ORDER ALERT ─────────────────────────────────────── */}
      {localStorage.getItem("bnplOrder") && (
        <div style={{
          background: "#fff3cd",
          border: "2px solid #ffc107",
          borderRadius: 8,
          padding: "16px 20px",
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div>
            <strong style={{ fontSize: 16, color: "#000" }}>📦 Pending Shop Order</strong>
            <p style={{ margin: "4px 0 0 0", color: "#333", fontSize: 14 }}>
              You have a pending BNPL order from the shop. Complete your payment now.
            </p>
          </div>
          <Link to="/checkout" style={{
            background: "#ff0000",
            color: "#fff",
            border: "none",
            padding: "8px 16px",
            borderRadius: 4,
            fontSize: 14,
            fontWeight: "bold",
            textDecoration: "none",
            cursor: "pointer"
          }}>
            Pay Now →
          </Link>
        </div>
      )}

      {/* ── 1. HERO ─────────────────────────────────────── */}
      <section className="home-hero-grid">
        <div className="home-hero-main card">
          <div className="home-hero-top">
            <div>
              <h1 className="home-hero-title">
                {user?.name ? `Hello, ${user.name.split(" ")[0]} 👋` : "Welcome to SnapCredit"}
              </h1>
              <p className="home-hero-date">
                {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p className="home-hero-subtitle">
                Track repayments, rewards, and monthly planning from one dashboard.
              </p>

              <div className="home-hero-actions">
                <a href="/subscription-hub" className="home-hero-btn home-hero-btn--primary">
                  Subscription Bundle <span aria-hidden="true">→</span>
                </a>
                <a href="/repayment" className="home-hero-btn home-hero-btn--secondary">
                  Pay EMI
                </a>
              </div>
            </div>
            <MotionIllustration />
          </div>

          <div className="home-hero-kpis">
            <div className="home-hero-kpi">
              <div className="home-hero-kpi-label">Available Credit</div>
              <div className="home-hero-kpi-value">₹{fmt(availableCredit)}</div>
            </div>
            <div className="home-hero-kpi">
              <div className="home-hero-kpi-label">Total Outstanding</div>
              <div className="home-hero-kpi-value">₹{fmt(outstanding)}</div>
            </div>
            <div className="home-hero-kpi">
              <div className="home-hero-kpi-label">Rewards Balance</div>
              <div className="home-hero-kpi-value">₹{fmt(rewardWallet?.balance || 0)}</div>
            </div>
          </div>
        </div>

        <FlyingElementsPreview />
      </section>

      {!isKycVerified && (
        <section className="card" style={{
          padding: 20,
          border: "1px solid var(--brand-orange-border)",
          background: "linear-gradient(135deg, rgba(255,102,55,0.08), rgba(255,255,255,0.96))",
          display: "grid",
          gap: 12,
          alignItems: "center",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--brand-orange-dark)" }}>
                Verification required
              </div>
              <h2 style={{ margin: "4px 0 6px", fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 800, color: "var(--navy)" }}>
                Complete KYC to unlock your credit limit
              </h2>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
                Verify your PAN, age, name, income, and employment details on this page. Once approved, your BNPL limit is assigned and you will not need to verify again.
              </p>
            </div>

            <button
              type="button"
              onClick={onVerify}
              className="home-hero-btn home-hero-btn--primary"
              style={{ minWidth: 210, justifyContent: "center" }}
            >
              Verify Now <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      )}

      {String(user?.employmentType || "").toLowerCase() === "student" && (
        <section className="card" style={{
          padding: 20,
          border: "1px solid rgba(10,19,43,0.1)",
          background: "linear-gradient(135deg, rgba(10,19,43,0.96), rgba(17,33,68,0.92))",
          color: "#fff",
          display: "grid",
          gap: 12,
          alignItems: "center",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}>
                Student BNPL verification
              </div>
              <h2 style={{ margin: "4px 0 6px", fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 800 }}>
                Complete guardian, college, and identity checks to unlock your student limit
              </h2>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.72)", fontSize: 14, lineHeight: 1.6 }}>
                The student verification flow calculates your trust score, suggests a BNPL limit, and records repayment surety details in one place.
              </p>
            </div>

            <Link
              to="/student-verification"
              className="home-hero-btn home-hero-btn--primary"
              style={{ minWidth: 240, justifyContent: "center", textDecoration: "none" }}
            >
              Open Student Module <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      )}

      {/* ── 2. REWARDS SECTION ──────────────────────────── */}
      <section className="home-reward-grid">
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ color: "var(--navy)" }}>Rewards Wallet</strong>
            <span className="badge badge--pending">{rewardWallet?.tier || "BRONZE"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Balance</div>
              <div className="value" style={{ fontWeight: 700, color: "var(--brand-orange)" }}>₹{fmt(rewardWallet?.balance || 0)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Earned</div>
              <div className="value" style={{ fontWeight: 700, color: "var(--navy)" }}>₹{fmt(rewardWallet?.totalEarned || 0)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>This Month</div>
              <div className="value" style={{ fontWeight: 700, color: "var(--text-secondary)" }}>₹{fmt(rewardWallet?.currentMonthEarned || 0)}</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
            Pay EMIs on time to earn higher cashback rates.
          </div>

          <div style={{ marginTop: 12, borderTop: "1px solid var(--surface-border)", paddingTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ color: "var(--navy)", fontSize: 13 }}>Rewards Timeline</strong>
              <a href="/history" className="view-all-link" style={{ fontSize: 12 }}>View all →</a>
            </div>

            {rewardHistory.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No reward activity yet. Make repayments to start earning cashback.</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {rewardHistory.slice(0, 4).map((entry) => {
                  const isRedeemed = String(entry.type || "").toUpperCase() === "REDEEMED";
                  return (
                    <div
                      key={entry._id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        border: "1px solid var(--surface-border)",
                        borderRadius: 8,
                        background: "var(--surface-white)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                          {rewardSourceLabel(entry.source)}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {new Date(entry.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="value" style={{ fontWeight: 700, color: isRedeemed ? "#B91C1C" : "#166534", fontSize: 13 }}>
                          {isRedeemed ? "-" : "+"}₹{fmt(entry.amount || 0)}
                        </div>
                        <span className={rewardTypeBadgeClass(entry.type)} style={{ marginTop: 3, display: "inline-block", fontSize: 10 }}>
                          {isRedeemed ? "Redeemed" : "Earned"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <TodayAtGlanceCard
          billingWindow={billingWindow}
          rewardWallet={rewardWallet}
          outstanding={outstanding}
          dueTotal={dueTotal}
          futureDue={futureDue}
          dueCount={dueCount}
          nextEmi={nextEmi}
        />
      </section>

      {/* ── 3. UPCOMING EMIs + RECENT TRANSACTIONS ───────── */}
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>

        {/* Upcoming EMIs */}
        <div className="card">
          <div className="section-header">
            <div>
              <div className="section-title">Upcoming EMIs</div>
              <div className="section-subtitle">Next 3 payments</div>
            </div>
            <a href="/repayment" className="view-all-link">Pay now →</a>
          </div>
          <div className="emi-list">
            {actionableEmis.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                No pending EMI installments found in your active loans.
              </div>
            ) : (
              actionableEmis.slice(0, 3).map((emi) => (
                <div key={emi.id} className="emi-item">
                  <div className={`emi-dot emi-dot--${emi.status}`} />
                  <div className="emi-details">
                    <div className="emi-merchant">{emi.merchant} · EMI {emi.installment}</div>
                    <div className="emi-due-date">
                      Due {new Date(emi.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div className="emi-amount">₹{fmt(emi.amount)}</div>
                    <StatusBadge status={emi.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="card">
          <div className="section-header">
            <div>
              <div className="section-title">Recent Activity</div>
              <div className="section-subtitle">Latest transactions</div>
            </div>
            <a href="/history" className="view-all-link">View all →</a>
          </div>
          <div className="txn-list">
            {[
              { id: 1, type: "PURCHASE",   merchant: "Flipkart",   amount: 11520, date: "2026-03-27" },
              { id: 2, type: "REPAYMENT",  merchant: "Repayment",  amount: 3840,  date: "2026-03-25" },
              { id: 3, type: "PURCHASE",   merchant: "Amazon Pay", amount: 6450,  date: "2026-03-22" },
              { id: 4, type: "REPAYMENT",  merchant: "Repayment",  amount: 2150,  date: "2026-03-20" },
            ].map(txn => (
              <div key={txn.id} className="txn-item">
                <div className={`txn-icon txn-icon--${txn.type === "PURCHASE" ? "purchase" : "repayment"}`}>
                  {txn.type === "PURCHASE" ? "🛒" : "💰"}
                </div>
                <div className="txn-details">
                  <div className="txn-merchant">{txn.merchant}</div>
                  <div className="txn-date">
                    {new Date(txn.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
                <div className={`txn-amount ${txn.type === "PURCHASE" ? "txn-amount--negative" : "txn-amount--positive"}`}>
                  {txn.type === "PURCHASE" ? "-" : "+"}₹{fmt(txn.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. EMI CALCULATOR ────────────────────────────── */}
      <div className="card emi-calc-shell">
        <div className="emi-calc-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 800, color: "var(--navy)", marginBottom: 4 }}>
              EMI Calculator
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Estimate your monthly instalments before you buy</p>
          </div>
          <button
            type="button"
            onClick={() => { setAmount(DEFAULTS.amount); setTenure(DEFAULTS.tenure); setApr(DEFAULTS.apr); }}
            style={{
              padding: "8px 16px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--surface-border)",
              background: "var(--surface-soft)", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)",
              cursor: "pointer", transition: "all 0.15s ease",
            }}
          >
            Reset
          </button>
        </div>

        <div className="calc-grid">
          {/* Purchase Amount */}
          <div className="calc-field">
            <label>Purchase amount</label>
            <div className="calc-value calc-value--orange">₹{fmt(amount)}</div>
            <input
              type="range" min={AMOUNT_OPTIONS[0]} max={AMOUNT_OPTIONS.at(-1)} step={5000}
              value={amount} onChange={e => setAmount(Number(e.target.value))}
              className="calc-slider calc-slider--orange"
            />
            <div className="quick-chips">
              {AMOUNT_OPTIONS.map(v => (
                <button key={v} type="button"
                  className={`quick-chip${amount === v ? " quick-chip--active" : ""}`}
                  onClick={() => setAmount(v)}
                >
                  {(v / 1000).toFixed(0)}K
                </button>
              ))}
            </div>
          </div>

          {/* Tenure */}
          <div className="calc-field">
            <label>Tenure (months)</label>
            <div className="calc-value calc-value--blue">{tenure} mo</div>
            <input
              type="range" min={TENURE_OPTIONS[0]} max={TENURE_OPTIONS.at(-1)} step={3}
              value={tenure} onChange={e => setTenure(Number(e.target.value))}
              className="calc-slider calc-slider--blue"
            />
            <div className="quick-chips">
              {TENURE_OPTIONS.map(v => (
                <button key={v} type="button"
                  className={`quick-chip${tenure === v ? " quick-chip--active" : ""}`}
                  onClick={() => setTenure(v)}
                >
                  {v}m
                </button>
              ))}
            </div>
          </div>

          {/* APR */}
          <div className="calc-field">
            <label>Interest rate (APR)</label>
            <div className="calc-value calc-value--rose">{apr}%</div>
            <input
              type="range" min={APR_OPTIONS[0]} max={APR_OPTIONS.at(-1)} step={2}
              value={apr} onChange={e => setApr(Number(e.target.value))}
              className="calc-slider calc-slider--rose"
            />
            <div className="quick-chips">
              {APR_OPTIONS.map(v => (
                <button key={v} type="button"
                  className={`quick-chip${apr === v ? " quick-chip--active" : ""}`}
                  onClick={() => setApr(v)}
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result Summary */}
        <div className="calc-results" style={{ marginTop: 20 }}>
          <div className="calc-result-card">
            <div className="calc-result-label">Monthly EMI</div>
            <div className="calc-result-value" style={{ color: "var(--brand-orange)" }}>₹{fmt(emi)}</div>
          </div>
          <div className="calc-result-card">
            <div className="calc-result-label">Total payable</div>
            <div className="calc-result-value" style={{ color: "#2563EB" }}>₹{fmt(total)}</div>
          </div>
          <div className="calc-result-card">
            <div className="calc-result-label">Interest cost</div>
            <div className="calc-result-value" style={{ color: "#E11D48" }}>₹{fmt(interest)}</div>
          </div>
        </div>

        {/* Account snapshot */}
        {creditLimit > 0 && (
          <div style={{
            marginTop: 16, padding: "12px 16px", borderRadius: "var(--radius-md)",
            background: "var(--brand-orange-bg)", border: "1px solid var(--brand-orange-border)",
            fontSize: 13, color: "var(--brand-orange-dark)", fontWeight: 500,
          }}>
            💳 Available credit: <strong>₹{fmt(availableCredit)}</strong> &nbsp;·&nbsp;
            Outstanding: <strong>₹{fmt(outstanding)}</strong> &nbsp;·&nbsp;
            Limit: <strong>₹{fmt(creditLimit)}</strong>
          </div>
        )}
      </div>

      {/* ── 5. AMORTIZATION TABLE ────────────────────────── */}
      <div className="card schedule-shell">
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 800, color: "var(--navy)" }}>
            Payment Schedule
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            Month-by-month breakdown for ₹{fmt(amount)} over {tenure} months at {apr}% APR
          </p>
        </div>
        <div className="amort-table-wrap">
          <table className="amort-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>EMI</th>
                <th>Principal</th>
                <th>Interest</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {amortRows.map(r => (
                <tr key={r.month}>
                  <td style={{ fontWeight: 600, color: "var(--text-secondary)" }}>M{r.month}</td>
                  <td style={{ color: "var(--brand-orange)", fontWeight: 600 }}>₹{fmt(r.emi)}</td>
                  <td style={{ color: "#2563EB" }}>₹{fmt(r.prinPart)}</td>
                  <td style={{ color: "#E11D48" }}>₹{fmt(r.intPart)}</td>
                  <td style={{ fontWeight: 700, color: "var(--navy)" }}>₹{fmt(r.bal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}