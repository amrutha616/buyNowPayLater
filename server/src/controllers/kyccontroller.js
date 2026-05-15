const { isValidPAN, simulateCreditBureau, validatePANForIndividual, verifyPanWithProvider } = require("../services/panVerificationService");
const { analyzeBankStatement } = require("../services/bankStatementService");
const CreditReport = require("../models/CreditReport");
const BankStatement = require("../models/BankStatement");
const KYCDocument = require("../models/KYCDocument");
const KYC = require("../models/kycModel");
const User = require("../models/userModel");
const Loan = require("../models/Loan");
const { predictKycUsingPythonApi } = require("../services/mlPredictionService");

const EMPLOYMENT_TYPES = new Set(["salaried", "self-employed", "student", "unemployed"]);
const CITY_TIER_VALUES = new Set(["1", "2", "3", "4", "tier-1", "tier-2", "tier-3", "tier-4"]);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePhone = (value) => String(value || "").replace(/\D/g, "").slice(0, 10);

const normalizeCityTier = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.startsWith("tier-")) return normalized;
  return CITY_TIER_VALUES.has(normalized) ? `tier-${normalized}` : normalized;
};

const parseStudentFlag = (value, employmentType) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "yes" || normalized === "true") return true;
  if (normalized === "no" || normalized === "false") return false;
  return employmentType === "student";
};

const parseEmploymentType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "unemployed";

  if (normalized === "salaried" || normalized === "working" || normalized === "private" || normalized === "government") {
    return "salaried";
  }

  if (normalized === "self-employed" || normalized === "self employed" || normalized === "self_employed") {
    return "self-employed";
  }

  if (normalized === "student") {
    return "student";
  }

  if (normalized === "unemployed") {
    return "unemployed";
  }

  return "unemployed";
};

const parseMonthlyIncome = (monthlyIncomeInput, incomeRangeInput, fallback = 0) => {
  const directIncome = Number(monthlyIncomeInput);
  if (Number.isFinite(directIncome) && directIncome >= 0) {
    return directIncome;
  }

  const normalizedRange = String(incomeRangeInput || "").trim().toLowerCase();
  const rangeMap = {
    "0-25000": 12500,
    "25000-50000": 37500,
    "50000-100000": 75000,
    "100000+": 125000,
    "above 100000": 125000,
  };

  if (normalizedRange && rangeMap[normalizedRange] !== undefined) {
    return rangeMap[normalizedRange];
  }

  const fallbackIncome = Number(fallback);
  return Number.isFinite(fallbackIncome) && fallbackIncome >= 0 ? fallbackIncome : 0;
};

const deriveIncomeStability = ({ employmentType, yearsEmployed, cityTier, student }) => {
  if (student) return 0.42;

  const years = toNumber(yearsEmployed, 0);
  const tier = String(cityTier || "").trim().toLowerCase();

  let base = employmentType === "salaried" ? 0.86 : employmentType === "self-employed" ? 0.66 : 0.38;
  if (years >= 3) base += 0.08;
  else if (years >= 1) base += 0.04;
  if (tier === "tier-1" || tier === "1") base += 0.04;
  if (tier === "tier-4" || tier === "4") base -= 0.03;

  return Math.max(0.2, Math.min(0.98, base));
};

const deriveExistingLoanCount = (existingEmi, monthlyIncome) => {
  if (existingEmi <= 0) return 0;
  if (monthlyIncome <= 0) return 1;

  const ratio = existingEmi / monthlyIncome;
  if (ratio < 0.15) return 1;
  if (ratio < 0.35) return 2;
  if (ratio < 0.6) return 3;
  return 4;
};

