// scripts/verifyCibilMapping.js
//
// Verification for the CIBIL report mapping layer. Runs the mapper over a real
// stored Xaler response and asserts, for every mapped field:
//   • presence  — the field exists on the model
//   • type      — Number | String | null as the contract requires
//   • format    — dates DD/MM/YYYY, DPD codes normalised, no "-1" sentinels
// plus the calculated summaries and lookup resolution.
//
// Usage:  node scripts/verifyCibilMapping.js <path-to-raw-response.json>
// On the server:
//   node scripts/verifyCibilMapping.js /var/www/uploads/applications/<FORM>/cibil/raw-response.json
//
// Exits non-zero if any check fails.

import fs from "fs";
import { buildReportModel, LOOKUPS } from "../utils/cibilReportData.js";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/verifyCibilMapping.js <raw-response.json>");
  process.exit(2);
}

let pass = 0;
let fail = 0;
const failures = [];

const check = (name, cond, detail = "") => {
  if (cond) { pass++; return true; }
  fail++;
  failures.push(`${name}${detail ? " — " + detail : ""}`);
  return false;
};

// ─── Type / format predicates ────────────────────────────────────────────────
const isNumOrNull = (v) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const isStrOrNull = (v) => v === null || (typeof v === "string" && v.length > 0);
const isDateOrNull = (v) => v === null || /^\d{2}\/\d{2}\/\d{4}$/.test(v);
const isDpdCode = (v) => /^(\d{3}|[A-Z]{3})$/.test(v);

/** No sentinel may survive anywhere in the model. */
function findSentinels(node, path = "", hits = []) {
  if (node === null || node === undefined) return hits;
  if (Array.isArray(node)) { node.forEach((v, i) => findSentinels(v, `${path}[${i}]`, hits)); return hits; }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) findSentinels(v, path ? `${path}.${k}` : k, hits);
    return hits;
  }
  const s = String(node);
  if (s === "-1" || s === "-1.00" || s === "-1.0" || (typeof node === "number" && node < 0)) hits.push(`${path} = ${s}`);
  return hits;
}

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const model = buildReportModel({
  app: { formId: "FORM-TEST", applicant: {} },
  cibil: { score: null, requestId: "tu_test" },
  raw,
});

console.log("=== CIBIL mapping verification ===");
console.log("source:", file);
console.log("");

// ── Header ───────────────────────────────────────────────────────────────────
check("header.reportDate format", isDateOrNull(model.header.reportDate), model.header.reportDate);
check("header.reportTime format", /^\d{2}:\d{2}:\d{2}$/.test(model.header.reportTime), model.header.reportTime);
check("header.referenceNumber type", isStrOrNull(model.header.referenceNumber));
check("header.controlNumber is null (absent from feed)", model.header.controlNumber === null);
check("header.memberId is null (absent from feed)", model.header.memberId === null);

// ── Consumer ─────────────────────────────────────────────────────────────────
const c = model.consumer;
check("consumer.name type", isStrOrNull(c.name), String(c.name));
check("consumer.dob format", isDateOrNull(c.dob), String(c.dob));
check("consumer.age type", isNumOrNull(c.age));
check("consumer.gender type", isStrOrNull(c.gender));

check("telephones is array", Array.isArray(c.telephones));
c.telephones.forEach((t, i) => {
  check(`telephones[${i}].number is string`, typeof t.number === "string" && t.number.length > 0, JSON.stringify(t));
  check(`telephones[${i}].type resolved`, isStrOrNull(t.type));
});
check("telephones populated (path fix)", c.telephones.length > 0, `got ${c.telephones.length}`);

check("emails is array of strings", Array.isArray(c.emails) && c.emails.every((e) => typeof e === "string"));

check("addresses is array", Array.isArray(c.addresses));
c.addresses.forEach((a, i) => {
  check(`addresses[${i}].line is string`, isStrOrNull(a.line), JSON.stringify(a.line));
  check(`addresses[${i}].dateReported format`, isDateOrNull(a.dateReported));
  check(`addresses[${i}].region resolved`, isStrOrNull(a.region));
});
check("addresses populated (path fix)", c.addresses.some((a) => a.line !== null),
  `lines: ${c.addresses.map((a) => a.line).join(" | ")}`);

