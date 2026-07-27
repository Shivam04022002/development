/**
 * workflowConfig.js — SINGLE SOURCE OF TRUTH for workflow stages (mobile mirror).
 *
 * This file MUST stay in sync with admin-backend/utils/workflowConstants.js.
 * All dealer app screens must import from here — never hardcode stage names.
 */

// ─── Canonical stage keys (lowercase, matches DB values) ─────────────────────
export const WORKFLOW_STAGES = [
  'contact creation',
  'house visit',
  'document collection',
  'credit sanction',
  'agreement',
  'pre-disbursement documentation',
  'disbursed',
];

// ─── Final stages ─────────────────────────────────────────────────────────────
export const FINAL_STAGES = ['disbursed'];

// ─── Human-readable display labels ───────────────────────────────────────────
export const STAGE_LABELS = {
  'contact creation':               'Contact Creation',
  'house visit':                    'House Visit',
  'document collection':            'Document Collection',
  'credit sanction':                'Credit Sanction',
  'agreement':                      'Agreement',
  'pre-disbursement documentation': 'Pre-Disbursement Documentation',
  'disbursed':                      'Disbursed',
};

// ─── Legacy key aliases (old DB values → canonical key) ──────────────────────
export const STAGE_ALIASES = {
  'housevisit':    'house visit',
  'house-visit':   'house visit',
  'pd visit':      'house visit',
  'cibil':         'contact creation',
  'disbursement':  'disbursed',
};

// ─── Badge colours (React Native) ────────────────────────────────────────────
// Each entry: { bg, text, border }
export const STAGE_COLORS = {
  'contact creation':               { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' },
  'house visit':                    { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  'document collection':            { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74' },
  'credit sanction':                { bg: '#FEF9C3', text: '#92400E', border: '#FDE68A' },
  'agreement':                      { bg: '#FDF2F8', text: '#86198F', border: '#F0ABFC' },
  'pre-disbursement documentation': { bg: '#FEFCE8', text: '#B45309', border: '#FDE68A' },
  'disbursed':                      { bg: '#D1FAE5', text: '#065F46', border: '#34D399' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalise a raw stage string to its canonical lowercase key. */
export const toStage = (s) => {
  const raw = String(s || '').trim().toLowerCase();
  return STAGE_ALIASES[raw] ?? raw;
};

/** Display label for a stage. */
export const stageLabel = (s) => {
  const key = toStage(s);
  return STAGE_LABELS[key] ?? key.replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Badge colour object for a stage. */
export const stageColor = (s) => {
  const key = toStage(s);
  return STAGE_COLORS[key] ?? { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' };
};

/** True if the stage is final/disbursed. */
export const isFinalStage = (s) => FINAL_STAGES.includes(toStage(s));

/** Index of a stage in the workflow (0-based). Returns -1 if unknown. */
export const stageIndex = (s) => WORKFLOW_STAGES.indexOf(toStage(s));
