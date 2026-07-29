// utils/creditUnderwritingData.js
//
// Maps an Application + its Credit Note (+ the bureau model when available)
// onto a normalised model for the Credit Underwriting Decision Report.
//
// This is a FACTUAL decision sheet. It reports only what is stored:
//   • no risk grade, no risk scoring, no pass/warn/fail verdicts
//   • no recommendation engine, no decision thresholds, no policy rules
//   • the decision shown is the one already recorded on the application
// The only calculations are simple counts and totals (accounts, EMI, overdue).
//
// Contract with the renderer:
//   • money / numeric → Number, or null when not recorded
//   • dates           → "DD/MM/YYYY" string, or null
//   • nothing raw (Mongo documents, bureau JSON) is exposed
//
// cibilReportData.js is imported read-only and is NOT modified.

import { buildReportModel } from "./cibilReportData.js";

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

/** Whole years between a date value and now, or null. */
const yearsSince = (v) => {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return y >= 0 ? Math.floor(y) : null;
};

/**
 * The decision already recorded on the application. Nothing is inferred or
 * calculated — this reads the stored status / workflow stage only.
 */
function storedDecision(app) {
  const status = String(app?.status ?? "").toLowerCase();
  const stage = String(app?.workflowStage ?? "").toLowerCase();
  if (status === "rejected" || stage === "rejected") return "REJECTED";
  if (status === "approved" || stage === "disbursed") return "APPROVED";
  if (status === "pending") return "PENDING";
  return null;
}

/**
 * buildUnderwritingModel({ app, creditNote, raw })
 *   app        — Application document (lean object)
 *   creditNote — CreditNote document, or null
 *   raw        — stored bureau response, or null
 *
 * Never throws; missing inputs yield null fields.
 */
export function buildUnderwritingModel({ app = {}, creditNote = null, raw = null } = {}) {
  const applicant = app?.applicant?.applicant || app?.applicant || {};
  const vehicle = app?.vehicleDetails || {};
  const dealer = app?.dealerDetails || {};
  const cn = creditNote || {};

  // Bureau side reuses the existing, already-verified CIBIL mapper.
  const cibil = raw ? buildReportModel({ app, cibil: app?.cibil || {}, raw }) : null;
  const accounts = cibil?.accounts ?? [];
  const accSummary = cibil?.summary?.accounts ?? null;
  const enqSummary = cibil?.summary?.enquiries ?? null;

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
      branch: text(dealer.branch),
      dealer: text(dealer.name),
      product: [text(vehicle.brandName), text(vehicle.modelName)].filter(Boolean).join(" ") || null,
      loanAmount: num(vehicle.financeRequired),
      vehiclePrice: num(vehicle.priceOfVehicle),
      tenureMonths: num(vehicle.tenure),
      workflowStage: text(app.workflowStage),
      preparedBy: text(cn.createdBy),
      updatedBy: text(cn.updatedBy),
    },

    customer: {
      name: text(applicant.name) || text(cn.customerName),
      fatherName: text(applicant.fatherName),
      dob: date(applicant.dateOfBirth),
      age: yearsSince(applicant.dateOfBirth),
      gender: text(applicant.gender),
      address: text(cn.houseAddress) || text(applicant.address),
      mobile: text(applicant.mobileNumber) || text(applicant.mobile),
      email: text(applicant.email),
      pan: text(applicant.panNo),
      occupation: text(applicant.occupation),
    },

    // Simple counts and totals only.
    creditSummary: {
      score: num(cn.cibilScore) ?? num(app?.cibil?.score) ?? cibil?.score?.value ?? null,
      totalAccounts: accSummary?.total ?? null,
      activeAccounts: cibil ? accounts.filter((a) => a.status === "ACTIVE").length : null,
      closedAccounts: cibil ? accounts.filter((a) => a.status === "CLOSED").length : null,
      totalOverdue: accSummary?.overdueTotal ?? null,
      currentBalance: accSummary?.currentBalanceTotal ?? null,
      highCredit: accSummary?.highCreditTotal ?? null,
      recentEnquiries: enqSummary?.past12Months ?? null,
      totalEnquiries: enqSummary?.total ?? null,
      hasBureauData: cibil !== null,
    },

    // The staff-entered Credit Note, reported verbatim.
    creditNote: {
      dpdDays: num(cn.dpdDays),
      enquiryCount: num(cn.enquiryCount),
      suitFiled: text(cn.suitFiled),
      writeOff: text(cn.writeOff),
      totalOverdue: num(cn.totalOverdue),
      totalEmiAmount: num(cn.totalEmiAmount),
      totalEmiCount: num(cn.totalEmiCount),
      distanceFromBranch: num(cn.distanceFromBranch),
      recorded: creditNote !== null,
    },

    // Free-text remarks are not captured by the current Credit Note form.
    remarks: {
      creditOfficer: text(cn.creditOfficerRemarks),
      underwriter: text(cn.underwriterRemarks),
    },

    // Read from the application; never inferred.
    decision: {
      value: storedDecision(app),
      workflowStage: text(app.workflowStage),
      status: text(app.status),
    },
  };
}

export default { buildUnderwritingModel };
