// pdf/cirFormat.js
//
// Display formatting for the Consumer CIR PDF, mirroring the web renderer's
// components/cibil/format.js and currency.js so both surfaces show a value the
// same way.
//
// Presentation only. The mapper emits Number|null, "DD/MM/YYYY"|null and
// resolved label strings; nothing here derives or recomputes a value.

export const DASH = "-";
export const NA = "Not Available";

/** Display a nullable value, defaulting to "-". */
export const show = (v, fallback = DASH) =>
  v === null || v === undefined || v === "" ? fallback : String(v);

/** Indian digit grouping for a Number|null. */
export const money = (n, fallback = DASH) => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return fallback;
  const i = String(Math.round(Number(n)));
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3);
  return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
};

/** Currency display: the sheet prints amounts with the rupee sign. */
export const inr = (v) => {
  const s = money(v);
  return s === DASH ? DASH : `₹${s}`;
};

/** Percentages / rates that may legitimately be 0. */
export const rate = (n, suffix = "", fallback = DASH) =>
  n === null || n === undefined ? fallback : `${n}${suffix}`;

export const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Report state, derived from the normalised model only — never from raw JSON.
 *   full    -> a bureau report is present
 *   partial -> the flow ran but no report was returned
 *   error   -> the flow failed
 */
export const reportState = (model, statusMessage = null) => {
  const hasReport =
    !!model &&
    (model.accounts.length > 0 || model.consumer.name !== null || model.score.value !== null);
  if (hasReport) return { kind: "full", message: null };
  return { kind: statusMessage ? "error" : "partial", message: statusMessage };
};

export default { DASH, NA, show, money, inr, rate, MONTHS, reportState };
