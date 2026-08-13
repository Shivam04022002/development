// services/coApplicantCibilService.js
//
// On-demand CIBIL fetch for the CO-APPLICANT.
//
// Deliberately separate from cibilProcessingService: that service runs once,
// automatically, at application creation, and owns the applicant's report plus
// the auto-reject decision. This one is explicit, admin-triggered, and acquires
// data only. Nothing here rejects an application, moves a workflow stage,
// touches eligibility, or writes Application.cibil.
//
// The vendor client is reused unchanged. fetchCibilReport(party, config) is
// already party-agnostic — it takes a plain party object and never reads a
// role — so the co-applicant needs no new request builder and no change to the
// Xaler payload.
//
// ── Concurrency ────────────────────────────────────────────────────────────
// A bureau pull is billable, so "check then call" is not sufficient: two
// concurrent requests can both see no report and both pay. This service
// reserves the subject atomically first, using the compound unique index
// { applicationId, subjectPan } that Phase 2B.1 put in production. The insert
// is the lock; the database decides the winner. Only the caller that created
// the row may call the vendor. No new locking mechanism is introduced and the
// CibilReport schema is unchanged — a reservation is simply a row whose payload
// fields are still at their defaults, and `createdAt` (already provided by
// timestamps) makes staleness detectable.
//
import CibilReport from "../models/CibilReport.js";
import Application from "../models/Application.js";
import ApprovedApplication from "../models/ApprovedApplication.js";
import RejectedApplication from "../models/RejectedApplication.js";
import { fetchCibilReport, sanitizeVendorText } from "./xalerCibilService.js";
import { getDecryptedCibilConfig } from "./systemSettingsService.js";
import { createHistoryEntry } from "../controllers/formTrackingController.js";
import {
  partySubjectKey,
  hasRequiredIdentity,
  upsertCibilSubject,
  toCibilSubject,
} from "../models/cibilSubjectSchemas.js";
import { writeAppFile } from "../utils/fileStorage.js";
import { logEvent, logError } from "../utils/log.js";

const VENDOR = "Xaler-TransUnion";

/**
 * A reservation left behind by a crashed process would block the subject
 * forever. Anything still empty after this long is reclaimable. Generous
 * relative to the vendor's own ceiling (3 attempts x 20s + backoff ≈ 63s), so
 * a live request is never stolen.
 */
export const STALE_RESERVATION_MS = 10 * 60 * 1000;

/**
 * Consent — reporting what the repository actually contains.
 *
 * There is NO consent, bureau-authorisation, or KYC-declaration field anywhere
 * in this codebase, for either party; the applicant's report is pulled today
 * with no consent artefact stored. No such field is invented here.
 *
 * The check below is the gate that would enforce one if the business decides a
 * record is required. It is OFF by default, which preserves exactly the
 * authorisation posture the applicant fetch already has — turning it on without
 * a field to read would block every fetch, which is why it is opt-in.
 */
export const consentStatus = () => ({
  known: false,
  reason: "no co-applicant CIBIL consent field exists in the schema",
});
const consentGateEnabled = () =>
  String(process.env.CIBIL_REQUIRE_COAPPLICANT_CONSENT || "").trim() === "true";

/** A stored report, as opposed to a bare reservation. */
export const isCompletedReport = (r) =>
  Boolean(
    r &&
      (String(r.requestId || "").trim() ||
        (r.rawResponse !== null && r.rawResponse !== undefined) ||
        String(r.rawResponsePath || "").trim() ||
        (r.rawRequest !== null && r.rawRequest !== undefined))
  );

/** A reservation nobody completed, old enough to reclaim. */
export const isStaleReservation = (r, now = Date.now(), ttl = STALE_RESERVATION_MS) =>
  Boolean(r) && !isCompletedReport(r) && now - new Date(r.createdAt || 0).getTime() > ttl;

const defaultFindApplication = async (applicationId) => {
  for (const Model of [Application, ApprovedApplication, RejectedApplication]) {
    const doc = await Model.findById(applicationId);
    if (doc) return { doc, Model };
  }
  return null;
};

/**
 * fetchCoApplicantCibil(applicationId, deps)
 *
 * Every collaborator is injectable so the whole path — including the
 * reservation race — can be exercised against in-memory fakes with no database
 * and no vendor call. Production passes nothing and gets the real ones.
 *
 * Returns a structured outcome; never throws.
 *   { ok:true,  status:"fetched",        subject:"coApplicant", subjectPan, score }
 *   { ok:false, status:"already_exists" | "in_progress" | "missing_identity" |
 *                      "no_co_applicant" | "not_found" | "not_configured" |
 *                      "consent_required" | "vendor_failed" |
 *                      "not_retryable", ... }
 *
 * A vendor "partial" flow (identity verification still running) is reported as
 * `in_progress` and additionally carries `pendingAuthentication` — the
 * web-token / report URLs the bureau is waiting on — and
 * `pendingResponsePath`, where the complete body was written.
 */