const mapScoreToCreditPolicy = (score) => {
  const safeScore = Math.max(300, Math.min(900, Number(score) || 300));

  if (safeScore < 550) {
    return {
      creditBand: "VERY_HIGH_RISK",
      eligibilityStatus: "rejected",
      assignedCreditLimit: 0,
      reasons: ["Simulated credit score is below the minimum threshold"],
    };
  }

  if (safeScore < 650) {
    return {
      creditBand: "HIGH_RISK",
      eligibilityStatus: "manual_review",
      assignedCreditLimit: 10000,
      reasons: ["Borderline credit profile; manual review required"],
    };
  }

  if (safeScore < 750) {
    return {
      creditBand: "MEDIUM_RISK",
      eligibilityStatus: "approved",
      assignedCreditLimit: 35000,
      reasons: [],
    };
  }

  return {
    creditBand: "LOW_RISK",
    eligibilityStatus: "approved",
    assignedCreditLimit: 75000,
    reasons: [],
  };
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const calculateEmi = (principal, annualRatePct, tenureMonths) => {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  const monthlyRate = annualRatePct / 12 / 100;
  if (monthlyRate === 0) return principal / tenureMonths;

  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  const amortized = (principal * monthlyRate * factor) / (factor - 1);
  const minDue = principal * 0.05;
  return Math.max(amortized, minDue);
};

const assignLimitFromProfile = ({ monthlyIncome, age, employmentType }) => {
  const income = Math.max(0, Number(monthlyIncome) || 0);

  const employmentFactor = {
    salaried: 1.0,
    "self-employed": 0.9,
    student: 0.6,
    unemployed: 0.45,
  }[employmentType] || 0.85;

  const ageFactor = age < 23 ? 0.9 : age <= 45 ? 1.0 : 0.95;
  const profileLimit = income * 0.55 * employmentFactor * ageFactor;
  const bounded = clamp(profileLimit, 2000, Math.min(50000, income * 1.5 || 2000));
  return Math.round(bounded / 500) * 500;
};

const calculateCreditScore = ({ monthlyIncome, loanAmount, age, employmentType, emiToIncome }) => {
  const income = Math.max(1, Number(monthlyIncome) || 1);
  const loan = Math.max(0, Number(loanAmount) || 0);
  const lti = loan / income;

  let score = 700;
  if (lti < 0.3) score += 50;
  else if (lti < 0.6) score += 20;
  else if (lti < 1) score -= 50;
  else score -= 100;

  if (age < 24) score -= 30;
  else if (age <= 45) score += 20;
  else score -= 10;

  if (employmentType === "salaried") score += 20;
  else if (employmentType === "self-employed") score -= 20;
  else if (employmentType === "student") score -= 80;
  else score -= 100;

  if (emiToIncome <= 0.15) score += 10;
  else if (emiToIncome <= 0.30) score += 0;
  else if (emiToIncome <= 0.45) score -= 40;
  else score -= 80;

  return Math.round(clamp(score, 300, 780));
};

const evaluateApproval = (riskPercent, creditScore, emiToIncome) => {
  if (riskPercent < 40 && creditScore >= 700 && emiToIncome <= 0.35) {
    return "Approved";
  }
  if (riskPercent < 70 && creditScore >= 650) {
    return "Approved with Limit";
  }
  return "Rejected";
};

const recommendCreditLimit = (income, riskPercent, creditScore, emiToIncome) => {
  const safeIncome = Math.max(0, Number(income) || 0);
  if (riskPercent >= 70 || creditScore < 620 || safeIncome <= 0) return 0;

  let maxCap = safeIncome * 2;
  if (riskPercent >= 55 || creditScore < 680) maxCap = safeIncome * 0.8;
  else if (riskPercent >= 40 || creditScore < 730) maxCap = safeIncome * 1.25;

  const scoreFactor = clamp((creditScore - 300) / 600, 0.35, 1.0);
  const riskFactor = Math.max(0.2, 1.0 - riskPercent / 120);
  const affordabilityFactor = Math.max(0.25, 1.0 - emiToIncome * 1.25);

  let limit = safeIncome * 0.9 * scoreFactor * riskFactor * affordabilityFactor * 1.8;
  limit = Math.min(limit, maxCap, 50000);
  limit = Math.max(2000, limit);
  return Math.round(limit / 500) * 500;
};

const getStarterLimit = (monthlyIncome) => {
  const income = Math.max(0, Number(monthlyIncome) || 0);
  if (income <= 20000) return 2000;
  if (income <= 50000) return 5000;
  return 10000;
};

const roundToFiveHundred = (value) => {
  return Math.max(0, Math.round((Number(value) || 0) / 500) * 500);
};

const countOnTimeRepayments = async (userId) => {
  const loans = await Loan.find({ user: userId })
    .select("installments.status installments.dueDate installments.paidDate")
    .lean();

  let onTimeRepayments = 0;
  for (const loan of loans || []) {
    for (const installment of loan.installments || []) {
      const status = String(installment?.status || "").toUpperCase();
      if (status !== "PAID") continue;

      const dueDate = installment?.dueDate ? new Date(installment.dueDate) : null;
      const paidDate = installment?.paidDate ? new Date(installment.paidDate) : null;
      if (!dueDate || Number.isNaN(dueDate.getTime()) || !paidDate || Number.isNaN(paidDate.getTime())) {
        continue;
      }

      if (paidDate.getTime() <= dueDate.getTime()) {
        onTimeRepayments += 1;
      }
    }
  }

  return onTimeRepayments;
};

const applyPracticalBnplLimitPolicy = ({ monthlyIncome, approvalStatus, onTimeRepayments }) => {
  if (approvalStatus !== "approved") {
    return {
      finalAssignedLimit: 0,
      starterLimit: 0,
      appliedRule: "rejected_no_limit",
    };
  }

  const income = Math.max(0, Number(monthlyIncome) || 0);
  const starterLimit = getStarterLimit(income);

  let finalLimit = starterLimit;
  let appliedRule = "starter_limit";

  if (onTimeRepayments >= 12) {
    finalLimit = income;
    appliedRule = "12_on_time_income_1x";
  } else if (onTimeRepayments >= 6) {
    finalLimit = starterLimit * 1.5;
    appliedRule = "6_on_time_plus_50pct";
  } else if (onTimeRepayments >= 3) {
    finalLimit = starterLimit * 1.25;
    appliedRule = "3_on_time_plus_25pct";
  }

  return {
    finalAssignedLimit: roundToFiveHundred(finalLimit),
    starterLimit,
    appliedRule,
  };
};

const predictKycDecision = ({ monthlyIncome, age, employmentType, existingEmi, riskThreshold }) => {
  const income = Math.max(0, Number(monthlyIncome) || 0);
  const baseLimit = assignLimitFromProfile({ monthlyIncome: income, age, employmentType });
  const emi = Number(existingEmi) > 0 ? Number(existingEmi) : calculateEmi(baseLimit, 12, 6);
  const emiToIncome = income > 0 ? emi / income : 1;
  const creditScore = calculateCreditScore({
    monthlyIncome: income,
    loanAmount: baseLimit,
    age,
    employmentType,
    emiToIncome,
  });

  let riskPercent = 55 - (creditScore - 300) / 12;
  if (employmentType === "student") riskPercent += 8;
  if (employmentType === "unemployed") riskPercent += 15;
  if (emiToIncome > 0.45) riskPercent += 15;
  else if (emiToIncome > 0.35) riskPercent += 8;
  riskPercent = clamp(riskPercent, 5, 99);

  const threshold = clamp(Number(riskThreshold) || 72, 20, 95);
  const thresholdBreach = riskPercent >= threshold;
  const approvalOutcome = thresholdBreach ? "Rejected" : evaluateApproval(riskPercent, creditScore, emiToIncome);
  const assignedLimit = approvalOutcome === "Rejected"
    ? 0
    : recommendCreditLimit(income, riskPercent, creditScore, emiToIncome);

  const reasons = [];
  if (approvalOutcome === "Rejected") {
    reasons.push("Model prediction marked this profile as not eligible");
  }
  if (emiToIncome > 0.4) {
    reasons.push("EMI to income ratio is high for safe BNPL usage");
  }
  if (thresholdBreach) {
    reasons.push(`Risk threshold of ${threshold}% was exceeded`);
  }

  return {
    approvalOutcome,
    approvalStatus: approvalOutcome === "Rejected" ? "not_eligible" : "approved",
    eligibilityStatus: approvalOutcome === "Rejected" ? "rejected" : "approved",
    assignedCreditLimit: assignedLimit,
    modelRiskPercent: Number(riskPercent.toFixed(2)),
    modelCreditScore: creditScore,
    thresholdBreach,
    riskThreshold: threshold,
    reasons,
  };
};

const computeDynamicCreditLimit = ({
  monthlyIncome,
  existingEmi,
  employmentType,
  student,
  yearsEmployed,
  eligibilityStatus,
  basePolicyLimit,
}) => {
  if (eligibilityStatus === "rejected") {
    return { assignedLimit: 0, reasons: [] };
  }

  const income = Math.max(0, Number(monthlyIncome) || 0);
  const emi = Math.max(0, Number(existingEmi) || 0);
  const debtRatio = income > 0 ? emi / income : 1;
  const employedYears = Math.max(0, Number(yearsEmployed) || 0);
  const reasons = [];

  let multiplier = eligibilityStatus === "approved" ? 0.52 : 0.22;
  if (employmentType === "salaried") multiplier += 0.08;
  if (employmentType === "student") multiplier -= 0.08;
  if (student) multiplier -= 0.04;
  if (employmentType === "unemployed") multiplier -= 0.14;
  if (employedYears >= 3) multiplier += 0.06;
  else if (employedYears >= 1) multiplier += 0.03;

  if (debtRatio >= 0.6) {
    multiplier -= 0.22;
    reasons.push("Existing EMI is high relative to monthly income");
  } else if (debtRatio >= 0.4) {
    multiplier -= 0.12;
    reasons.push("Existing EMI load reduced assigned limit");
  } else if (debtRatio >= 0.25) {
    multiplier -= 0.06;
  }

  multiplier = clamp(multiplier, 0.1, 0.75);

  const incomeCap = Math.max(0, Math.round(income * multiplier));
  const conservativeIncomeCap = Math.max(0, Math.round(income * 0.8));
  const policyLimit = Math.max(0, Number(basePolicyLimit) || 0);

  let assignedLimit = Math.min(policyLimit, incomeCap, conservativeIncomeCap);

  if (eligibilityStatus === "approved" && income > 0) {
    const minApproved = Math.min(15000, Math.round(income * 0.15));
    assignedLimit = Math.max(assignedLimit, minApproved);
  }

  if (eligibilityStatus === "manual_review") {
    assignedLimit = Math.min(assignedLimit, 10000);
  }

  assignedLimit = Math.max(0, Math.round(assignedLimit));

  if (income > 0 && assignedLimit >= income) {
    assignedLimit = Math.max(0, Math.round(income * 0.8));
  }

  if (assignedLimit < policyLimit) {
    reasons.push("Credit limit capped based on salary and repayment profile");
  }

  return { assignedLimit, reasons };
};

// ─── Response Filtering Helper ─────────────────────────────────────────────

const filterKycResponseForUser = (kycRecord, isAdmin = false) => {
  if (!kycRecord) return null;
  
  const record = kycRecord.toObject ? kycRecord.toObject() : { ...kycRecord };
  
  // Remove sensitive fields for non-admin users
  if (!isAdmin) {
    delete record.modelRiskPercent;
    delete record.modelCreditScore;
    delete record.modelRiskThreshold;
    delete record.thresholdBreach;
    delete record.rejectionReasons;
  }
  
  return record;
};

// ─── Legacy stubs (kept for backward compatibility) ──────────────────────────

exports.submitKyc = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const existingKyc = await KYC.findOne({ userId: user._id }).lean();
    if (existingKyc?.verificationStatus === "verified" && !req.body?.forceReevaluate) {
      return res.json({
        message: "KYC already verified for this user",
        kyc: existingKyc,
        decision: {
          verificationStatus: existingKyc.verificationStatus,
          eligibilityStatus: existingKyc.eligibilityStatus,
          approvalStatus: existingKyc.eligibilityStatus === "approved" ? "approved" : "not_eligible",
          simulatedCreditScore: existingKyc.simulatedCreditScore,
          creditBand: existingKyc.creditBand,
          assignedCreditLimit: existingKyc.assignedCreditLimit,
          rejectionReasons: existingKyc.rejectionReasons || [],
          cached: true,
        },
      });
    }

    const fullName = String(req.body?.fullName || user.name || "").trim();
    const pan = String(req.body?.pan || req.body?.panNumber || "").toUpperCase().trim();
    const phoneNumber = normalizePhone(req.body?.phoneNumber || req.body?.phone || user.phone || "");
    const employmentType = parseEmploymentType(req.body?.employmentType || user.employmentType);
    const monthlyIncome = parseMonthlyIncome(
      req.body?.monthlyIncome,
      req.body?.incomeRange,
      user.monthlyIncome
    );
    const age = toNumber(req.body?.age, user.age || 0);
    const yearsEmployed = toNumber(req.body?.yearsEmployed, 1);
    const existingEmi = toNumber(req.body?.existingEmi, 0);
    const cityTier = normalizeCityTier(req.body?.cityTier || "2");
    const riskThreshold = clamp(Number(req.body?.riskThreshold) || 72, 20, 95);
    const student = parseStudentFlag(req.body?.student, employmentType);

    if (!pan) {
      return res.status(400).json({ message: "PAN is required" });
    }

    if (!isValidPAN(pan)) {
      return res.status(400).json({ message: "Invalid PAN format. Expected: ABCDE1234F" });
    }

    if (!EMPLOYMENT_TYPES.has(employmentType)) {
      return res.status(400).json({ message: "Invalid employment type" });
    }

    if (!Number.isFinite(monthlyIncome) || monthlyIncome < 0) {
      return res.status(400).json({ message: "Monthly income must be a valid non-negative number" });
    }

    if (!phoneNumber || phoneNumber.length !== 10) {
      return res.status(400).json({ message: "Phone number must contain exactly 10 digits" });
    }

    const memberName = String(fullName || user.name || "").trim();
    const panValidation = validatePANForIndividual(pan, memberName);
    if (!panValidation.isValid) {
      const isNameMismatch = panValidation.reasons.some((reason) =>
        /surname initial does not match profile name/i.test(String(reason || ""))
      );

      return res.status(400).json({
        message: isNameMismatch
          ? "Invalid PAN: PAN number does not match member name"
          : "PAN verification failed",
        reasons: panValidation.reasons,
        panStatus: "INVALID",
      });
    }

    const bureauScore = Number(user.bureauScore || 0);
    const approvalScore = Number(user.creditScore || 0);
    const simulatedCreditScore = bureauScore > 0
      ? Math.round(Math.max(300, Math.min(900, bureauScore)))
      : Math.round(Math.max(300, Math.min(900, (approvalScore / 1000) * 900)));

    const policy = mapScoreToCreditPolicy(simulatedCreditScore);
    let modelDecision;
    try {
      console.log("[KYC] Calling Python ML API with:", {
        monthlyIncome,
        age,
        employmentType,
        yearsEmployed,
        existingEmi,
        cityTier,
        riskThreshold,
      });
      modelDecision = await predictKycUsingPythonApi({
        customerId: req.body?.customerId,
        fullName,
        panNumber: pan,
        monthlyIncome,
        age,
        employmentType,
        yearsEmployed,
        existingEmi,
        cityTier,
        student,
        riskThreshold,
      });
      console.log("[KYC-SUCCESS] Python ML API response:", modelDecision);
    } catch (predictionError) {
      console.warn("[KYC-FALLBACK] Python prediction API unavailable:", predictionError.message);
      console.warn("[KYC-FALLBACK] Falling back to local policy");
      modelDecision = {
        ...predictKycDecision({
          monthlyIncome,
          age,
          employmentType,
          riskThreshold,
        }),
        decisionSource: "local_fallback",
        traceId: "",
      };
      console.log("[KYC-FALLBACK] Local fallback decision:", modelDecision);
    }

    let eligibilityStatus = modelDecision.eligibilityStatus;
    let approvalStatus = modelDecision.approvalStatus;
    let assignedCreditLimit = modelDecision.assignedCreditLimit;
    const rejectionReasons = Array.from(new Set([...(policy.reasons || []), ...(modelDecision.reasons || [])]));

    if (policy.eligibilityStatus === "rejected") {
      eligibilityStatus = "rejected";
      approvalStatus = "not_eligible";
      assignedCreditLimit = 0;
    }

    if (monthlyIncome === 0 && employmentType !== "student") {
      eligibilityStatus = "rejected";
      approvalStatus = "not_eligible";
      assignedCreditLimit = 0;
      rejectionReasons.push("Monthly income cannot be zero for non-student profiles");
    }

    const onTimeRepayments = await countOnTimeRepayments(user._id);
    const practicalLimit = applyPracticalBnplLimitPolicy({
      monthlyIncome,
      approvalStatus,
      onTimeRepayments,
    });

    assignedCreditLimit = practicalLimit.finalAssignedLimit;
    if (approvalStatus === "approved") {
      rejectionReasons.push(
        `Practical BNPL policy applied: ${practicalLimit.appliedRule} (on-time repayments: ${onTimeRepayments})`
      );
    }

    const verificationStatus = eligibilityStatus === "approved"
      ? "verified"
      : eligibilityStatus === "manual_review"
        ? "pending"
        : "rejected";

    const kycPayload = {
      userId: user._id,
      fullName: fullName || user.name,
      age,
      panNumber: pan,
      phoneNumber,
      monthlyIncome,
      employmentType,
      yearsEmployed,
      existingEmi,
      cityTier,
      guarantorName: "",
      guarantorPhone: "",
      verificationStatus,
      simulatedCreditScore,
      creditBand: policy.creditBand,
      eligibilityStatus,
      assignedCreditLimit,
      modelRiskPercent: Number(modelDecision.modelRiskPercent || 0),
      modelRiskThreshold: Number(modelDecision.riskThreshold || riskThreshold),
      thresholdBreach: Boolean(modelDecision.thresholdBreach),
      decisionSource: modelDecision.decisionSource || "local_fallback",
      rejectionReasons: Array.from(new Set(rejectionReasons)),
      verifiedAt: verificationStatus === "verified" ? new Date() : null,
    };

    const kycRecord = await KYC.findOneAndUpdate(
      { userId: user._id },
      kycPayload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await User.findByIdAndUpdate(user._id, {
      name: fullName || user.name,
      phone: phoneNumber || user.phone,
      age,
      pan,
      monthlyIncome,
      employmentType,
      isEligible: eligibilityStatus === "approved",
      creditLimit: assignedCreditLimit,
      riskReasons: Array.from(new Set(rejectionReasons)),
      ...(bureauScore > 0 ? { bureauScore } : {}),
      ...(approvalScore > 0 ? { creditScore: approvalScore } : {}),
    });

    // If user is NOT a student, clear all student-related fields to avoid misleading data
    if (employmentType !== "student") {
      await User.findByIdAndUpdate(user._id, {
        studentVerificationStatus: "draft",
        studentTrustScore: 0,
        studentRiskLevel: "CRITICAL",
        studentSuggestedBnplLimit: 0,
        studentApprovalDecision: "REJECTED",
        studentVerificationUpdatedAt: null,
      });
    }

    // Filter response based on user role
    const isAdmin = user.role === "admin" || user.isAdmin === true;
    const filteredKyc = filterKycResponseForUser(kycRecord, isAdmin);

    res.json({
      message: "KYC submitted successfully",
      kyc: filteredKyc,
      decision: {
        verificationStatus,
        eligibilityStatus,
        approvalStatus,
        assignedCreditLimit,
        approvalOutcome: modelDecision.approvalOutcome,
        decisionSource: modelDecision.decisionSource || "local_fallback",
        traceId: modelDecision.traceId || "",
        onTimeRepayments,
        starterLimit: practicalLimit.starterLimit,
        appliedLimitRule: practicalLimit.appliedRule,
        riskVisibleToAdminOnly: true,
      },
    });
  } catch (err) {
    console.error("submitKyc error:", err);
    res.status(500).json({ message: "Error submitting KYC" });
  }
};

