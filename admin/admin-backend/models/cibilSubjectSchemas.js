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
