// utils/loanEligibility.js
//
// Loan Eligibility & Decision Panel — advisory model.
//
// ADVISORY ONLY. Nothing here approves, rejects, swaps or changes a workflow
// stage; it reads the application and reports what company policy says.
//
// The policy is NOT redefined here. Score bands come from System Settings and
// are interpreted with the same `normalizeRanges` / `decideByScore` helpers the
// CIBIL workflow itself uses, so the panel and the auto-reject rule can never
// disagree.
//
// Why this is computed server-side: GET /api/settings/cibil is Super Admin
// only, but Application Details is used by loan officers. Sending the bands to
// the browser would mean either widening that endpoint or hardcoding a
// threshold in the SPA — the second would duplicate a business rule. Deciding
// on the server avoids both.
//
import SystemSettings from "../models/SystemSettings.js";
import { normalizeRanges, decideByScore } from "./cibilRanges.js";

const SETTINGS_KEY = "system";

/**
 * The score bands, defaulted for older/absent settings documents.
 * Reads only the policy fields — never the encrypted API key.
 */
export async function loadCibilPolicy() {
  let cibil = {};
  try {
    const doc = await SystemSettings.findOne({ key: SETTINGS_KEY }).select("cibil").lean();
    cibil = doc?.cibil || {};
  } catch (err) {
    // Settings unavailable → fall back to the documented defaults rather than
    // failing the whole application read.
    console.error("[loanEligibility] Could not load CIBIL policy:", err?.message || err);
  }
  return {
    ...normalizeRanges(cibil),
    minimumScore: typeof cibil.minimumScore === "number" ? cibil.minimumScore : 650,
  };
}

/* ─────────────────────────── party helpers ──────────────────────────────── */

const partyOf = (party) => party?.applicant || party || {};

const nameOf = (party) => {
  const p = partyOf(party);
  return p.name || `${p.firstName || ""} ${p.surname || ""}`.trim() || "";
};

const panOf = (party) => String(partyOf(party).panNo || partyOf(party).pan || "").trim().toUpperCase();

const hasParty = (party) => Boolean(party && typeof party === "object" && Object.keys(party).length);

/**
 * The score belonging to THIS person.
 *
 * A bureau pull is made against one person's PAN; `cibil.subjectPan` records
 * whose report is stored. Records predating the role-swap feature carry no
 * subject, which meant "the applicant" at the time. A person who does not own
 * the stored report has no score — the panel must not borrow someone else's.
 */
function scoreForParty(app, party, isApplicant) {
  const score = typeof app?.cibil?.score === "number" ? app.cibil.score : null;
  if (score === null) return null;

  const subject = String(app?.cibil?.subjectPan || "").trim().toUpperCase();
  if (!subject) return isApplicant ? score : null;

  const pan = panOf(party);
  return pan && pan === subject ? score : null;
}

/** Assess one person against the bands. */
function assess(party, score, policy) {
  const name = nameOf(party);
  if (!hasParty(party)) {
    return { present: false, name: "", score: null, band: null, eligible: false, status: "Not provided" };
  }
  if (score === null) {
    return {
      present: true, name, score: null, band: null, eligible: false,
      status: "No CIBIL Report Available",
    };
  }

  const { matched } = decideByScore(score, policy);
  const eligible = matched === "pass";
  const status =
    matched === "pass" ? "Eligible"
      : matched === "reject" ? "Below Company Policy"
        : matched === "pending" ? "NTC — insufficient credit history"
          : "Outside configured score bands";

  return { present: true, name, score, band: matched, eligible, status };
}

/**
 * buildEligibility(app, policy)
 *
 * Returns the advisory model for the panel. Pure — no writes, no side effects.
 */
export function buildEligibility(app, policy) {
  const applicantParty = app?.applicant;
  const coApplicantParty = app?.coApplicant;

  const applicant = assess(applicantParty, scoreForParty(app, applicantParty, true), policy);
  const coApplicant = assess(coApplicantParty, scoreForParty(app, coApplicantParty, false), policy);

  // ── Best borrower: the higher KNOWN score. ──────────────────────────────
  const candidates = [applicant, coApplicant].filter((p) => p.present && p.score !== null);
  const best = candidates.length
    ? candidates.reduce((a, b) => (b.score > a.score ? b : a))
    : null;
  const bestIsCoApplicant = Boolean(best && best === coApplicant);

  // ── Recommendation ──────────────────────────────────────────────────────
  let action = "none";
  let recommendation;

  if (applicant.eligible) {
    recommendation = "Current Applicant satisfies policy. No swap required.";
  } else if (coApplicant.eligible) {
    action = "swap";
    recommendation = "Promote Co-Applicant to Primary Applicant";
  } else if (applicant.score === null && coApplicant.score === null) {
    action = "review";
    recommendation =
      "No CIBIL report is available for either party. Eligibility cannot be assessed.";
  } else if (applicant.score === null || coApplicant.score === null) {
    action = "review";
    const missing = applicant.score === null ? "the Applicant" : "the Co-Applicant";
    recommendation = `No CIBIL report is available for ${missing}. Eligibility cannot be fully assessed.`;
  } else {
    action = "review";
    recommendation =
      "Neither applicant satisfies company policy. Application requires manual review.";
  }

  // ── Warnings ────────────────────────────────────────────────────────────
  const warnings = [];
  if (applicant.present && applicant.score !== null && !applicant.eligible) {
    warnings.push({
      level: "warning",
      icon: "⚠",
      text: "Current Applicant does not satisfy company policy.",
    });
  }
  if (
    applicant.score !== null &&
    coApplicant.score !== null &&
    coApplicant.score > applicant.score
  ) {
    warnings.push({
      level: "info",
      icon: "💡",
      text: "Better CIBIL detected for Co-Applicant.",
    });
  }

  const actionLabel =
    action === "swap" ? "Swap Applicant"
      : action === "review" ? "Manual review"
        : "No action required";

  return {
    // Bands are advisory context for the panel; no credentials are included.
    policy: {
      passRange: policy.passRange,
      rejectRange: policy.rejectRange,
      pendingRange: policy.pendingRange,
      minimumScore: policy.minimumScore,
    },
    applicant,
    coApplicant,
    summary: {
      applicantScore: applicant.score,
      coApplicantScore: coApplicant.score,
      bestBorrower: best ? best.name : null,
      bestIsCoApplicant,
      eligible: Boolean(best && best.eligible),
      recommendedAction: actionLabel,
    },
    recommendation,
    action, // "none" | "swap" | "review" — advisory; the UI never acts on it alone
    warnings,
  };
}

export default { loadCibilPolicy, buildEligibility };
