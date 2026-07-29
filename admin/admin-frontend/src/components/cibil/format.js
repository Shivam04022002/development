// Renderer-side formatting. The mapper emits Number|null, "DD/MM/YYYY"|null and
// resolved label strings; every display decision lives here.

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

/** Percentages / rates that may legitimately be 0. */
export const rate = (n, suffix = "", fallback = DASH) =>
  n === null || n === undefined ? fallback : `${n}${suffix}`;

export const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/** Colour band for a DPD cell. */
export const dpdClass = (code) => {
  if (!code || code === DASH) return "dpd-none";
  if (code === "000") return "dpd-ok";
  if (/^\d+$/.test(code)) return Number(code) >= 90 ? "dpd-bad" : "dpd-warn";
  if (code === "STD") return "dpd-ok";
  if (code === "XXX") return "dpd-none";
  return "dpd-bad"; // SMA / SUB / DBT / LSS
};

/** Score band, matching the admin CIBIL colour ranges already used elsewhere. */
export const scoreBand = (v) => {
  if (v === null || v === undefined) return { label: "NO SCORE", color: "#94a3b8" };
  if (v >= 750) return { label: "EXCELLENT", color: "#16a34a" };
  if (v >= 650) return { label: "GOOD", color: "#f59e0b" };
  return { label: "LOW", color: "#ef4444" };
};

/**
 * Report state, derived from the normalised model only — never from raw JSON.
 *   full    → a bureau report is present
 *   partial → the flow ran but no report was returned
 *   error   → the flow failed
 */
export const reportState = (model, statusMessage = null) => {
  const hasReport =
    !!model && (model.accounts.length > 0 || model.consumer.name !== null || model.score.value !== null);
  if (hasReport) return { kind: "full", message: null };
  return { kind: statusMessage ? "error" : "partial", message: statusMessage };
};
