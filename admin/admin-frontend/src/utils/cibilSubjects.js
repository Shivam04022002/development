/**
 * cibilSubjects.js — subject-aware CIBIL helpers for the admin UI.
 *
 * An application can now hold one bureau report per person, keyed by
 * `subjectPan`. These helpers decide, for a given party, which summary the UI
 * may show and which URL it may read — and, just as importantly, when it must
 * show nothing.
 *
 * The matching rule mirrors the backend exactly (partySubjectPan /
 * summaryForSubject / loadRawResponse): normalise the PAN, then match on it.
 * Never on name, role, ordering, score, date or array position.
 *
 * Kept as plain functions with no React or axios dependency so the decisions
 * can be verified without a browser, a DOM or a test framework — this package
 * has none. See scripts/verifyCibilSubjectUi.mjs.
 */

/** Canonical PAN form: trimmed, upper-case. Same as the backend's normalizePan. */
export const normalizePan = (v) => String(v ?? "").trim().toUpperCase();

/**
 * PAN of an embedded party, tolerating the legacy nested shape
 * (application.applicant.applicant) and both field names. Mirrors
 * partySubjectPan on the server.
 */
export const partyPan = (party) => {
  const p = party?.applicant || party || {};
  return normalizePan(p.panNo || p.pan);
};

/* ── Subject keys when there is no PAN ─────────────────────────────────────
 * PAN is optional for a bureau pull, so a subject may be stored under a
 * DERIVED key instead. These four helpers mirror cibilSubjectSchemas.js on the
 * backend character for character; like normalizePan and partyPan above, they
 * are duplicated deliberately and must never diverge — a mismatch here would
 * silently fail to find a report that exists, or find the wrong one.
 */