check("employment is array", Array.isArray(c.employment));
c.employment.forEach((e, i) => {
  check(`employment[${i}].occupation resolved`, isStrOrNull(e.occupation), String(e.occupation));
  check(`employment[${i}].accountType resolved`, isStrOrNull(e.accountType), String(e.accountType));
  check(`employment[${i}].dateReported format`, isDateOrNull(e.dateReported));
  check(`employment[${i}].income type`, isNumOrNull(e.income));
});

const id = c.identification;
["pan", "voterId", "ckyc", "aadhaar", "passport", "drivingLicence"].forEach((k) =>
  check(`identification.${k} type`, isStrOrNull(id[k]), `${k}=${id[k]}`));

// ── Score ────────────────────────────────────────────────────────────────────
check("score.value type", isNumOrNull(model.score.value), String(model.score.value));
check("score.value in range", model.score.value === null || (model.score.value >= 300 && model.score.value <= 900));
check("score.factors is array of strings", Array.isArray(model.score.factors) && model.score.factors.every((f) => typeof f === "string"));
check("score.factors stripped of 'explain:'", model.score.factors.every((f) => !/^explain:/i.test(f)));

// ── Accounts ─────────────────────────────────────────────────────────────────
check("accounts is array", Array.isArray(model.accounts));
const MONEY = ["sanctionedAmount", "currentBalance", "overdueAmount", "actualPayment",
  "creditLimit", "cashLimit", "emi", "writtenOffTotal", "settlementAmount"];
const DATES = ["dateOpened", "dateClosed", "dateReported", "dateAccountStatus", "lastPayment"];
let dpdCells = 0;
model.accounts.forEach((a, i) => {
  MONEY.forEach((f) => check(`accounts[${i}].${f} Number|null`, isNumOrNull(a[f]), `${f}=${a[f]}`));
  DATES.forEach((f) => check(`accounts[${i}].${f} DD/MM/YYYY`, isDateOrNull(a[f]), `${f}=${a[f]}`));
  check(`accounts[${i}].status`, a.status === "ACTIVE" || a.status === "CLOSED", a.status);
  check(`accounts[${i}].accountType resolved`, isStrOrNull(a.accountType), String(a.accountType));
  check(`accounts[${i}].ownership resolved`, isStrOrNull(a.ownership));
  check(`accounts[${i}].interestRate Number|null`, isNumOrNull(a.interestRate));
  check(`accounts[${i}].repaymentTenure Number|null`, isNumOrNull(a.repaymentTenure));
  check(`accounts[${i}].dpd.years is array`, Array.isArray(a.dpd.years));
  check(`accounts[${i}].dpd.startDate format`, isDateOrNull(a.dpd.startDate));
  for (const y of a.dpd.years) {
    check(`accounts[${i}].dpd year ${y} is 4-digit`, /^\d{4}$/.test(y));
    for (const [mth, code] of Object.entries(a.dpd.byYear[y])) {
      dpdCells++;
      check(`accounts[${i}].dpd[${y}][${mth}] month 1-12`, Number(mth) >= 1 && Number(mth) <= 12);
      check(`accounts[${i}].dpd[${y}][${mth}] code`, isDpdCode(code), code);
    }
  }
});

// ── Enquiries ────────────────────────────────────────────────────────────────
model.enquiries.forEach((e, i) => {
  check(`enquiries[${i}].memberName type`, isStrOrNull(e.memberName));
  check(`enquiries[${i}].date format`, isDateOrNull(e.date), String(e.date));
  check(`enquiries[${i}].amount Number|null`, isNumOrNull(e.amount));
  check(`enquiries[${i}].purpose resolved`, isStrOrNull(e.purpose));
});
check("enquiries carry no internal _iso", model.enquiries.every((e) => !("_iso" in e)));

