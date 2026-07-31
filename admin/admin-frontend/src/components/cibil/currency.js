import { money, DASH } from "./format";

/**
 * Currency display for the report: the bureau prints amounts with the rupee
 * sign. Grouping and the null fallback stay in format.js — this only prefixes
 * the symbol, and never to a missing value.
 */
export const inr = (v) => {
  const s = money(v);
  return s === DASH ? DASH : `₹${s}`;
};

export default { inr };