export async function fetchCoApplicantCibil(applicationId, deps = {}) {
  const {
    findApplication = defaultFindApplication,
    reports = CibilReport,
    fetchReport = fetchCibilReport,
    loadConfig = getDecryptedCibilConfig,
    history = createHistoryEntry,
    saveRawFile = writeAppFile,
    now = () => Date.now(),
    actor = "System",
  } = deps;

  const found = await findApplication(applicationId);
  if (!found) return { ok: false, status: "not_found", message: "Application not found." };

  const { doc: app, Model } = found;

  const hist = (actionType, remarks) =>
    history({
      applicationId: app._id,
      formId: app.formId,
      actionType,
      remarks,
      updatedBy: actor,
      updatedByRole: "admin",
    }).catch(() => {});

  // 2 · a co-applicant must exist
  const coApplicant = app.coApplicant;
  const hasCoApplicant =
    coApplicant && typeof coApplicant === "object" && Object.keys(coApplicant).length > 0;
  if (!hasCoApplicant) {
    return { ok: false, status: "no_co_applicant", message: "This application has no co-applicant." };
  }

  // 3 + 4 · identity, from the STORED record — never from the caller.
  //
  // PAN is OPTIONAL. What the bureau actually requires is mobile, forename,
  // surname and date of birth; a missing PAN narrows the match but does not
  // stop the request, and `pan_id` is simply omitted from the body.
  //
  // What IS required is that the subject can be identified, because the report
  // has to be stored and displayed as belonging to this person and no other.
  // partySubjectKey gives the PAN when there is one and a derived key over the
  // supplied identity when there is not.
  if (!hasRequiredIdentity(coApplicant)) {
    return {
      ok: false,
      status: "missing_identity",
      message:
        "Co-applicant CIBIL needs a mobile number, first name, last name and date of birth. PAN is optional.",
    };
  }

  const subjectPan = partySubjectKey(coApplicant);
  if (!subjectPan) {
    return {
      ok: false,
      status: "missing_identity",
      message: "Co-applicant cannot be identified for a CIBIL fetch.",
    };
  }

  // 5 · consent gate — off unless a field exists and the business enables it
  if (consentGateEnabled()) {
    return {
      ok: false,
      status: "consent_required",
      message: "Co-applicant CIBIL consent is required but no consent record exists.",
      consent: consentStatus(),
    };
  }

  const config = await loadConfig();
  if (!config || !config.apiUrl) {
    return { ok: false, status: "not_configured", message: "CIBIL is not configured." };
  }

  // The remark does not name the actor: `updatedBy` already carries it, and it
  // is no longer always an admin — the same service now also runs automatically
  // after application submission, where the actor is the system.
  await hist("CO_APPLICANT_CIBIL_FETCH_REQUESTED", "Co-applicant CIBIL requested");

  // 6 · atomic reservation. The upsert either inserts (pre-image null → we own
  // the subject) or matches an existing row (someone else owns it). The unique
  // index makes the database the arbiter; there is no window between deciding
  // and acting.
  let reservation = await reserve(reports, app._id, subjectPan);

  if (reservation.existing) {
    const row = reservation.existing;
    if (isCompletedReport(row)) {
      return {
        ok: false,
        status: "already_exists",
        subject: "coApplicant",
        subjectPan,
        reportId: String(row._id),
        message: "A CIBIL report already exists for this co-applicant.",
      };
    }
    // An empty row: a fetch in flight, or one abandoned by a crashed process.
    if (!isStaleReservation(row, now())) {
      return {
        ok: false,
        status: "in_progress",
        subject: "coApplicant",
        subjectPan,
        message: "A CIBIL fetch for this co-applicant is already in progress.",
      };
    }
    // Reclaim: delete only while it is still empty, then reserve again once.
    await releaseReservation(reports, row._id);
    reservation = await reserve(reports, app._id, subjectPan);
    if (reservation.existing) {
      return { ok: false, status: "in_progress", subject: "coApplicant", subjectPan };
    }
  }

  const reservedId = reservation.created._id;

  // 7 + 8 · only the reservation holder calls the vendor, with the existing
  // client and the existing payload builder — unchanged.
  //
  // Emitted immediately before the call and exactly once per real invocation,
  // so "was Xaler actually called?" is answerable from a request event rather
  // than reconstructed from response bodies. Mirrors the applicant flow's
  // `cibil_request`, distinguished by name and by `subject`. No PAN, no
  // payload, no credentials — the subject is identified by the application.
  logEvent("coapplicant_cibil_request", {
    applicationId: String(app._id),
    formId: app.formId,
    subject: "coApplicant",
    reportId: String(reservedId),
  });

  let result;
  try {
    result = await fetchReport(coApplicant, config);
  } catch (err) {
    // fetchCibilReport is documented never to throw; treat a throw as a failure
    // rather than leaking a stuck reservation.
    await releaseReservation(reports, reservedId);
    const reason = sanitizeVendorText(err?.message || "error");
    await hist("CO_APPLICANT_CIBIL_FETCH_FAILED", `Co-applicant CIBIL failed (unknown) — ${reason}`);
    logError("coapplicant_cibil_threw", { applicationId: String(app._id), subject: "coApplicant", error: reason });
    // A thrown client is a transport-class fault: retrying may legitimately work.
    return {
      ok: false, status: "vendor_failed", subject: "coApplicant", subjectPan,
      reason, retryability: "retryable", retryable: true,
    };
  }

  if (!result?.ok) {
    // 8 · failure must not leave the subject permanently blocked. The
    // reservation is released for EVERY failure kind — retryable or not — so
    // the subject is never stuck. "Not retryable" is advice to the operator,
    // never a lock on the data.
    await releaseReservation(reports, reservedId);

    // The vendor's own judgement when it sends one, else the transport/status
    // rule. A deterministic failure — the bureau holding no record for this
    // identity — must not invite another identical paid request.
    const retryability = result?.retryability || "unknown";
    const notRetryable = retryability === "not_retryable";
    const reason = sanitizeVendorText(result?.reason || "unavailable");

    await hist(
      "CO_APPLICANT_CIBIL_FETCH_FAILED",
      `Co-applicant CIBIL failed (${retryability}) — ${reason}`
    );
    logEvent("coapplicant_cibil_response", {
      applicationId: String(app._id), formId: app.formId, subject: "coApplicant",
      ok: false, retryability, reason, pending: Boolean(result?.pending),
    });

    // ── Pending authentication: preserve what the vendor DID return ─────────
    //
    // A "partial" flow is the one failure kind that carries something the
    // operator can act on — the bureau is waiting for the customer's
    // authentication answer, and the response names the web-token URL that
    // collects it plus the report URLs that will serve the report afterwards.
    // Every other branch above discards the body, which was correct while a
    // failure body held nothing but an explanation; here it loses the only
    // route to finishing the pull. FORM-664454 is that case in production: a
    // valid HTTP 200 / "partial" response, and zero rows in `cibilreports`.
    //
    // It is deliberately NOT written into the reserved CibilReport row. Any of
    // rawRequest / rawResponse / rawResponsePath / requestId makes
    // isCompletedReport() true, so a pending row would answer every later
    // attempt with `already_exists` — permanently, since nothing would ever
    // complete it. That trades a lost payload for a subject that can never be
    // fetched again, and the schema has no field to mark a row as incomplete.
    // The reservation is therefore still released, exactly as before.
    //
    // Instead the raw body goes to the SAME application file store the success
    // path already writes to, under its own name so it can never be mistaken
    // for a stored report (nothing reads it as one — loadRawResponse only ever
    // resolves a path recorded on a CibilReport row), and the actionable fields
    // are returned to the caller. Nothing else about this branch changes.
    let pendingAuthentication;
    let pendingResponsePath = "";
    if (result?.pending) {
      pendingAuthentication = result.pendingAuth || null;
      if (result.raw !== undefined && result.raw !== null && app.formId) {
        try {
          pendingResponsePath = await saveRawFile(
            app.formId,
            ["cibil", `pending-response-${subjectPan}.json`],
            JSON.stringify(result.raw, null, 2)
          );
        } catch (e) {
          logError("coapplicant_cibil_pending_write_failed", {
            applicationId: String(app._id), error: e?.message,
          });
        }
      }
      logEvent("coapplicant_cibil_pending", {
        applicationId: String(app._id),
        formId: app.formId,
        subject: "coApplicant",
        // Presence only — a web-token URL is a bearer credential for the
        // customer's authentication session and is never logged.
        pendingAuthentication: pendingAuthentication?.pendingAuthentication ?? null,
        hasWebTokenUrl: Boolean(pendingAuthentication?.webTokenUrl),
        hasReportUrl: Boolean(pendingAuthentication?.jsonReportUrl || pendingAuthentication?.pdfReportUrl),
        rawResponsePath: pendingResponsePath || null,
      });
    }

    // Explicitly NOT a low score and NOT a rejection — the application is
    // untouched either way. Only the status distinguishes what the operator
    // should do next.
    // A "partial" flow is not a gateway fault: the bureau answered, and only
    // identity verification is still running, so the same consumer can be
    // retried later. Reporting that as vendor_failed sent 502 for a request
    // nothing had actually failed. `pending` is the vendor client's own marker
    // for that case — deliberately narrower than `unavailable`, which a plain
    // transport exhaustion also sets, and which must stay a 502.
    return {
      ok: false,
      status: notRetryable
        ? "not_retryable"
        : result?.pending
          ? "in_progress"
          : "vendor_failed",
      subject: "coApplicant",
      subjectPan,
      reason,
      retryability,
      retryable: retryability === "retryable",
      // Present ONLY for a pending flow, so a caller can tell a bureau still
      // awaiting the customer's answer from a reservation already in flight —
      // both of which are reported as `in_progress`.
      ...(result?.pending
        ? { pendingAuthentication, pendingResponsePath }
        : {}),
    };
  }

  // 9 · complete the reservation in place, so the row we own becomes the report.
  const ex = result.extracted || {};
  let rawResponsePath = "";
  if (result.raw !== undefined && result.raw !== null && app.formId) {
    try {
      rawResponsePath = await saveRawFile(
        app.formId,
        ["cibil", `raw-response-${subjectPan}.json`],
        JSON.stringify(result.raw, null, 2)
      );
    } catch (e) {
      logError("coapplicant_cibil_raw_write_failed", { applicationId: String(app._id), error: e?.message });
    }
  }

  await reports.updateOne(
    { _id: reservedId },
    {
      $set: {
        vendor: VENDOR,
        rawRequest: result.request ?? null,
        rawResponse: result.raw ?? null,
        rawResponsePath,
        reportUrl: ex.reportUrl || "",
        requestId: ex.requestId || "",
      },
    }
  );

  // 10 · summary into cibilSubjects only. Application.cibil is the applicant's
  // and is never written here.
  let summaryMirrored = false;
  const supportsList = Boolean(Model?.schema?.path?.("cibilSubjects"));
  if (supportsList) {
    const summary = {
      score: ex.score ?? null,
      status: ex.status || "",
      state: "",
      result: "",
      reportDate: ex.reportDate || "",
      requestId: ex.requestId || "",
      fetchedAt: new Date(),
    };
    const next = upsertCibilSubject(app.cibilSubjects, subjectPan, summary);
    await Model.collection.updateOne(
      { _id: app._id },
      { $set: { cibilSubjects: next.map((e) => toCibilSubject(e.subjectPan, e)) } }
    );
    summaryMirrored = true;
  }
  // ApprovedApplication declares no cibilSubjects (audit §6A). The report is
  // still stored and readable through the subject-aware APIs; the summary is
  // simply not mirrored rather than being forced in through the native driver,
  // where the model would strip it on read.

  await hist("CO_APPLICANT_CIBIL_FETCHED", `Co-applicant CIBIL received — score ${ex.score}`);
  logEvent("coapplicant_cibil_response", {
    applicationId: String(app._id), formId: app.formId, ok: true, score: ex.score ?? null,
  });

  // 11 · no auto-reject, no stage change, no eligibility change. Data only.
  return {
    ok: true,
    status: "fetched",
    subject: "coApplicant",
    subjectPan,
    score: ex.score ?? null,
    reportId: String(reservedId),
    summaryMirrored,
  };
}

