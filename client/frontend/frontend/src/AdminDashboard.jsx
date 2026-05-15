
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import API from "./services/api";
import "./AdminDashboard.css";

const money = new Intl.NumberFormat("en-IN", {
	style: "currency",
	currency: "INR",
	maximumFractionDigits: 0,
});
const nums = new Intl.NumberFormat("en-IN");

const formatCurrency = (value) => money.format(Number(value || 0));
const formatNumber = (value) => nums.format(Number(value || 0));
const formatDate = (value) => {
	if (!value) return "-";
	const dt = new Date(value);
	if (Number.isNaN(dt.getTime())) return "-";
	return dt.toLocaleDateString("en-IN", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
};

const CHART_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#f97316"];
const TOOLTIP_STYLE = {
	background: "#1e293b",
	border: "1px solid #334155",
	borderRadius: "8px",
	color: "#e2e8f0",
};
const SEVERITY_COLORS = {
	low: "#10b981",
	medium: "#f59e0b",
	high: "#ef4444",
	critical: "#7f1d1d",
};
const SEVERITY_CLASS = {
	low: "severity-low",
	medium: "severity-medium",
	high: "severity-high",
	critical: "severity-critical",
};

function DashboardTab() {
	const [overview, setOverview] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		setLoading(true);
		API.get("/admin/overview")
			.then((res) => {
				setOverview(res.data);
				setError("");
			})
			.catch((err) => {
				setError(err.response?.data?.message || "Failed to load overview");
			})
			.finally(() => setLoading(false));
	}, []);

	if (loading) return <div className="admin-loading">Loading overview...</div>;
	if (error) return <div className="admin-error">{error}</div>;
	if (!overview) return null;

	const summary = overview.summary || {};
	const monthlyTrend = overview.monthlyTrend || [];
	const paymentMethods = overview.distributions?.paymentMethods || [];
	const topMerchants = overview.distributions?.topMerchants || [];
	const recentTx = overview.recentTransactions || [];

	const kpis = [
		{
			label: "Total Users",
			value: formatNumber(summary.users?.total),
			sub: `+${formatNumber(summary.users?.newThisMonth)} this month`,
			cls: "kpi-blue",
		},
		{
			label: "Eligible Users",
			value: formatNumber(summary.users?.eligibleUsers),
			sub: `${summary.users?.eligibilityRatePct || 0}% eligibility`,
			cls: "kpi-green",
		},
		{
			label: "Active Loans",
			value: formatNumber(summary.loans?.active),
			sub: `${formatNumber(summary.loans?.defaulted)} defaulted`,
			cls: "kpi-orange",
		},
		{
			label: "Completed Loans",
			value: formatNumber(summary.loans?.completed),
			sub: "Repayments closed",
			cls: "kpi-indigo",
		},
		{
			label: "Disbursed",
			value: formatCurrency(summary.finance?.totalBnplDisbursed),
			sub: "Total BNPL volume",
			cls: "kpi-purple",
		},
		{
			label: "Revenue",
			value: formatCurrency(summary.finance?.totalRevenue),
			sub: `Fees ${formatCurrency(summary.finance?.totalPlatformFees)}`,
			cls: "kpi-teal",
		},
		{
			label: "Fraud Alerts",
			value: formatNumber(summary.ops?.unresolvedFraudAlerts),
			sub: `${formatNumber(summary.ops?.totalFraudAlerts)} total`,
			cls: "kpi-red",
		},
	];

	return (
		<div>
			<div className="admin-kpi-grid">
				{kpis.map((item) => (
					<article key={item.label} className={`admin-kpi-card ${item.cls}`}>
						<p className="kpi-label">{item.label}</p>
						<p className="kpi-value">{item.value}</p>
						<p className="kpi-sub">{item.sub}</p>
					</article>
				))}
			</div>

			<div className="admin-charts-row">
				<div className="admin-chart-card wide">
					<h3>Monthly Purchases vs Repayments</h3>
					<ResponsiveContainer width="100%" height={280}>
						<BarChart data={monthlyTrend} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
							<CartesianGrid strokeDasharray="3 3" stroke="#334155" />
							<XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} />
							<YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
							<Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
							<Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
							<Bar dataKey="purchaseVolume" name="Purchases" fill="#6366f1" radius={[4, 4, 0, 0]} />
							<Bar dataKey="repaymentVolume" name="Repayments" fill="#22d3ee" radius={[4, 4, 0, 0]} />
						</BarChart>
					</ResponsiveContainer>
				</div>

				<div className="admin-chart-card">
					<h3>Payment Methods</h3>
					<ResponsiveContainer width="100%" height={280}>
						<PieChart>
							<Pie
								data={paymentMethods}
								dataKey="count"
								nameKey="method"
								cx="50%"
								cy="50%"
								outerRadius={90}
								label={({ method, percent }) => `${method} ${(percent * 100).toFixed(0)}%`}
								labelLine={false}
							>
								{paymentMethods.map((_, index) => (
									<Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
								))}
							</Pie>
							<Tooltip contentStyle={TOOLTIP_STYLE} />
						</PieChart>
					</ResponsiveContainer>
				</div>
			</div>

			<div className="admin-charts-row">
				<div className="admin-table-card wide">
					<h3>Top Merchants</h3>
					<table className="admin-table">
						<thead>
							<tr>
								<th>Merchant</th>
								<th>Transactions</th>
								<th>Volume</th>
							</tr>
						</thead>
						<tbody>
							{topMerchants.slice(0, 8).map((row) => (
								<tr key={row.merchant}>
									<td>{row.merchant}</td>
									<td>{formatNumber(row.transactionCount)}</td>
									<td>{formatCurrency(row.totalVolume)}</td>
								</tr>
							))}
							{topMerchants.length === 0 && (
								<tr>
									<td colSpan={3} className="muted-cell">No merchant data</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>

				<div className="admin-table-card">
					<h3>Recent Transactions</h3>
					<table className="admin-table">
						<thead>
							<tr>
								<th>User</th>
								<th>Type</th>
								<th>Amount</th>
								<th>Date</th>
							</tr>
						</thead>
						<tbody>
							{recentTx.slice(0, 6).map((row) => (
								<tr key={row._id || row.id}>
									<td>{row.userName || row.user?.name || "-"}</td>
									<td>
										<span className={`type-badge type-${String(row.type || "").toLowerCase()}`}>
											{row.type}
										</span>
									</td>
									<td>{formatCurrency(row.totalAmount)}</td>
									<td>{formatDate(row.createdAt)}</td>
								</tr>
							))}
							{recentTx.length === 0 && (
								<tr>
									<td colSpan={4} className="muted-cell">No transactions</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}

function UsersTab() {
	const [payload, setPayload] = useState({ users: [], page: 1, total: 0, totalPages: 1 });
	const [page, setPage] = useState(1);
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(false);
	const [downloading, setDownloading] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			setPage(1);
			setSearch(searchInput.trim());
		}, 350);
		return () => clearTimeout(timer);
	}, [searchInput]);

	useEffect(() => {
		setLoading(true);
		API.get("/admin/users", {
			params: {
				page,
				limit: 12,
				search,
				sortBy: "createdAt",
				order: "desc",
			},
		})
			.then((res) => setPayload(res.data))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [page, search]);

	const downloadCsv = async () => {
		setDownloading(true);
		try {
			const res = await API.get("/admin/users/export", {
				params: { search },
				responseType: "blob",
			});
			const contentDisposition = res.headers["content-disposition"] || "";
			const matched = contentDisposition.match(/filename="?([^";]+)"?/i);
			const filename = matched?.[1] || "bnpl-users-export.csv";

			const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
			const url = window.URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			console.error("CSV export failed", err);
		} finally {
			setDownloading(false);
		}
	};

	return (
		<div className="admin-table-card">
			<div className="admin-table-toolbar">
				<input
					className="admin-search-input"
					placeholder="Search users by name or email"
					value={searchInput}
					onChange={(event) => setSearchInput(event.target.value)}
				/>
				<button className="btn-download" onClick={downloadCsv} disabled={downloading}>
					{downloading ? "Preparing..." : "Export CSV"}
				</button>
			</div>

			{loading ? (
				<div className="admin-loading">Loading users...</div>
			) : (
				<>
					<table className="admin-table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Email</th>
								<th>Employment</th>
								<th>Credit Limit</th>
								<th>Score</th>
								<th>Risk %</th>
								<th>Eligible</th>
								<th>Joined</th>
							</tr>
						</thead>
						<tbody>
							{payload.users.map((row) => (
								<tr key={row._id}>
									<td>{row.name}</td>
									<td>{row.email}</td>
									<td>{row.employmentType || "-"}</td>
									<td>{formatCurrency(row.creditLimit)}</td>
									<td>{row.creditScore || "-"}</td>
									<td>{typeof row.riskScore === "number" ? `${Number(row.riskScore).toFixed(1)}%` : "-"}</td>
									<td>{row.isEligible ? <span className="badge-yes">Yes</span> : <span className="badge-no">No</span>}</td>
									<td>{formatDate(row.createdAt)}</td>
								</tr>
							))}
							{payload.users.length === 0 && (
								<tr>
									<td colSpan={8} className="muted-cell">No users found</td>
								</tr>
							)}
						</tbody>
					</table>

					<div className="admin-pagination">
						<button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
							Prev
						</button>
						<span>
							Page {payload.page} of {payload.totalPages} ({formatNumber(payload.total)} total)
						</span>
						<button disabled={page >= payload.totalPages} onClick={() => setPage((current) => current + 1)}>
							Next
						</button>
					</div>
				</>
			)}
		</div>
	);
}

