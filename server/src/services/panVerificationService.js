/**
 * PAN Verification Service
 * Supports a simulator today and a pluggable IDfy integration via env config.
 *
 * Configure IDfy with:
 *   PAN_VERIFICATION_PROVIDER=idfy
 *   IDFY_BASE_URL=https://...
 *   IDFY_PAN_VERIFY_PATH=/...
 *   IDFY_AUTH_HEADER_NAME=x-api-key (or Authorization)
 *   IDFY_AUTH_HEADER_VALUE=...
 */

const PAN_VERIFICATION_PROVIDER = String(process.env.PAN_VERIFICATION_PROVIDER || "mock").trim().toLowerCase();

// Validate Indian PAN format: ABCDE1234F
const isValidPAN = (pan) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test((pan || "").toUpperCase().trim());

const normalizeName = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractSurnameInitial = (fullName) => {
  const cleaned = normalizeName(fullName);
  if (!cleaned) return null;
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1][0] || null;
};

const isLikelyDummyPAN = (panUpper) => {
  const letters = panUpper.slice(0, 5);
  const digits = panUpper.slice(5, 9);
  const knownDummy = ["ABCDE1234F", "AAAAA1111A", "PAAAA1111A"];

  if (knownDummy.includes(panUpper)) return true;
  if (/^([A-Z])\1{4}$/.test(letters)) return true;
  if (/^(\d)\1{3}$/.test(digits)) return true;

  return false;
};

const validatePANForIndividual = (pan, fullName = "") => {
  const panUpper = (pan || "").toUpperCase().trim();
  const reasons = [];
  const warnings = [];

  if (!panUpper) {
    reasons.push("PAN is required");
    return { isValid: false, reasons, panType: null, surnameInitial: null };
  }

  if (!isValidPAN(panUpper)) {
    reasons.push("Invalid PAN format");
    return { isValid: false, reasons, panType: null, surnameInitial: null };
  }

  if (panUpper[3] !== "P") {
    reasons.push("PAN is not an individual PAN (4th character must be P)");
  }

  if (isLikelyDummyPAN(panUpper)) {
    reasons.push("PAN appears to be a dummy or test PAN");
  }

  const surnameInitial = extractSurnameInitial(fullName);
  if (surnameInitial && panUpper[4] !== surnameInitial) {
    warnings.push("PAN surname initial does not match profile name");
  }

  return {
    isValid: reasons.length === 0,
    reasons,
    warnings,
    panType: panUpper[3] === "P" ? "Individual" : "Other",
    surnameInitial,
  };
};

const getIdfyHeaders = () => {
  const headerName = String(process.env.IDFY_AUTH_HEADER_NAME || "x-api-key").trim();
  const headerValue = String(process.env.IDFY_AUTH_HEADER_VALUE || process.env.IDFY_API_KEY || "").trim();
  const authScheme = String(process.env.IDFY_AUTH_SCHEME || "").trim().toLowerCase();

  if (!headerValue) {
    return null;
  }

  if (headerName.toLowerCase() === "authorization" && authScheme === "bearer") {
    return { Authorization: `Bearer ${headerValue}` };
  }

  return { [headerName]: headerValue };
};

const normalizeIdfyResponse = (payload, panUpper, userData = {}) => {
  const data = payload?.data || payload?.result || payload?.response || payload || {};
  const success = Boolean(
    data?.success ??
      data?.verified ??
      data?.isValid ??
      data?.status === "SUCCESS" ??
      data?.status === "VERIFIED" ??
      payload?.success ??
      payload?.status === "SUCCESS"
  );

  const verifiedName = String(
    data?.nameOnPan || data?.name || data?.panName || data?.verifiedName || userData.name || "Account Holder"
  ).trim();

  return {
    success,
    provider: "idfy",
    providerReferenceId: String(data?.requestId || data?.referenceId || data?.transactionId || payload?.requestId || "").trim() || null,
    panNumber: panUpper,
    panStatus: success ? "VALID" : "INVALID",
    panType: String(data?.panType || data?.type || "Individual").trim(),
    verifiedName,
    nameMatch: Boolean(data?.nameMatch ?? data?.match ?? data?.isNameMatch ?? false),
    message: String(data?.message || data?.error || payload?.message || (success ? "PAN verified successfully via IDfy" : "IDfy PAN verification failed")).trim(),
    raw: payload,
  };
};

