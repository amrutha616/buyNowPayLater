import { useEffect, useMemo, useState } from "react";
import API from "./services/api";

function fmt(n) {
	return Number(n || 0).toLocaleString("en-IN", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

const durationOptions = [3, 6, 9, 12];

function formatDate(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function expiryLabel(daysLeft) {
	if (daysLeft < 0) return `Expired ${Math.abs(daysLeft)} day(s) ago`;
	if (daysLeft === 0) return "Expires today";
	return `${daysLeft} day(s) left`;
}

export default function SubscriptionHub({ user, onUpdate }) {
	const [catalog, setCatalog] = useState([]);
	const [selectedCodes, setSelectedCodes] = useState([]);
	const [annualInterestRate, setAnnualInterestRate] = useState(12);
	const [durationMonths, setDurationMonths] = useState(12);
	const [beneficiaryEmail, setBeneficiaryEmail] = useState(user?.email || "");
	const [rewardWallet, setRewardWallet] = useState(null);
	const [rewardRedeemAmount, setRewardRedeemAmount] = useState("");
	const [quote, setQuote] = useState(null);
	const [orders, setOrders] = useState([]);
	const [activatedSubscriptions, setActivatedSubscriptions] = useState([]);
	const [otpCode, setOtpCode] = useState("");
	const [renewalOrderId, setRenewalOrderId] = useState("");
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [otpSending, setOtpSending] = useState(false);

	const selectedPlans = useMemo(() => {
		const selectedSet = new Set(selectedCodes);
		return catalog.filter((item) => selectedSet.has(item.code));
	}, [catalog, selectedCodes]);

	const selectedBaseTotal = useMemo(
		() => selectedPlans.reduce((sum, plan) => sum + Number(plan.yearlyPrice || 0), 0),
		[selectedPlans]
	);

	const selectedRenewOrder = useMemo(
		() => orders.find((order) => String(order._id) === String(renewalOrderId)) || null,
		[orders, renewalOrderId]
	);
	const renewBaseTotal = useMemo(
		() => (selectedRenewOrder?.bundleItems || []).reduce((sum, item) => sum + Number(item.yearlyPrice || 0), 0),
		[selectedRenewOrder]
	);
	const maxCheckoutRedeem = Math.max(0, Math.min(Number(rewardWallet?.balance || 0), Number(quote?.emiSummary?.principalAmount || selectedBaseTotal || 0)));
	const maxRenewRedeem = Math.max(0, Math.min(Number(rewardWallet?.balance || 0), Number(renewBaseTotal || 0)));
	const effectiveCheckoutRedeem = Math.max(0, Math.min(Number(rewardRedeemAmount || 0), maxCheckoutRedeem));
	const effectiveRenewRedeem = Math.max(0, Math.min(Number(rewardRedeemAmount || 0), maxRenewRedeem));

	const loadCatalog = async () => {
		const res = await API.get("/subscriptions/catalog");
		setCatalog(res.data?.subscriptions || []);
	};

	const loadOrders = async () => {
		const res = await API.get("/subscriptions/orders");
		setOrders(res.data?.orders || []);
	};

	const loadActivated = async () => {
		const res = await API.get("/subscriptions/activated");
		setActivatedSubscriptions(res.data?.activatedSubscriptions || []);
	};

	const loadRewards = async () => {
		const res = await API.get("/rewards/me");
		setRewardWallet(res.data?.wallet || null);
	};

	useEffect(() => {
		loadCatalog().catch((err) => setError(err.response?.data?.message || "Unable to load subscriptions"));
		Promise.all([loadOrders(), loadActivated(), loadRewards()]).catch(() => {});
	}, []);

	const toggleCode = (code) => {
		setSelectedCodes((prev) =>
			prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]
		);
	};

	const handleQuote = async () => {
		setMessage("");
		setError("");

		if (!selectedCodes.length) {
			setError("Select at least one subscription");
			return;
		}

		try {
			setLoading(true);
			const res = await API.post("/subscriptions/quote", {
				subscriptionCodes: selectedCodes,
				annualInterestRate,
				durationMonths,
			});
			setQuote(res.data);
		} catch (err) {
			setError(err.response?.data?.message || "Failed to calculate EMI quote");
		} finally {
			setLoading(false);
		}
	};

	const handleSendOtp = async () => {
		setMessage("");
		setError("");

		if (!quote?.emiSummary) {
			setError("Calculate EMI before requesting OTP");
			return;
		}

		try {
			setOtpSending(true);
			const res = await API.post("/subscriptions/send-checkout-otp", {});
			setMessage(res.data?.message || "OTP sent to your registered email");
		} catch (err) {
			setError(err.response?.data?.message || "Unable to send OTP");
		} finally {
			setOtpSending(false);
		}
	};

	const handleSendRenewOtp = async (orderId) => {
		setMessage("");
		setError("");

		try {
			setOtpSending(true);
			const res = await API.post("/subscriptions/send-checkout-otp", {});
			setRenewalOrderId(orderId);
			setMessage(res.data?.message || "OTP sent for renewal checkout");
		} catch (err) {
			setError(err.response?.data?.message || "Unable to send renewal OTP");
		} finally {
			setOtpSending(false);
		}
	};

	const handleCheckout = async () => {
		setMessage("");
		setError("");

		if (!quote?.emiSummary) {
			setError("Calculate EMI before checkout");
			return;
		}

		if (!beneficiaryEmail.trim()) {
			setError("Enter the email for this subscription");
			return;
		}

		if (!otpCode.trim()) {
			setError("Enter OTP to confirm checkout");
			return;
		}

		try {
			setLoading(true);
			const res = await API.post("/subscriptions/checkout", {
				subscriptionCodes: selectedCodes,
				annualInterestRate,
				durationMonths,
				beneficiaryEmail: beneficiaryEmail.trim(),
				rewardRedeemAmount: effectiveCheckoutRedeem,
				otpCode,
			});

			const rewardsUsed = Number(res.data?.rewardsUsed || 0);
			setMessage(`${res.data?.message || "Bundle activated"}${rewardsUsed > 0 ? ` | You saved Rs. ${fmt(rewardsUsed)}` : ""}`);
			setOtpCode("");
			setRewardRedeemAmount("");
			await Promise.all([loadOrders(), loadActivated(), loadRewards(), onUpdate?.()]);
		} catch (err) {
			setError(err.response?.data?.message || "Checkout failed");
		} finally {
			setLoading(false);
		}
	};

	const handleRenewCheckout = async () => {
		setMessage("");
		setError("");

		if (!renewalOrderId) {
			setError("Choose a bundle from activated subscriptions to renew");
			return;
		}

		if (!otpCode.trim()) {
			setError("Enter OTP to confirm renewal checkout");
			return;
		}

		try {
			setLoading(true);
			const res = await API.post("/subscriptions/renew", {
				orderId: renewalOrderId,
				otpCode,
				durationMonths,
				annualInterestRate,
				rewardRedeemAmount: effectiveRenewRedeem,
			});

			const rewardsUsed = Number(res.data?.rewardsUsed || 0);
			setMessage(`${res.data?.message || "Bundle renewed"}${rewardsUsed > 0 ? ` | You saved Rs. ${fmt(rewardsUsed)}` : ""}`);
			setOtpCode("");
			setRenewalOrderId("");
			setRewardRedeemAmount("");
			await Promise.all([loadOrders(), loadActivated(), loadRewards(), onUpdate?.()]);
		} catch (err) {
			setError(err.response?.data?.message || "Renewal failed");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		const maxAllowed = renewalOrderId ? maxRenewRedeem : maxCheckoutRedeem;
		if (Number(rewardRedeemAmount || 0) > maxAllowed) {
			setRewardRedeemAmount(String(maxAllowed));
		}
	}, [maxCheckoutRedeem, maxRenewRedeem, renewalOrderId, rewardRedeemAmount]);

	return (
		<div className="overview" style={{ gap: 20 }}>
			<div style={{ display: "flex", justifyContent: "flex-end" }}>
				<a href="/subscription-hub" className="btn btn--primary" style={{ textDecoration: "none" }}>
					Subscription Bundle
				</a>
			</div>

			<div className="card" style={{ display: "grid", gap: 12 }}>
				<div>
					<h2 style={{ margin: 0, fontFamily: "Fraunces, serif", color: "var(--navy)" }}>Subscription Hub</h2>
					<p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
						Bundle your OTT subscriptions and convert yearly payment into EMI.
					</p>
				</div>

				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
					{catalog.map((plan) => {
						const selected = selectedCodes.includes(plan.code);
						return (
							<button
								key={plan.code}
								type="button"
								onClick={() => toggleCode(plan.code)}
								style={{
									padding: 14,
									borderRadius: 12,
									border: selected ? "2px solid var(--brand-orange)" : "1.5px solid var(--surface-border)",
									background: selected ? "var(--brand-orange-bg)" : "var(--surface-white)",
									textAlign: "left",
									cursor: "pointer",
								}}
							>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
									<strong style={{ color: "var(--navy)", fontSize: 15 }}>{plan.name}</strong>
									<span style={{ fontSize: 12, color: selected ? "var(--brand-orange-dark)" : "var(--text-muted)" }}>
										{selected ? "Selected" : "Tap to add"}
									</span>
								</div>
								<div style={{ marginTop: 8, color: "var(--text-secondary)", fontWeight: 700 }}>
									Rs. {Number(plan.yearlyPrice).toLocaleString("en-IN")} / year
								</div>
							</button>
						);
					})}
				</div>

				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
					<div>
						<label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
							Duration (months)
						</label>
						<select
							value={durationMonths}
							onChange={(e) => setDurationMonths(Number(e.target.value))}
							style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--surface-border)" }}
						>
							{durationOptions.map((months) => (
								<option key={months} value={months}>{months} months</option>
							))}
						</select>
					</div>

					<div>
						<label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
							Interest Rate (% per year)
						</label>
						<input
							type="number"
							min={0}
							max={36}
							step={0.25}
							value={annualInterestRate}
							onChange={(e) => setAnnualInterestRate(Number(e.target.value))}
							style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--surface-border)" }}
						/>
					</div>
				</div>

				<div>
					<label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
						Beneficiary Email (who will use this subscription?)
					</label>
					<input
						type="email"
						placeholder="e.g., user@gmail.com"
						value={beneficiaryEmail}
						onChange={(e) => setBeneficiaryEmail(e.target.value)}
						style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--surface-border)" }}
					/>
					<p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
						We'll send the activation code to this email. Can be different from your account email (for gifts).
					</p>
					<div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid var(--surface-border)", background: "var(--surface-soft)" }}>
						<label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
							Redeem Rewards (optional)
						</label>
						<div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
							<input
								type="number"
								min={0}
								max={renewalOrderId ? maxRenewRedeem : maxCheckoutRedeem}
								value={rewardRedeemAmount}
								onChange={(e) => setRewardRedeemAmount(e.target.value)}
								placeholder="0"
								style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--surface-border)" }}
							/>
							<button
								type="button"
								className="btn btn--secondary"
								onClick={() => setRewardRedeemAmount(String(renewalOrderId ? maxRenewRedeem : maxCheckoutRedeem))}
								disabled={(renewalOrderId ? maxRenewRedeem : maxCheckoutRedeem) <= 0}
							>
								Use Max
							</button>
						</div>
						<div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
							Wallet: Rs. {fmt(rewardWallet?.balance || 0)} | Max now: Rs. {fmt(renewalOrderId ? maxRenewRedeem : maxCheckoutRedeem)}
						</div>
					</div>
				</div>

				<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
					<button type="button" className="btn btn--primary" onClick={handleQuote} disabled={loading}>
						{loading ? "Calculating..." : "Calculate EMI"}
					</button>
					<button type="button" className="btn btn--secondary" onClick={handleSendOtp} disabled={otpSending || !quote?.emiSummary}>
						{otpSending ? "Sending OTP..." : "Send Checkout OTP"}
					</button>
				</div>

				{quote?.emiSummary && (
					<div style={{ background: "var(--surface-soft)", border: "1px solid var(--surface-border)", borderRadius: 12, padding: 14 }}>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
							<div>
								<div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Principal</div>
								<div style={{ fontWeight: 700, color: "var(--navy)" }}>Rs. {fmt(quote.emiSummary.principalAmount)}</div>
							</div>
							<div>
								<div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Monthly EMI</div>
								<div style={{ fontWeight: 700, color: "var(--brand-orange)" }}>Rs. {fmt(quote.emiSummary.emiAmount)}</div>
							</div>
							<div>
								<div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Payable</div>
								<div style={{ fontWeight: 700, color: "var(--navy)" }}>Rs. {fmt(quote.emiSummary.totalPayable)}</div>
							</div>
							<div>
								<div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Interest</div>
								<div style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Rs. {fmt(quote.emiSummary.totalInterest)}</div>
							</div>
						</div>

						<div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
							Selected total yearly subscription value: Rs. {fmt(selectedBaseTotal)}
						</div>
					</div>
				)}

				<div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
					<input
						type="text"
						placeholder="Enter OTP"
						value={otpCode}
						onChange={(e) => setOtpCode(e.target.value)}
						style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--surface-border)" }}
					/>
					<button type="button" className="btn btn--primary" onClick={handleCheckout} disabled={loading || !quote?.emiSummary}>
						Confirm Checkout
					</button>
				</div>

				<div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
					<input
						type="text"
						placeholder="Renewal order id"
						value={renewalOrderId}
						onChange={(e) => setRenewalOrderId(e.target.value)}
						style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--surface-border)" }}
					/>
					<button type="button" className="btn btn--secondary" onClick={handleRenewCheckout} disabled={loading}>
						Renew Bundle
					</button>
				</div>

				<div style={{ fontSize: 12, color: "var(--text-muted)" }}>
					OTP is sent to {user?.email || "your registered email"}. Use the renewal button when expiry is within one month.
				</div>

				{message && <div className="status-alert status-alert--success">{message}</div>}
				{error && <div className="status-alert status-alert--error">{error}</div>}
			</div>

			<div className="card" style={{ display: "grid", gap: 10 }}>
				<div>
					<h3 style={{ margin: 0, color: "var(--navy)" }}>Activated Subscriptions</h3>
					<p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
						Countdown and next EMI due date for each active plan.
					</p>
				</div>

				{activatedSubscriptions.length === 0 ? (
					<div style={{ color: "var(--text-muted)", fontSize: 13 }}>No activated subscriptions yet.</div>
				) : (
					<div style={{ display: "grid", gap: 8 }}>
						{activatedSubscriptions.map((entry) => (
							<div key={`${entry.orderId}-${entry.subscriptionCode}`} style={{ border: "1px solid var(--surface-border)", borderRadius: 10, padding: 12, background: "var(--surface-white)" }}>
								<div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
									<strong style={{ color: "var(--navy)" }}>{entry.subscriptionName}</strong>
									<span style={{
										fontSize: 12,
										fontWeight: 700,
										color: entry.renewalEligible ? "#B45309" : "var(--text-muted)",
										background: entry.renewalEligible ? "#FEF3C7" : "var(--surface-soft)",
										padding: "4px 8px",
										borderRadius: 8,
									}}>
										{expiryLabel(Number(entry.daysLeft || 0))}
									</span>
								</div>
								<div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
									Activated: {formatDate(entry.activatedAt)} | Expires: {formatDate(entry.expiresAt)}
								</div>
								<div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)" }}>								Beneficiary: <strong>{entry.beneficiaryEmail || "N/A"}</strong>
							</div>
							{entry.activationCode && (
								<div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)" }}>
									Activation Code: <strong>{entry.activationCode}</strong>
									<button
										type="button"
										style={{
											marginLeft: 8,
											padding: "4px 8px",
											fontSize: 11,
											background: "var(--surface-soft)",
											border: "1px solid var(--surface-border)",
											borderRadius: 6,
											cursor: "pointer",
											fontWeight: 600,
										}}
										onClick={() => {
											navigator.clipboard.writeText(entry.activationCode);
											setMessage("Activation code copied to clipboard!");
										}}
									>
										Copy
									</button>
								</div>
							)}
							<div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)" }}>									Next EMI: {entry.nextEmi ? `EMI ${entry.nextEmi.installmentNumber} due ${formatDate(entry.nextEmi.dueDate)} (Rs. ${fmt(entry.nextEmi.amountDue)})` : "No pending EMI"}
								</div>
								{entry.renewalEligible && (
									<button
										type="button"
										className="btn btn--secondary"
										style={{ marginTop: 8 }}
										onClick={() => handleSendRenewOtp(entry.orderId)}
										disabled={otpSending}
									>
										{otpSending && renewalOrderId === entry.orderId ? "Sending OTP..." : "Renew This Bundle"}
									</button>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			<div className="card" style={{ display: "grid", gap: 10 }}>
				<div>
					<h3 style={{ margin: 0, color: "var(--navy)" }}>Your Bundle Orders</h3>
					<p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>Recent subscription EMI bundles</p>
				</div>

				{orders.length === 0 ? (
					<div style={{ color: "var(--text-muted)", fontSize: 13 }}>No bundle orders yet.</div>
				) : (
					<div style={{ display: "grid", gap: 8 }}>
						{orders.slice(0, 5).map((order) => (
							<div key={order._id} style={{ border: "1px solid var(--surface-border)", borderRadius: 10, padding: 12, background: "var(--surface-white)" }}>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
									<strong style={{ color: "var(--navy)" }}>{order.merchant}</strong>
									<span style={{ fontSize: 12, color: "var(--text-muted)" }}>
										{new Date(order.createdAt).toLocaleDateString("en-IN")}
									</span>
								</div>
								<div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>
									EMI: Rs. {fmt(order.emiAmount || 0)} x {order.bundleDurationMonths || order.installmentPlan} months
								</div>
								<div style={{ marginTop: 4, fontSize: 13, color: "var(--text-secondary)" }}>
									Total payable: Rs. {fmt(order.totalPayable || order.bnplAmount || 0)}
								</div>
								<div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
									Order ID: {order._id}
								</div>
								<div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
									{(order.bundleItems || []).map((item) => item.name).join(", ")}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
