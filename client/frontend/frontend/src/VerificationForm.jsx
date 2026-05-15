import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "./services/api";

const buildCustomerId = (user) => {
  const rawId = String(user?.id || user?._id || "").trim();
  if (!rawId) return "";
  return `CUST-${rawId.slice(-8).toUpperCase()}`;
};

const DEFAULT_RISK_THRESHOLD = 72;

export default function VerificationForm({ onClose, onSuccess, user }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    customerId: buildCustomerId(user),
    fullName: "",
    panNumber: "",
    age: "",
    phoneNumber: "",
    monthlyIncome: "",
    employmentType: "",
    existingEmi: "0",
    yearsEmployed: "1",
    cityTier: "2",
  });

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      customerId: buildCustomerId(user) || prev.customerId,
    }));
  }, [user]);

  const [panValidated, setPanValidated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState("");
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  const phoneRegex = /^\d{10}$/;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const normalizedValue =
      name === "panNumber"
        ? value.toUpperCase().replace(/[^A-Z0-9]/g, "")
        : name === "phoneNumber" || name === "guarantorPhone"
        ? value.replace(/\D/g, "")
        : value;

    setFormData((prev) => ({
      ...prev,
      [name]: normalizedValue,
    }));

    if (name === "panNumber" && panValidated) {
      setPanValidated(false);
    }
  };

  const validatePAN = async () => {
    const pan = String(formData.panNumber || "").toUpperCase().trim();

    if (!pan || !panRegex.test(pan)) {
      setMessage("Invalid PAN format. Format: AAAAA0000A");
      setMsgType("error");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await API.post("/kyc/verify-pan", {
        pan,
      });

      if (response.status === 200) {
        setFormData((prev) => ({ ...prev, panNumber: pan }));
        setPanValidated(true);
        setMessage("PAN validated successfully");
        setMsgType("success");
      }
    } catch (err) {
      setMessage(err.response?.data?.message || "PAN validation failed");
      setMsgType("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!String(formData.fullName || "").trim()) {
      setMessage("Please enter your full name");
      setMsgType("error");
      return;
    }

    if (!formData.panNumber || !panValidated) {
      setMessage("Please validate PAN first");
      setMsgType("error");
      return;
    }

    if (!phoneRegex.test(String(formData.phoneNumber || "").trim())) {
      setMessage("Please enter a valid 10-digit phone number");
      setMsgType("error");
      return;
    }

    if (!formData.age || parseInt(formData.age) < 18) {
      setMessage("Age must be at least 18");
      setMsgType("error");
      return;
    }

    if (!formData.employmentType) {
      setMessage("Please select employment type");
      setMsgType("error");
      return;
    }

    if (!formData.monthlyIncome || Number(formData.monthlyIncome) < 0) {
      setMessage("Please enter a valid monthly income");
      setMsgType("error");
      return;
    }

    if (String(formData.employmentType || "").toLowerCase() === "student") {
      if (onClose) onClose();
      navigate("/student-verification", {
        state: {
          fromVerification: true,
          returnTo: "/",
          fullName: String(formData.fullName || "").trim(),
          panNumber: formData.panNumber,
          phoneNumber: String(formData.phoneNumber || "").trim(),
        },
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const submitData = {
        customerId: String(formData.customerId || "").trim(),
        fullName: String(formData.fullName || "").trim(),
        panNumber: formData.panNumber,
        phoneNumber: String(formData.phoneNumber || "").trim(),
        age: parseInt(formData.age),
        monthlyIncome: Number(formData.monthlyIncome),
        employmentType: formData.employmentType,
        existingEmi: Number(formData.existingEmi) || 0,
        yearsEmployed: Number(formData.yearsEmployed) || 1,
        cityTier: formData.cityTier || "2",
        riskThreshold: DEFAULT_RISK_THRESHOLD,
      };

      const response = await API.post("/kyc/submit", submitData);

      if (response.status === 200) {
        const approvalStatus = String(
          response?.data?.decision?.approvalStatus || ""
        )
          .trim()
          .toLowerCase();

        const limit = Number(
          response?.data?.decision?.assignedCreditLimit ??
          response?.data?.kyc?.assignedCreditLimit ??
          0
        );

        const isApproved = approvalStatus === "approved" || limit > 0;
        if (isApproved) {
          setMessage(
            `Approved. Credit limit assigned: ₹${limit.toLocaleString("en-IN")}`
          );
          setMsgType("success");
        } else {
          setMessage("Not approved / Not eligible based on current verification details");
          setMsgType("error");
        }

        if (onSuccess) onSuccess(response.data);
        setTimeout(() => {
          if (onClose) onClose();
        }, 2000);
      }
    } catch (err) {
      setMessage(err.response?.data?.message || "Submission failed");
      setMsgType("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="verification-form-overlay">
      <div className="verification-form-modal">
        <div className="verification-form-header">
          <h2>Verification Form</h2>
          <button
            className="verification-form-close"
            onClick={onClose}
            aria-label="Close form"
          >
            ✕
          </button>
        </div>

        {message && (
          <div className={`verification-msg verification-msg--${msgType}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="verification-form">
          <div className="verification-field">
            <label htmlFor="customerId">Customer ID</label>
            <input
              type="text"
              id="customerId"
              name="customerId"
              placeholder="Customer ID is set automatically"
              value={formData.customerId}
              onChange={handleInputChange}
              maxLength="40"
              readOnly
            />
          </div>

          {/* Full Name */}
          <div className="verification-field">
            <label htmlFor="fullName">Full Name *</label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              placeholder="Enter your full name"
              value={formData.fullName}
              onChange={handleInputChange}
              maxLength="80"
              required
            />
          </div>

          {/* PAN Number */}
          <div className="verification-field">
            <label htmlFor="panNumber">PAN Number *</label>
            <div className="verification-input-group">
              <input
                type="text"
                id="panNumber"
                name="panNumber"
                placeholder="AAAAA0000A"
                value={formData.panNumber}
                onChange={handleInputChange}
                disabled={panValidated}
                maxLength="10"
                pattern="[A-Z]{5}[0-9]{4}[A-Z]"
                title="PAN format: AAAAA0000A"
                autoCapitalize="characters"
              />
              <button
                type="button"
                className={`verification-btn-validate ${
                  panValidated ? "verified" : ""
                }`}
                onClick={validatePAN}
                disabled={panValidated || isSubmitting}
              >
                {panValidated ? "✓ Validated" : "Validate"}
              </button>
            </div>
          </div>

          <div className="verification-field">
            <label htmlFor="phoneNumber">Phone Number *</label>
            <input
              type="text"
              id="phoneNumber"
              name="phoneNumber"
              placeholder="Enter 10-digit phone number"
              value={formData.phoneNumber}
              onChange={handleInputChange}
              maxLength="10"
              pattern="[0-9]{10}"
              title="Phone number must be exactly 10 digits"
              required
            />
          </div>

          {/* Age */}
          <div className="verification-field">
            <label htmlFor="age">Age *</label>
            <input
              type="number"
              id="age"
              name="age"
              min="18"
              max="100"
              placeholder="Enter your age"
              value={formData.age}
              onChange={handleInputChange}
            />
          </div>

          <div className="verification-field">
            <label htmlFor="monthlyIncome">Monthly Income *</label>
            <input
              type="number"
              id="monthlyIncome"
              name="monthlyIncome"
              min="0"
              placeholder="Enter monthly income"
              value={formData.monthlyIncome}
              onChange={handleInputChange}
              required
            />
          </div>

          {/* Employment Type */}
          <div className="verification-field">
            <label htmlFor="employmentType">Employment Type *</label>
            <select
              id="employmentType"
              name="employmentType"
              value={formData.employmentType}
              onChange={handleInputChange}
            >
              <option value="">-- Select --</option>
              <option value="government">Government</option>
              <option value="private">Private</option>
              <option value="self-employed">Self-employed</option>
              <option value="student">Student</option>
              <option value="unemployed">Unemployed</option>
            </select>
          </div>

          {/* Years Employed */}
          <div className="verification-field">
            <label htmlFor="yearsEmployed">Years Employed</label>
            <input
              type="number"
              id="yearsEmployed"
              name="yearsEmployed"
              min="0"
              max="60"
              step="0.5"
              placeholder="Enter years of employment (e.g., 5)"
              value={formData.yearsEmployed}
              onChange={handleInputChange}
            />
          </div>

          {/* Existing EMI */}
          <div className="verification-field">
            <label htmlFor="existingEmi">Existing EMI (Monthly)</label>
            <input
              type="number"
              id="existingEmi"
              name="existingEmi"
              min="0"
              placeholder="Enter existing monthly EMI (default: 0)"
              value={formData.existingEmi}
              onChange={handleInputChange}
            />
          </div>

          {/* City Tier */}
          <div className="verification-field">
            <label htmlFor="cityTier">City Tier</label>
            <select
              id="cityTier"
              name="cityTier"
              value={formData.cityTier}
              onChange={handleInputChange}
            >
              <option value="1">Tier 1 (Metro - Delhi, Mumbai, Bangalore, Hyderabad)</option>
              <option value="2">Tier 2 (Major Cities)</option>
              <option value="3">Tier 3 (Other Cities)</option>
              <option value="4">Tier 4 (Small Cities/Towns)</option>
            </select>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="verification-btn-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit Verification"}
          </button>
        </form>
      </div>
    </div>
  );
}