const verifyPanWithIdfy = async (pan, userData = {}) => {
  const baseUrl = String(process.env.IDFY_BASE_URL || "").trim().replace(/\/$/, "");
  const verifyPath = String(process.env.IDFY_PAN_VERIFY_PATH || "").trim();

  if (!baseUrl || !verifyPath) {
    return {
      success: false,
      provider: "idfy",
      message: "IDfy PAN verification is not configured. Set IDFY_BASE_URL and IDFY_PAN_VERIFY_PATH.",
    };
  }

  const headers = getIdfyHeaders();
  if (!headers) {
    return {
      success: false,
      provider: "idfy",
      message: "IDfy authentication is not configured. Set IDFY_AUTH_HEADER_NAME and IDFY_AUTH_HEADER_VALUE.",
    };
  }

  const response = await fetch(`${baseUrl}${verifyPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: JSON.stringify({
      pan: String(pan || "").toUpperCase().trim(),
      consent: true,
      name: userData.name || "",
      mobile: userData.mobile || "",
      dob: userData.dob || "",
      applicantType: "individual",
    }),
  });

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const payload = contentType.includes("application/json") ? await response.json() : { message: await response.text() };

  if (!response.ok) {
    return {
      success: false,
      provider: "idfy",
      message: payload?.message || payload?.error || `IDfy PAN verification failed with HTTP ${response.status}`,
      raw: payload,
    };
  }

  return normalizeIdfyResponse(payload, String(pan || "").toUpperCase().trim(), userData);
};

const verifyPanWithProvider = async (pan, userData = {}) => {
  if (PAN_VERIFICATION_PROVIDER === "idfy") {
    return verifyPanWithIdfy(pan, userData);
  }

  const bureauReport = simulateCreditBureau(pan, userData);
  return {
    ...bureauReport,
    provider: "mock",
    providerReferenceId: null,
    panVerifiedName: bureauReport.nameOnPAN,
    verifiedName: bureauReport.nameOnPAN,
    nameMatch: true,
    message: bureauReport.message || "PAN verified successfully",
  };
};

/**
 * Deterministic bureau simulation from PAN + user data.
 * Uses PAN character checksum so the same PAN always produces the same report.
 */
const simulateCreditBureau = (pan, userData = {}) => {
  const panUpper = (pan || "").toUpperCase().trim();
  const validation = validatePANForIndividual(panUpper, userData.name || "");
  if (!validation.isValid) {
    return {
      success: false,
      message: validation.reasons[0] || "PAN validation failed",
      validation,
    };
  }

  // Seed from PAN chars to keep reports deterministic
  const charSum = panUpper.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const seed = charSum % 100; // 0–99

  const income = Number(userData.monthlyIncome || 0);
  const incomeBonus = income >= 100000 ? 40 : income >= 50000 ? 25 : income >= 25000 ? 10 : 0;
  const bureauScore = Math.min(900, 580 + seed * 3 + incomeBonus);

  const scoreRating =
    bureauScore >= 750 ? "EXCELLENT" :
    bureauScore >= 700 ? "GOOD" :
    bureauScore >= 650 ? "FAIR" : "POOR";

  // Simulate past loans (0–4)
  const numLoans = seed % 5;
  const loanTypes = ["Personal Loan", "Credit Card", "Home Loan", "Auto Loan", "Education Loan"];
  const banks = ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank"];
  const amounts = [50000, 200000, 1500000, 350000, 180000];

  const loanHistory = Array.from({ length: numLoans }, (_, i) => ({
    loanType: loanTypes[i % loanTypes.length],
    bank: banks[i % banks.length],
    sanctionedAmount: amounts[i % amounts.length],
    outstandingAmount: i === 0 ? Math.round(amounts[i % amounts.length] * 0.4) : 0,
    status: i === 0 ? "ACTIVE" : "CLOSED",
    onTimePct: Math.min(100, 75 + (charSum % 25)),
    openedYear: new Date().getFullYear() - (2 + i),
  }));

  // Simulate credit cards (0–2)
  const numCards = seed % 3;
  const cardBanks = ["HDFC Bank", "SBI Card", "ICICI Bank"];
  const creditCards = Array.from({ length: numCards }, (_, i) => ({
    bank: cardBanks[i % cardBanks.length],
    limit: [50000, 100000, 75000][i % 3],
    currentBalance: Math.round([50000, 100000, 75000][i % 3] * (0.2 + (seed % 40) / 100)),
    utilization: 20 + (seed % 45),
    status: "ACTIVE",
  }));

  // Repayment history
  const onTime = Math.min(100, 70 + (charSum % 30));
  const late = Math.floor((100 - onTime) * 0.7);
  const missed = 100 - onTime - late;

  // Recent enquiries (credit applications in last 6 months)
  const enquiries = seed % 5;

  return {
    success: true,
    panNumber: panUpper,
    panStatus: "VALID",
    panType: "Individual",
    nameOnPAN: (userData.name || "Account Holder").toUpperCase(),
    warnings: validation.warnings || [],
    bureauScore,
    scoreRating,
    totalLoans: numLoans,
    activeLoans: numLoans > 0 ? 1 : 0,
    closedLoans: numLoans > 1 ? numLoans - 1 : 0,
    loanHistory,
    creditCards,
    creditUtilization: numCards > 0 ? 20 + (seed % 45) : 0,
    repaymentHistory: { onTime, late, missed },
    oldestAccountAge: numLoans > 0 ? `${2 + (seed % 8)} years` : "No credit history",
    recentEnquiries: enquiries,
    validation,
    reportGeneratedAt: new Date().toISOString(),
    disclaimer:
      "Simulated credit report for demonstration. In production, integrate CIBIL/Experian/Equifax API with proper RBI compliance.",
  };
};

module.exports = {
  isValidPAN,
  validatePANForIndividual,
  simulateCreditBureau,
  verifyPanWithIdfy,
  verifyPanWithProvider,
};