/**
 * Atomically claim { applicationId, subjectPan }.
 *
 * Upsert with a pre-image: a null pre-image means THIS caller performed the
 * insert and owns the subject. Any concurrent caller either loses the unique
 * index race or receives the existing row. Returns { created } or { existing }.
 */
async function reserve(reports, applicationId, subjectPan) {
  try {
    const before = await reports.findOneAndUpdate(
      { applicationId, subjectPan },
      { $setOnInsert: { applicationId, subjectPan, vendor: VENDOR } },
      { upsert: true, new: false, setDefaultsOnInsert: true }
    );
    if (before) return { existing: before };
    const created = await reports.findOne({ applicationId, subjectPan });
    return { created };
  } catch (err) {
    // Duplicate key: another request inserted between our read and write. It
    // owns the subject; we must not call the vendor.
    if (err?.code === 11000) {
      const existing = await reports.findOne({ applicationId, subjectPan });
      return { existing: existing || { _id: null } };
    }
    throw err;
  }
}

/** Delete a reservation, but only while it is still empty. */
async function releaseReservation(reports, id) {
  if (!id) return;
  try {
    await reports.deleteOne({
      _id: id,
      requestId: "",
      rawResponsePath: "",
      rawResponse: null,
      rawRequest: null,
    });
  } catch (err) {
    logError("coapplicant_cibil_release_failed", { reportId: String(id), error: err?.message });
  }
}

export default { fetchCoApplicantCibil };
