import { useState, useEffect } from "react";
import API from "./services/api";

export default function Referral() {
  const [referralInfo, setReferralInfo] = useState(null);
  const [referralEmail, setReferralEmail] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchReferralInfo();
  }, []);

  const fetchReferralInfo = async () => {
    try {
      const res = await API.get("/referral");
      setReferralInfo(res.data.referral);
    } catch (err) {
      setMessage("Failed to load referral info");
    }
  };

  const copyReferralCode = () => {
    if (referralInfo?.referralCode) {
      navigator.clipboard.writeText(referralInfo.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareReferral = async (e) => {
    e.preventDefault();
    try {
      await API.post("/referral/refer", {
        referralCode: referralInfo.referralCode,
        referredEmail: referralEmail,
      });
      setMessage("✓ Referral invitation sent!");
      setReferralEmail("");
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to send referral");
    }
  };

  const claimBonus = async () => {
    try {
      const res = await API.post("/referral/claim-bonus", {
        referralCode: referralInfo.referralCode,
      });
      setMessage(res.data.message);
      fetchReferralInfo();
    } catch (err) {
      setMessage(err.response?.data?.message || "No bonus to claim");
    }
  };

  if (!referralInfo) return <div className="loading">Loading...</div>;

  return (
    <div className="referral-page">
      <section className="overview">
        <h2>🎁 Referral Program</h2>
        <p className="muted">Earn bonus credit for each friend you refer</p>
      </section>

      <div className="referral-content">
        <div className="referral-card">
          <h3>Your Referral Code</h3>
          <div className="code-display">
            <input
              type="text"
              value={referralInfo.referralCode}
              readOnly
              className="code-input"
            />
            <button onClick={copyReferralCode} className="ghost-button">
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <p className="muted">Share this code with friends to earn bonuses</p>
        </div>

        <div className="referral-card">
          <h3>Invite a Friend</h3>
          <form onSubmit={shareReferral} className="referral-form">
            <input
              type="email"
              value={referralEmail}
              onChange={(e) => setReferralEmail(e.target.value)}
              placeholder="Friend's email"
              required
            />
            <button type="submit" className="primary-button">
              Send Invitation
            </button>
          </form>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Referrals</h3>
            <p className="big-number">{referralInfo.totalReferrals}</p>
          </div>
          <div className="stat-card">
            <h3>Bonus Earned</h3>
            <p className="big-number">₹{referralInfo.totalBonusEarned}</p>
          </div>
          <div className="stat-card">
            <h3>Per Referral</h3>
            <p className="big-number">₹{referralInfo.bonusPerReferral}</p>
          </div>
        </div>

        {referralInfo.referrals?.some((r) => !r.bonusAwarded) && (
          <button onClick={claimBonus} className="primary-button claim-bonus-btn">
            Claim Pending Bonus
          </button>
        )}

        <div className="referrals-list">
          <h3>Your Referrals</h3>
          {referralInfo.referrals?.map((ref, idx) => (
            <div key={idx} className="referral-item">
              <div>{ref.referredEmail}</div>
              <span className={`badge ${ref.status}`}>{ref.status}</span>
              {ref.bonusAwarded && <span className="bonus-badge">✓ Bonus Claimed</span>}
            </div>
          ))}
        </div>
      </div>

      {message && <p className="message">{message}</p>}
    </div>
  );
}
