// utils/cibilReportData.js
//
// Maps the raw Xaler / TransUnion response onto a clean, normalised model.
// The renderer never sees raw Xaler JSON: every path, lookup, calculation and
// date format is resolved here.
//
// Contract with the renderer:
//   • money / numeric fields → Number, or null when not reported
//   • date fields            → "DD/MM/YYYY" string, or null
//   • text / coded fields    → String, or null
//   • the "-1" / "-1.00" / "" sentinels NEVER escape this module
// The renderer decides how to display null (e.g. "-" or "Not Available").
//
// Paths verified field-by-field against a real 1 MB response — see
// scripts/verifyCibilMapping.js.

// ─── Lookup tables ───────────────────────────────────────────────────────────
// Every `description` in the feed is an empty string (verified across all
// tradelines and enquiries), so coded values must be resolved here. Unknown
// symbols fall back to the raw symbol rather than a guess.

export const ACCOUNT_TYPE = {
  "01": "AUTO LOAN", "02": "HOUSING LOAN", "03": "PROPERTY LOAN",
  "04": "LOAN AGAINST SHARES/SECURITIES", "05": "PERSONAL LOAN", "06": "CONSUMER LOAN",
  "07": "GOLD LOAN", "08": "EDUCATION LOAN", "09": "LOAN TO PROFESSIONAL",
  "10": "CREDIT CARD", "11": "LEASING", "12": "OVERDRAFT", "13": "TWO-WHEELER LOAN",
  "14": "NON-FUNDED CREDIT FACILITY", "15": "AGRICULTURAL LOAN", "16": "CORPORATE CREDIT CARD",
  "17": "KISAN CREDIT CARD", "18": "HOME LOAN", "19": "LOAN AGAINST BANK DEPOSITS",
  "20": "MICROFINANCE LOAN", "24": "SECURED LOAN", "31": "SECURED CREDIT CARD",
  "32": "USED CAR LOAN", "33": "CONSTRUCTION EQUIPMENT LOAN",
  "35": "MICROFINANCE - BUSINESS LOAN", "36": "MICROFINANCE - PERSONAL LOAN",
  "37": "MICROFINANCE - HOUSING LOAN", "38": "MICROFINANCE - OTHERS",
  "39": "MICROFINANCE - DETAILS NOT REPORTED", "40": "BUSINESS LOAN - GENERAL",
  "41": "BUSINESS LOAN - PRIORITY SECTOR - SMALL BUSINESS",
  "43": "BUSINESS LOAN - PRIORITY SECTOR - AGRICULTURE",
  "44": "BUSINESS LOAN - PRIORITY SECTOR - OTHERS",
  "45": "BUSINESS NON-FUNDED CREDIT FACILITY - GENERAL",
  "51": "BUSINESS LOAN AGAINST BANK DEPOSITS", "53": "STAFF LOAN",
  "54": "BUSINESS LOAN - UNSECURED", "59": "LOAN ON CREDIT CARD",
  "61": "BUSINESS LOAN - UNSECURED", "69": "OTHER",
};

export const OWNERSHIP = {
  "1": "INDIVIDUAL", "2": "AUTHORISED USER", "3": "GUARANTOR", "4": "JOINT",
  "01": "INDIVIDUAL", "02": "AUTHORISED USER", "03": "GUARANTOR", "04": "JOINT",
};

export const PAYMENT_FREQUENCY = {
  "01": "WEEKLY", "02": "FORTNIGHTLY", "03": "MONTHLY",
  "04": "QUARTERLY", "05": "HALF YEARLY", "06": "YEARLY", "07": "BULLET",
};

export const COLLATERAL_TYPE = {
  "00": "NOT APPLICABLE", "01": "PROPERTY", "02": "GOLD", "03": "SHARES/SECURITIES",
  "04": "BANK DEPOSITS", "05": "VEHICLE", "06": "OTHERS",
};

