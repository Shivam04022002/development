// utils/cibilReportData.js
//
// Maps the raw Xaler / TransUnion response onto the model the CIBIL report
// renders. Everything is derived from the API response — nothing is invented.
// Fields the response does not carry resolve to "-" (or "Not Available").
//
// Summary figures that TransUnion does not supply directly (zero-balance count,
// overdue count, high-credit total, recent/oldest opened date, enquiry buckets)
// are CALCULATED from the tradelines and enquiries here.

// ─── Lookup tables for coded values ──────────────────────────────────────────
// The response returns { symbol, description } with description empty, so the
// symbol is mapped to the published CIBIL label. Unknown symbols fall back to
// the raw symbol rather than a guess.

export const ACCOUNT_TYPE = {
  "01": "AUTO LOAN", "02": "HOUSING LOAN", "03": "PROPERTY LOAN",
  "04": "LOAN AGAINST SHARES/SECURITIES", "05": "PERSONAL LOAN", "06": "CONSUMER LOAN",
  "07": "GOLD LOAN", "08": "EDUCATION LOAN", "09": "LOAN TO PROFESSIONAL",
  "10": "CREDIT CARD", "11": "LEASING", "12": "OVERDRAFT", "13": "TWO-WHEELER LOAN",
  "14": "NON-FUNDED CREDIT FACILITY", "15": "AGRICULTURAL LOAN", "16": "CORPORATE CREDIT CARD",
  "17": "KISAN CREDIT CARD", "31": "SECURED CREDIT CARD", "32": "USED CAR LOAN",
  "33": "CONSTRUCTION EQUIPMENT LOAN", "35": "MICROFINANCE - BUSINESS LOAN",
  "36": "MICROFINANCE - PERSONAL LOAN", "37": "MICROFINANCE - HOUSING LOAN",
  "38": "MICROFINANCE - OTHERS", "39": "MICROFINANCE - DETAILS NOT REPORTED",
  "40": "BUSINESS LOAN - GENERAL", "41": "BUSINESS LOAN - PRIORITY SECTOR - SMALL BUSINESS",
  "43": "BUSINESS LOAN - PRIORITY SECTOR - AGRICULTURE",
  "44": "BUSINESS LOAN - PRIORITY SECTOR - OTHERS",
  "45": "BUSINESS NON-FUNDED CREDIT FACILITY - GENERAL",
  "51": "BUSINESS LOAN AGAINST BANK DEPOSITS", "53": "STAFF LOAN",
  "54": "BUSINESS LOAN - UNSECURED", "59": "LOAN ON CREDIT CARD",
  "61": "BUSINESS LOAN - UNSECURED",
};

