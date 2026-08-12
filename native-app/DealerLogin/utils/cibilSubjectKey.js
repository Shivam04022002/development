/**
 * cibilSubjectKey.js — how the app decides WHICH person a stored CIBIL report
 * belongs to.
 *
 * A bureau report is stored per person, tagged with a subject key. That key is
 * the person's normalised PAN when they have one. PAN is optional for a pull —
 * the bureau's required identity is mobile, first name, last name and date of
 * birth — so a person without a PAN is keyed by a deterministic digest of that
 * identity instead, prefixed `K:` so it can never be mistaken for a PAN.
 *
 * This file is a deliberate mirror of:
 *   admin/admin-backend/models/cibilSubjectSchemas.js   (writes the key)
 *   admin/admin-frontend/src/utils/cibilSubjects.js     (reads it)
 *
 * The three must never diverge. If they do, this app looks up a report under a
 * key the backend never wrote, and a real report silently reads as "not
 * available" — or, worse, the wrong person's score is matched. The backend
 * suite scripts/verifyOptionalPanCibil.mjs asserts all three agree.
 *
 * Kept dependency-free so the rules can be checked without a bundler or a
 * device.
 */

/** Canonical PAN: trimmed, upper-case. */
export const normalizePan = (v) => String(v ?? '').trim().toUpperCase();

/** Last ten digits, so +91 / 0 / spacing variants of one number agree. */
export const normalizeMobile = (v) => {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/** Leading YYYY-MM-DD, taken verbatim so no timezone shift can occur. */
export const normalizeDob = (v) => {
  const m = String(v ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
};

/** Canonical name for keying: trimmed, inner runs of whitespace collapsed, upper-cased. */
export const normalizeName = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/** A party may use the legacy nested shape, with the real person one level down. */
export const resolveParty = (party) => party?.applicant || party || {};

/** PAN of an embedded party, tolerating both field names the records use. */
export const partyPan = (party) => {
  const p = resolveParty(party);
  return normalizePan(p.panNo || p.pan);
};

/**
 * FNV-1a, 32-bit, eight UPPERCASE hex characters. Not a security primitive.
 * Upper case so normalizePan is a no-op on a derived key.
 */
export const subjectDigest = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').toUpperCase();
};

/** The identity the bureau requires. PAN is deliberately absent from this list. */
export const partyIdentity = (party) => {
  const p = resolveParty(party);
  const name = String(p.name ?? '').trim();
  const split = name.split(/\s+/).filter(Boolean);
  const forename = String(p.firstName ?? '').trim() || split[0] || '';
  const surname =
    String(p.surname ?? p.lastName ?? '').trim() ||
    (split.length > 1 ? split.slice(1).join(' ') : '');
  return {
    forename,
    surname,
    mobile: normalizeMobile(p.mobileNumber || p.mobile),
    dob: normalizeDob(p.dateOfBirth || p.dob),
  };
};

/** Can this party be identified at all? PAN is not part of the answer. */
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
  if (!hasRequiredIdentity(party)) return '';
  return `K:${subjectDigest(subjectKeySource(party))}`;
};