exports.getKycStatus = async (req, res) => {
  try {
    const kyc = await KYC.findOne({ userId: req.user.id }).lean();
    if (!kyc) {
      return res.json({
        status: "Not Started",
        verificationStatus: "pending",
        eligibilityStatus: "manual_review",
        assignedCreditLimit: 0,
        rejectionReasons: [],
        userId: req.user.id,
      });
    }

    res.json({
      status: kyc.verificationStatus === "verified"
        ? "Verified"
        : kyc.verificationStatus === "rejected"
          ? "Rejected"
          : "Pending",
      verificationStatus: kyc.verificationStatus,
      eligibilityStatus: kyc.eligibilityStatus,
      approvalStatus: kyc.eligibilityStatus === "approved" ? "approved" : "not_eligible",
      assignedCreditLimit: kyc.assignedCreditLimit,
      rejectionReasons: kyc.rejectionReasons || [],
      userId: req.user.id,
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching KYC status" });
  }
};

// ─── PAN Verification + Credit Bureau Simulation ─────────────────────────────

/**
 * POST /api/kyc/verify-pan
 * Body: { pan }
 * Validates PAN, runs bureau simulation + ML risk model, saves CreditReport.
 */
exports.verifyPAN = async (req, res) => {
  try {
    const { pan } = req.body;

    if (!pan) return res.status(400).json({ message: "PAN is required" });

    const panUpper = pan.toUpperCase().trim();
    if (!isValidPAN(panUpper)) {
      return res.status(400).json({ message: "Invalid PAN format. Expected: ABCDE1234F" });
    }

    // Fetch user for income / employment data
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const panValidation = validatePANForIndividual(panUpper, user.name || "");
    const nonNameReasons = (panValidation.reasons || []).filter(
      (reason) => !/surname initial does not match profile name/i.test(String(reason || ""))
    );
    if (nonNameReasons.length > 0) {
      const isNameMismatch = panValidation.reasons.some((reason) =>
        /surname initial does not match profile name/i.test(String(reason || ""))
      );

      return res.status(400).json({
        message: isNameMismatch
          ? "Invalid PAN: PAN number does not match member name"
          : nonNameReasons[0] || "PAN verification failed",
        reasons: nonNameReasons,
        panStatus: "INVALID",
      });
    }

    const panVerification = await verifyPanWithProvider(panUpper, {
      name: user.name,
      monthlyIncome: user.monthlyIncome,
      mobile: user.phone,
      dob: user.dob,
    });

    if (!panVerification.success) {
      return res.status(400).json({
        message: panVerification.message || "PAN verification failed",
        reasons: panVerification.validation?.reasons || [],
        panStatus: "INVALID",
        provider: panVerification.provider || process.env.PAN_VERIFICATION_PROVIDER || "mock",
      });
    }

    // Simulate bureau report after PAN verification succeeds
    const bureauReport = simulateCreditBureau(panUpper, {
      name: user.name,
      monthlyIncome: user.monthlyIncome,
    });

    if (!bureauReport.success) {
      return res.status(400).json({ message: bureauReport.message });
    }

    // Upsert CreditReport
    const reportData = {
      userId: req.user.id,
      panNumber: panUpper,
      panVerified: true,
      panVerificationProvider: panVerification.provider || process.env.PAN_VERIFICATION_PROVIDER || "mock",
      panVerificationReferenceId: panVerification.providerReferenceId || null,
      panVerificationStatus: panVerification.panStatus || "VALID",
      panVerifiedName: panVerification.verifiedName || user.name || "",
      panNameMatch: Boolean(panVerification.nameMatch),
      panVerificationMessage: panVerification.message || "PAN verified successfully",
      bureauScore: bureauReport.bureauScore,
      scoreRating: bureauReport.scoreRating,
      totalLoans: bureauReport.totalLoans,
      activeLoans: bureauReport.activeLoans,
      closedLoans: bureauReport.closedLoans,
      loanHistory: bureauReport.loanHistory,
      creditCards: bureauReport.creditCards,
      repaymentHistory: bureauReport.repaymentHistory,
      creditUtilization: bureauReport.creditUtilization,
      oldestAccountAge: bureauReport.oldestAccountAge,
      recentEnquiries: bureauReport.recentEnquiries,
      generatedAt: new Date(),
    };

    await CreditReport.findOneAndUpdate(
      { userId: req.user.id },
      reportData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await User.findByIdAndUpdate(req.user.id, {
      ...(user.pan ? {} : { pan: panUpper }),
      bureauScore: bureauReport.bureauScore,
      bureauScoreRating: bureauReport.scoreRating,
    });

    res.json({
      message: "PAN verified successfully",
      panVerification,
      bureauReport,
      disclaimer: bureauReport.disclaimer,
    });
  } catch (err) {
    console.error("verifyPAN error:", err);
    res.status(500).json({ message: "PAN verification failed" });
  }
};

// ─── Get saved Credit Report ──────────────────────────────────────────────────

/**
 * GET /api/kyc/credit-report
 */
exports.getCreditReport = async (req, res) => {
  try {
    const report = await CreditReport.findOne({ userId: req.user.id });
    if (!report) return res.status(404).json({ message: "No credit report found. Please verify your PAN first." });
    res.json({ report });
  } catch (err) {
    res.status(500).json({ message: "Error fetching credit report" });
  }
};

// ─── Bank Statement Upload & Analysis ────────────────────────────────────────

/**
 * POST /api/kyc/bank-statement
 * Multipart file: field name "statement" (CSV file)
 */
exports.uploadBankStatement = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "CSV file is required" });

    const csvText = req.file.buffer.toString("utf-8");
    const fileName = req.file.originalname || "bank_statement.csv";
    const analysis = analyzeBankStatement(csvText, fileName);

    if (!analysis.success) {
      return res.status(400).json({ message: analysis.message });
    }

    // Save / update analysis in DB
    await BankStatement.findOneAndUpdate(
      { userId: req.user.id },
      { userId: req.user.id, fileName, analysis },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ message: "Bank statement analysed successfully", analysis });
  } catch (err) {
    console.error("uploadBankStatement error:", err);
    res.status(500).json({ message: "Bank statement analysis failed" });
  }
};

/**
 * GET /api/kyc/bank-statement
 */
exports.getBankStatement = async (req, res) => {
  try {
    const stmt = await BankStatement.findOne({ userId: req.user.id }).sort({ createdAt: -1 });
    if (!stmt) return res.status(404).json({ message: "No bank statement found." });
    res.json({ analysis: stmt.analysis, fileName: stmt.fileName, uploadedAt: stmt.createdAt });
  } catch (err) {
    res.status(500).json({ message: "Error fetching bank statement" });
  }
};