/**
 * Bank Statement Analysis Service
 * Parses a CSV bank statement and extracts income / spending insights.
 *
 * Expected CSV columns (case-insensitive header):
 *   Date, Description/Narration, Debit, Credit, Balance
 *
 * Example rows:
 *   01/01/2026,"SALARY NEFT - TATA CONSULTANCY",,"50000","50000"
 *   05/01/2026,"NACH EMI - HDFC HOME LOAN","15000",,"35000"
 */

const SALARY_KEYWORDS = [
  "salary", "sal ", "sal-", "payroll", "pay credit", "neft cr salary",
  "salary credit", "monthly salary", "wages", "stipend",
];

const EMI_KEYWORDS = [
  "emi", "loan emi", "equated monthly", "nach emi", "auto debit emi",
  "nach debit", "loan repayment", "housing loan", "home loan emi",
];

const stripCurrency = (str) =>
  parseFloat((str || "0").replace(/[₹,\s"]/g, "") || "0") || 0;

const parseCSVLine = (line) => {
  // Handle quoted fields with commas inside
  const cols = [];
  let cur = "";
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols;
};

const parseBankStatement = (csvText) => {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  // Try to identify column indices from header
  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const dateIdx = header.findIndex((h) => h.includes("date"));
  const descIdx = header.findIndex((h) =>
    h.includes("narration") || h.includes("description") || h.includes("particulars") || h.includes("details")
  );
  const debitIdx = header.findIndex((h) => h.includes("debit") || h.includes("withdrawal"));
  const creditIdx = header.findIndex((h) => h.includes("credit") || h.includes("deposit"));

  const useIdx = dateIdx !== -1 && descIdx !== -1 && creditIdx !== -1;

  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;

    const rowDate = useIdx ? cols[dateIdx] : cols[0];
    const rowDesc = useIdx ? cols[descIdx] : cols[1];
    const rowDebit = useIdx ? cols[debitIdx] : cols[2];
    const rowCredit = useIdx ? cols[creditIdx] : cols[3];

    const parsedDate = new Date(rowDate);
    if (isNaN(parsedDate.getTime())) continue;

    transactions.push({
      date: parsedDate,
      description: (rowDesc || "").toLowerCase(),
      debit: stripCurrency(rowDebit),
      credit: stripCurrency(rowCredit),
    });
  }

  return transactions;
};

const analyzeBankStatement = (csvText, fileName = "") => {
  const transactions = parseBankStatement(csvText);

  if (transactions.length === 0) {
    return {
      success: false,
      message: "No valid transactions found. Ensure CSV has columns: Date, Description, Debit, Credit.",
    };
  }

  // Group monthly totals
  const monthMap = {};
  for (const txn of transactions) {
    const key = `${txn.date.getFullYear()}-${String(txn.date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap[key]) monthMap[key] = { credits: 0, debits: 0, salaryCredits: 0 };
    monthMap[key].credits += txn.credit;
    monthMap[key].debits += txn.debit;
  }

  // Detect salary
  const salaryTxns = transactions.filter(
    (t) => t.credit > 0 && SALARY_KEYWORDS.some((kw) => t.description.includes(kw))
  );

  // Group salary by month
  const salaryByMonth = {};
  for (const t of salaryTxns) {
    const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
    salaryByMonth[key] = (salaryByMonth[key] || 0) + t.credit;
  }

  // If no salary keyword found, treat largest regular monthly credit as salary
  let salaryMonthValues = Object.values(salaryByMonth);
  if (salaryMonthValues.length === 0) {
    // Pick biggest monthly credit as proxy salary
    for (const [key, val] of Object.entries(monthMap)) {
      salaryMonthValues.push(val.credits);
    }
  }

  const avgMonthlySalary =
    salaryMonthValues.length > 0
      ? Math.round(salaryMonthValues.reduce((s, v) => s + v, 0) / salaryMonthValues.length)
      : 0;

  // Detect EMIs
  const emiTxns = transactions.filter(
    (t) => t.debit > 0 && EMI_KEYWORDS.some((kw) => t.description.includes(kw))
  );
  const emiByMonth = {};
  for (const t of emiTxns) {
    const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
    emiByMonth[key] = (emiByMonth[key] || 0) + t.debit;
  }
  const emiMonths = Object.values(emiByMonth);
  const avgMonthlyEMI =
    emiMonths.length > 0
      ? Math.round(emiMonths.reduce((s, v) => s + v, 0) / emiMonths.length)
      : 0;

  // Monthly averages
  const monthValues = Object.values(monthMap);
  const avgCredit =
    monthValues.length > 0
      ? Math.round(monthValues.reduce((s, v) => s + v.credits, 0) / monthValues.length)
      : 0;
  const avgDebit =
    monthValues.length > 0
      ? Math.round(monthValues.reduce((s, v) => s + v.debits, 0) / monthValues.length)
      : 0;

  // Income stability (coefficient of variation)
  let incomeStability = "Stable";
  if (salaryMonthValues.length >= 2) {
    const mean = avgMonthlySalary || 1;
    const variance =
      salaryMonthValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / salaryMonthValues.length;
    const cv = Math.sqrt(variance) / mean;
    if (cv > 0.3) incomeStability = "Variable";
    else if (cv > 0.15) incomeStability = "Moderate";
  }

  // Attempt to infer employer from salary narration
  let inferredEmployer = null;
  if (salaryTxns.length > 0) {
    const raw = salaryTxns[0].description.toUpperCase();
    // Match pattern "NEFT - EMPLOYER NAME" or "SALARY FROM EMPLOYER"
    const m = raw.match(/(?:NEFT|IMPS|RTGS)[^A-Z]*([A-Z][A-Z\s]{3,30}?)(?:\s+\d|\s*$)/);
    if (m) inferredEmployer = m[1].trim();
  }

  // DTI ratio
  const dtiRatio =
    avgMonthlySalary > 0 ? parseFloat((avgMonthlyEMI / avgMonthlySalary).toFixed(2)) : null;

  return {
    success: true,
    fileName,
    totalTransactions: transactions.length,
    monthsAnalyzed: monthValues.length,
    averageMonthlySalary: avgMonthlySalary,
    inferredEmployer,
    incomeStability,
    averageMonthlyCredit: avgCredit,
    averageMonthlyDebit: avgDebit,
    estimatedMonthlyEMI: avgMonthlyEMI,
    netMonthlyFlow: avgCredit - avgDebit,
    salaryCreditsFound: salaryTxns.length,
    emiTransactionsFound: emiTxns.length,
    dtiRatio,
    analysedAt: new Date().toISOString(),
  };
};

module.exports = { analyzeBankStatement };