export const ACCOUNT_CONDITION = {
  "01": "ACTIVE", "02": "CLOSED", "03": "SETTLED", "04": "WRITTEN OFF",
  "05": "RESTRUCTURED", "06": "SUIT FILED",
};

export const OPEN_CLOSED = { "01": "OPEN", "02": "CLOSED" };

export const PHONE_TYPE = {
  "00": "NOT CLASSIFIED", "01": "MOBILE PHONE", "02": "HOME PHONE",
  "03": "OFFICE PHONE", "04": "NOT CLASSIFIED",
};

export const ADDRESS_CATEGORY = {
  "01": "PERMANENT ADDRESS", "02": "RESIDENCE ADDRESS",
  "03": "OFFICE ADDRESS", "04": "NOT CATEGORIZED",
};

export const OCCUPATION = {
  "01": "SALARIED", "02": "SELF EMPLOYED PROFESSIONAL",
  "03": "SELF EMPLOYED", "04": "OTHERS",
};

// CIBIL/GST state codes. "09" → Uttar Pradesh, confirmed against the reference report.
export const REGION = {
  "01": "JAMMU & KASHMIR", "02": "HIMACHAL PRADESH", "03": "PUNJAB", "04": "CHANDIGARH",
  "05": "UTTARAKHAND", "06": "HARYANA", "07": "DELHI", "08": "RAJASTHAN",
  "09": "UTTAR PRADESH", "10": "BIHAR", "11": "SIKKIM", "12": "ARUNACHAL PRADESH",
  "13": "NAGALAND", "14": "MANIPUR", "15": "MIZORAM", "16": "TRIPURA",
  "17": "MEGHALAYA", "18": "ASSAM", "19": "WEST BENGAL", "20": "JHARKHAND",
  "21": "ODISHA", "22": "CHHATTISGARH", "23": "MADHYA PRADESH", "24": "GUJARAT",
  "25": "DAMAN & DIU", "26": "DADRA & NAGAR HAVELI", "27": "MAHARASHTRA",
  "28": "ANDHRA PRADESH", "29": "KARNATAKA", "30": "GOA", "31": "LAKSHADWEEP",
  "32": "KERALA", "33": "TAMIL NADU", "34": "PUDUCHERRY",
  "35": "ANDAMAN & NICOBAR", "36": "TELANGANA", "37": "LADAKH",
};

/** DPD legend, for the renderer's glossary/payment-history key. */
export const DPD_LEGEND = {
  "000": "Payment made on the due date",
  STD: "Payments being made within 90 days",
  SMA: "Special Mention Account — moving toward sub-standard",
  SUB: "Payments being made after 90 days",
  DBT: "Sub-standard for 12 months",
  LSS: "Loss identified, remains uncollectable",
  XXX: "Data not reported by the institution",
};

export const LOOKUPS = {
  ACCOUNT_TYPE, OWNERSHIP, PAYMENT_FREQUENCY, COLLATERAL_TYPE, ACCOUNT_CONDITION,
  OPEN_CLOSED, PHONE_TYPE, ADDRESS_CATEGORY, OCCUPATION, REGION, DPD_LEGEND,
};

// ─── Primitives — sentinels are normalised to null here, never downstream ────

const SENTINELS = new Set(["", "-1", "-1.00", "-1.0", "NULL", "null", "NA", "N/A"]);

/** Trimmed string, or null. */
export const text = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" || SENTINELS.has(s) ? null : s;
};

/** Number, or null. Negative values are the feed's "not reported" marker. */
export const num = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "" || SENTINELS.has(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** "2026-04-21+05:30" | ISO → "DD/MM/YYYY", or null. Read textually: no TZ shift. */
export const date = (v) => {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

/** Indian digit grouping — exported for the renderer; the model carries Numbers. */
export const money = (n) => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return null;
  const i = String(Math.round(Number(n)));
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3);
  return rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
};

