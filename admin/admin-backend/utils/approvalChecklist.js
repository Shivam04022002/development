// utils/approvalChecklist.js
//
// Loan Approval Readiness Checklist — derived state, not new policy.
//
// Every item is READ from data that already exists. No new business rule is
// defined here:
//
//   • policy verdict      → the eligibility engine (which reuses decideByScore)
//   • dealer requirement  → the one rule approveApplicationCore enforces
//   • stage order         → utils/workflowConstants.js
//   • document / KYC set  → the dealer app's own submission requirements
//   • credit note state   → the CreditNote record itself
//
// BLOCKING is deliberately limited to the requirement approval ALREADY enforces
// (a dealer reference). Everything else is advisory, so no application that can
// be approved today becomes unapprovable. See `blocking: true` below.
//
import { WORKFLOW_STAGES, toStage } from "./workflowConstants.js";

export const STATUS = { DONE: "Completed", PENDING: "Pending", NA: "Not Applicable" };

const partyOf = (p) => p?.applicant || p || {};
const nameOf = (p) => {
  const x = partyOf(p);
  return x.name || `${x.firstName || ""} ${x.surname || ""}`.trim() || "";
};
const present = (v) => v !== undefined && v !== null && String(v).trim() !== "";

const fmtDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * The applicant document set the DEALER APP already requires at submission
 * (ApplicationFormScreen: photo, aadharFront, aadharBack, panImage). Mirrored
 * here as the read list — this is the project's existing definition of a
 * complete document set, not a new one.
 */
const REQUIRED_DOCS = [
  ["photo", "Photograph"],
  ["aadharFront", "Aadhaar Front"],
  ["aadharBack", "Aadhaar Back"],
  ["panImage", "PAN Card"],
];

/** KYC identifiers the dealer app requires alongside those images. */
const KYC_FIELDS = [
  ["aadharNo", "Aadhaar Number"],
  ["panNo", "PAN Number"],
];

const item = (key, label, status, { reason = null, blocking = false, details = {} } = {}) => ({
  key,
  label,
  status,
  blocking,
  reason,
  details,
});

/**
 * buildApprovalChecklist(app, eligibility)
 *
 * Pure. Reads the application (already in memory) plus the Credit Note summary
 * the caller supplies. Performs no writes and makes no decisions of its own.
 */
