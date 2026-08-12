// services/applicationService.js
//
// Core Backend Redesign (Phase 2).
// The Admin Backend is the ONLY writer of loan applications. This service
// creates exactly ONE Application document from a payload forwarded by the
// Mobile Backend gateway. It replaces the removed merge subsystem
// (autoMergeService / mergeController / merge API / recovery interval).
//
import mongoose from "mongoose";
import Application from "../models/Application.js";
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import Branch from "../models/Branch.js";
import { toStage, normalizeWorkflows, WORKFLOW_STAGES, PENDING_CIBIL_STAGE } from "../utils/workflowConstants.js";
import { processApplicationCibil } from "./cibilProcessingService.js";
import { fetchCoApplicantCibil } from "./coApplicantCibilService.js";
import { createHistoryEntry } from "../controllers/formTrackingController.js";
import { organizeApplicationFiles } from "../utils/appFileStorage.js";
import { logEvent, logError } from "../utils/log.js";

const DEFAULT_START_STAGE = WORKFLOW_STAGES[0]; // "contact creation"

/**
 * startCoApplicantCibil(applicationId, deps) — begin the co-applicant bureau
 * fetch WITHOUT holding up the caller.
 *
 * This is orchestration only. Every decision — is there a co-applicant, is
 * there a PAN, is consent required, is a fetch already in flight, what does a
 * vendor failure mean — belongs to coApplicantCibilService and is deliberately
 * not duplicated here. That service stays the single source of truth for
 * co-applicant CIBIL, shared verbatim with the manual Super Admin endpoint.
 * The HTTP route is NOT called internally: its requireSuperAdmin guard exists
 * for the manual action and is neither bypassed nor weakened.
 *
 * Two properties this function must guarantee:
 *
 *   1. It never rejects and never throws. A bureau problem is not an
 *      application-creation problem, so nothing here can reach the dealer's
 *      submit response or leave an unhandled rejection.
 *   2. It returns immediately. The returned promise is a handle for tests;
 *      production intentionally drops it, so the vendor round trip — which can
 *      outlast the mobile client's timeout — happens after the response.
 *
 * No queue, worker, cron or external dependency is introduced: the detached
 * promise is the whole mechanism.
 */
export function startCoApplicantCibil(applicationId, deps = {}) {
  const {
    fetchCoApplicant = fetchCoApplicantCibil,
    log = logEvent,
    onError = logError,
    actor = "System (automatic)",
  } = deps;

  return (async () => {
    try {
      const outcome = await fetchCoApplicant(applicationId, { actor });
      // One line per automatic attempt, whatever the outcome, so "did the
      // automation run, and what did it decide?" is answerable from the log.
      // `status` already distinguishes no_co_applicant / missing_identity (skipped,
      // no vendor call) from fetched / already_exists / in_progress / the
      // failure statuses. No PAN, score, name or vendor payload is logged.
      log("coapplicant_cibil_auto", {
        applicationId: String(applicationId),
        ok: Boolean(outcome?.ok),
        status: outcome?.status || "unknown",
        retryability: outcome?.retryability,
      });
      return outcome;
    } catch (err) {
      // fetchCoApplicantCibil is documented never to throw. If it ever does,
      // it is swallowed here rather than surfacing as an unhandled rejection.
      onError("coapplicant_cibil_auto_threw", {
        applicationId: String(applicationId),
        error: err?.message,
      });
      return { ok: false, status: "error" };
    }
  })();
}

function asPlain(doc) {
  return doc?.toObject ? doc.toObject() : doc;
}

/** Build the denormalized dealer snapshot stored on the Application. */
function sanitizeDealer(userDoc) {
  if (!userDoc) return null;
  const u = asPlain(userDoc);
  const snapshot = {
    _id: u._id || u.id || null,
    userId: u.userId ?? u.UserId ?? null,
    email: u.email ?? u.Email ?? null,
    name: u.name ?? u.Name ?? null,
    district: u.district ?? u.District ?? null,
    branch: u.branch ?? u.Branch ?? null,
  };
  const hasInfo = Object.entries(snapshot).some(([k, v]) => k !== "_id" && v);
  return hasInfo ? snapshot : null;
}