export const OWNERSHIP = {
  "1": "INDIVIDUAL", "2": "AUTHORISED USER", "3": "GUARANTOR", "4": "JOINT",
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

/** Map a { symbol } object to a readable label, falling back to the symbol. */
export const label = (map, node) => {
  const sym = typeof node === "object" && node !== null ? node.symbol : node;
  if (sym === undefined || sym === null || sym === "") return "-";
  const desc = typeof node === "object" && node !== null ? node.description : "";
  return map[String(sym)] || (desc || String(sym));
};

// ─── Formatting helpers ──────────────────────────────────────────────────────

/** "2026-04-21+05:30" | "2026-04-21T…" → "21/04/2026". Never throws. */
export const fmtDate = (v) => {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "-";
};

/** Indian digit grouping. "-1" and "" mean "not reported" in this feed. */
export const money = (v) => {
  if (v === undefined || v === null || v === "") return "-";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "-";
  const [i, f] = String(Math.round(n)).split(".");
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return f ? `${grouped}.${f}` : grouped;
};

/** Plain value with a dash fallback; "-1" is the feed's "not reported". */
export const val = (v) => {
  if (v === undefined || v === null || v === "" || v === "-1" || v === "-1.00") return "-";
  return String(v);
};

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const numOr0 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// ─── Extraction ──────────────────────────────────────────────────────────────

/** The TrueLink credit report node, wherever the unified flow placed it. */
function findTrueLink(raw) {
  for (const step of asArray(raw?.steps)) {
    const tl = step?.response?.GetCustomerAssetsResponse?.GetCustomerAssetsSuccess
      ?.Asset?.TrueLinkCreditReport;
    if (tl) return tl;
  }
  return null;
}

function findCreditSummary(raw) {
  for (const step of asArray(raw?.steps)) {
    const cs = step?.response?.GetCustomerAssetsResponse?.GetCustomerAssetsSuccess
      ?.CreditSummaryData;
    if (cs) return cs;
  }
  return null;
}

/** Identifiers keyed by IdentifierName (SocialId / TaxId / VoterId / CkycId …). */
function identifiers(tl) {
  const out = {};
  for (const part of asArray(tl?.Borrower?.IdentifierPartition)) {
    for (const id of asArray(part?.Identifier)) {
      const name = id?.ID?.IdentifierName;
      if (name && id?.ID?.Id) out[name] = String(id.ID.Id);
    }
  }
  return out;
}

/** Month-wise DPD grouped by year → { [year]: { 1..12: code } }. */
function dpdGrid(monthly) {
  const grid = {};
  for (const m of asArray(monthly)) {
    const d = String(m?.date ?? "").match(/^(\d{4})-(\d{2})/);
    if (!d) continue;
    const year = d[1];
    const month = Number(d[2]);
    grid[year] = grid[year] || {};
    // "0" is reported for on-time; the report prints it three-digit.
    const s = String(m?.status ?? "").trim();
    grid[year][month] = s === "" ? "-" : /^\d+$/.test(s) ? s.padStart(3, "0") : s.toUpperCase();
  }
  return grid;
}

/** Normalise one tradeline partition into the account card model. */
function mapAccount(part, index) {
  const t = part?.Tradeline || {};
  const g = t?.GrantedTrade || {};
  const openClosed = label(ACCOUNT_CONDITION, t?.OpenClosed);
  const status =
    String(t?.OpenClosed?.symbol || "") === "02" || /closed/i.test(openClosed)
      ? "CLOSED"
      : "ACTIVE";

  return {
    index: index + 1,
    status,
    dateOpened: fmtDate(t.dateOpened),
    dateClosed: fmtDate(t.dateClosed),
    dateReported: fmtDate(t.dateReported),
    accountType: label(ACCOUNT_TYPE, g?.AccountType) !== "-"
      ? label(ACCOUNT_TYPE, g.AccountType)
      : (part?.accountTypeDescription || "-"),
    memberName: val(t.creditorName),
    accountNumber: val(t.accountNumber),
    ownership: label(OWNERSHIP, t?.AccountDesignator),
    sanctioned: money(t.highBalance),
    currentBalance: money(t.currentBalance),
    overdue: money(g.amountPastDue),
    actualPayment: money(g.actualPaymentAmount),
    paymentFrequency: label(PAYMENT_FREQUENCY, g?.PaymentFrequency),
    repaymentTenure: val(g.termMonths),
    interestRate: val(g.interestRate),
    emi: money(g.EMIAmount),
    collateralType: label(COLLATERAL_TYPE, g?.CollateralType),
    creditLimit: money(g.CreditLimit),
    writtenOff: money(t.writtenOffAmtTotal),
    settlement: money(t.settlementAmount),
    dpdStart: fmtDate(g?.PayStatusHistory?.startDate),
    dpdEnd: fmtDate(g?.PayStatusHistory?.endDate),
    lastPayment: fmtDate(g.dateLastPayment),
    dpd: dpdGrid(g?.PayStatusHistory?.MonthlyPayStatus),
    // raw numerics for the summary calculations
    _balance: numOr0(t.currentBalance),
    _high: numOr0(t.highBalance),
    _overdue: numOr0(g.amountPastDue),
    _openedISO: String(t.dateOpened ?? ""),
  };
}

/** Enquiry rows + the calculated 30-day / 12-month / 24-month buckets. */
function mapEnquiries(tl) {
  const rows = asArray(tl?.InquiryPartition).map((p) => {
    const q = p?.Inquiry || p || {};
    return {
      memberName: val(q.subscriberName),
      date: fmtDate(q.inquiryDate),
      purpose: label(ACCOUNT_TYPE, { symbol: q.inquiryType }),
      amount: money(q.amount),
      _iso: String(q.inquiryDate ?? ""),
    };
  });

  const now = Date.now();
  const days = (iso) => {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return Infinity;
    return (now - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000;
  };
  const within = (d) => rows.filter((r) => days(r._iso) <= d).length;
  const sorted = rows.filter((r) => days(r._iso) !== Infinity)
    .sort((a, b) => days(a._iso) - days(b._iso));

  return {
    rows,
    summary: {
      total: rows.length,
      mostRecent: sorted.length ? sorted[0].date : "-",
      past30Days: within(30),
      past12Months: within(365),
      past24Months: within(730),
    },
  };
}

/** Account summary — calculated, since the feed supplies no totals. */
function accountSummary(accounts) {
  const opened = accounts.map((a) => a._openedISO).filter((s) => /^\d{4}-\d{2}-\d{2}/.test(s)).sort();
  return {
    total: accounts.length,
    zeroBalance: accounts.filter((a) => a._balance === 0).length,
    overdueCount: accounts.filter((a) => a._overdue > 0).length,
    highCredit: money(accounts.reduce((s, a) => s + a._high, 0)),
    currentBalance: money(accounts.reduce((s, a) => s + a._balance, 0)),
    overdueAmount: money(accounts.reduce((s, a) => s + a._overdue, 0)),
    recentOpened: opened.length ? fmtDate(opened[opened.length - 1]) : "-",
    oldestOpened: opened.length ? fmtDate(opened[0]) : "-",
  };
}

/**
 * buildReportModel({ app, cibil, raw }) → everything the renderer needs.
 * Never throws: a missing or malformed response yields empty sections.
 */
export function buildReportModel({ app = {}, cibil = {}, raw = null } = {}) {
  const tl = findTrueLink(raw);
  const b = tl?.Borrower || {};
  const ids = identifiers(tl);
  const cs = findCreditSummary(raw);

  const accounts = asArray(tl?.TradeLinePartition).map(mapAccount);
  const enquiries = mapEnquiries(tl);

  const applicant = app?.applicant?.applicant || app?.applicant || {};
  const score = typeof cibil?.score === "number" ? cibil.score : null;

  const factors = [];
  for (const f of asArray(b?.CreditScore?.CreditScoreFactor)) {
    for (const text of asArray(f?.FactorText)) {
      const t = String(text).replace(/^explain:\s*/i, "").trim();
      if (t) factors.push(t);
    }
  }

  return {
    header: {
      // The unified response carries no control / member / reference number.
      reportDate: new Date().toLocaleDateString("en-GB"),
      reportTime: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      controlNumber: val(raw?.control_number),
      memberId: val(raw?.member_id),
      referenceNumber: val(cibil?.requestId || raw?.client_key),
    },
    consumer: {
      name: val(b?.BorrowerName?.Name?.Forename || applicant.name),
      dob: fmtDate(b?.Birth?.date || applicant.dateOfBirth),
      gender: val(b?.Gender || applicant.gender),
      telephones: asArray(b?.BorrowerTelephone).map((t) => val(t?.Telephone?.Unparsed || t?.unparsed)),
      emails: asArray(b?.EmailAddress).map((e) => val(e?.Email)),
      addresses: asArray(b?.BorrowerAddress).map((a) => ({
        text: [a?.CreditAddress?.unparsedStreet, a?.CreditAddress?.city,
               a?.CreditAddress?.state, a?.CreditAddress?.postalCode]
          .filter(Boolean).join(", ") || "-",
        category: val(a?.CreditAddress?.AddressCategory?.description),
        reported: fmtDate(a?.dateReported),
      })),
      employment: asArray(b?.Employer).map((e) => ({
        accountType: val(e?.EmployerName || e?.name),
        occupation: val(e?.Occupation?.description),
        income: money(e?.income),
        reported: fmtDate(e?.dateReported),
      })),
      identification: {
        pan: val(ids.TaxId || applicant.panNo),
        aadhaar: ids.UID ? val(ids.UID) : "NOT DISCLOSED",
        passport: val(ids.PassportId),
        voterId: val(ids.VoterId),
        drivingLicence: val(ids.DriverLicenseId),
        ckyc: val(ids.CkycId),
      },
    },
    score: {
      value: score,
      model: val(b?.CreditScore?.CreditScoreModel?.symbol),
      factors,
      min: 300,
      max: 900,
    },
    creditSummary: cs || null,
    accountSummary: accountSummary(accounts),
    accounts,
    enquirySummary: enquiries.summary,
    enquiries: enquiries.rows,
    application: {
      formId: val(app?.formId),
      status: val(app?.status),
    },
  };
}

export default { buildReportModel };