export function buildApprovalChecklist(app, eligibility, creditNote) {
  const items = [];

  const applicantParty = app?.applicant;
  const applicantData = partyOf(applicantParty);
  const applicantName = nameOf(applicantParty);

  // 1 ── Applicant selected (creation guard: `!applicant` → incomplete_payload)
  items.push(
    item("applicant", "Applicant Selected", applicantName ? STATUS.DONE : STATUS.PENDING, {
      reason: applicantName ? null : "No applicant on this application.",
      details: { Name: applicantName || "—" },
    })
  );

  // 2 ── Applicant CIBIL available (attributed by cibil.subjectPan)
  const el = eligibility || null;
  const score = el?.applicant?.score ?? null;
  items.push(
    item("cibil", "Applicant CIBIL Available", score === null ? STATUS.PENDING : STATUS.DONE, {
      reason: score === null ? "No CIBIL report is available for the current applicant." : null,
      details: score === null ? {} : { Score: String(score), Band: el?.applicant?.band || "—" },
    })
  );

  // 3 ── Meets company policy (verdict from the eligibility engine)
  const policyKnown = score !== null;
  items.push(
    item(
      "policy",
      "Applicant Meets Company Policy",
      !policyKnown ? STATUS.PENDING : el?.applicant?.eligible ? STATUS.DONE : STATUS.PENDING,
      {
        reason: !policyKnown
          ? "Cannot be assessed without a CIBIL report."
          : el?.applicant?.eligible
            ? null
            : el?.applicant?.status || "Below company policy.",
        details: !policyKnown
          ? {}
          : {
              Score: String(score),
              Policy: el?.applicant?.status || "—",
              ...(el?.policy?.passRange
                ? { "Pass band": `${el.policy.passRange.min}–${el.policy.passRange.max}` }
                : {}),
            },
      }
    )
  );

  // 4 ── Required documents. Presence AND verification state, the latter read
  //      straight from documentVerification — never recomputed here.
  const docs = app?.documents?.applicant || {};
  const verif = app?.documentVerification?.applicant || {};
  const uploaded = (f) => present(docs[f]) || present(applicantData[f]);
  const docStatus = (f) => verif?.[f]?.status || "Pending";

  const missingDocs = REQUIRED_DOCS.filter(([f]) => !uploaded(f));
  const rejectedDocs = REQUIRED_DOCS.filter(([f]) => uploaded(f) && docStatus(f) === "Rejected");
  const reuploadDocs = REQUIRED_DOCS.filter(
    ([f]) => uploaded(f) && docStatus(f) === "Re-upload Requested"
  );
  const unverified = REQUIRED_DOCS.filter(([f]) => uploaded(f) && docStatus(f) === "Pending");

  const docReason = missingDocs.length
    ? `Missing: ${missingDocs.map(([, l]) => l).join(", ")}.`
    : rejectedDocs.length
      ? `Rejected: ${rejectedDocs.map(([, l]) => l).join(", ")}.`
      : reuploadDocs.length
        ? `Re-upload requested: ${reuploadDocs.map(([, l]) => l).join(", ")}.`
        : unverified.length
          ? `Awaiting verification: ${unverified.map(([, l]) => l).join(", ")}.`
          : null;

  items.push(
    item("documents", "Required Documents Verified", docReason ? STATUS.PENDING : STATUS.DONE, {
      reason: docReason,
      details: Object.fromEntries(
        REQUIRED_DOCS.map(([f, l]) => [l, uploaded(f) ? docStatus(f) : "Not uploaded"])
      ),
    })
  );

  // 5 ── KYC identifiers
  const missingKyc = KYC_FIELDS.filter(([f]) => !present(applicantData[f]));
  items.push(
    item("kyc", "KYC Complete", missingKyc.length ? STATUS.PENDING : STATUS.DONE, {
      reason: missingKyc.length ? `Missing: ${missingKyc.map(([, l]) => l).join(", ")}.` : null,
      details: Object.fromEntries(
        KYC_FIELDS.map(([f, l]) => [l, present(applicantData[f]) ? String(applicantData[f]) : "Missing"])
      ),
    })
  );

  // 6 ── Vehicle details (creation guard is `!vehicleDetails`; no field-level
  //      definition exists in the codebase, so presence is all that is asserted)
  const vehicle = app?.vehicleDetails || {};
  const hasVehicle = Object.keys(vehicle).length > 0;
  items.push(
    item("vehicle", "Vehicle Details Complete", hasVehicle ? STATUS.DONE : STATUS.PENDING, {
      reason: hasVehicle ? null : "No vehicle details captured.",
      details: hasVehicle
        ? {
            Vehicle: [vehicle.brandName, vehicle.modelName].filter(Boolean).join(" ") || "—",
            Price: present(vehicle.priceOfVehicle) ? String(vehicle.priceOfVehicle) : "—",
          }
        : {},
    })
  );

  // 7 ── Finance details (same: presence only — no completeness rule exists)
  const financeFields = [
    ["financeRequired", "Finance Required"],
    ["tenure", "Tenure"],
  ];
  const missingFinance = financeFields.filter(([f]) => !present(vehicle[f]));
  items.push(
    item("finance", "Finance Details Complete", missingFinance.length ? STATUS.PENDING : STATUS.DONE, {
      reason: missingFinance.length ? `Missing: ${missingFinance.map(([, l]) => l).join(", ")}.` : null,
      details: Object.fromEntries(
        financeFields.map(([f, l]) => [l, present(vehicle[f]) ? String(vehicle[f]) : "Missing"])
      ),
    })
  );

  // 8 ── Dealer assigned. THE ONE RULE APPROVAL ALREADY ENFORCES
  //      (approveApplicationCore → 422 "Dealer reference missing"), so this is
  //      the only item allowed to block the Approve button.
  const hasDealer = Boolean(app?.dealer);
  items.push(
    item("dealer", "Dealer Assigned", hasDealer ? STATUS.DONE : STATUS.PENDING, {
      blocking: true,
      reason: hasDealer ? null : "Approval is rejected without a dealer reference.",
      details: { Dealer: app?.dealerDetails?.name || "—", Branch: app?.dealerDetails?.branch || "—" },
    })
  );

  // 9 ── Credit Note
  if (creditNote) {
    const outdated = Boolean(creditNote.pdfOutdated);
    items.push(
      item("creditNote", "Credit Note Generated", outdated ? STATUS.PENDING : STATUS.DONE, {
        reason: outdated
          ? "Regenerate required — the stored PDF predates the applicant change."
          : null,
        details: {
          "Generated By": creditNote.createdBy || creditNote.updatedBy || "—",
          "Generated On": fmtDate(creditNote.updatedAt || creditNote.createdAt) || "—",
          ...(creditNote.pdfPath ? {} : { PDF: "Not rendered" }),
        },
      })
    );
  } else {
    items.push(
      item("creditNote", "Credit Note Generated", STATUS.PENDING, {
        reason: "Not generated yet.",
      })
    );
  }

  // 10 ── Agreement. There is no agreement module in this system — no model, no
  //       generator, no route, no stored files. Reported as Not Applicable
  //       rather than a ❌ nobody can ever clear.
  items.push(
    item("agreement", "Agreement Generated", STATUS.NA, {
      reason: "No agreement module exists in this system.",
    })
  );

  // 11 ── Workflow position (order from workflowConstants)
  const stage = toStage(app?.workflowStage || "");
  const idx = WORKFLOW_STAGES.indexOf(stage);
  const lastIdx = WORKFLOW_STAGES.length - 1;
  const atEnd = idx >= lastIdx - 1 && idx !== -1; // pre-disbursement or beyond
  items.push(
    item("workflow", "Workflow Complete", atEnd ? STATUS.DONE : STATUS.PENDING, {
      reason: atEnd ? null : `Currently at "${app?.workflowStage || "—"}".`,
      details: {
        Stage: app?.workflowStage || "—",
        Position: idx === -1 ? "—" : `${idx + 1} of ${WORKFLOW_STAGES.length}`,
      },
    })
  );

  // ── Roll-up ────────────────────────────────────────────────────────────
  const applicable = items.filter((i) => i.status !== STATUS.NA);
  const completed = applicable.filter((i) => i.status === STATUS.DONE).length;
  const missing = applicable
    .filter((i) => i.status !== STATUS.DONE)
    .map((i) => ({ key: i.key, label: i.label, reason: i.reason, blocking: i.blocking }));

  // Only items flagged `blocking` can stop approval — see the file header.
  const blockers = missing.filter((m) => m.blocking);

  return {
    items,
    missing,
    summary: {
      completed,
      total: applicable.length,
      percent: applicable.length ? Math.round((completed / applicable.length) * 100) : 0,
      ready: missing.length === 0,
    },
    approval: {
      blocked: blockers.length > 0,
      blockers,
      message: blockers.length
        ? "Approval blocked because mandatory requirements are incomplete."
        : null,
    },
  };
}

export default { buildApprovalChecklist, STATUS };