/** First configured admin workflow stage, falling back to the canonical start. */
async function getFirstAdminWorkflowStage() {
  try {
    const admin = await Admin.findOne().lean();
    if (!admin) return DEFAULT_START_STAGE;
    const stages = normalizeWorkflows(
      admin.workflows || admin.workflow || admin.workflowStages || []
    );
    return stages[0] || DEFAULT_START_STAGE;
  } catch {
    return DEFAULT_START_STAGE;
  }
}

/**
 * Resolve the dealer User from the identifiers the gateway forwarded.
 * Accepts an ObjectId (preferred, from the authenticated dealer token) or a
 * string UserId / email fallback.
 */
async function resolveDealer({ dealerId, dealerUserId, dealerEmail, applicant, vehicle }) {
  const objectIdCandidates = [dealerId, applicant?.user, vehicle?.user]
    .filter(Boolean)
    .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  const uniqueIds = [
    ...new Map(objectIdCandidates.map((id) => [id.toString(), id])).values(),
  ];

  if (uniqueIds.length > 0) {
    const found = await User.findOne({ _id: { $in: uniqueIds } }).lean();
    if (found) return found;
  }

  const stringCandidates = [dealerUserId, dealerEmail].filter(Boolean);
  if (stringCandidates.length > 0) {
    const orClauses = stringCandidates.flatMap((val) => [
      { userId: val },
      { UserId: val },
      { email: val },
    ]);
    const found = await User.findOne({ $or: orClauses }).lean();
    if (found) return found;
  }

  return null;
}

/** Resolve the Branch document by name (best-effort — never blocks creation). */
async function resolveBranch(branchName) {
  if (!branchName || !String(branchName).trim()) return { id: null, name: "" };
  const name = String(branchName).trim();
  try {
    const branch = await Branch.findOne({ name }).lean();
    return { id: branch?._id ?? null, name };
  } catch {
    return { id: null, name };
  }
}

/** Collect document/image URLs from the embedded parties. */
function extractDocuments({ applicant = {}, coApplicant = {}, vehicleDetails = {} }) {
  return {
    applicant: {
      photo: applicant.photo || "",
      aadharFront: applicant.aadharFront || "",
      aadharBack: applicant.aadharBack || "",
      panImage: applicant.panImage || "",
    },
    coApplicant: {
      photo: coApplicant.photo || "",
      aadharFront: coApplicant.aadharFront || "",
      aadharBack: coApplicant.aadharBack || "",
      panImage: coApplicant.panImage || "",
      form60: coApplicant.form60 || "",
    },
    vehicle: {
      vehiclePhoto: vehicleDetails.vehiclePhoto || "",
      vehicleImage: vehicleDetails.vehicleImage || "",
    },
  };
}

/**
 * createApplication(payload)
 *
 * payload = {
 *   applicant, coApplicant, vehicleDetails,   // embedded objects from the app
 *   dealerId, dealerUserId, dealerEmail,      // forwarded dealer identity
 *   source                                    // e.g. "mobile"
 * }
 *
 * Returns { success, applicationId, formId, reason?, alreadyExists? }.
 * Idempotent on formId — a repeated submission returns the existing document
 * instead of creating a duplicate (mirrors the old merge's "already_merged").
 */
