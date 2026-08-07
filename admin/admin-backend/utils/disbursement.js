// utils/disbursement.js
//
// The disbursement rules, in one place.
//
// Every route that can move an application to `disbursed` calls
// `prepareDisbursement` before the stage changes. That is what makes the
// invariant hold: the stage cannot advance unless this returns a valid block,
// so there is no path — single, bulk, or a direct API call — that reaches
// `disbursed` without the details being saved.
//
// No stage is written here and no document is moved; this validates and shapes
// the data, and the caller applies it inside its existing transition.
//
import Application from "../models/Application.js";
import ApprovedApplication from "../models/ApprovedApplication.js";
import { normalizeLoanNumber, loanNumberKey } from "../models/disbursementSchemas.js";
import { escapeRegex } from "./escapeRegex.js";

/** Field-level messages, keyed by field so the UI can show them inline. */
function validate(input = {}) {
  const errors = {};

  // ── Approved amount ──────────────────────────────────────────────────────
  const rawAmount = input.approvedAmount;
  const amount = typeof rawAmount === "string" ? Number(rawAmount.replace(/,/g, "").trim()) : Number(rawAmount);
  if (rawAmount === undefined || rawAmount === null || rawAmount === "") {
    errors.approvedAmount = "Approved Amount is required.";
  } else if (!Number.isFinite(amount)) {
    errors.approvedAmount = "Approved Amount must be a number.";
  } else if (amount <= 0) {
    errors.approvedAmount = "Approved Amount must be greater than 0.";
  }

  // ── Loan number ──────────────────────────────────────────────────────────
  // Trimmed for storage and comparison; the casing the admin typed is kept.
  const loanNumber = normalizeLoanNumber(input.loanNumber);
  if (!loanNumber) {
    errors.loanNumber = "Loan Number is required.";
  } else if (loanNumber.length > 64) {
    errors.loanNumber = "Loan Number must be 64 characters or fewer.";
  }

  // ── Disbursement date ────────────────────────────────────────────────────
  const raw = input.disbursementDate;
  let disbursementDate = null;
  if (!raw) {
    errors.disbursementDate = "Disbursement Date is required.";
  } else {
    disbursementDate = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(disbursementDate.getTime())) {
      errors.disbursementDate = "Disbursement Date is not a valid date.";
    }
  }

  return { errors, amount, loanNumber, disbursementDate };
}

/**
 * Is this loan number already used by a different application?
 *
 * Checked case-insensitively across both collections, since an application
 * moves from `applications` to `approvedApplications` at disbursement. The
 * field is indexed on both (sparse), and the anchored regex lets that index
 * serve the lookup.
 */
async function findDuplicate(loanNumber, excludeId) {
  const rx = new RegExp(`^${escapeRegex(loanNumberKey(loanNumber))}$`, "i");
  const filter = { "disbursement.loanNumber": rx };
  const exclude = (doc) => doc && String(doc._id) !== String(excludeId);

  const [pending, approved] = await Promise.all([
    Application.findOne(filter).select("_id formId").lean(),
    ApprovedApplication.findOne(filter).select("_id formId").lean(),
  ]);

  if (exclude(pending)) return pending;
  if (exclude(approved)) return approved;
  return null;
}

/**
 * Validate a disbursement payload and shape it for storage.
 *
 * @returns {{ ok: true, disbursement: object } | { ok: false, status, message, errors? }}
 */
export async function prepareDisbursement(input, { applicationId, admin } = {}) {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      status: 400,
      message: "Disbursement details are required before an application can be marked Disbursed.",
      code: "disbursement_required",
      errors: {
        approvedAmount: "Approved Amount is required.",
        loanNumber: "Loan Number is required.",
        disbursementDate: "Disbursement Date is required.",
      },
    };
  }

  const { errors, amount, loanNumber, disbursementDate } = validate(input);
  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      status: 400,
      message: "Please correct the disbursement details.",
      code: "disbursement_invalid",
      errors,
    };
  }

  const duplicate = await findDuplicate(loanNumber, applicationId);
  if (duplicate) {
    return {
      ok: false,
      status: 409,
      message: `Loan Number "${loanNumber}" is already used by application ${duplicate.formId || duplicate._id}.`,
      code: "loan_number_duplicate",
      errors: { loanNumber: "This Loan Number is already in use." },
    };
  }

  return {
    ok: true,
    disbursement: {
      approvedAmount: amount,
      loanNumber,
      disbursementDate,
      disbursedBy: admin?._id || admin?.id || null,
      disbursedByName: admin?.name || admin?.email || "admin",
      disbursedAt: new Date(),
    },
  };
}

/** Indian-format currency for the audit line: 450000 → "₹4,50,000". */
export const formatAmount = (n) =>
  typeof n === "number" && Number.isFinite(n)
    ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
    : "—";

/** "05 Aug 2026" — the format the audit entry and the details section use. */
export const formatDate = (d) => {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/** The multi-line remark stored on the audit entry. */
export const describeDisbursement = (d) =>
  [
    `Approved Amount: ${formatAmount(d?.approvedAmount)}`,
    `Loan Number: ${d?.loanNumber || "—"}`,
    `Disbursement Date: ${formatDate(d?.disbursementDate)}`,
  ].join("\n");

export default { prepareDisbursement, describeDisbursement, formatAmount, formatDate };
