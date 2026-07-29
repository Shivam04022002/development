// utils/creditUnderwritingData.js
//
// Maps an Application + its Credit Note (+ the CIBIL report model, when
// available) onto a normalised underwriting model. Same philosophy as
// cibilReportData.js: every path, lookup, calculation and derived grade is
// resolved here so the renderer is presentation-only.
//
// Contract with the renderer:
//   • money / numeric → Number, or null when not available
//   • dates           → "DD/MM/YYYY" string, or null
//   • verdicts        → "PASS" | "WARNING" | "FAIL" | null
//   • nothing raw (Mongo documents, bureau JSON) is ever exposed
//
// cibilReportData.js is imported read-only and is NOT modified.

import { buildReportModel } from "./cibilReportData.js";

// ─── Primitives (mirrors the CIBIL mapper's contract) ────────────────────────
const SENTINELS = new Set(["", "-1", "-1.00", "NULL", "null", "NA", "N/A"]);

const text = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" || SENTINELS.has(s) ? null : s;
};

const num = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "" || SENTINELS.has(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const date = (v) => {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = v instanceof Date ? v : v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

const yesNo = (v) => (v === "Yes" ? true : v === "No" ? false : null);

/** Whole years between an ISO/Date value and now, or null. */
const yearsSince = (v) => {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return y >= 0 ? Math.floor(y) : null;
};

// ─── Verdicts ────────────────────────────────────────────────────────────────
const PASS = "PASS";
const WARNING = "WARNING";
const FAIL = "FAIL";

/** One risk check row. `value` is display-ready; `verdict` drives the badge. */
const check = (label, value, verdict, note = null) => ({ label, value, verdict, note });

// ─── Risk grade ──────────────────────────────────────────────────────────────
/**
 * Grade A-D from the bureau score and the number of failed checks.
 * Score bands align with the admin CIBIL colour ranges already in use.
 */
function riskGrade(score, fails, warnings) {
  if (score === null) return { grade: null, label: "Not Graded" };
  if (fails > 0) return { grade: "D", label: "High Risk" };
  if (score >= 750 && warnings === 0) return { grade: "A", label: "Low Risk" };
  if (score >= 750) return { grade: "B", label: "Moderate Risk" };
  if (score >= 650) return { grade: warnings > 1 ? "C" : "B", label: warnings > 1 ? "Elevated Risk" : "Moderate Risk" };
  return { grade: "C", label: "Elevated Risk" };
}

const scoreBandLabel = (s) =>
  s === null ? null : s >= 750 ? "EXCELLENT" : s >= 650 ? "GOOD" : s >= 300 ? "LOW" : null;

// ─── Decision ────────────────────────────────────────────────────────────────
/** Current decision from the application's own state — never invented. */
function decisionFrom(app) {
  const status = String(app?.status ?? "").toLowerCase();
  const stage = String(app?.workflowStage ?? "").toLowerCase();
  if (status === "rejected" || stage === "rejected") return "REJECTED";
  if (status === "approved" || stage === "disbursed") return "APPROVED";
  return "PENDING";
}

/** Recommendation derived from grade + checks; advisory, not the stored state. */
function recommend(grade, fails, warnings, score) {
  if (score === null) return { decision: "PENDING", reason: "Bureau score not available for this applicant." };
  if (fails > 0) return { decision: "REJECTED", reason: `${fails} risk check${fails === 1 ? "" : "s"} failed.` };
  if (grade === "A") return { decision: "APPROVED", reason: "Bureau score and all risk checks are satisfactory." };
  if (warnings > 0) {
    return {
      decision: "CONDITIONAL APPROVAL",
      reason: `${warnings} risk check${warnings === 1 ? "" : "s"} raised a warning; approval subject to the conditions below.`,
    };
  }
  return { decision: "APPROVED", reason: "No adverse findings recorded against this applicant." };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * buildUnderwritingModel({ app, creditNote, raw })
 *   app        — Application document (lean object)
 *   creditNote — CreditNote document, or null
 *   raw        — stored bureau response, or null (reuses the CIBIL mapper)
 *
 * Never throws; missing inputs yield null fields and empty sections.
 */
export function buildUnderwritingModel({ app = {}, creditNote = null, raw = null } = {}) {
  const applicant = app?.applicant?.applicant || app?.applicant || {};
  const vehicle = app?.vehicleDetails || {};
  const dealer = app?.dealerDetails || {};
  const cn = creditNote || {};

  // Reuse the CIBIL model for the credit summary when a bureau response exists.
  const cibil = raw ? buildReportModel({ app, cibil: app?.cibil || {}, raw }) : null;
  const accounts = cibil?.accounts ?? [];
  const accSummary = cibil?.summary?.accounts ?? null;
  const enqSummary = cibil?.summary?.enquiries ?? null;

  const score = num(cn.cibilScore) ?? num(app?.cibil?.score) ?? cibil?.score?.value ?? null;

  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE").length;
  const closedAccounts = accounts.filter((a) => a.status === "CLOSED").length;
  const settledCount = accounts.filter((a) => (a.settlementAmount ?? 0) > 0).length;
  const writtenOffCount = accounts.filter((a) => (a.writtenOffTotal ?? 0) > 0).length;

  const highCredit = accSummary?.highCreditTotal ?? null;
  const currentBalance = accSummary?.currentBalanceTotal ?? null;
  const utilisation =
    highCredit && highCredit > 0 && currentBalance !== null
      ? Number(((currentBalance / highCredit) * 100).toFixed(1))
      : null;

  const dpdDays = num(cn.dpdDays);
  const overdueTotal = num(cn.totalOverdue) ?? accSummary?.overdueTotal ?? null;
  const overdueCount = accSummary?.overdueCount ?? null;
  const recentEnquiries = num(cn.enquiryCount) ?? enqSummary?.past12Months ?? null;
  const suitFiled = yesNo(cn.suitFiled);
  const writeOff = yesNo(cn.writeOff);
  const creditAgeYears = accSummary?.oldestOpened
    ? yearsSince(accSummary.oldestOpened.split("/").reverse().join("-"))
    : null;

  // ── Risk checks ────────────────────────────────────────────────────────────
  const checks = [
    check("Suit Filed", suitFiled === null ? null : suitFiled ? "Yes" : "No",
      suitFiled === null ? null : suitFiled ? FAIL : PASS),
    check("Written Off", writeOff === null ? null : writeOff ? "Yes" : "No",
      writeOff === null ? null : writeOff ? FAIL : PASS,
      writtenOffCount ? `${writtenOffCount} account(s) with a written-off amount` : null),
    check("Settlement", settledCount ? `${settledCount} account(s)` : cibil ? "None" : null,
      cibil === null ? null : settledCount > 0 ? FAIL : PASS),
    check("Overdue Accounts", overdueCount === null ? null : String(overdueCount),
      overdueCount === null ? null : overdueCount === 0 ? PASS : overdueCount <= 2 ? WARNING : FAIL,
      overdueTotal ? `Total overdue ${overdueTotal}` : null),
    check("High Utilisation", utilisation === null ? null : `${utilisation}%`,
      utilisation === null ? null : utilisation < 60 ? PASS : utilisation < 85 ? WARNING : FAIL),
    check("Multiple Recent Enquiries", recentEnquiries === null ? null : String(recentEnquiries),
      recentEnquiries === null ? null : recentEnquiries <= 3 ? PASS : recentEnquiries <= 8 ? WARNING : FAIL),
    check("Credit Age", creditAgeYears === null ? null : `${creditAgeYears} year(s)`,
      creditAgeYears === null ? null : creditAgeYears >= 3 ? PASS : creditAgeYears >= 1 ? WARNING : FAIL),
    check("Existing Defaults (DPD)", dpdDays === null ? null : `${dpdDays} day(s)`,
      dpdDays === null ? null : dpdDays === 0 ? PASS : dpdDays <= 60 ? WARNING : FAIL),
  ];

  const fails = checks.filter((c) => c.verdict === FAIL).length;
  const warnings = checks.filter((c) => c.verdict === WARNING).length;
  const passes = checks.filter((c) => c.verdict === PASS).length;
  const grade = riskGrade(score, fails, warnings);

  // ── Financial assessment ───────────────────────────────────────────────────
  const requestedAmount = num(vehicle.financeRequired);
  const tenureMonths = num(vehicle.tenure);
  const existingEmi = num(cn.totalEmiAmount);
  const existingEmiCount = num(cn.totalEmiCount);
  // Straight-line instalment: the application stores no interest rate, so this
  // is principal / tenure and is labelled as indicative in the renderer.
  const requestedEmi =
    requestedAmount !== null && tenureMonths ? Math.round(requestedAmount / tenureMonths) : null;
  const monthlyIncome = num(applicant.monthlyIncome) ?? num(applicant.income) ?? null;
  const totalEmi = (existingEmi ?? 0) + (requestedEmi ?? 0);
  const foir =
    monthlyIncome && monthlyIncome > 0 ? Number(((totalEmi / monthlyIncome) * 100).toFixed(1)) : null;
  const disposableIncome = monthlyIncome !== null ? monthlyIncome - totalEmi : null;
  const debtRatio =
    monthlyIncome && monthlyIncome > 0 && existingEmi !== null
      ? Number(((existingEmi / monthlyIncome) * 100).toFixed(1))
      : null;

  const rec = recommend(grade.grade, fails, warnings, score);

  // ── Underwriter analysis, derived from the checks ──────────────────────────
  const positives = checks.filter((c) => c.verdict === PASS).map((c) => `${c.label}: ${c.value}`);
  const negatives = checks
    .filter((c) => c.verdict === FAIL || c.verdict === WARNING)
    .map((c) => `${c.label}: ${c.value}${c.note ? ` (${c.note})` : ""}`);
  const conditions =
    rec.decision === "CONDITIONAL APPROVAL"
      ? checks.filter((c) => c.verdict === WARNING).map((c) => `Obtain clarification on ${c.label.toLowerCase()}.`)
      : [];

  const documents = app?.documents || {};
  const docRow = (label, value) => ({ label, uploaded: !!text(value) });

  return {
    header: {
      companyName: "SURJIT FINANCE",
      tagline: "TODAY. TOMORROW. TOGETHER.",
      address: "248-C, Vijay Nagar, Krishna Nagar, Lucknow - 226012",
      title: "CREDIT UNDERWRITING DECISION REPORT",
      reportDate: date(cn.updatedAt || cn.createdAt || new Date()),
      reportTime: new Date().toTimeString().slice(0, 8),
    },
    application: {
      applicationNo: text(app.formId),
      customerName: text(cn.customerName) || text(applicant.name),
      loanProduct: [text(vehicle.brandName), text(vehicle.modelName)].filter(Boolean).join(" ") || null,
      requestedAmount,
      vehiclePrice: num(vehicle.priceOfVehicle),
      tenureMonths,
      branch: text(dealer.branch),
      dealer: text(dealer.name),
      underwriter: text(cn.updatedBy) || text(cn.createdBy),
      workflowStage: text(app.workflowStage),
      status: text(app.status),
    },
    decision: {
      current: decisionFrom(app),
      recommended: rec.decision,
      reason: rec.reason,
      conditions,
      riskCategory: grade.label,
      grade: grade.grade,
    },
    customer: {
      name: text(applicant.name) || text(cn.customerName),
      fatherName: text(applicant.fatherName),
      dob: date(applicant.dateOfBirth),
      age: yearsSince(applicant.dateOfBirth),
      gender: text(applicant.gender),
      pan: text(applicant.panNo),
      aadhaar: text(applicant.aadharNo),
      mobile: text(applicant.mobileNumber) || text(applicant.mobile),
      email: text(applicant.email),
      address: text(cn.houseAddress) || text(applicant.address),
      occupation: text(applicant.occupation),
      employer: text(applicant.employerName) || text(applicant.employer),
      branch: text(dealer.branch),
    },
    creditSummary: {
      score,
      scoreBand: scoreBandLabel(score),
      totalAccounts: accSummary?.total ?? null,
      activeAccounts: cibil ? activeAccounts : null,
      closedAccounts: cibil ? closedAccounts : null,
      currentBalance,
      highCredit,
      totalOverdue: overdueTotal,
      totalEmiAmount: existingEmi,
      totalEmiCount: existingEmiCount,
      recentEnquiries,
      dpdDays,
      utilisation,
      creditAgeYears,
      hasBureauData: cibil !== null,
    },
    risk: { checks, passes, warnings, fails },
    financial: {
      monthlyIncome,
      existingEmi,
      requestedEmi,
      totalEmi: monthlyIncome !== null || requestedEmi !== null ? totalEmi : null,
      foir,
      debtRatio,
      disposableIncome,
      requestedAmount,
      tenureMonths,
      // Not captured anywhere in the application today.
      eligibleEmi: null,
      loanEligibility: null,
    },
    distance: {
      fromBranch: num(cn.distanceFromBranch),
      fromDealer: null,
      residenceVerification: null,
      officeVerification: null,
    },
    analysis: {
      positiveFactors: positives,
      negativeFactors: negatives,
      riskObservations: [
        score !== null ? `Bureau score ${score} (${scoreBandLabel(score)}).` : "No bureau score on file.",
        accSummary ? `${accSummary.total} account(s) on the bureau file, ${activeAccounts} active.` : "No bureau accounts on file.",
        utilisation !== null ? `Credit utilisation at ${utilisation}%.` : null,
      ].filter(Boolean),
      specialConditions: conditions,
      remarks: null,
    },
    approvals: [
      { role: "Credit Officer", name: text(cn.createdBy), decision: null, remarks: null, date: date(cn.createdAt) },
      { role: "Branch Manager", name: null, decision: null, remarks: null, date: null },
      { role: "Regional Manager", name: null, decision: null, remarks: null, date: null },
      { role: "Credit Head", name: null, decision: null, remarks: null, date: null },
    ],
    documents: [
      docRow("PAN Card", applicant.panImage || documents?.applicant?.panImage),
      docRow("Aadhaar", applicant.aadharFront || documents?.applicant?.aadharFront),
      docRow("Photograph", applicant.photo || documents?.applicant?.photo),
      docRow("Bank Statement", applicant.bankStatement),
      docRow("Salary Slip", applicant.salarySlip),
      docRow("ITR", applicant.itr),
      docRow("GST", applicant.gst),
      docRow("RC", vehicle.rc),
      docRow("Electricity Bill", applicant.electricityBill),
      docRow("Residence Proof", applicant.residenceProof),
      docRow("Office Proof", applicant.officeProof),
      docRow("Form 60", applicant.form60 || documents?.coApplicant?.form60),
    ],
  };
}

export default { buildUnderwritingModel };