/** Resolve a { symbol } node through a lookup; falls back to symbol, else null. */
export const lookup = (map, node) => {
  const sym = node && typeof node === "object" ? node.symbol : node;
  const s = text(sym);
  if (s === null) return null;
  return map[s] || map[s.padStart(2, "0")] || s;
};

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

// ─── Locating the report inside the unified response ─────────────────────────

function findAssetSuccess(raw) {
  for (const step of asArray(raw?.steps)) {
    const s = step?.response?.GetCustomerAssetsResponse?.GetCustomerAssetsSuccess;
    if (s) return s;
  }
  return null;
}

// ─── Section mappers ─────────────────────────────────────────────────────────

/** Identifiers keyed by IdentifierName (SocialId / TaxId / VoterId / CkycId). */
function mapIdentifiers(borrower) {
  const out = {};
  for (const part of asArray(borrower?.IdentifierPartition)) {
    for (const id of asArray(part?.Identifier)) {
      const name = text(id?.ID?.IdentifierName);
      const value = text(id?.ID?.Id);
      if (name && value) out[name] = value;
    }
  }
  return {
    pan: out.TaxId ?? null,
    voterId: out.VoterId ?? null,
    ckyc: out.CkycId ?? null,
    socialId: out.SocialId ?? null,
    // Verified absent from this feed — kept so the renderer can show the row.
    aadhaar: out.UID ?? null,
    passport: out.PassportId ?? null,
    drivingLicence: out.DriverLicenseId ?? null,
    rationCard: out.RationCardId ?? null,
  };
}

/** Address: verified CreditAddress.StreetAddress / City / Region / PostalCode. */
function mapAddresses(borrower) {
  return asArray(borrower?.BorrowerAddress).map((a) => {
    const ca = a?.CreditAddress || {};
    const parts = [
      text(ca.StreetAddress),
      text(ca.City),
      lookup(REGION, text(ca.Region)),
      text(ca.PostalCode),
    ].filter(Boolean);
    return {
      line: parts.length ? parts.join(", ") : null,
      street: text(ca.StreetAddress),
      city: text(ca.City),
      region: lookup(REGION, text(ca.Region)),
      postalCode: text(ca.PostalCode),
      category: lookup(ADDRESS_CATEGORY, a?.Dwelling) ?? lookup(ADDRESS_CATEGORY, a?.AddressType),
      residenceCode: lookup(ADDRESS_CATEGORY, a?.Ownership),
      reportedBy: text(a?.Origin?.symbol),
      dateReported: date(a?.dateReported),
    };
  });
}

/** Telephone: verified BorrowerTelephone[].PhoneNumber.Number. */
function mapTelephones(borrower) {
  return asArray(borrower?.BorrowerTelephone)
    .map((t) => ({
      number: text(t?.PhoneNumber?.Number),
      type: lookup(PHONE_TYPE, t?.PhoneType),
    }))
    .filter((t) => t.number !== null);
}

function mapEmails(borrower) {
  return asArray(borrower?.EmailAddress)
    .map((e) => text(e?.Email))
    .filter(Boolean);
}

/** Employment: verified Employer.account / dateReported / OccupationCode / name. */
function mapEmployment(borrower) {
  return asArray(borrower?.Employer).map((e) => ({
    employerName: text(e?.name),
    accountType: lookup(ACCOUNT_TYPE, text(e?.account)),
    // OccupationCode is the one node in this feed that carries a description.
    occupation: text(e?.OccupationCode?.description) ?? lookup(OCCUPATION, e?.OccupationCode),
    income: num(e?.income),
    netGrossIndicator: text(e?.NetGrossIndicator),
    incomeFrequency: text(e?.IncomeFreqIndicator),
    dateReported: date(e?.dateReported),
  }));
}

