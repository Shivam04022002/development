// scripts/snapshotCibilReport.js
//
// Regression snapshot for the CIBIL report pipeline. Produces a stable
// structural fingerprint of the normalised model so any future mapper change
// is detected immediately. Contains no personal data — only shapes, counts,
// types and null-ratios.
//
//   node scripts/snapshotCibilReport.js <raw.json> [...]        print snapshot
//   node scripts/snapshotCibilReport.js --check <baseline.json> <raw.json> ...
//
// Exits non-zero when a snapshot differs from the baseline.

import fs from "fs";
import { buildReportModel } from "../utils/cibilReportData.js";

const args = process.argv.slice(2);
const checkMode = args[0] === "--check";
const baselineFile = checkMode ? args[1] : null;
const files = checkMode ? args.slice(2) : args;

if (!files.length) {
  console.error("usage: node scripts/snapshotCibilReport.js [--check <baseline>] <raw.json> ...");
  process.exit(2);
}

const typeOf = (v) =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v;

/** Shape of an object: key → type, recursively, arrays collapsed to element 0. */
function shape(node, depth = 0) {
  if (depth > 6 || node === null || node === undefined) return typeOf(node);
  if (Array.isArray(node)) return node.length ? [shape(node[0], depth + 1)] : [];
  if (typeof node === "object") {
    const out = {};
    for (const k of Object.keys(node).sort()) out[k] = shape(node[k], depth + 1);
    return out;
  }
  return typeof node;
}

/** Non-identifying fingerprint of one payload. */
function fingerprint(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const model = buildReportModel({
    app: { formId: "FORM-SNAP", applicant: {} },
    cibil: { score: null, requestId: "tu_snap" },
    raw,
  });
  const a = model.accounts;
  const nullRatio = (arr, f) =>
    arr.length ? Number((arr.filter((x) => x[f] === null).length / arr.length).toFixed(2)) : null;

  return {
    state: model.accounts.length || model.consumer.name ? "full" : "no-report",
    modelKeys: Object.keys(model).sort(),
    shape: {
      header: shape(model.header),
      consumer: shape(model.consumer),
      score: shape(model.score),
      summary: shape(model.summary),
      account: a.length ? shape(a[0]) : null,
      enquiry: model.enquiries.length ? shape(model.enquiries[0]) : null,
    },
    counts: {
      accounts: a.length,
      enquiries: model.enquiries.length,
      telephones: model.consumer.telephones.length,
      emails: model.consumer.emails.length,
      addresses: model.consumer.addresses.length,
      employment: model.consumer.employment.length,
      scoreFactors: model.score.factors.length,
      dpdCells: a.reduce((s, x) => s + x.dpd.years.reduce((t, y) => t + Object.keys(x.dpd.byYear[y]).length, 0), 0),
      dpdYears: a.reduce((s, x) => s + x.dpd.years.length, 0),
    },
    summary: model.summary.accounts,
    enquirySummary: model.summary.enquiries,
    // Null-density per account field catches silent path regressions.
    nullRatios: {
      accountType: nullRatio(a, "accountType"),
      ownership: nullRatio(a, "ownership"),
      paymentFrequency: nullRatio(a, "paymentFrequency"),
      dateOpened: nullRatio(a, "dateOpened"),
      currentBalance: nullRatio(a, "currentBalance"),
    },
  };
}

const snapshot = {};
for (const f of files) {
  const parts = f.split(/[/\\]+/);
  const ai = parts.indexOf("applications");
  const key = ai >= 0 && parts[ai + 1] ? parts[ai + 1] : parts[parts.length - 1];
  snapshot[key] = fingerprint(f);
}

if (!checkMode) {
  console.log(JSON.stringify(snapshot, null, 2));
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
const diffs = [];
const walk = (a, b, path) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja === jb) return;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${path}.${k}`);
    return;
  }
  diffs.push(`${path}: baseline ${jb} → now ${ja}`);
};
walk(snapshot, baseline, "snapshot");

console.log(`snapshots compared : ${Object.keys(snapshot).length}`);
console.log(`differences        : ${diffs.length}`);
diffs.slice(0, 30).forEach((d) => console.log("  - " + d));
process.exit(diffs.length ? 1 : 0);
