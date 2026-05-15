import { useEffect, useMemo, useState } from "react";
import { motion as Motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import API from "./services/api";

const CHART_COLORS = ["#ec4899", "#06b6d4", "#6366f1", "#f59e0b", "#22c55e"];

const reveal = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function Analytics() {
  const [spending, setSpending] = useState(null);
  const [creditScore, setCreditScore] = useState(null);
  const [loanStats, setLoanStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [spendRes, scoreRes, loanRes] = await Promise.all([
        API.get("/analytics/spending"),
        API.get("/analytics/credit-score"),
        API.get("/analytics/loans"),
      ]);
      setSpending(spendRes.data.analytics);
      setCreditScore(scoreRes.data);
      setLoanStats(loanRes.data.analytics);
    } catch (err) {
      console.error("Analytics fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const spendingTrendData = useMemo(() => {
    if (!spending) return [];

    const totalSpent = Number(spending.totalSpent || 0);
    const totalPaid = Number(spending.totalPaid || 0);
    const remaining = Math.max(0, totalSpent - totalPaid);

    return [
      { label: "Week 1", spent: Math.round(totalSpent * 0.2), paid: Math.round(totalPaid * 0.15) },
      { label: "Week 2", spent: Math.round(totalSpent * 0.4), paid: Math.round(totalPaid * 0.35) },
      { label: "Week 3", spent: Math.round(totalSpent * 0.7), paid: Math.round(totalPaid * 0.65) },
      { label: "Week 4", spent: totalSpent, paid: totalPaid, remaining },
    ];
  }, [spending]);

  const categoryPieData = useMemo(() => {
    if (!spending?.categoryBreakdown) return [];

    return spending.categoryBreakdown.map((item, index) => ({
      name: item.category,
      value: Number(item.amount || 0),
      percentage: Number(item.percentage || 0),
      fill: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [spending]);

  const utilization = useMemo(() => {
    const borrowed = Number(loanStats?.totalBorrowed || 0);
    const outstanding = Number(loanStats?.outstandingBalance || 0);
    if (borrowed <= 0) return 0;
    return Math.min(100, Math.round((outstanding / borrowed) * 100));
  }, [loanStats]);

  if (loading) {
    return <div className="loading rounded-2xl border border-white/60 bg-white/60 p-5 text-slate-700 backdrop-blur">Loading analytics...</div>;
  }

  return (
    <div className="analytics-page rounded-[2rem] border border-white/60 bg-white/45 p-5 shadow-[0_30px_90px_rgba(236,72,153,0.2)] backdrop-blur-xl sm:p-6">
      <section className="overview mb-5 rounded-2xl border border-white/70 bg-white/70 p-5">
        <h2 className="text-2xl font-bold text-slate-900">Financial Analytics</h2>
        <p className="muted mt-1 text-slate-700">Animated spending, credit, and loan insights</p>
      </section>

      <div className="analytics-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Motion.div variants={reveal} initial="hidden" animate="show" transition={{ duration: 0.3 }} className="card rounded-2xl border border-white/70 bg-white/70 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Credit health</h3>
          <div className="score-display mt-2">
            <div className="score-number text-4xl font-bold text-slate-900">{creditScore?.creditScore || 0}</div>
            <div className="score-category text-sm text-fuchsia-600">{creditScore?.category || "Unknown"}</div>
          </div>
          <p className="muted mt-2 text-xs text-slate-600">
            {creditScore?.scoreType === "simulated_bureau"
              ? `Simulated PAN bureau result • Approval score ${creditScore?.approvalScore || 0}/1000`
              : `Internal approval score • Out of ${creditScore?.scaleMax || 1000}`}
          </p>
        </Motion.div>

        {spending && (
          <>
            <Motion.div variants={reveal} initial="hidden" animate="show" transition={{ delay: 0.06, duration: 0.3 }} className="card rounded-2xl border border-white/70 bg-white/70 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Monthly spending</h3>
              <p className="big-number mt-2 text-3xl font-bold text-slate-900">₹{spending.totalSpent}</p>
              <p className="muted mt-1 text-xs text-slate-600">Current cycle</p>
            </Motion.div>

            <Motion.div variants={reveal} initial="hidden" animate="show" transition={{ delay: 0.1, duration: 0.3 }} className="card rounded-2xl border border-white/70 bg-white/70 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Amount repaid</h3>
              <p className="big-number mt-2 text-3xl font-bold text-emerald-600">₹{spending.totalPaid}</p>
              <p className="muted mt-1 text-xs text-slate-600">Repayments done</p>
            </Motion.div>
          </>
        )}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Motion.section variants={reveal} initial="hidden" animate="show" transition={{ delay: 0.12, duration: 0.35 }} className="rounded-2xl border border-white/70 bg-white/70 p-5">
          <h3 className="text-lg font-semibold text-slate-900">Spending vs repayment trend</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spendingTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.65} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0.06} />
                  </linearGradient>
                  <linearGradient id="paidGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                <Area type="monotone" dataKey="spent" name="Spent" stroke="#ec4899" fill="url(#spendGradient)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="paid" name="Paid" stroke="#06b6d4" fill="url(#paidGradient)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Motion.section>

        <Motion.section variants={reveal} initial="hidden" animate="show" transition={{ delay: 0.16, duration: 0.35 }} className="rounded-2xl border border-white/70 bg-white/70 p-5">
          <h3 className="text-lg font-semibold text-slate-900">Category mix</h3>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryPieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3} isAnimationActive />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {categoryPieData.map((item) => (
            <div key={item.name} className="mt-2 flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2 text-slate-700">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                {item.name}
              </span>
              <span className="font-medium text-slate-900">{item.percentage}%</span>
            </div>
          ))}
        </Motion.section>
      </div>

      {loanStats && (
        <Motion.section variants={reveal} initial="hidden" animate="show" transition={{ delay: 0.2, duration: 0.35 }} className="mt-5 rounded-2xl border border-white/70 bg-white/70 p-5">
          <h3 className="text-lg font-semibold text-slate-900">Loan utilization</h3>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
            <Motion.div
              initial={{ width: 0 }}
              animate={{ width: `${utilization}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-rose-500 to-orange-400"
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/80 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Active loans</p>
              <p className="text-xl font-semibold text-slate-900">{loanStats.activeLoans}</p>
            </div>
            <div className="rounded-xl bg-white/80 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Total borrowed</p>
              <p className="text-xl font-semibold text-slate-900">₹{loanStats.totalBorrowed}</p>
            </div>
            <div className="rounded-xl bg-white/80 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Outstanding</p>
              <p className="text-xl font-semibold text-rose-600">₹{loanStats.outstandingBalance}</p>
            </div>
          </div>
        </Motion.section>
      )}

      {spending?.categoryBreakdown && (
        <section className="category-breakdown mt-5 rounded-2xl border border-white/70 bg-white/65 p-5">
          <h3 className="text-lg font-semibold text-slate-900">Quick category breakdown</h3>
          {spending.categoryBreakdown.map((cat) => (
            <div key={cat.category} className="category-bar mt-3">
              <div className="category-name text-sm text-slate-700">{cat.category}</div>
              <div className="bar-container mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="bar h-full rounded-full bg-fuchsia-500" style={{ width: `${cat.percentage}%` }}></div>
              </div>
              <div className="category-amount mt-1 text-xs text-slate-600">₹{cat.amount} ({cat.percentage}%)</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
