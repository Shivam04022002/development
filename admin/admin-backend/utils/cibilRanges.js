// utils/cibilRanges.js
//
// Single source of truth for the CIBIL score bands. The same helpers are used
// when validating what a Super Admin saves and when the workflow decides what
// to do with a score, so the two can never drift apart.
//
// Bands are ordered pending < reject < pass and must be continuous and
// non-overlapping, which makes every score fall into exactly one band.

export const DEFAULT_RANGES = {
  pendingRange: { min: -1, max: 200 },
  rejectRange: { min: 201, max: 649 },
  passRange: { min: 650, max: 900 },
};

export const RANGE_ORDER = ["pendingRange", "rejectRange", "passRange"];

const LABEL = {
  pendingRange: "Pending",
  rejectRange: "Reject",
  passRange: "Pass",
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Read the bands off a stored settings object, falling back to the defaults
 * for any band an older document does not carry. Never throws.
 */
export function normalizeRanges(cibil = {}) {
  const out = {};
  for (const key of RANGE_ORDER) {
    const stored = cibil?.[key];
    const fallback = DEFAULT_RANGES[key];
    out[key] = {
      min: isNum(stored?.min) ? stored.min : fallback.min,
      max: isNum(stored?.max) ? stored.max : fallback.max,
    };
  }
  return out;
}

/**
 * Validate a set of bands. Returns an array of human-readable problems —
 * empty means the configuration is valid.
 */
export function validateRanges(ranges) {
  const errors = [];

  for (const key of RANGE_ORDER) {
    const r = ranges?.[key];
    if (!r || !isNum(r.min) || !isNum(r.max)) {
      errors.push(`${LABEL[key]} range: minimum and maximum must both be numbers.`);
      continue;
    }
    if (!Number.isInteger(r.min) || !Number.isInteger(r.max)) {
      errors.push(`${LABEL[key]} range: minimum and maximum must be whole numbers.`);
    }
    if (r.min > r.max) {
      errors.push(
        `${LABEL[key]} range: minimum (${r.min}) must be less than or equal to maximum (${r.max}).`
      );
    }
  }
  if (errors.length) return errors;

  // Continuity + no overlap across consecutive bands.
  for (let i = 0; i < RANGE_ORDER.length - 1; i++) {
    const a = ranges[RANGE_ORDER[i]];
    const b = ranges[RANGE_ORDER[i + 1]];
    const aLabel = LABEL[RANGE_ORDER[i]];
    const bLabel = LABEL[RANGE_ORDER[i + 1]];

    if (b.min <= a.max) {
      errors.push(
        `${bLabel} range overlaps ${aLabel} range: ${bLabel} starts at ${b.min} but ${aLabel} ends at ${a.max}.`
      );
    } else if (b.min !== a.max + 1) {
      errors.push(
        `Gap between ${aLabel} and ${bLabel}: ${aLabel} ends at ${a.max}, so ${bLabel} must start at ${a.max + 1} (got ${b.min}).`
      );
    }
  }

  return errors;
}

/**
 * Decide which band a score falls into.
 * Returns { matched: "pending" | "reject" | "pass" | null, configuredRange }.
 * A null/undefined/non-numeric score yields matched: null, which callers treat
 * as the existing Pending CIBIL behaviour.
 */
export function decideByScore(score, ranges) {
  const r = normalizeRanges(ranges);
  const n = Number(score);
  if (score === null || score === undefined || score === "" || !Number.isFinite(n)) {
    return { matched: null, configuredRange: null };
  }
  for (const key of RANGE_ORDER) {
    const band = r[key];
    if (n >= band.min && n <= band.max) {
      return {
        matched: key.replace("Range", ""),
        configuredRange: `${band.min}-${band.max}`,
      };
    }
  }
  // Outside every configured band — treat as pending rather than guessing.
  return { matched: null, configuredRange: null };
}

export default { DEFAULT_RANGES, RANGE_ORDER, normalizeRanges, validateRanges, decideByScore };