function LoansTab() {
	const [payload, setPayload] = useState({ loans: [], page: 1, total: 0, totalPages: 1 });
	const [stats, setStats] = useState({ byStatus: [], byMerchant: [], byPlan: [] });
	const [status, setStatus] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			setPage(1);
			setSearch(searchInput.trim());
		}, 350);
		return () => clearTimeout(timer);
	}, [searchInput]);

	useEffect(() => {
		setLoading(true);
		Promise.all([
			API.get("/admin/loans", {
				params: {
					page,
					limit: 15,
					status: status || undefined,
					search: search || undefined,
				},
			}),
			API.get("/admin/loans/stats"),
		])
			.then(([loanRes, statRes]) => {
				setPayload(loanRes.data);
				setStats(statRes.data || { byStatus: [], byMerchant: [], byPlan: [] });
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [page, status, search]);

	const statusClassMap = {
		ACTIVE: "status-active",
		COMPLETED: "status-completed",
		DEFAULTED: "status-defaulted",
	};

	return (
		<div>
			<div className="admin-charts-row">
				<div className="admin-chart-card">
					<h3>Loans by Status</h3>
					<ResponsiveContainer width="100%" height={220}>
						<PieChart>
							<Pie
								data={stats.byStatus || []}
								dataKey="count"
								nameKey="status"
								cx="50%"
								cy="50%"
								outerRadius={80}
								label={({ status: itemStatus, count }) => `${itemStatus}: ${count}`}
								labelLine={false}
							>
								{(stats.byStatus || []).map((_, index) => (
									<Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
								))}
							</Pie>
							<Tooltip contentStyle={TOOLTIP_STYLE} />
						</PieChart>
					</ResponsiveContainer>
				</div>

				<div className="admin-chart-card wide">
					<h3>Top Merchants by BNPL</h3>
					<ResponsiveContainer width="100%" height={220}>
						<BarChart data={stats.byMerchant || []} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
							<CartesianGrid strokeDasharray="3 3" stroke="#334155" />
							<XAxis dataKey="merchant" tick={{ fill: "#94a3b8", fontSize: 11 }} />
							<YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
							<Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
							<Bar dataKey="totalBnpl" name="BNPL" fill="#6366f1" radius={[4, 4, 0, 0]} />
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>

			<div className="admin-table-card">
				<div className="admin-table-toolbar">
					<input
						className="admin-search-input"
						placeholder="Search by user name or email"
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
					/>
					<select
						className="admin-select"
						value={status}
						onChange={(event) => {
							setPage(1);
							setStatus(event.target.value);
						}}
					>
						<option value="">All Statuses</option>
						<option value="ACTIVE">Active</option>
						<option value="COMPLETED">Completed</option>
						<option value="DEFAULTED">Defaulted</option>
					</select>
				</div>

				{loading ? (
					<div className="admin-loading">Loading loans...</div>
				) : (
					<>
						<table className="admin-table">
							<thead>
								<tr>
									<th>User</th>
									<th>Merchant</th>
									<th>BNPL</th>
									<th>Paid</th>
									<th>Remaining</th>
									<th>Plan</th>
									<th>Status</th>
									<th>Date</th>
								</tr>
							</thead>
							<tbody>
								{payload.loans.map((row) => (
									<tr key={row.id}>
										<td>
											<div>{row.userName}</div>
											<small className="muted-cell">{row.userEmail}</small>
										</td>
										<td>{row.merchant}</td>
										<td>{formatCurrency(row.bnplAmount)}</td>
										<td>{formatCurrency(row.totalPaid)}</td>
										<td>{formatCurrency(row.remainingAmount)}</td>
										<td>{row.installmentPlan} mo</td>
										<td>
											<span className={`status-badge ${statusClassMap[row.status] || ""}`}>{row.status}</span>
										</td>
										<td>{formatDate(row.createdAt)}</td>
									</tr>
								))}
								{payload.loans.length === 0 && (
									<tr>
										<td colSpan={8} className="muted-cell">No loans found</td>
									</tr>
								)}
							</tbody>
						</table>
						<div className="admin-pagination">
							<button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
								Prev
							</button>
							<span>
								Page {payload.page} of {payload.totalPages} ({formatNumber(payload.total)} total)
							</span>
							<button disabled={page >= payload.totalPages} onClick={() => setPage((current) => current + 1)}>
								Next
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function TransactionsTab() {
	const [payload, setPayload] = useState({ transactions: [], page: 1, total: 0, totalPages: 1 });
	const [type, setType] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			setPage(1);
			setSearch(searchInput.trim());
		}, 350);
		return () => clearTimeout(timer);
	}, [searchInput]);

	useEffect(() => {
		setLoading(true);
		API.get("/admin/transactions", {
			params: {
				page,
				limit: 20,
				type: type || undefined,
				search: search || undefined,
			},
		})
			.then((res) => setPayload(res.data))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [page, type, search]);

	const volumeByDay = useMemo(() => {
		const bucket = {};
		for (const row of payload.transactions || []) {
			const day = (row.createdAt || "").slice(0, 10);
			if (!day) continue;
			if (!bucket[day]) {
				bucket[day] = { day, amount: 0, count: 0 };
			}
			bucket[day].amount += Number(row.totalAmount || 0);
			bucket[day].count += 1;
		}
		return Object.values(bucket).sort((a, b) => String(a.day).localeCompare(String(b.day)));
	}, [payload.transactions]);

	return (
		<div>
			<div className="admin-chart-card full">
				<h3>Daily Transaction Volume (Current Page)</h3>
				<ResponsiveContainer width="100%" height={240}>
					<AreaChart data={volumeByDay} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
						<defs>
							<linearGradient id="txnGrad" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor="#22d3ee" stopOpacity={0.45} />
								<stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
							</linearGradient>
						</defs>
						<CartesianGrid strokeDasharray="3 3" stroke="#334155" />
						<XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 10 }} />
						<YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
						<Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
						<Area type="monotone" dataKey="amount" stroke="#22d3ee" fill="url(#txnGrad)" strokeWidth={2} />
					</AreaChart>
				</ResponsiveContainer>
			</div>

			<div className="admin-table-card">
				<div className="admin-table-toolbar">
					<input
						className="admin-search-input"
						placeholder="Search by user or merchant"
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
					/>
					<select
						className="admin-select"
						value={type}
						onChange={(event) => {
							setPage(1);
							setType(event.target.value);
						}}
					>
						<option value="">All Types</option>
						<option value="PURCHASE">Purchase</option>
						<option value="REPAYMENT">Repayment</option>
					</select>
				</div>

				{loading ? (
					<div className="admin-loading">Loading transactions...</div>
				) : (
					<>
						<table className="admin-table">
							<thead>
								<tr>
									<th>User</th>
									<th>Type</th>
									<th>Merchant</th>
									<th>Total</th>
									<th>Upfront</th>
									<th>BNPL</th>
									<th>Method</th>
									<th>Date</th>
								</tr>
							</thead>
							<tbody>
								{payload.transactions.map((row) => (
									<tr key={row.id}>
										<td>
											<div>{row.userName}</div>
											<small className="muted-cell">{row.userEmail}</small>
										</td>
										<td>
											<span className={`type-badge type-${String(row.type || "").toLowerCase()}`}>{row.type}</span>
										</td>
										<td>{row.merchant || "-"}</td>
										<td>{formatCurrency(row.totalAmount)}</td>
										<td>{formatCurrency(row.upfrontPaid)}</td>
										<td>{formatCurrency(row.bnplAmount)}</td>
										<td>{row.paymentMethod || "-"}</td>
										<td>{formatDate(row.createdAt)}</td>
									</tr>
								))}
								{payload.transactions.length === 0 && (
									<tr>
										<td colSpan={8} className="muted-cell">No transactions found</td>
									</tr>
								)}
							</tbody>
						</table>

						<div className="admin-pagination">
							<button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
								Prev
							</button>
							<span>
								Page {payload.page} of {payload.totalPages} ({formatNumber(payload.total)} total)
							</span>
							<button disabled={page >= payload.totalPages} onClick={() => setPage((current) => current + 1)}>
								Next
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function FraudAlertsTab() {
	const [payload, setPayload] = useState({
		alerts: [],
		page: 1,
		total: 0,
		totalPages: 1,
		unresolvedCount: 0,
		bySeverity: [],
	});
	const [page, setPage] = useState(1);
	const [severity, setSeverity] = useState("");
	const [resolved, setResolved] = useState("");
	const [loading, setLoading] = useState(false);
	const [resolutionText, setResolutionText] = useState({});

	const fetchAlerts = useCallback(() => {
		setLoading(true);
		API.get("/admin/fraud-alerts", {
			params: {
				page,
				limit: 15,
				severity: severity || undefined,
				resolved: resolved || undefined,
			},
		})
			.then((res) => setPayload(res.data))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [page, severity, resolved]);

	useEffect(() => {
		fetchAlerts();
	}, [fetchAlerts]);

	const resolveAlert = async (alertId) => {
		const action = String(resolutionText[alertId] || "").trim();
		if (!action) return;

		try {
			await API.patch(`/admin/fraud-alerts/${alertId}/resolve`, { action });
			fetchAlerts();
		} catch (err) {
			console.error("Resolve alert failed", err);
		}
	};

	return (
		<div>
			<div className="admin-charts-row">
				<div className="admin-chart-card">
					<h3>Alerts by Severity</h3>
					<ResponsiveContainer width="100%" height={220}>
						<PieChart>
							<Pie
								data={payload.bySeverity || []}
								dataKey="count"
								nameKey="severity"
								cx="50%"
								cy="50%"
								outerRadius={80}
								label={({ severity: itemSeverity, count }) => `${itemSeverity}: ${count}`}
								labelLine={false}
							>
								{(payload.bySeverity || []).map((entry, index) => (
									<Cell
										key={index}
										fill={SEVERITY_COLORS[entry.severity] || CHART_COLORS[index % CHART_COLORS.length]}
									/>
								))}
							</Pie>
							<Tooltip contentStyle={TOOLTIP_STYLE} />
						</PieChart>
					</ResponsiveContainer>
				</div>

				<div className="admin-stat-card">
					<div className="stat-big">{payload.unresolvedCount || 0}</div>
					<div className="stat-label">Unresolved Alerts</div>
					<div className="muted">{formatNumber(payload.total || 0)} total</div>
				</div>
			</div>

			<div className="admin-table-card">
				<div className="admin-table-toolbar">
					<select
						className="admin-select"
						value={severity}
						onChange={(event) => {
							setPage(1);
							setSeverity(event.target.value);
						}}
					>
						<option value="">All Severities</option>
						<option value="low">Low</option>
						<option value="medium">Medium</option>
						<option value="high">High</option>
						<option value="critical">Critical</option>
					</select>

					<select
						className="admin-select"
						value={resolved}
						onChange={(event) => {
							setPage(1);
							setResolved(event.target.value);
						}}
					>
						<option value="">All States</option>
						<option value="false">Unresolved</option>
						<option value="true">Resolved</option>
					</select>
				</div>

				{loading ? (
					<div className="admin-loading">Loading alerts...</div>
				) : (
					<>
						<table className="admin-table">
							<thead>
								<tr>
									<th>User</th>
									<th>Type</th>
									<th>Severity</th>
									<th>Description</th>
									<th>Date</th>
									<th>Status</th>
									<th>Resolution</th>
								</tr>
							</thead>
							<tbody>
								{payload.alerts.map((row) => (
									<tr key={row.id}>
										<td>
											<div>{row.userName}</div>
											<small className="muted-cell">{row.userEmail}</small>
										</td>
										<td>{String(row.alertType || "-").replace(/_/g, " ")}</td>
										<td>
											<span className={`severity-badge ${SEVERITY_CLASS[row.severity] || "severity-medium"}`}>
												{row.severity}
											</span>
										</td>
										<td className="desc-cell">{row.description || "-"}</td>
										<td>{formatDate(row.createdAt)}</td>
										<td>
											{row.resolved ? <span className="badge-resolved">Resolved</span> : <span className="badge-open">Open</span>}
										</td>
										<td>
											{!row.resolved ? (
												<div className="resolve-row">
													<input
														className="resolve-input"
														placeholder="Resolution note"
														value={resolutionText[row.id] || ""}
														onChange={(event) =>
															setResolutionText((prev) => ({ ...prev, [row.id]: event.target.value }))
														}
													/>
													<button className="btn-resolve" onClick={() => resolveAlert(row.id)}>
														Resolve
													</button>
												</div>
											) : (
												<span className="muted-cell">{row.resolutionAction || "-"}</span>
											)}
										</td>
									</tr>
								))}
								{payload.alerts.length === 0 && (
									<tr>
										<td colSpan={7} className="muted-cell">No alerts found</td>
									</tr>
								)}
							</tbody>
						</table>

						<div className="admin-pagination">
							<button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
								Prev
							</button>
							<span>
								Page {payload.page} of {payload.totalPages} ({formatNumber(payload.total)} total)
							</span>
							<button disabled={page >= payload.totalPages} onClick={() => setPage((current) => current + 1)}>
								Next
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function ReportsTab() {
	const [reports, setReports] = useState(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		setLoading(true);
		API.get("/admin/reports")
			.then((res) => setReports(res.data))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	if (loading) return <div className="admin-loading">Generating reports...</div>;
	if (!reports) return <div className="admin-loading">No report data available</div>;

	return (
		<div>
			<div className="admin-charts-row">
				<div className="admin-chart-card full">
					<h3>12-Month Purchase vs Repayment Trend</h3>
					<ResponsiveContainer width="100%" height={300}>
						<BarChart data={reports.monthlyTrend || []} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
							<CartesianGrid strokeDasharray="3 3" stroke="#334155" />
							<XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} />
							<YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
							<Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
							<Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
							<Bar dataKey="purchases" name="Purchases" fill="#6366f1" radius={[4, 4, 0, 0]} />
							<Bar dataKey="repayments" name="Repayments" fill="#22d3ee" radius={[4, 4, 0, 0]} />
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>

			<div className="admin-charts-row">
				<div className="admin-chart-card">
					<h3>Credit Score Distribution</h3>
					<ResponsiveContainer width="100%" height={240}>
						<BarChart data={reports.creditScoreDist || []} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
							<CartesianGrid strokeDasharray="3 3" stroke="#334155" />
							<XAxis dataKey="range" tick={{ fill: "#94a3b8", fontSize: 11 }} />
							<YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
							<Tooltip contentStyle={TOOLTIP_STYLE} />
							<Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
						</BarChart>
					</ResponsiveContainer>
				</div>

				<div className="admin-chart-card">
					<h3>Employment Distribution</h3>
					<ResponsiveContainer width="100%" height={240}>
						<PieChart>
							<Pie
								data={reports.employmentDist || []}
								dataKey="count"
								nameKey="type"
								cx="50%"
								cy="50%"
								outerRadius={90}
								label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}
								labelLine={false}
							>
								{(reports.employmentDist || []).map((_, index) => (
									<Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
								))}
							</Pie>
							<Tooltip contentStyle={TOOLTIP_STYLE} />
						</PieChart>
					</ResponsiveContainer>
				</div>

				<div className="admin-chart-card wide">
					<h3>Daily Purchases (Last 30 Days)</h3>
					<ResponsiveContainer width="100%" height={240}>
						<AreaChart data={reports.dailyPurchases || []} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
							<defs>
								<linearGradient id="reportPurchaseGrad" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
									<stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
								</linearGradient>
							</defs>
							<CartesianGrid strokeDasharray="3 3" stroke="#334155" />
							<XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} />
							<YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
							<Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
							<Area type="monotone" dataKey="amount" stroke="#6366f1" fill="url(#reportPurchaseGrad)" strokeWidth={2} />
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
}

function SubscriptionCatalogTab() {
	const [plans, setPlans] = useState([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({
		code: "",
		name: "",
		yearlyPrice: "",
		sortOrder: "",
		isActive: true,
	});

	const loadCatalog = useCallback(async () => {
		setLoading(true);
		try {
			const res = await API.get("/admin/subscriptions/catalog");
			setPlans(res.data?.plans || []);
		} catch (err) {
			console.error("Failed to load subscription catalog", err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadCatalog();
	}, [loadCatalog]);

	const createPlan = async (event) => {
		event.preventDefault();
		setSaving(true);
		try {
			await API.post("/admin/subscriptions/catalog", {
				code: form.code,
				name: form.name,
				yearlyPrice: Number(form.yearlyPrice || 0),
				sortOrder: Number(form.sortOrder || 0),
				isActive: Boolean(form.isActive),
			});

			setForm({ code: "", name: "", yearlyPrice: "", sortOrder: "", isActive: true });
			await loadCatalog();
		} catch (err) {
			console.error("Failed to create plan", err);
		} finally {
			setSaving(false);
		}
	};

	const togglePlan = async (plan) => {
		try {
			await API.patch(`/admin/subscriptions/catalog/${plan._id}`, {
				isActive: !plan.isActive,
			});
			await loadCatalog();
		} catch (err) {
			console.error("Failed to toggle plan", err);
		}
	};

	const deletePlan = async (planId) => {
		try {
			await API.delete(`/admin/subscriptions/catalog/${planId}`);
			await loadCatalog();
		} catch (err) {
			console.error("Failed to delete plan", err);
		}
	};

	return (
		<div className="admin-table-card">
			<h3>Subscription Catalog Management</h3>
			<p className="muted-cell" style={{ marginTop: 4, marginBottom: 14 }}>
				Manage OTT plans from database. Changes are reflected in Subscription Hub checkout.
			</p>

			<form onSubmit={createPlan} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
				<input className="admin-search-input" placeholder="Code (NETFLIX)" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} required />
				<input className="admin-search-input" placeholder="Name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
				<input className="admin-search-input" placeholder="Yearly price" type="number" min="0" value={form.yearlyPrice} onChange={(e) => setForm((prev) => ({ ...prev, yearlyPrice: e.target.value }))} required />
				<input className="admin-search-input" placeholder="Sort order" type="number" value={form.sortOrder} onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))} />
				<label style={{ display: "flex", alignItems: "center", gap: 8, color: "#cbd5e1", fontSize: 13 }}>
					<input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
					Active
				</label>
				<button type="submit" className="btn-download" disabled={saving}>
					{saving ? "Saving..." : "Add Plan"}
				</button>
			</form>

			{loading ? (
				<div className="admin-loading">Loading catalog...</div>
			) : (
				<table className="admin-table">
					<thead>
						<tr>
							<th>Code</th>
							<th>Name</th>
							<th>Yearly Price</th>
							<th>Status</th>
							<th>Order</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{plans.map((plan) => (
							<tr key={plan._id}>
								<td>{plan.code}</td>
								<td>{plan.name}</td>
								<td>{formatCurrency(plan.yearlyPrice)}</td>
								<td>{plan.isActive ? <span className="badge-yes">Active</span> : <span className="badge-no">Inactive</span>}</td>
								<td>{plan.sortOrder || 0}</td>
								<td>
									<div style={{ display: "flex", gap: 8 }}>
										<button type="button" className="btn-download" onClick={() => togglePlan(plan)}>
											{plan.isActive ? "Disable" : "Enable"}
										</button>
										<button type="button" className="btn-download" style={{ background: "#7f1d1d" }} onClick={() => deletePlan(plan._id)}>
											Delete
										</button>
									</div>
								</td>
							</tr>
						))}
						{plans.length === 0 && (
							<tr>
								<td colSpan={6} className="muted-cell">No subscription plans found</td>
							</tr>
						)}
					</tbody>
				</table>
			)}
		</div>
	);
}

function RewardsTab() {
	const [summary, setSummary] = useState(null);
	const [config, setConfig] = useState(null);
	const [configForm, setConfigForm] = useState({
		baseCashbackRate: 0.02,
		earlyCashbackRate: 0.03,
		monthlyCashbackCap: 500,
		perTxnCashbackCap: 200,
		referralRewardAmount: 500,
		campaignRewardDefaultAmount: 250,
	});
	const [campaignForm, setCampaignForm] = useState({
		userId: "",
		amount: 250,
		campaignCode: "",
		note: "",
	});
	const [loading, setLoading] = useState(false);
	const [savingConfig, setSavingConfig] = useState(false);
	const [granting, setGranting] = useState(false);
	const [info, setInfo] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		setLoading(true);
		Promise.all([API.get("/rewards/admin/summary"), API.get("/rewards/admin/config")])
			.then(([summaryRes, configRes]) => {
				setSummary(summaryRes.data || null);
				setConfig(configRes.data?.config || null);
				setConfigForm((prev) => ({
					...prev,
					...(configRes.data?.config || {}),
				}));
				setCampaignForm((prev) => ({
					...prev,
					amount: Number(configRes.data?.config?.campaignRewardDefaultAmount || prev.amount),
				}));
				setError("");
			})
			.catch((err) => {
				setError(err.response?.data?.message || "Failed to load rewards analytics");
			})
			.finally(() => setLoading(false));
	}, []);

	if (loading) return <div className="admin-loading">Loading rewards analytics...</div>;
	if (error && !summary) return <div className="admin-error">{error}</div>;
	if (!summary) return null;

	const topEarners = summary.topEarners || [];
	const monthly = summary.monthly || [];
	const totals = summary.summary || {};

	const handleSaveConfig = async (event) => {
		event.preventDefault();
		setSavingConfig(true);
		setInfo("");
		setError("");
		try {
			const payload = {
				baseCashbackRate: Number(configForm.baseCashbackRate || 0),
				earlyCashbackRate: Number(configForm.earlyCashbackRate || 0),
				monthlyCashbackCap: Number(configForm.monthlyCashbackCap || 0),
				perTxnCashbackCap: Number(configForm.perTxnCashbackCap || 0),
				referralRewardAmount: Number(configForm.referralRewardAmount || 0),
				campaignRewardDefaultAmount: Number(configForm.campaignRewardDefaultAmount || 0),
			};

			const res = await API.patch("/rewards/admin/config", payload);
			setConfig(res.data?.config || null);
			setInfo("Reward configuration updated successfully");
		} catch (err) {
			setError(err.response?.data?.message || "Failed to update reward config");
		} finally {
			setSavingConfig(false);
		}
	};

	const handleGrantCampaignReward = async (event) => {
		event.preventDefault();
		setGranting(true);
		setInfo("");
		setError("");
		try {
			await API.post("/rewards/admin/campaign-grant", {
				userId: campaignForm.userId,
				amount: Number(campaignForm.amount || 0),
				campaignCode: campaignForm.campaignCode,
				note: campaignForm.note,
			});

			const refreshed = await API.get("/rewards/admin/summary");
			setSummary(refreshed.data || null);
			setInfo("Campaign reward granted successfully");
			setCampaignForm((prev) => ({ ...prev, userId: "", campaignCode: "", note: "" }));
		} catch (err) {
			setError(err.response?.data?.message || "Failed to grant campaign reward");
		} finally {
			setGranting(false);
		}
	};

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div className="admin-table-card">
				<h3>Reward Rules</h3>
				<p className="muted-cell" style={{ marginTop: 4, marginBottom: 12 }}>
					Change cashback rates and reward caps without deployment.
				</p>
				<form onSubmit={handleSaveConfig} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
					<input className="admin-search-input" type="number" min="0" max="1" step="0.001" value={configForm.baseCashbackRate} onChange={(e) => setConfigForm((prev) => ({ ...prev, baseCashbackRate: e.target.value }))} placeholder="Base cashback rate" required />
					<input className="admin-search-input" type="number" min="0" max="1" step="0.001" value={configForm.earlyCashbackRate} onChange={(e) => setConfigForm((prev) => ({ ...prev, earlyCashbackRate: e.target.value }))} placeholder="Early cashback rate" required />
					<input className="admin-search-input" type="number" min="0" step="1" value={configForm.monthlyCashbackCap} onChange={(e) => setConfigForm((prev) => ({ ...prev, monthlyCashbackCap: e.target.value }))} placeholder="Monthly cashback cap" required />
					<input className="admin-search-input" type="number" min="0" step="1" value={configForm.perTxnCashbackCap} onChange={(e) => setConfigForm((prev) => ({ ...prev, perTxnCashbackCap: e.target.value }))} placeholder="Per transaction cap" required />
					<input className="admin-search-input" type="number" min="0" step="1" value={configForm.referralRewardAmount} onChange={(e) => setConfigForm((prev) => ({ ...prev, referralRewardAmount: e.target.value }))} placeholder="Referral reward amount" required />
					<input className="admin-search-input" type="number" min="0" step="1" value={configForm.campaignRewardDefaultAmount} onChange={(e) => setConfigForm((prev) => ({ ...prev, campaignRewardDefaultAmount: e.target.value }))} placeholder="Default campaign reward" required />
					<button type="submit" className="btn-download" disabled={savingConfig}>
						{savingConfig ? "Saving..." : "Save Reward Rules"}
					</button>
				</form>
				{config && (
					<div className="muted-cell" style={{ marginTop: 10 }}>
						Last updated: {formatDate(config.updatedAt)}
					</div>
				)}
			</div>

			<div className="admin-table-card">
				<h3>Campaign Reward Grant</h3>
				<p className="muted-cell" style={{ marginTop: 4, marginBottom: 12 }}>
					Grant one-time campaign rewards directly to a user wallet.
				</p>
				<form onSubmit={handleGrantCampaignReward} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
					<input className="admin-search-input" value={campaignForm.userId} onChange={(e) => setCampaignForm((prev) => ({ ...prev, userId: e.target.value }))} placeholder="User ID" required />
					<input className="admin-search-input" type="number" min="1" step="1" value={campaignForm.amount} onChange={(e) => setCampaignForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Reward amount" required />
					<input className="admin-search-input" value={campaignForm.campaignCode} onChange={(e) => setCampaignForm((prev) => ({ ...prev, campaignCode: e.target.value }))} placeholder="Campaign code" required />
					<input className="admin-search-input" value={campaignForm.note} onChange={(e) => setCampaignForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Optional note" />
					<button type="submit" className="btn-download" disabled={granting}>
						{granting ? "Granting..." : "Grant Campaign Reward"}
					</button>
				</form>
			</div>

			{info && <div className="admin-loading">{info}</div>}
			{error && <div className="admin-error">{error}</div>}

			<div className="admin-kpi-grid">
				<article className="admin-kpi-card kpi-green">
					<p className="kpi-label">Cashback Issued</p>
					<p className="kpi-value">{formatCurrency(totals.totalCashbackIssued)}</p>
					<p className="kpi-sub">{formatNumber(totals.totalCashbackTransactions)} reward transactions</p>
				</article>
				<article className="admin-kpi-card kpi-blue">
					<p className="kpi-label">Wallet Balance Liability</p>
					<p className="kpi-value">{formatCurrency(totals.totalWalletBalance)}</p>
					<p className="kpi-sub">Across {formatNumber(totals.walletCount)} wallets</p>
				</article>
			</div>

			<div className="table-wrap">
				<h3>Monthly Cashback Trend</h3>
				<table className="admin-table">
					<thead>
						<tr>
							<th>Month</th>
							<th>Total Cashback</th>
							<th>Transactions</th>
						</tr>
					</thead>
					<tbody>
						{monthly.map((row) => (
							<tr key={row.month}>
								<td>{row.month}</td>
								<td>{formatCurrency(row.totalCashback)}</td>
								<td>{formatNumber(row.transactions)}</td>
							</tr>
						))}
						{monthly.length === 0 && (
							<tr>
								<td colSpan={3} className="muted-cell">No cashback data available</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<div className="table-wrap">
				<h3>Top Reward Earners</h3>
				<table className="admin-table">
					<thead>
						<tr>
							<th>User</th>
							<th>Email</th>
							<th>Total Earned</th>
							<th>Transactions</th>
						</tr>
					</thead>
					<tbody>
						{topEarners.map((row) => (
							<tr key={row.userId}>
								<td>{row.name}</td>
								<td>{row.email}</td>
								<td>{formatCurrency(row.totalEarned)}</td>
								<td>{formatNumber(row.transactions)}</td>
							</tr>
						))}
						{topEarners.length === 0 && (
							<tr>
								<td colSpan={4} className="muted-cell">No earners yet</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

const TABS = [
	{ id: "dashboard", label: "Dashboard" },
	{ id: "users", label: "Users" },
	{ id: "loans", label: "Loans" },
	{ id: "transactions", label: "Transactions" },
	{ id: "fraud", label: "Fraud Alerts" },
	{ id: "rewards", label: "Rewards" },
	{ id: "subscriptions", label: "Subscriptions" },
	{ id: "reports", label: "Reports" },
];

export default function AdminDashboard({ user }) {
	const [activeTab, setActiveTab] = useState("users");
	const isAdmin = Boolean(user && (user.isAdmin || user.email === "admin@example.com"));

	if (!isAdmin) {
		return (
			<div className="admin-page">
				<section className="overview">
					<h2>Admin Dashboard</h2>
					<p className="muted">Access denied - administrator only.</p>
				</section>
			</div>
		);
	}

	return (
		<div className="admin-page">
			<section className="overview">
				<div className="greeting">
					<h2>Admin Command Center</h2>
					<p className="muted">Monitor users, loans, transactions, fraud, and platform reports.</p>
				</div>
			</section>

			<div className="admin-tabs">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						className={`admin-tab-btn${activeTab === tab.id ? " active" : ""}`}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</button>
				))}
			</div>

			<div className="admin-tab-content">
				{activeTab === "dashboard" && <DashboardTab />}
				{activeTab === "users" && <UsersTab />}
				{activeTab === "loans" && <LoansTab />}
				{activeTab === "transactions" && <TransactionsTab />}
				{activeTab === "fraud" && <FraudAlertsTab />}
				{activeTab === "rewards" && <RewardsTab />}
				{activeTab === "subscriptions" && <SubscriptionCatalogTab />}
				{activeTab === "reports" && <ReportsTab />}
			</div>
		</div>
	);
}

