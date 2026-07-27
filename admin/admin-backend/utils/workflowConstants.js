/**
 * workflowConstants.js — SINGLE SOURCE OF TRUTH for workflow stages.
 *
 * Every stage definition lives here.  All backend controllers, frontend
 * pages, and the mobile app must import from this file (or its mirror).
 * Never hardcode stage names, labels, colors, or orders anywhere else.
 */

// ─── The Pending CIBIL stage (the pipeline's entry stage) ────────────────────
// New applications land here (status "pending", workflowStage "pending_cibil").
// It is a WORKFLOW STAGE, not a status. Exported for use across services.
export const PENDING_CIBIL_STAGE = "pending_cibil";

// ─── Canonical stage keys (lowercase, stored in DB) ──────────────────────────
export const WORKFLOW_STAGES = [
  "pending_cibil",
  "contact creation",
  "house visit",
  "document collection",
  "credit sanction",
  "agreement",
  "pre-disbursement documentation",
  "disbursed",
];

// ─── Stages that trigger moving the application to the Approved collection ───
export const FINAL_STAGES = ["disbursed"];

// ─── Human-readable display labels (used in UI, notifications, history) ──────
export const STAGE_LABELS = {
  "pending_cibil":                  "Pending CIBIL",
  "contact creation":               "Contact Creation",
  "house visit":                    "House Visit",
  "document collection":            "Document Collection",
  "credit sanction":                "Credit Sanction",
  "agreement":                      "Agreement",
  "pre-disbursement documentation": "Pre-Disbursement Documentation",
  "disbursed":                      "Disbursed",
};

// ─── Badge colours (admin web + used as reference for mobile) ────────────────
export const STAGE_COLORS = {
  "pending_cibil":                  { bg: "#ECFEFF", color: "#0E7490", border: "#A5F3FC" },
  "contact creation":               { bg: "#F5F3FF", color: "#6D28D9", border: "#DDD6FE" },
  "house visit":                    { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  "document collection":            { bg: "#FFF7ED", color: "#C2410C", border: "#FDBA74" },
  "credit sanction":                { bg: "#FEF9C3", color: "#92400E", border: "#FDE68A" },
  "agreement":                      { bg: "#FDF2F8", color: "#86198F", border: "#F0ABFC" },
  "pre-disbursement documentation": { bg: "#FEFCE8", color: "#B45309", border: "#FDE68A" },
  "disbursed":                      { bg: "#D1FAE5", color: "#065F46", border: "#34D399" },
};

// ─── Legacy key aliases (old DB values → canonical key) ──────────────────────
// Used by toStage() so existing records migrate transparently.
export const STAGE_ALIASES = {
  "housevisit":    "house visit",
  "house-visit":   "house visit",
  "pd visit":      "house visit",
  "cibil":         "contact creation",   // cibil was merged into contact creation
  "disbursement":  "disbursed",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalise a raw stage string to its canonical lowercase key. */
export const toStage = (s) => {
  const raw = String(s || "").trim().toLowerCase();
  return STAGE_ALIASES[raw] ?? raw;
};

/** Display label for a stage key. Falls back to title-cased key. */
export const stageLabel = (s) => {
  const key = toStage(s);
  return STAGE_LABELS[key] ?? key.replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Badge colour object for a stage key. */
export const stageColor = (s) => {
  const key = toStage(s);
  return STAGE_COLORS[key] ?? { bg: "#F1F5F9", color: "#475569", border: "#CBD5E1" };
};

/** True if the stage key is a final (disbursed) stage. */
export const isFinalStage = (s) => FINAL_STAGES.includes(toStage(s));

/** True if the given key is a recognised workflow stage. */
export const isValidStage = (s) => WORKFLOW_STAGES.includes(toStage(s));

/** Return the next stage after `current`, or the last stage if already final. */
export const getNextStage = (current) => {
  const idx = WORKFLOW_STAGES.indexOf(toStage(current));
  if (idx === -1) return WORKFLOW_STAGES[0];
  if (idx >= WORKFLOW_STAGES.length - 1) return WORKFLOW_STAGES[WORKFLOW_STAGES.length - 1];
  return WORKFLOW_STAGES[idx + 1];
};

/** Normalise a workflows array or multi-line string into canonical keys. */
export const normalizeWorkflows = (wf) => {
  if (!wf) return [];
  const arr = Array.isArray(wf)
    ? wf.flat()
    : String(wf).replace(/[\[\]"']/g, "").split(/[\n,]+/);
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean).map(toStage))];
};