/** Month-wise DPD → { year: { 1..12: code } } plus a sorted year list. */
function mapDpd(history) {
  const byYear = {};
  for (const m of asArray(history?.MonthlyPayStatus)) {
    const d = String(m?.date ?? "").match(/^(\d{4})-(\d{2})/);
    if (!d) continue;
    const raw = String(m?.status ?? "").trim();
    if (raw === "") continue;
    byYear[d[1]] = byYear[d[1]] || {};
    byYear[d[1]][Number(d[2])] = /^\d+$/.test(raw) ? raw.padStart(3, "0") : raw.toUpperCase();
  }
  return {
    startDate: date(history?.startDate),
    endDate: date(history?.endDate),
    years: Object.keys(byYear).sort((a, b) => Number(b) - Number(a)),
    byYear,
  };
}

/** One account card. All money fields are Number|null. */
function mapAccount(partition, i) {
  const t = partition?.Tradeline || {};
  const g = t?.GrantedTrade || {};
  const openClosedSym = text(t?.OpenClosed?.symbol);
  const condition = lookup(ACCOUNT_CONDITION, t?.AccountCondition);

  return {
    index: i + 1,
    status: openClosedSym === "02" ? "CLOSED" : "ACTIVE",
    accountCondition: condition,
    accountType:
      lookup(ACCOUNT_TYPE, g?.AccountType) ??
      lookup(ACCOUNT_TYPE, text(partition?.accountTypeSymbol)),
    memberName: text(t.creditorName),
    accountNumber: text(t.accountNumber),
    ownership: lookup(OWNERSHIP, t?.AccountDesignator),
    dateOpened: date(t.dateOpened),
    dateClosed: date(t.dateClosed),
    dateReported: date(t.dateReported),
    dateAccountStatus: date(t.dateAccountStatus),
    lastPayment: date(g.dateLastPayment),
    sanctionedAmount: num(t.highBalance),
    currentBalance: num(t.currentBalance),
    overdueAmount: num(g.amountPastDue),
    actualPayment: num(g.actualPaymentAmount),
    creditLimit: num(g.CreditLimit),
    cashLimit: num(g.CashLimit),
    emi: num(g.EMIAmount),
    interestRate: num(g.interestRate),
    repaymentTenure: num(g.termMonths),
    paymentFrequency: lookup(PAYMENT_FREQUENCY, g?.PaymentFrequency),
    collateralType: lookup(COLLATERAL_TYPE, g?.CollateralType),
    collateral: text(g.collateral),
    writtenOffTotal: num(t.writtenOffAmtTotal),
    writtenOffPrincipal: num(t.writtenOffPrincipal),
    settlementAmount: num(t.settlementAmount),
    disputeFlag: text(t?.DisputeFlag?.symbol),
    dpd: mapDpd(g?.PayStatusHistory),
  };
}

function mapEnquiries(report) {
  return asArray(report?.InquiryPartition).map((p) => {
    const q = p?.Inquiry || {};
    return {
      memberName: text(q.subscriberName),
      date: date(q.inquiryDate),
      purpose: lookup(ACCOUNT_TYPE, text(q.inquiryType)),
      amount: num(q.amount),
      controlNumber: text(q.enqControlNum),
      _iso: text(q.inquiryDate),
    };
  });
}

// ─── Calculated summaries (the feed supplies none of these) ──────────────────

function calcAccountSummary(accounts) {
  const opened = accounts.map((a) => a.dateOpened).filter(Boolean);
  const toSortable = (d) => d.slice(6) + d.slice(3, 5) + d.slice(0, 2); // YYYYMMDD
  const sorted = [...opened].sort((a, b) => toSortable(a).localeCompare(toSortable(b)));
  const sum = (f) => accounts.reduce((s, a) => s + (a[f] ?? 0), 0);

  return {
    total: accounts.length,
    zeroBalance: accounts.filter((a) => (a.currentBalance ?? 0) === 0).length,
    overdueCount: accounts.filter((a) => (a.overdueAmount ?? 0) > 0).length,
    highCreditTotal: sum("sanctionedAmount"),
    currentBalanceTotal: sum("currentBalance"),
    overdueTotal: sum("overdueAmount"),
    recentOpened: sorted.length ? sorted[sorted.length - 1] : null,
    oldestOpened: sorted.length ? sorted[0] : null,
  };
}