// ── Calculated summaries ─────────────────────────────────────────────────────
const s = model.summary.accounts;
check("summary.total matches accounts length", s.total === model.accounts.length, `${s.total} vs ${model.accounts.length}`);
check("summary.zeroBalance recomputes",
  s.zeroBalance === model.accounts.filter((a) => (a.currentBalance ?? 0) === 0).length);
check("summary.overdueCount recomputes",
  s.overdueCount === model.accounts.filter((a) => (a.overdueAmount ?? 0) > 0).length);
check("summary.highCreditTotal recomputes",
  s.highCreditTotal === model.accounts.reduce((t, a) => t + (a.sanctionedAmount ?? 0), 0));
check("summary.currentBalanceTotal recomputes",
  s.currentBalanceTotal === model.accounts.reduce((t, a) => t + (a.currentBalance ?? 0), 0));
check("summary.overdueTotal recomputes",
  s.overdueTotal === model.accounts.reduce((t, a) => t + (a.overdueAmount ?? 0), 0));
check("summary.recentOpened format", isDateOrNull(s.recentOpened), String(s.recentOpened));
check("summary.oldestOpened format", isDateOrNull(s.oldestOpened), String(s.oldestOpened));

const q = model.summary.enquiries;
check("enquirySummary.total matches", q.total === model.enquiries.length);
check("enquirySummary buckets are numbers", [q.past30Days, q.past12Months, q.past24Months].every((n) => typeof n === "number"));
check("enquirySummary buckets are monotonic", q.past30Days <= q.past12Months && q.past12Months <= q.past24Months,
  `${q.past30Days}/${q.past12Months}/${q.past24Months}`);
check("enquirySummary.mostRecent format", isDateOrNull(q.mostRecent));

// ── Sentinels + isolation ────────────────────────────────────────────────────
const sentinels = findSentinels(model);
check("no -1 / negative sentinels survive", sentinels.length === 0, sentinels.slice(0, 5).join("; "));
const modelKeys = Object.keys(model).sort().join(",");
check("model shape is normalised",
  modelKeys === "accounts,consumer,creditVision,enquiries,header,score,summary", modelKeys);

// ── Lookups ──────────────────────────────────────────────────────────────────
check("11 lookup tables exported", Object.keys(LOOKUPS).length === 11, Object.keys(LOOKUPS).join(","));
check("ACCOUNT_TYPE resolves 06", LOOKUPS.ACCOUNT_TYPE["06"] === "CONSUMER LOAN");
check("REGION resolves 09", LOOKUPS.REGION["09"] === "UTTAR PRADESH");
check("PAYMENT_FREQUENCY resolves 03", LOOKUPS.PAYMENT_FREQUENCY["03"] === "MONTHLY");

// ── Degenerate inputs must not throw ─────────────────────────────────────────
for (const [label, r] of [["null", null], ["{}", {}], ["error body", { status: "error", steps: [] }]]) {
  try {
    const m = buildReportModel({ raw: r });
    check(`degenerate ${label}: no throw, empty sections`, m.accounts.length === 0 && m.enquiries.length === 0);
  } catch (e) {
    check(`degenerate ${label}: no throw`, false, e.message);
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────
console.log(`accounts        : ${model.accounts.length}`);
console.log(`enquiries       : ${model.enquiries.length}`);
console.log(`DPD cells       : ${dpdCells}`);
console.log(`telephones      : ${c.telephones.length}`);
console.log(`emails          : ${c.emails.length}`);
console.log(`addresses       : ${c.addresses.length}`);
console.log(`employment      : ${c.employment.length}`);
console.log(`score factors   : ${model.score.factors.length}`);
console.log("");
console.log(`account summary : ${JSON.stringify(model.summary.accounts)}`);
console.log(`enquiry summary : ${JSON.stringify(model.summary.enquiries)}`);
console.log("");
console.log(`checks passed   : ${pass}`);
console.log(`checks failed   : ${fail}`);
if (fail) {
  console.log("\nFAILURES:");
  failures.slice(0, 25).forEach((f) => console.log("  - " + f));
}
process.exit(fail ? 1 : 0);
