// models/cibilSubjectSchemas.js
//
// Phase 1 — multi-subject CIBIL storage.
//
// A bureau report belongs to a PERSON, not to a role. Until now one application
// could hold exactly one report and the role alone identified whose it was;
// `cibil.subjectPan` was added later to record the owner once Applicant and
// Co-Applicant could swap. This sub-document generalises that: a list of CIBIL
// summaries on one application, each carrying the PAN of the person it
// describes, so the same record can eventually hold the applicant's report and
// the co-applicant's side by side.
//
// Storage only. Phase 1 writes this list but nothing reads it yet — every
// consumer still reads `Application.cibil`, which is unchanged and remains the
// applicant's summary. Switching readers over is Phase 2.
//
// Shape is deliberately identical to the existing `cibil` block (same field
// names, same defaults) plus `subjectPan`, so an entry can be produced from a
// `cibil` object — and read back into one — with no translation layer.
//
// Invariant: at most ONE entry per subjectPan. Enforced by the writers
// (upsertCibilSubject below), not by the schema — Mongoose cannot express a
// uniqueness constraint within an array.
//
import mongoose from "mongoose";

/** Normalise a PAN for storage and comparison: trimmed, upper-case. */
export const normalizePan = (v) => String(v ?? "").trim().toUpperCase();

/**
 * PAN of an embedded party, tolerating the legacy nested shape. Identical rule
 * to partyPan() in controllers/applicantSwapController.js and panOf() in
 * utils/loanEligibility.js — the three must never diverge.
 */
export const partySubjectPan = (party) => {
  const p = party?.applicant || party || {};
  return normalizePan(p.panNo || p.pan);
};

/* ── Subject keys when there is no PAN ─────────────────────────────────────
 *
 * PAN is optional for a bureau pull: the vendor's required identity is mobile,
 * forename, surname and date of birth. But `subjectPan` is what makes one
 * report distinguishable from another — it is the second half of the
 * { applicationId, subjectPan } unique index, the match key for cibilSubjects,
 * and how both UIs decide whose score they are showing.
 *
 * A PAN-less subject keyed on "" would collide with the legacy "no PAN means
 * the applicant" convention, and two PAN-less people on one application would
 * share a single slot — one silently overwriting the other, or being handed
 * the other's report. So a PAN-less subject gets a DERIVED key instead.
 *
 * The derived key is:
 *   - stable      — same person, same key, on every path and every re-fetch
 *   - distinct    — prefixed "K:", so it can never equal a PAN (which is
 *                   [A-Z]{5}[0-9]{4}[A-Z]) nor the legacy empty string
 *   - opaque      — a digest, so a mobile number and DOB are not carried in a
 *                   field that is returned to API callers
 *   - synchronous — the admin and mobile UIs must compute the identical key to
 *                   match an entry, and cannot await a crypto primitive to do
 *                   it. This mirrors normalizePan/partyPan, which are already
 *                   duplicated across the three codebases on the same terms:
 *                   they must never diverge.
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
 * FNV-1a, 32-bit, as eight UPPERCASE hex characters. Not a security primitive
 * and not used as one — it exists so the key is opaque and cheap to compute
 * identically in Node and in a browser. Uniqueness only has to hold among the
 * two or three subjects of ONE application: the applicationId is the other half
 * of every key, so digests never compete across applications.
 *
 * Upper case matters. Every comparison of a stored subjectPan in this repo runs
 * through normalizePan, which upper-cases; emitting upper-case hex makes that
 * a no-op on a derived key, so none of those comparisons need to learn about
 * this at all.
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
    String(p.surname ?? p.lastName ?? "").trim() || (split.length > 1 ? split.slice(1).join(" ") : "");
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

/**
 * The key this party's report is stored and matched under: the PAN when there
 * is one — unchanged, so every existing record keeps its key — otherwise a
 * derived key over the identity that the request actually carried.
 *
 * Returns "" when neither is possible; callers must treat that as "cannot
 * identify this subject" and not fetch, because an unidentifiable report
 * cannot be stored or displayed safely.
 */
/**
 * The exact string the derived key is hashed from. Exported so the three
 * copies of this rule — backend, admin UI, mobile app — can be compared field
 * by field rather than only through their digests.
 *
 * All four required identity fields participate: two different people who
 * happen to share a mobile number (a household line) or a date of birth must
 * not collide onto one subject key.
 */
export const subjectKeySource = (party) => {
  const { forename, surname, mobile, dob } = partyIdentity(party);
  return `${mobile}|${normalizeName(forename)}|${normalizeName(surname)}|${dob}`;
};

export const partySubjectKey = (party) => {
  const pan = partySubjectPan(party);
  if (pan) return pan;
  // The same bar as being allowed to fetch at all: a subject that cannot be
  // identified cannot be stored or displayed safely, so it gets no key.
  if (!hasRequiredIdentity(party)) return "";
  return `K:${subjectDigest(subjectKeySource(party))}`;
};

const cibilSubjectSchema = new mongoose.Schema(
  {
    // The person this summary belongs to. Empty only for legacy records whose
    // applicant had no PAN on file; the "empty means the applicant" fallback
    // that the rest of the codebase already applies still covers those.
    subjectPan: { type: String, default: "" },

    // ── Mirror of the `cibil` summary block ────────────────────────────────
    score: { type: Number, default: null },
    status: { type: String, default: "" },   // vendor-reported status
    state: { type: String, default: "" },    // "pending" | "auto_rejected" | "unavailable"
    result: { type: String, default: "" },   // "NTC" | "PASS" | "REJECT"
    reportDate: { type: String, default: "" },
    requestId: { type: String, default: "" },
    fetchedAt: { type: Date, default: null },
  },
  { _id: false }
);

// `default: []` rather than `default: undefined`: unlike disbursement, this list
// is written for every application that reaches CIBIL processing, so an empty
// array is the honest initial state and callers can push without a null check.
export const cibilSubjects = { type: [cibilSubjectSchema], default: [] };

/** The summary fields, copied out of a `cibil`-shaped object. */
export const toCibilSubject = (subjectPan, cibil = {}) => ({
  subjectPan: normalizePan(subjectPan),
  score: typeof cibil.score === "number" ? cibil.score : null,
  status: cibil.status || "",
  state: cibil.state || "",
  result: cibil.result || "",
  reportDate: cibil.reportDate || "",
  requestId: cibil.requestId || "",
  fetchedAt: cibil.fetchedAt || null,
});

/**
 * Insert or replace this subject's entry in the list, in place, preserving the
 * one-entry-per-subjectPan invariant. Returns the array so callers can assign.
 *
 * Matching is by normalised PAN. A record whose applicant has no PAN yields an
 * empty subjectPan, which still occupies exactly one slot — it cannot silently
 * multiply.
 */
export const upsertCibilSubject = (list, subjectPan, cibil) => {
  const entry = toCibilSubject(subjectPan, cibil);
  const next = Array.isArray(list) ? [...list] : [];
  const at = next.findIndex((e) => normalizePan(e?.subjectPan) === entry.subjectPan);
  if (at === -1) next.push(entry);
  else next[at] = entry;
  return next;
};
