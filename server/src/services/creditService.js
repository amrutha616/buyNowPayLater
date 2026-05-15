/**
 * Eligibility Check & Credit Limit Assignment
 * Based on real BNPL criteria:
 * - PAN validation (tax ID)
 * - Monthly income assessment
 * - Debt-to-income ratio
 * - Employment type & stability
 */

// Validate PAN format (India): AAAPL1234A
const isValidPAN = (pan) => {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan?.toUpperCase() || "");
};

const calculateCreditScore = (userData) => {
  let score = 300; // Base score
  let reasons = [];

  // PAN validation (mandatory, 300 points)
  if (userData.pan && isValidPAN(userData.pan)) {
    score += 300;
    reasons.push("PAN verified");
  } else {
    return { score: 0, creditLimit: 0, reasons: ["Invalid/missing PAN"], isEligible: false };
  }

  // Monthly income assessment (0-400 points)
  const monthlyIncome = Number(userData.monthlyIncome || 0);
  if (monthlyIncome < 10000) {
    score += 0;
    reasons.push("Income too low");
    return { score, creditLimit: 0, reasons, isEligible: false };
  } else if (monthlyIncome < 25000) {
    score += 100;
    reasons.push("Income: ₹10K-₹25K");
  } else if (monthlyIncome < 50000) {
    score += 200;
    reasons.push("Income: ₹25K-₹50K");
  } else if (monthlyIncome < 100000) {
    score += 300;
    reasons.push("Income: ₹50K-₹100K");
  } else {
    score += 400;
    reasons.push("Income: ₹100K+");
  }

  // Employment type (0-200 points)
  if (userData.employmentType === "salaried") {
    score += 150;
    reasons.push("Salaried: Stable income");
  } else if (userData.employmentType === "self-employed") {
    score += 80;
    reasons.push("Self-employed: Medium stability");
  } else if (userData.employmentType === "student") {
    score += 40;
    reasons.push("Student: Limited income");
  } else {
    score += 0;
    reasons.push("Employment not specified");
  }

  // Existing debt check (deduct 100-300 points)
  const existingDebt = Number(userData.existingDebt || 0);
  const debtToIncomeRatio = monthlyIncome > 0 ? (existingDebt / monthlyIncome) : 0;

  if (debtToIncomeRatio < 0.2) {
    score += 50;
    reasons.push("Low debt");
  } else if (debtToIncomeRatio < 0.5) {
    score += 20;
    reasons.push("Moderate debt");
  } else if (debtToIncomeRatio < 1) {
    score -= 50;
    reasons.push("High debt");
  } else {
    return { score: 0, creditLimit: 0, reasons: ["Debt exceeds income"], isEligible: false };
  }

  // Age check (optional, 0-50 points)
  const age = Number(userData.age || null);
  if (age && age >= 21 && age <= 50) {
    score += 50;
    reasons.push(`Age: ${age} (Prime working age)`);
  } else if (age && age > 50) {
    score -= 30;
    reasons.push("Age > 50");
  }

  score = Math.max(0, Math.min(score, 1000)); // Cap 0-1000
  return { score, reasons, isEligible: score >= 500 };
};

const assignCreditLimit = (monthlyIncome, creditScore) => {
  if (creditScore < 500) return 0; // Ineligible

  // Base: 3x monthly income, adjusted by credit score
  const baseLimit = monthlyIncome * 3;
  const multiplier = creditScore / 1000; // 0.5 to 1.0

  let limit = Math.round(baseLimit * multiplier);

  // Apply caps by score tier
  if (creditScore >= 850) {
    limit = Math.min(limit, 500000); // Premium: up to 5L
  } else if (creditScore >= 700) {
    limit = Math.min(limit, 200000); // Gold: up to 2L
  } else if (creditScore >= 600) {
    limit = Math.min(limit, 100000); // Silver: up to 1L
  } else if (creditScore >= 500) {
    limit = Math.min(limit, 50000);  // Base: up to 50K
  }

  return Math.max(5000, limit); // Minimum 5K
};

const checkEligibility = async (userData) => {
  try {
    const { score, reasons, isEligible } = calculateCreditScore(userData);
    const monthlyIncome = Number(userData.monthlyIncome || 0);
    const creditLimit = assignCreditLimit(monthlyIncome, score);

    return {
      isEligible,
      creditScore: score,
      creditLimit,
      monthlyIncome,
      reason: isEligible 
        ? `Eligible with ₹${creditLimit} credit limit (${reasons.join(", ")})`
        : `Not eligible: ${reasons.join(", ")}`,
      details: reasons,
    };
  } catch (err) {
    console.error("Eligibility check error:", err);
    throw err;
  }
};

module.exports = {
  checkEligibility,
  calculateCreditScore,
  assignCreditLimit,
  isValidPAN,
};
