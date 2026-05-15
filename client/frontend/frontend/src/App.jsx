import { Suspense, lazy, useEffect, useState, useCallback } from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { AnimatePresence, motion as Motion, useReducedMotion } from "framer-motion";

import API from "./services/api";
import Home from "./home";
import VerificationForm from "./VerificationForm";
import BNPLCheckout from "./BNPLCheckout";
import "./App.css";

const Repayment    = lazy(() => import("./Repayment"));
const History      = lazy(() => import("./History"));
const EMISchedule  = lazy(() => import("./EMISchedule"));
const AccountSettings = lazy(() => import("./AccountSettings"));
const Analytics    = lazy(() => import("./Analytics"));
const Support      = lazy(() => import("./Support"));
const SubscriptionHub = lazy(() => import("./SubscriptionHub"));
const AdminDashboard = lazy(() => import("./AdminDashboard"));
const StudentVerification = lazy(() => import("./StudentVerification"));

/* ---------- page animation presets ---------- */
const pageVariants = {
  home: {
    initial:    { opacity: 0, scale: 0.985, y: 12 },
    animate:    { opacity: 1, scale: 1, y: 0 },
    exit:       { opacity: 0, scale: 0.992, y: -8 },
    transition: { duration: 0.28, ease: "easeOut" },
  },
  slide: {
    initial:    { opacity: 0, x: 24 },
    animate:    { opacity: 1, x: 0 },
    exit:       { opacity: 0, x: -16 },
    transition: { duration: 0.24, ease: "easeOut" },
  },
  fade: {
    initial:    { opacity: 0, y: 10 },
    animate:    { opacity: 1, y: 0 },
    exit:       { opacity: 0, y: -8 },
    transition: { duration: 0.22, ease: "easeOut" },
  },
};

function AnimatedPage({ children, preset = "fade", reducedMotion = false }) {
  if (reducedMotion) return <div>{children}</div>;
  const p = pageVariants[preset] || pageVariants.fade;
  return (
    <Motion.div
      variants={p}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={p.transition}
    >
      {children}
    </Motion.div>
  );
}

function RouteFallback() {
  return (
    <div className="card" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: 14 }}>
      Loading…
    </div>
  );
}

/* ---------- Navbar link with active state ---------- */
function NavLink({ to, children }) {
  const { pathname } = useLocation();
  const isActive = pathname === to;
  return (
    <Link
      to={to}
      className={`topbar-nav-link${isActive ? " topbar-nav-link--active" : ""}`}
    >
      {children}
    </Link>
  );
}

/* ============================================================
   MAIN APP COMPONENT
   ============================================================ */
