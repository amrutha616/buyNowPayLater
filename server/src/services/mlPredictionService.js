const DEFAULT_PREDICTION_URL = process.env.PYTHON_PREDICTION_API_URL || "http://127.0.0.1:8888/predict";
const DEFAULT_TIMEOUT_MS = Math.max(1000, Number(process.env.PYTHON_PREDICTION_TIMEOUT_MS || 4000));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeEmploymentType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "salaried" || normalized === "private" || normalized === "government" || normalized === "working") {
    return "Private";
  }
  if (normalized === "self-employed" || normalized === "self employed" || normalized === "self_employed") {
    return "Self-employed";
  }
  if (normalized === "student") {
    return "Student";
  }
  return "Unemployed";
};

const normalizePredictionResponse = (payload) => {
  const assignedCreditLimit = Math.max(0, Math.round(toNumber(payload?.assigned_credit_limit, 0)));
  const approvalOutcome = String(payload?.approval_outcome || "Rejected").trim();
  const approvalStatus = String(payload?.approval_status || "not_eligible").trim().toLowerCase() === "approved"
    ? "approved"
    : "not_eligible";

  return {
    approvalStatus,
    approvalOutcome,
    eligibilityStatus: approvalStatus === "approved" ? "approved" : "rejected",
    assignedCreditLimit,
    modelRiskPercent: toNumber(payload?.model_risk_percent, 0),
    modelCreditScore: Math.round(toNumber(payload?.model_credit_score, 0)),
    reasons: Array.isArray(payload?.reasons) ? payload.reasons.map((item) => String(item)) : [],
    decisionSource: String(payload?.decision_source || payload?.decisionSource || "python_api").trim() || "python_api",
    traceId: String(payload?.trace_id || "").trim(),
    thresholdBreach: Boolean(payload?.threshold_breach),
    riskThreshold: toNumber(payload?.risk_threshold, 72),
  };
};

const predictKycUsingPythonApi = async ({
  customerId,
  fullName,
  panNumber,
  monthlyIncome,
  age,
  employmentType,
  existingEmi,
  yearsEmployed,
  cityTier,
  student,
  riskThreshold,
}) => {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable in this Node runtime");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const requestPayload = {
      customer_id: String(customerId || "").trim(),
      full_name: String(fullName || "").trim(),
      pan_number: String(panNumber || "").trim().toUpperCase(),
      monthly_income: Math.max(0, toNumber(monthlyIncome, 0)),
      age: Math.max(18, Math.round(toNumber(age, 18))),
      employment_type: normalizeEmploymentType(employmentType),
      existing_emi: Math.max(0, toNumber(existingEmi, 0)),
      years_employed: Math.max(0, toNumber(yearsEmployed, 0)),
      city_tier: String(cityTier || "").trim(),
      is_student: Boolean(student),
      risk_threshold: Math.max(20, Math.min(95, toNumber(riskThreshold, 72))),
    };

    console.log(`[ML] Fetching ML prediction from: ${DEFAULT_PREDICTION_URL}`);
    console.log("[ML] Request payload:", requestPayload);

    const response = await fetch(DEFAULT_PREDICTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const upstreamMessage = String(data?.detail || data?.message || "Prediction API request failed");
      console.error(`[ML-ERROR] ML API Error (${response.status}):`, upstreamMessage);
      throw new Error(upstreamMessage);
    }

    console.log("[ML-SUCCESS] ML API Response:", data);
    return normalizePredictionResponse(data);
  } catch (error) {
    console.error("[ML-EXCEPTION] ML Prediction Service Error:", error.message);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  predictKycUsingPythonApi,
};
