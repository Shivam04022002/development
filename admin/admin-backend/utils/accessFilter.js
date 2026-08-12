/**
 * accessFilter.js — Shared permission filter for all application queries.
 *
 * Permission model:
 *   - SuperAdmin     → sees ALL records in every collection, no filter.
 *   - Regular Admin  → Pending filtered by their assigned workflowStages.
 *                      Approved and Rejected are NOT filtered — all admins
 *                      see all finalized records regardless of who handled them.
 */

import { normalizeWorkflows, STAGE_ALIASES } from "./workflowConstants.js";

/**
 * Returns true when the caller is a super-admin (sees all records).
 */
export const isSuperAdmin = (admin) =>
  admin?.role === "superadmin" || admin?.role === "sadmin";

/**
 * Escape a string for use inside a RegExp literal.
 */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * For a canonical stage key, build a regex that matches it AND all its known
 * aliases, case-insensitively.  This catches every DB variant written before
 * workflowStage normalization was enforced.
 *
 * e.g. "house visit" → /^(house visit|housevisit|house-visit|pd visit)$/i
 */
const stageRegex = (canonical) => {
  const terms = new Set([canonical]);
  for (const [alias, target] of Object.entries(STAGE_ALIASES)) {
    if (target === canonical) terms.add(alias);
  }
  const pattern = [...terms].map(escapeRegex).join("|");
  return new RegExp(`^(${pattern})$`, "i");
};

/**
 * Returns the MongoDB query fragment that limits PENDING queries to the
 * workflowStages the admin is authorised to handle.
 *
 * SuperAdmin              → {} (no restriction)
 * Admin with stages       → { $or: [ workflowStage missing | matches any assigned stage (case-insensitive + aliases) ] }
 * Admin with no workflows → {} (no restriction — sees all pending)
 */
export const getPendingAccessFilter = (admin) => {
  if (isSuperAdmin(admin)) return {};

  const stages = normalizeWorkflows(admin?.workflows || []);
  if (!stages.length) return {};

  // Build one regex clause per assigned stage (handles casing + legacy aliases)
  const stageClauses = stages.map((s) => ({ workflowStage: { $regex: stageRegex(s) } }));

  return {
    $or: [
      { workflowStage: { $exists: false } },
      ...stageClauses,
    ],
  };
};

/**
 * Returns the filter for Approved / Rejected collections.
 * Per business rules, ALL admins see ALL finalized records — no restriction.
 * Only the baseFilter (search, branch, etc.) is applied.
 */
export const buildFinalizedFilter = async (_admin, baseFilter = {}) => {
  return baseFilter;
};

/**
 * Returns { pending, approved, rejected, total } counts for the given admin.
 * - pending  : filtered by admin's workflowStages
 * - approved : unfiltered (all admins see all)
 * - rejected : unfiltered (all admins see all)
 */
/**
 * Optional { from, to } → a createdAt clause, or null.
 *
 * The Super Admin stat tiles used to be produced by downloading every record
 * and filtering by date in the browser. Counting them here instead is what lets
 * that download go away. The bounds match what the client applied: the whole of
 * the `from` day through the whole of the `to` day.
 */
const statDateClause = (range) => {
  if (!range) return null;
  const out = {};
  if (range.from) {
    const d = new Date(range.from);
    if (!Number.isNaN(d.getTime())) { d.setHours(0, 0, 0, 0); out.$gte = d; }
  }
  if (range.to) {
    const d = new Date(range.to);
    if (!Number.isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); out.$lte = d; }
  }
  return Object.keys(out).length ? { createdAt: out } : null;
};

/**
 * `dateRange` is optional and defaults to null, so the existing caller
 * (/workflow/stats) keeps returning exactly the counts it always has.
 */
export const getStatCounts = async (
  admin,
  Application,
  ApprovedApplication,
  RejectedApplication,
  dateRange = null
) => {
  const dateFilter = statDateClause(dateRange);
  const withDate = (f) => (dateFilter ? { $and: [f, dateFilter] } : f);
  const basePending = {
    $or: [
      { status: { $in: ["pending", null] } },
      { workflowStage: { $exists: false } },
      { workflowStage: { $nin: ["disbursed", "rejected", "approved"] } },
    ],
  };

  // Exclude Pending CIBIL and rejected records from the normal pending count —
  // they belong to Pending CIBIL / Rejected respectively. Gated by WORKFLOW
  // STAGE (Pending CIBIL apps carry status "pending").
  const excludeCibilStates = { workflowStage: { $nin: ["pending_cibil", "rejected"] } };

  const pendingAccessFilter = getPendingAccessFilter(admin);
  const pendingFilter =
    Object.keys(pendingAccessFilter).length === 0
      ? { $and: [basePending, excludeCibilStates] }
      : { $and: [basePending, excludeCibilStates, pendingAccessFilter] };

  const [pending, approved, rejected, pendingCibil] = await Promise.all([
    Application.countDocuments(withDate(pendingFilter)),
    ApprovedApplication.countDocuments(dateFilter || {}),
    RejectedApplication.countDocuments(dateFilter || {}),
    Application.countDocuments(withDate({ workflowStage: "pending_cibil" })),
  ]);

  return {
    pending,
    approved,
    rejected,
    pendingCibil,
    total: pending + approved + rejected,
  };
};