export async function createApplication(payload = {}) {
  const {
    applicant,
    coApplicant,
    vehicleDetails,
    dealerId,
    dealerUserId,
    dealerEmail,
    source = "mobile",
  } = payload;

  if (!applicant || !vehicleDetails) {
    return { success: false, reason: "incomplete_payload" };
  }

  const formId =
    vehicleDetails?.formId ||
    applicant?.formId ||
    coApplicant?.formId ||
    null;

  // ── Idempotency: don't create a second Application for the same formId ──
  if (formId) {
    const existing = await Application.findOne({ formId })
      .select("_id status rejection")
      .lean();
    if (existing) {
      // Reflect the existing application's CIBIL outcome to the dealer.
      const dealerStatus = existing.status === "rejected" ? "rejected" : "pending_cibil";
      const out = {
        success: true,
        alreadyExists: true,
        reason: "already_exists",
        applicationId: existing._id,
        formId,
        dealerStatus,
      };
      if (dealerStatus === "rejected") {
        out.rejectionReason = existing.rejection?.reason || "Low CIBIL Score";
        out.message =
          "Your application has been rejected because your CIBIL score is below the minimum eligibility criteria.";
      }
      return out;
    }
  }

  // ── Dealer resolution ──────────────────────────────────────────────────
  const resolvedDealer = await resolveDealer({
    dealerId,
    dealerUserId,
    dealerEmail,
    applicant,
    vehicle: vehicleDetails,
  });

  const dealerObjectId =
    resolvedDealer?._id ||
    (dealerId && mongoose.Types.ObjectId.isValid(String(dealerId)) ? dealerId : null);

  if (!dealerObjectId) {
    // dealer is required on the schema — cannot create without one
    return { success: false, reason: "dealer_not_resolved" };
  }

  const dealerSnapshot = sanitizeDealer(resolvedDealer) || null;

  // ── Branch ──────────────────────────────────────────────────────────────
  const branchName = dealerSnapshot?.branch || "";
  const branch = await resolveBranch(branchName);

  // ── Local file storage (Phase 7) ───────────────────────────────────────
  // Move uploaded documents into uploads/applications/<formId>/... and rewrite
  // the embedded image fields to RELATIVE paths before persisting. Legacy
  // remote URLs are left untouched.
  await organizeApplicationFiles(formId, { applicant, coApplicant, vehicleDetails });

  // ── Build and persist the single Application document ──────────────────
  // Every new application starts at workflowStage "pending_cibil" with the
  // overall status "pending". Pending CIBIL is a WORKFLOW STAGE, not a status.
  const doc = {
    formId,
    applicant,
    coApplicant: coApplicant || null,
    vehicleDetails,
    documents: extractDocuments({ applicant, coApplicant, vehicleDetails }),
    dealer: dealerObjectId,
    dealerDetails: dealerSnapshot,
    branch,
    status: "pending",
    workflowStage: PENDING_CIBIL_STAGE,
    history: [],
    source,
    submittedBy: dealerObjectId,
    submittedAt: new Date(),
  };

  const created = await Application.create(doc);
  logEvent("application_created", { applicationId: String(created._id), formId, dealer: String(dealerObjectId) });

  // ── Timeline: Application Submitted ─────────────────────────────────────
  await createHistoryEntry({
    applicationId: created._id,
    formId: created.formId,
    actionType: "FORM_CREATED",
    remarks: "Application Submitted",
    updatedBy: dealerSnapshot?.name || dealerSnapshot?.userId || "Dealer",
    updatedByRole: "dealer",
  });

  // ── CIBIL (Xaler TransUnion) — Phase 4 ─────────────────────────────────
  // Runs AFTER the application is safely persisted. processApplicationCibil
  // never throws: on any vendor failure the application is kept as "Pending
  // CIBIL". It may set status to "rejected" (low score + auto-reject) or
  // "pending_cibil" and returns the dealer-facing outcome.
  const cibilOutcome = await processApplicationCibil(created);

  // ── Co-applicant CIBIL — automatic, detached ───────────────────────────
  // Started only after the applicant flow has finished, not alongside it.
  // Both paths write `cibilSubjects`, and the co-applicant path re-reads the
  // application and then $sets the whole array; overlapping them would let the
  // co-applicant's write, built from a snapshot taken before its vendor call,
  // clobber the applicant entry the applicant flow had just added. Sequencing
  // removes that lost update entirely — by the time this reads, the applicant
  // entry is already stored — and costs the dealer nothing, because the
  // applicant fetch was awaited here before this change too.
  //
  // Deliberately not awaited: the response returns now and the bureau round
  // trip continues in the background. Eligibility, duplicate protection and
  // failure handling all live in the service. Nothing it returns can alter the
  // application's status, stage or eligibility.
  startCoApplicantCibil(created._id);

  return {
    success: true,
    applicationId: created._id,
    formId,
    dealerStatus: cibilOutcome.dealerStatus, // "rejected" | "pending_cibil"
    rejectionReason: cibilOutcome.reason,      // present when rejected
    message: cibilOutcome.message,             // present when rejected
  };
}

export default { createApplication };
