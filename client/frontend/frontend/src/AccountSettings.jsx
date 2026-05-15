import { useState, useEffect } from "react";
import API from "./services/api";

/* ── toggle switch component ─────────────────────────────── */
function Toggle({ id, label, desc, checked, onChange }) {
  return (
    <div className="toggle-wrap">
      <div className="toggle-info">
        <label className="toggle-label" htmlFor={id}>{label}</label>
        {desc && <span className="toggle-desc">{desc}</span>}
      </div>
      <label className="toggle-switch">
        <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
  );
}

/* ── main component ──────────────────────────────────────── */
export default function AccountSettings({ user: propUser, onLogout }) {
  const [settings,    setSettings]    = useState(null);
  const [notif,       setNotif]       = useState({
    emailNotifications: true,
    smsNotifications: false,
    paymentReminders: true,
  });
  const [twoFA,       setTwoFA]       = useState(false);
  const [darkMode,    setDarkMode]    = useState(() =>
    localStorage.getItem("snapcredit-theme") === "dark"
  );
  const [bankAccount, setBankAccount] = useState({
    accountHolderName: "",
    accountNumber: "",
    ifscCode: "",
    bankName: "",
    accountType: "savings",
  });
  const [message,     setMessage]     = useState("");
  const [msgType,     setMsgType]     = useState("success");
  const [saving,      setSaving]      = useState(false);

  /* ── theme effect ────────────────────────────────────────*/
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("snapcredit-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  /* ── fetch settings ──────────────────────────────────────*/
  useEffect(() => {
    API.get("/settings")
      .then(res => {
        const s = res.data.settings || {};
        setSettings(s);
        if (s.notificationPreferences) setNotif(s.notificationPreferences);
        if (typeof s.twoFactorAuth?.enabled === "boolean") setTwoFA(s.twoFactorAuth.enabled);
        if (s.bankAccount) setBankAccount(prev => ({ ...prev, ...s.bankAccount }));
      })
      .catch(() => {});
  }, []);

  /* ── handlers ────────────────────────────────────────────*/
  const handleSave = async () => {
    try {
      setSaving(true);
      await API.put("/settings", { notificationPreferences: notif, bankAccount });
      setMessage("Settings saved successfully"); setMsgType("success");
    } catch (err) {
      setMessage(err.response?.data?.message || "Update failed"); setMsgType("error");
    } finally { setSaving(false); }
  };

  const handleToggle2FA = async () => {
    try {
      if (!twoFA) {
        await API.post("/settings/2fa/enable", { method: "email" });
        setTwoFA(true); setMessage("2FA enabled"); setMsgType("success");
      } else {
        await API.post("/settings/2fa/disable");
        setTwoFA(false); setMessage("2FA disabled"); setMsgType("success");
      }
    } catch {
      setMessage("2FA toggle failed"); setMsgType("error");
    }
  };

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  /* ── user meta ───────────────────────────────────────────*/
  const displayName  = propUser?.name  || settings?.name  || "User";
  const displayEmail = propUser?.email || settings?.email || "";
  const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const msgClass = msgType === "error" ? "status-alert status-alert--error" : "status-alert status-alert--success";

  return (
    <div className="settings-page">

      {/* ── Page title ────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(24px, 3.5vw, 32px)", fontWeight: 800, color: "var(--navy)", marginBottom: 6 }}>
          Profile & Settings
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)" }}>Manage your account preferences and security</p>
      </div>

      {/* ── Profile card ──────────────────────────────────── */}
      <div className="profile-card">
        <div className="profile-avatar">{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="profile-name">{displayName}</div>
          <div className="profile-email">{displayEmail}</div>
          <div className="profile-badges" style={{ marginTop: 10 }}>
            <span className="badge badge--paid">Verified ✓</span>
            <span className="badge badge--info">BNPL Member</span>
            {twoFA && <span className="badge badge--pending">2FA On 🔐</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Member since</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
            {settings?.createdAt
              ? new Date(settings.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
              : "Mar 2026"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>

        {/* ── Notifications ─────────────────────────────── */}
        <div className="settings-card">
          <div className="settings-card-title">
            <span className="settings-card-title-icon">🔔</span>
            Notifications
          </div>
          <Toggle
            id="email-notif"
            label="Email Notifications"
            desc="Receive payment receipts and alerts via email"
            checked={!!notif.emailNotifications}
            onChange={v => setNotif(n => ({ ...n, emailNotifications: v }))}
          />
          <Toggle
            id="sms-notif"
            label="SMS Notifications"
            desc="Get text alerts for dues and confirmations"
            checked={!!notif.smsNotifications}
            onChange={v => setNotif(n => ({ ...n, smsNotifications: v }))}
          />
          <Toggle
            id="payment-reminder"
            label="Payment Reminders"
            desc="Nudges before each EMI due date"
            checked={!!notif.paymentReminders}
            onChange={v => setNotif(n => ({ ...n, paymentReminders: v }))}
          />
        </div>

        {/* ── Appearance ────────────────────────────────── */}
        <div className="settings-card">
          <div className="settings-card-title">
            <span className="settings-card-title-icon">🎨</span>
            Appearance
          </div>
          <Toggle
            id="dark-mode"
            label="Dark Mode"
            desc="Switch to a darker interface theme"
            checked={darkMode}
            onChange={setDarkMode}
          />
          <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-soft)", border: "1px solid var(--surface-border)", fontSize: 13, color: "var(--text-secondary)" }}>
            Current theme: <strong style={{ color: "var(--brand-orange)" }}>{darkMode ? "Dark" : "Light"}</strong>
          </div>
        </div>

        {/* ── Security ──────────────────────────────────── */}
        <div className="settings-card">
          <div className="settings-card-title">
            <span className="settings-card-title-icon">🔐</span>
            Security
          </div>
          <Toggle
            id="two-fa"
            label="Two-Factor Authentication"
            desc="Add an extra layer of email-based security"
            checked={twoFA}
            onChange={handleToggle2FA}
          />
          {twoFA && (
            <button className="btn-danger" style={{ marginTop: 16, width: "100%" }} onClick={handleToggle2FA}>
              Disable 2FA
            </button>
          )}
          {!twoFA && (
            <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
              ⚠️ Enable 2FA to better protect your account from unauthorised access.
            </p>
          )}
        </div>

        {/* ── Bank Account ──────────────────────────────── */}
        <div className="settings-card" style={{ gridColumn: "1 / -1" }}>
          <div className="settings-card-title">
            <span className="settings-card-title-icon">🏦</span>
            Bank Account
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div className="settings-field">
              <label className="settings-label" htmlFor="acc-holder">Account Holder Name</label>
              <input
                id="acc-holder"
                type="text"
                className="settings-input"
                placeholder="e.g., Rahul Sharma"
                value={bankAccount.accountHolderName}
                onChange={e => setBankAccount(b => ({ ...b, accountHolderName: e.target.value }))}
              />
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="acc-number">Account Number</label>
              <input
                id="acc-number"
                type="text"
                className="settings-input"
                placeholder="12-digit account number"
                value={bankAccount.accountNumber}
                onChange={e => setBankAccount(b => ({ ...b, accountNumber: e.target.value }))}
              />
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="acc-ifsc">IFSC Code</label>
              <input
                id="acc-ifsc"
                type="text"
                className="settings-input"
                placeholder="e.g., SBIN0001234"
                value={bankAccount.ifscCode}
                onChange={e => setBankAccount(b => ({ ...b, ifscCode: e.target.value.toUpperCase() }))}
                maxLength={11}
              />
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="acc-bank">Bank Name</label>
              <input
                id="acc-bank"
                type="text"
                className="settings-input"
                placeholder="e.g., State Bank of India"
                value={bankAccount.bankName}
                onChange={e => setBankAccount(b => ({ ...b, bankName: e.target.value }))}
              />
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="acc-type">Account Type</label>
              <select
                id="acc-type"
                className="settings-input"
                style={{ cursor: "pointer" }}
                value={bankAccount.accountType}
                onChange={e => setBankAccount(b => ({ ...b, accountType: e.target.value }))}
              >
                <option value="savings">Savings</option>
                <option value="current">Current</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Save & Logout ─────────────────────────────────── */}
      <div className="settings-actions" style={{ marginTop: 24 }}>
        <button className="settings-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "💾 Save Settings"}
        </button>
        <button className="settings-logout-btn" onClick={handleLogout}>
          🚪 Logout
        </button>
        {message && <p className={msgClass}>{message}</p>}
      </div>
    </div>
  );
}