function App() {
  const location         = useLocation();
  const navigate         = useNavigate();
  const prefersReduced   = useReducedMotion();

  useEffect(() => {
    const bnplOrder = localStorage.getItem("bnplOrder");
    console.log("App.jsx - Current path:", location.pathname, "bnplOrder exists:", !!bnplOrder);
    
    // If bnplOrder exists and we're NOT on /checkout, redirect immediately
    if (bnplOrder && location.pathname !== "/checkout") {
      console.log("App.jsx - Force redirecting to /checkout");
      navigate("/checkout", { replace: true });
    }
  }, [location.pathname, navigate]);

  /* auth UI state */
  const [authMode, setAuthMode]       = useState("login");
  const [isSubmitting, setSubmitting] = useState(false);
  const [otpSending, setOtpSending]   = useState(false);
  const [showPass, setShowPass]       = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  /* form fields */
  const [name,           setName]           = useState("");
  const [email,          setEmail]          = useState("");
  const [phone,          setPhone]          = useState("");
  const [password,       setPassword]       = useState("");
  const [otpCode,        setOtpCode]        = useState("");
  const [forgotEmail,    setForgotEmail]    = useState("");
  const [resetEmail,     setResetEmail]     = useState("");
  const [resetToken,     setResetToken]     = useState("");
  const [resetNewPass,   setResetNewPass]   = useState("");

  /* message */
  const [message,     setMessage]     = useState("");
  const [msgType,     setMsgType]     = useState("info");
  const [user,        setUser]        = useState(null);
  const [showVerificationForm, setShowVerificationForm] = useState(false);

  const showMsg = (text, type = "info") => { setMessage(text); setMsgType(type); };
  const clearMsg = () => { setMessage(""); setMsgType("info"); };

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await API.get("/dashboard");
      setUser(res.data);
      clearMsg(); // Clear any previous error messages
      return true;
    } catch (err) {
      if (err.response?.status === 401) {
        // Token is invalid, clear it silently
        localStorage.removeItem("token");
      }
      // Don't show error message - let user continue and retry silently
      console.debug("Dashboard fetch error:", err.message);
      throw err; // Throw so retry logic can catch it
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const tokenFromUrl = q.get("token");
    const emailFromUrl = q.get("email");
    const studentVerificationResult = q.get("studentVerification");

    if (location.pathname === "/reset-password" || tokenFromUrl || emailFromUrl) {
      setAuthMode("reset");
      if (tokenFromUrl) setResetToken(tokenFromUrl);
      if (emailFromUrl) { setResetEmail(emailFromUrl); setForgotEmail(emailFromUrl); }
    }

    if (location.pathname === "/" && studentVerificationResult) {
      if (studentVerificationResult === "success") {
        showMsg("Successfully done. Student study BNPL verification completed.", "success");
      } else if (studentVerificationResult === "failed") {
        showMsg("Student study BNPL not verified.", "error");
      }
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    // Fetch dashboard with auto-retry (silent)
    let retries = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    const attemptFetch = () => {
      fetchDashboard().catch(() => {
        if (retries < maxRetries) {
          retries++;
          setTimeout(attemptFetch, retryDelay);
        }
      });
    };

    attemptFetch();

    // Also set up periodic retry every 30 seconds in case server went down and came back
    const retryInterval = setInterval(attemptFetch, 30000);

    return () => clearInterval(retryInterval);
  }, [location.pathname, location.search, fetchDashboard]);

  /* ---------- handlers ---------- */
  const handleLogin = async e => {
    e.preventDefault(); clearMsg();
    if (!email || !password) { showMsg("Email and password are required", "error"); return; }
    try {
      setSubmitting(true);
      const res = await API.post("/login", { email, password });
      localStorage.setItem("token", res.data.token);
      setUser(res.data.user);
      fetchDashboard();
    } catch (err) {
      showMsg(err.response?.data?.message || "Login failed", "error");
    } finally { setSubmitting(false); }
  };

  const handleAdminLogin = async e => {
    e.preventDefault(); clearMsg();
    if (!email || !password) { showMsg("Admin email and password are required", "error"); return; }
    try {
      setSubmitting(true);
      const res = await API.post("/admin/login", { email, password });
      localStorage.setItem("token", res.data.token);
      setUser(res.data.user);
      fetchDashboard();
    } catch (err) {
      showMsg(err.response?.data?.message || "Admin login failed", "error");
    } finally { setSubmitting(false); }
  };

  const handleSendOtp = async e => {
    e.preventDefault(); clearMsg();
    if (!email) { showMsg("Enter email to receive OTP", "error"); return; }
    try {
      setOtpSending(true);
      await API.post("/register/send-otp", { email });
      showMsg("OTP sent to your email", "success");
    } catch (err) {
      showMsg(err.response?.data?.message || "Failed to send OTP", "error");
    } finally { setOtpSending(false); }
  };

  const handleSignup = async e => {
    e.preventDefault(); clearMsg();
    if (!name || !email || !password || !otpCode) {
      showMsg("Name, email, password, and OTP are required", "error"); return;
    }
    try {
      setSubmitting(true);
      await API.post("/register", { name, email, phone: phone || undefined, password, otpCode });
      showMsg("Account created! Please login.", "success");
      setAuthMode("login");
      setPassword(""); setOtpCode(""); setPhone("");
    } catch (err) {
      showMsg(err.response?.data?.message || "Signup failed", "error");
    } finally { setSubmitting(false); }
  };

  const handleForgotPassword = async e => {
    e.preventDefault(); clearMsg();
    if (!forgotEmail) { showMsg("Enter your email", "error"); return; }
    try {
      setSubmitting(true);
      const res = await API.post("/forgot-password", { email: forgotEmail });
      showMsg(res.data?.message || "Reset link sent", "success");
      setResetEmail(forgotEmail);
      if (res.data?.debugResetToken) { setResetToken(res.data.debugResetToken); setAuthMode("reset"); }
    } catch (err) {
      showMsg(err.response?.data?.message || "Unable to process forgot password", "error");
    } finally { setSubmitting(false); }
  };

  const handleResetPassword = async e => {
    e.preventDefault(); clearMsg();
    if (!resetEmail || !resetToken || !resetNewPass) {
      showMsg("Email, reset token, and new password are required", "error"); return;
    }
    try {
      setSubmitting(true);
      const res = await API.post("/reset-password", { email: resetEmail, token: resetToken, newPassword: resetNewPass });
      showMsg(res.data?.message || "Password reset successful", "success");
      setAuthMode("login"); setEmail(resetEmail); setPassword(""); setResetNewPass(""); setResetToken("");
    } catch (err) {
      showMsg(err.response?.data?.message || "Reset failed", "error");
    } finally { setSubmitting(false); }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    clearMsg();
  };

  const isKycVerified = String(user?.verificationStatus || "").toLowerCase() === "verified";
  const isAdminUser = Boolean(user?.isAdmin);

  const msgClass =
    msgType === "error"   ? "status-alert status-alert--error" :
    msgType === "success" ? "status-alert status-alert--success" :
                            "status-alert status-alert--info";

  /* ============================================================
     AUTH VIEW
     ============================================================ */
  if (!user) {
    return (
      <div className="auth-page">
        {/* ── LEFT: navy brand panel ─────────────────────── */}
        <div className="auth-left">
          <div className="auth-left-bg-circle auth-left-bg-circle--1" />
          <div className="auth-left-bg-circle auth-left-bg-circle--2" />

          <div className="auth-brand-mark">SC</div>
          <h1 className="auth-brand-name">SnapCredit</h1>
          <p className="auth-tagline">
            Flexible Buy Now, Pay Later with transparent EMIs and a dashboard
            that keeps you in complete control.
          </p>

          <div className="auth-feature-cards">
            {[
              { icon: "⚡", title: "Instant Approval",   desc: "Quick eligibility checks with real-time credit decisions." },
              { icon: "📅", title: "Flexible EMI",       desc: "Choose 3–24 month plans that match your cash flow." },
              { icon: "🔒", title: "Secure Payments",    desc: "Bank-grade encryption — Razorpay powered checkout." },
            ].map(f => (
              <div key={f.title} className="auth-feature-card">
                <div className="auth-feature-icon">{f.icon}</div>
                <div>
                  <div className="auth-feature-title">{f.title}</div>
                  <div className="auth-feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: white form panel ────────────────────── */}
        <div className="auth-right">
          <div className="auth-panel">
            {/* Tabs */}
            <div className="auth-tabs" role="tablist">
              {[
                { key: "login",  label: "Login" },
                { key: "signup", label: "Sign Up" },
                { key: "forgot", label: "Reset" },
                { key: "admin", label: "Admin" },
              ].map(tab => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={authMode === tab.key || (tab.key === "forgot" && authMode === "reset")}
                  className={`auth-tab${authMode === tab.key || (tab.key === "forgot" && authMode === "reset") ? " auth-tab--active" : ""}`}
                  onClick={() => { setAuthMode(tab.key); clearMsg(); }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── LOGIN ── */}
            {authMode === "login" && (
              <form onSubmit={handleLogin}>
                <h2 className="auth-heading">Welcome back</h2>
                <p className="auth-subheading">Sign in to continue to your dashboard.</p>

                <div className="form-field">
                  <label className="form-label" htmlFor="login-email">Email address</label>
                  <input
                    id="login-email"
                    type="email"
                    className="form-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="login-password">Password</label>
                  <div className="form-input-wrapper">
                    <input
                      id="login-password"
                      type={showPass ? "text" : "password"}
                      className="form-input form-input--with-icon"
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="form-input-icon"
                      onClick={() => setShowPass(p => !p)}
                      aria-label={showPass ? "Hide password" : "Show password"}
                    >
                      {showPass ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: 8 }}>
                  {isSubmitting ? "Signing in…" : "Login →"}
                </button>
              </form>
            )}

            {/* ── ADMIN LOGIN ── */}
            {authMode === "admin" && (
              <form onSubmit={handleAdminLogin}>
                <h2 className="auth-heading">Admin Portal</h2>
                <p className="auth-subheading">Use dedicated admin credentials to access user risk and control dashboards.</p>

                <div className="form-field">
                  <label className="form-label" htmlFor="admin-email">Admin email</label>
                  <input
                    id="admin-email"
                    type="email"
                    className="form-input"
                    placeholder="admin@snapcredit.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="username"
                  />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="admin-password">Admin password</label>
                  <div className="form-input-wrapper">
                    <input
                      id="admin-password"
                      type={showPass ? "text" : "password"}
                      className="form-input form-input--with-icon"
                      placeholder="Enter admin password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button type="button" className="form-input-icon" onClick={() => setShowPass(p => !p)}>
                      {showPass ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: 8 }}>
                  {isSubmitting ? "Signing in…" : "Login as Admin →"}
                </button>
              </form>
            )}

            {/* ── SIGNUP ── */}
            {authMode === "signup" && (
              <form onSubmit={handleSignup}>
                <h2 className="auth-heading">Create account</h2>
                <p className="auth-subheading">OTP verification keeps your account secure.</p>

                <div className="form-field">
                  <label className="form-label" htmlFor="signup-name">Full name</label>
                  <input id="signup-name" type="text" className="form-input" placeholder="Rahul Sharma" value={name} onChange={e => setName(e.target.value)} />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="signup-email">Email address</label>
                  <input id="signup-email" type="email" className="form-input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="signup-phone">Phone (optional)</label>
                  <input id="signup-phone" type="tel" className="form-input" placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="signup-password">Password</label>
                  <div className="form-input-wrapper">
                    <input
                      id="signup-password"
                      type={showPass ? "text" : "password"}
                      className="form-input form-input--with-icon"
                      placeholder="Create a strong password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                    <button type="button" className="form-input-icon" onClick={() => setShowPass(p => !p)}>
                      {showPass ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="signup-otp">OTP code</label>
                  <div className="otp-row">
                    <input id="signup-otp" type="text" className="form-input" placeholder="6-digit OTP" value={otpCode} onChange={e => setOtpCode(e.target.value)} />
                    <button type="button" className="otp-send-btn" onClick={handleSendOtp} disabled={otpSending}>
                      {otpSending ? "Sending…" : "Send OTP"}
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: 4 }}>
                  {isSubmitting ? "Creating account…" : "Create Account →"}
                </button>
              </form>
            )}

            {/* ── FORGOT ── */}
            {authMode === "forgot" && (
              <form onSubmit={handleForgotPassword}>
                <h2 className="auth-heading">Reset password</h2>
                <p className="auth-subheading">We'll send a secure reset link to your inbox.</p>

                <div className="form-field">
                  <label className="form-label" htmlFor="forgot-email">Email address</label>
                  <input id="forgot-email" type="email" className="form-input" placeholder="you@example.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} />
                </div>

                <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: 4 }}>
                  {isSubmitting ? "Sending…" : "Send Reset Link →"}
                </button>
              </form>
            )}

            {/* ── RESET ── */}
            {authMode === "reset" && (
              <form onSubmit={handleResetPassword}>
                <h2 className="auth-heading">New password</h2>
                <p className="auth-subheading">Paste the token from your email if not auto-filled.</p>

                <div className="form-field">
                  <label className="form-label" htmlFor="reset-email">Email address</label>
                  <input id="reset-email" type="email" className="form-input" placeholder="you@example.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="reset-token">Reset token</label>
                  <input id="reset-token" type="text" className="form-input" placeholder="Paste token from email" value={resetToken} onChange={e => setResetToken(e.target.value)} />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="reset-new-pass">New password</label>
                  <div className="form-input-wrapper">
                    <input
                      id="reset-new-pass"
                      type={showNewPass ? "text" : "password"}
                      className="form-input form-input--with-icon"
                      placeholder="Create new password"
                      value={resetNewPass}
                      onChange={e => setResetNewPass(e.target.value)}
                    />
                    <button type="button" className="form-input-icon" onClick={() => setShowNewPass(p => !p)}>
                      {showNewPass ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: 4 }}>
                  {isSubmitting ? "Resetting…" : "Reset Password →"}
                </button>
              </form>
            )}

            {/* Status message */}
            {message && (
              <p className={msgClass} role={msgType === "error" ? "alert" : "status"} aria-live="polite">
                {message}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ============================================================
     AUTHENTICATED VIEW — navbar + routes
     ============================================================ */
  return (
    <div className="app">
      {/* ── TOP NAV ─────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-inner">
          {/* Brand */}
          <Link to="/" className="topbar-brand">
            <div className="topbar-brand-mark">SC</div>
            <span className="topbar-brand-name">SnapCredit</span>
          </Link>

          {/* Nav links */}
          <nav className="topbar-nav" aria-label="Primary navigation">
            <NavLink to="/">Home</NavLink>
            {!isAdminUser && <NavLink to="/repayment">Repayment</NavLink>}
            {!isAdminUser && <NavLink to="/history">History</NavLink>}
            {!isAdminUser && <NavLink to="/emi-schedule">EMI</NavLink>}
            {!isAdminUser && <NavLink to="/subscription-hub">Subscription Hub</NavLink>}
            <NavLink to="/analytics">Analytics</NavLink>
            <NavLink to="/support">Support</NavLink>
            <NavLink to="/settings">Settings</NavLink>
            {!isAdminUser && <NavLink to="/student-verification">Student BNPL</NavLink>}
            {isAdminUser && <NavLink to="/admin">Admin</NavLink>}
          </nav>

          {/* Actions */}
          <div className="topbar-actions">
            {user?.name && (
              <>
                {!isAdminUser && !isKycVerified ? (
                  <button
                    className="topbar-verify-btn"
                    onClick={() => setShowVerificationForm(true)}
                    aria-label="Open Verification Form"
                  >
                    Verify
                  </button>
                ) : !isAdminUser ? (
                  <span
                    className="topbar-verify-btn"
                    style={{ cursor: "default", opacity: 0.9 }}
                    aria-label="KYC already verified"
                  >
                    Verified
                  </span>
                ) : null}
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Hi, {user.name.split(" ")[0]} 👋
                </span>
              </>
            )}
            <button className="topbar-logout" onClick={logout} aria-label="Logout">
              Logout
            </button>
          </div>

          {/* Verification Form Modal */}
          {showVerificationForm && (
            <VerificationForm
              user={user}
              onClose={() => setShowVerificationForm(false)}
              onSuccess={async (payload) => {
                await fetchDashboard();
                const assignedLimit = Number(payload?.decision?.assignedCreditLimit || 0);
                const approvalStatus = String(payload?.decision?.approvalStatus || "").toLowerCase();
                const approved = approvalStatus === "approved" || assignedLimit > 0;
                showMsg(
                  approved
                    ? `Verification successful. Credit limit updated to ₹${assignedLimit.toLocaleString("en-IN")}`
                    : "Verification completed. Not approved / not eligible at this time.",
                  approved ? "success" : "error"
                );
                setShowVerificationForm(false);
              }}
            />
          )}
        </div>
      </header>

      {/* ── MAIN CONTENT ────────────────────────────────── */}
      <main id="main-content" className="main-content">
        {message && (
          <p className={`${msgClass}`} style={{ marginBottom: 20 }}
             role={msgType === "error" ? "alert" : "status"} aria-live="polite">
            {message}
          </p>
        )}

        <AnimatePresence mode="wait" initial={!prefersReduced}>
          <Routes location={location} key={location.pathname}>
            <Route path="/checkout" element={<BNPLCheckout />} />
            <Route path="/" element={
              <AnimatedPage preset="home" reducedMotion={prefersReduced}>
                <Home user={user} onUpdate={fetchDashboard} onVerify={() => setShowVerificationForm(true)} />
              </AnimatedPage>
            } />
            <Route path="/repayment" element={
              <AnimatedPage preset="slide" reducedMotion={prefersReduced}>
                <Suspense fallback={<RouteFallback />}>
                  <Repayment user={user} onUpdate={fetchDashboard} />
                </Suspense>
              </AnimatedPage>
            } />
            <Route path="/history" element={
              <AnimatedPage preset="slide" reducedMotion={prefersReduced}>
                <Suspense fallback={<RouteFallback />}>
                  <History />
                </Suspense>
              </AnimatedPage>
            } />
            <Route path="/emi-schedule" element={
              <AnimatedPage preset="slide" reducedMotion={prefersReduced}>
                <Suspense fallback={<RouteFallback />}>
                  <EMISchedule user={user} />
                </Suspense>
              </AnimatedPage>
            } />
            <Route path="/subscription-hub" element={
              <AnimatedPage preset="slide" reducedMotion={prefersReduced}>
                <Suspense fallback={<RouteFallback />}>
                  <SubscriptionHub user={user} onUpdate={fetchDashboard} />
                </Suspense>
              </AnimatedPage>
            } />
            <Route path="/analytics" element={
              <AnimatedPage preset="slide" reducedMotion={prefersReduced}>
                <Suspense fallback={<RouteFallback />}>
                  <Analytics user={user} />
                </Suspense>
              </AnimatedPage>
            } />
            <Route path="/support" element={
              <AnimatedPage preset="fade" reducedMotion={prefersReduced}>
                <Suspense fallback={<RouteFallback />}>
                  <Support />
                </Suspense>
              </AnimatedPage>
            } />
            <Route path="/settings" element={
              <AnimatedPage preset="fade" reducedMotion={prefersReduced}>
                <Suspense fallback={<RouteFallback />}>
                  <AccountSettings user={user} onLogout={logout} />
                </Suspense>
              </AnimatedPage>
            } />
            <Route path="/student-verification" element={
              <AnimatedPage preset="slide" reducedMotion={prefersReduced}>
                <Suspense fallback={<RouteFallback />}>
                  <StudentVerification user={user} onUpdate={fetchDashboard} />
                </Suspense>
              </AnimatedPage>
            } />
            <Route path="/admin" element={
              <AnimatedPage preset="fade" reducedMotion={prefersReduced}>
                <Suspense fallback={<RouteFallback />}>
                  <AdminDashboard user={user} />
                </Suspense>
              </AnimatedPage>
            } />
          </Routes>
        </AnimatePresence>
      </main>
    </div>
  );
}

function AppWrapper() {
  return (
    <Router basename="/bnpl">
      <App />
    </Router>
  );
}

export default AppWrapper;