/** Last ten digits, so +91 / 0 / spacing variants of one number agree. */
export const normalizeMobile = (v) => {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/** Leading YYYY-MM-DD, taken verbatim so no timezone shift can occur. */
export const normalizeDob = (v) => {
  const m = String(v ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
};

/** Canonical name for keying: trimmed, inner runs of whitespace collapsed, upper-cased. */
export const normalizeName = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/**
 * FNV-1a, 32-bit, eight UPPERCASE hex characters. Not a security primitive.
 * Upper case so that normalizePan — which every comparison below runs through —
 * is a no-op on a derived key.
 */
export const subjectDigest = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").toUpperCase();
};

/** The identity the vendor requires. PAN is deliberately absent from this list. */
export const partyIdentity = (party) => {
  const p = party?.applicant || party || {};
  const name = String(p.name ?? "").trim();
  const split = name.split(/\s+/).filter(Boolean);
  const forename = String(p.firstName ?? "").trim() || split[0] || "";
  const surname =
    String(p.surname ?? p.lastName ?? "").trim() ||
    (split.length > 1 ? split.slice(1).join(" ") : "");
  return {
    forename,
    surname,
    mobile: normalizeMobile(p.mobileNumber || p.mobile),
    dob: normalizeDob(p.dateOfBirth || p.dob),
  };
};

/** Can this party be sent to the bureau at all? PAN is not part of the answer. */
export const hasRequiredIdentity = (party) => {
  const { forename, surname, mobile, dob } = partyIdentity(party);
  return Boolean(forename && surname && mobile.length === 10 && dob);
};

/** The exact string the derived key is hashed from. All four fields participate. */
export const subjectKeySource = (party) => {
  const { forename, surname, mobile, dob } = partyIdentity(party);
  return `${mobile}|${normalizeName(forename)}|${normalizeName(surname)}|${dob}`;
};

/** The key this party's report is stored under: PAN when present, else derived. */
export const partySubjectKey = (party) => {
  const pan = partyPan(party);
  if (pan) return pan;
  if (!hasRequiredIdentity(party)) return "";
  return `K:${subjectDigest(subjectKeySource(party))}`;
};

/** A party actually exists on the record. */
export const hasParty = (party) =>
  Boolean(party && typeof party === "object" && Object.keys(party).length > 0);

/**
 * A summary describes a real report. Same test the backend and the existing
 * admin code already use: a numeric score, or a requestId.
 */
export const hasReport = (summary) =>
  Boolean(
    summary &&
      (typeof summary.score === "number" || String(summary.requestId || "").trim())
  );

/**
 * The CIBIL summary this party may be shown.
 *
 * Resolution order — the third rule is what preserves existing behaviour, and
 * the absence of a fourth is what prevents a leak:
 *
 *   1. the matching `cibilSubjects` entry
 *   2. `app.cibil`, only when its own subjectPan IS this party
 *   3. `app.cibil` with NO subjectPan, for the APPLICANT only — the pre-swap
 *      rule, where an unattributed summary meant "the applicant"
 *   4. otherwise {} — never another person's summary
 *
 * Returns { summary, subjectPan, available, source } so callers can both render
 * and build a subject-scoped URL from one call.
 */
export function subjectSummary(app, party, isApplicant) {
  // The subject key, not merely the PAN: a party with no PAN may still own a
  // report, stored under the derived key. normalizePan is a no-op on one.
  const pan = partySubjectKey(party);
  const list = Array.isArray(app?.cibilSubjects) ? app.cibilSubjects : [];
  const legacy = app?.cibil || {};
  const legacyPan = normalizePan(legacy.subjectPan);

  const done = (summary, source) => ({
    summary,
    subjectPan: pan,
    available: hasReport(summary),
    source,
  });

  if (pan) {
    const entry = list.find((e) => normalizePan(e?.subjectPan) === pan);
    if (entry) return done(entry, "cibilSubjects");
    if (legacyPan && legacyPan === pan) return done(legacy, "cibil");
  }

  // Unattributed legacy summary: the applicant's, by the rule that predates
  // subjectPan. A co-applicant can never claim it.
  if (!legacyPan && isApplicant && hasReport(legacy)) return done(legacy, "cibil-legacy");

  return done({}, "none");
}

/**
 * URL for a subject-scoped report read.
 *
 * With a subject the parameter is always sent, so the backend resolves the
 * exact { applicationId, subjectPan } row. Without one (a legacy applicant
 * whose PAN cannot be resolved) the call stays subject-blind, which is the
 * behaviour that shipped before and which the backend still honours.
 *
 * An empty subjectPan is never sent — it would be a different query, not a
 * wildcard.
 */
export const cibilReportPath = (applicationId, path, subjectPan) => {
  const pan = normalizePan(subjectPan);
  const base = `/cibil/${applicationId}${path}`;
  return pan ? `${base}?subjectPan=${encodeURIComponent(pan)}` : base;
};

/**
 * Whether the co-applicant Fetch CIBIL action may be offered.
 *
 * UX only — the backend's requireSuperAdmin remains the authority. The point
 * here is not to offer a billable action that would 403, cost money for
 * nothing, or duplicate a report that already exists.
 */
export function canFetchCoApplicantCibil({ isSuperAdmin, coApplicant, coApplicantSummary, busy }) {
  if (!isSuperAdmin) return { show: false, reason: "not_superadmin" };
  if (!hasParty(coApplicant)) return { show: false, reason: "no_co_applicant" };
  // PAN is optional. What the bureau requires is mobile, first name, last name
  // and date of birth — offering the action without those would spend a
  // billable call on a request the vendor cannot match.
  if (!hasRequiredIdentity(coApplicant)) return { show: false, reason: "missing_identity" };
  if (hasReport(coApplicantSummary)) return { show: false, reason: "already_fetched" };
  return { show: true, disabled: Boolean(busy), reason: "eligible" };
}

/**
 * Backend outcome → message. Every documented status is named explicitly;
 * these are operationally distinct and must not collapse into one alert.
 */
export const FETCH_MESSAGES = {
  fetched: "Co-Applicant CIBIL report fetched successfully.",
  already_exists: "Co-Applicant CIBIL report already exists.",
  in_progress: "Co-Applicant CIBIL fetch is already in progress.",
  // PAN is optional; these are the fields the bureau actually needs.
  missing_identity:
    "Co-Applicant CIBIL needs a mobile number, first name, last name and date of birth. PAN is optional.",
  no_co_applicant: "No co-applicant is available for this application.",
  consent_required: "Co-Applicant consent is required before fetching CIBIL.",
  not_found: "Application or co-applicant was not found.",
  not_configured: "CIBIL service is not configured.",
  vendor_failed: "Co-Applicant CIBIL request failed. No retry should happen automatically.",
  // A deterministic outcome: the bureau holds no record matching the identity
  // supplied. Repeating the same paid request will fail identically, so the
  // message says what would have to change first rather than inviting a retry.
  not_retryable:
    "No CIBIL credit record was found for this co-applicant. Do not retry unless the " +
    "identity/PAN details have been corrected or the bureau specifically advises another attempt.",
};

/** Which outcomes mean the stored data changed and the view should reload. */
export const SUCCESS_STATUSES = ["fetched", "already_exists"];

/**
 * Map a response (or an axios error's response) onto { status, message, ok }.
 * Falls through to null when the shape is unrecognised, so the caller can use
 * the page's existing generic error handling rather than inventing a message.
 */
export function fetchOutcome(payload) {
  const status = payload?.status;
  if (status && FETCH_MESSAGES[status]) {
    return {
      status,
      message: FETCH_MESSAGES[status],
      ok: SUCCESS_STATUSES.includes(status),
      refresh: SUCCESS_STATUSES.includes(status),
    };
  }
  return null;
}