function calcEnquirySummary(enquiries) {
  const now = Date.now();
  const ageDays = (iso) => {
    const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (now - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000 : Infinity;
  };
  const dated = enquiries.filter((e) => ageDays(e._iso) !== Infinity)
    .sort((a, b) => ageDays(a._iso) - ageDays(b._iso));
  const within = (d) => enquiries.filter((e) => ageDays(e._iso) <= d).length;

  return {
    total: enquiries.length,
    mostRecent: dated.length ? dated[0].date : null,
    past30Days: within(30),
    past12Months: within(365),
    past24Months: within(730),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * buildReportModel({ app, cibil, raw }) → normalised report model.
 * Never throws; a missing or malformed response yields empty sections.
 */
export function buildReportModel({ app = {}, cibil = {}, raw = null } = {}) {
  const success = findAssetSuccess(raw);
  const report = success?.Asset?.TrueLinkCreditReport || null;
  const b = report?.Borrower || {};
  const applicant = app?.applicant?.applicant || app?.applicant || {};

  const accounts = asArray(report?.TradeLinePartition).map(mapAccount);
  const enquiriesRaw = mapEnquiries(report);
  const enquiries = enquiriesRaw.map(({ _iso, ...rest }) => rest);

  const factors = [];
  for (const f of asArray(b?.CreditScore?.CreditScoreFactor)) {
    for (const t of asArray(f?.FactorText)) {
      const s = text(String(t).replace(/^explain:\s*/i, ""));
      if (s) factors.push(s);
    }
  }

  const now = new Date();
  return {
    header: {
      reportDate: date(now.toISOString()),
      reportTime: now.toTimeString().slice(0, 8),
      // Verified absent from the feed; kept so the renderer can show the rows.
      controlNumber: null,
      memberId: null,
      referenceNumber: text(cibil?.requestId) ?? text(raw?.client_key) ?? text(report?.ReferenceKey),
      applicationNo: text(app?.formId),
    },
    consumer: {
      name: text(b?.BorrowerName?.Name?.Forename) ?? text(applicant.name),
      dob: date(b?.Birth?.date) ?? date(applicant.dateOfBirth),
      age: num(b?.Birth?.age),
      gender: text(b?.Gender) ?? text(applicant.gender),
      telephones: mapTelephones(b),
      emails: mapEmails(b),
      addresses: mapAddresses(b),
      employment: mapEmployment(b),
      identification: mapIdentifiers(b),
    },
    score: {
      value: num(b?.CreditScore?.riskScore) ?? num(cibil?.score),
      name: text(b?.CreditScore?.scoreName),
      model: text(b?.CreditScore?.CreditScoreModel?.symbol),
      noScoreReason: text(b?.CreditScore?.NoScoreReason?.symbol),
      factors,
      min: 300,
      max: 900,
    },
    creditVision: {
      // No algorithm data exists in this feed — verified across the response.
      algorithms: [],
    },
    summary: {
      accounts: calcAccountSummary(accounts),
      enquiries: calcEnquirySummary(enquiriesRaw),
      // TransUnion's own summary block, distinct from the report's summary box.
      creditSummary: success?.CreditSummaryData
        ? {
            oldestCreditAccountPeriod: num(success.CreditSummaryData.OldestCreditAccountPeriod),
            inquiries: num(success.CreditSummaryData.Inquires),
            onTimePaymentHistory: num(success.CreditSummaryData.OnTimePaymentHistory),
            creditCardUtilization: num(success.CreditSummaryData.CreditCardUtilization),
            creditMix: num(success.CreditSummaryData.CreditMix),
          }
        : null,
    },
    accounts,
    enquiries,
  };
}

export default { buildReportModel, LOOKUPS, money, date, num, text, lookup };
