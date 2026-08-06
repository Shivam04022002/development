// controllers/dealerActionsController.js
//
// Dealer Action Center — the dealer's side of the admin document-verification
// workflow.
//
// Scope: a dealer can see the requests an admin raised against their own
// applications, replace a requested document, and add a response remark. They
// can never verify anything — status after a replacement is always "Pending",
// i.e. awaiting admin verification.
//
// Uploads reuse the EXISTING multer middleware and moveIntoApp; no parallel
// upload system. Replacements are written to a VERSIONED filename so the
// superseded file is never overwritten or deleted.
//
import mongoose from "mongoose";
import ApplicationDoc from "../models/ApplicationDoc.js";
import ApprovedApplication from "../models/ApprovedApplication.js";
import ApplicationHistory from "../models/ApplicationHistory.js";
import upload, { STAGING_REL } from "../middleware/upload.js";
import { moveIntoApp, removeRel } from "../utils/fileStorage.js";
import {
  DOC_STATUS,
  APPLICANT_DOCS,
  CO_APPLICANT_DOCS,
} from "../models/documentVerificationSchemas.js";
import { logEvent } from "../utils/log.js";

const ROLES = ["applicant", "coApplicant"];

/** Folder name on disk for a role — matches how uploads were organised. */
const FOLDER = { applicant: "applicant", coApplicant: "co-applicant" };

/** Canonical file base name per document field, as used at creation time. */
const BASENAME = {
  photo: "selfie",
  aadharFront: "aadhaar-front",
  aadharBack: "aadhaar-back",
  panImage: "pan",
  form60: "form60",
};

const docsFor = (role) => (role === "applicant" ? APPLICANT_DOCS : CO_APPLICANT_DOCS);
const labelFor = (role, field) => (docsFor(role).find(([f]) => f === field) || [])[1] || field;
const isKnownField = (role, field) => docsFor(role).some(([f]) => f === field);

const partyOf = (app, role) => app?.[role]?.applicant || app?.[role] || {};

/** Actions the dealer is expected to take on one application. */
function pendingActionsFor(app) {
  const out = [];
  for (const role of ROLES) {
    const party = partyOf(app, role);
    if (!party || !Object.keys(party).length) continue;
    for (const [field, label] of docsFor(role)) {
      const state = app?.documentVerification?.[role]?.[field];
      if (state?.status === DOC_STATUS.REUPLOAD) {
        out.push({
          role,
          field,
          label,
          status: state.status,
          reason: state.remarks || "",
          requestedBy: state.reuploadRequestedBy || "",
          requestedAt: state.reuploadRequestedAt || null,
        });
      }
    }
  }
  return out;
}

/** The dealer-visible view of one document. */
function documentView(app, role, field, label) {
  const party = partyOf(app, role);
  const state = app?.documentVerification?.[role]?.[field] || {};
  const path = party?.[field] || "";
  return {
    role,
    field,
    label,
    uploaded: Boolean(path),
    path: path || null,
    status: path ? state.status || DOC_STATUS.PENDING : "Not uploaded",
    reason: state.remarks || "",
    requestedBy: state.reuploadRequestedBy || "",
    requestedAt: state.reuploadRequestedAt || null,
    verifiedBy: state.verifiedBy || "",
    verifiedAt: state.verifiedAt || null,
    dealerResponse: state.dealerResponse || "",
    actionRequired: state.status === DOC_STATUS.REUPLOAD,
    // Oldest first; the active file is the current `path`.
    versions: Array.isArray(state.versions) ? state.versions : [],
  };
}

/** Find one of the dealer's applications in whichever collection holds it. */
async function findOwnedApplication(applicationId, dealerId) {
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    return { error: { status: 400, message: "Invalid application id." } };
  }

  let Model = ApplicationDoc;
  // .lean() — the raw document, so nothing this service does not model is lost.
  let app = await ApplicationDoc.findById(applicationId).lean();
  if (!app) {
    app = await ApprovedApplication.findById(applicationId).lean();
    Model = ApprovedApplication;
  }
  if (!app) return { error: { status: 404, message: "Application not found." } };

  const owner = app.dealer?._id?.toString() || app.dealer?.toString();
  if (owner !== dealerId.toString()) {
    return { error: { status: 403, message: "Access denied." } };
  }
  return { app, Model };
}

/* ─────────────────────── GET /api/dealer-actions ────────────────────────── */

/**
 * Every application of this dealer that needs attention, plus the counters the
 * dashboard shows. Dealer-scoped by query, never by client input.
 */
export const listDealerActions = async (req, res) => {
  try {
    const dealerId = req.user._id;
    const SELECT = "formId applicant coApplicant dealer status workflowStage documentVerification updatedAt";

    const [pending, approved] = await Promise.all([
      ApplicationDoc.find({ dealer: dealerId }).select(SELECT).lean(),
      ApprovedApplication.find({ dealer: dealerId }).select(SELECT).lean(),
    ]);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    let completedToday = 0;
    const items = [...pending, ...approved].map((app) => {
      const actions = pendingActionsFor(app);

      // Documents this dealer re-uploaded today and that are now awaiting review.
      for (const role of ROLES) {
        for (const [field] of docsFor(role)) {
          const s = app?.documentVerification?.[role]?.[field];
          if (s?.dealerUploadedAt && new Date(s.dealerUploadedAt) >= startOfDay) completedToday += 1;
        }
      }

      return {
        applicationId: String(app._id),
        loanNumber: app.formId || "",
        customerName: partyOf(app, "applicant").name || "",
        status: app.status || "",
        workflowStage: app.workflowStage || "",
        pendingActions: actions,
        actionCount: actions.length,
      };
    });

    const awaiting = items.filter((i) => i.actionCount > 0);

    return res.status(200).json({
      counters: {
        pendingActions: awaiting.reduce((n, i) => n + i.actionCount, 0),
        completedToday,
        applicationsAwaitingDealer: awaiting.length,
      },
      // Applications needing attention first, then the rest.
      items: [...awaiting, ...items.filter((i) => i.actionCount === 0)],
    });
  } catch (err) {
    console.error("listDealerActions error:", err);
    return res.status(500).json({ message: "Server error loading dealer actions" });
  }
};

/* ───────────────── GET /api/dealer-actions/:applicationId ───────────────── */

/** The action center for one application: every document and its state. */
export const getApplicationActions = async (req, res) => {
  try {
    const { app, error } = await findOwnedApplication(req.params.applicationId, req.user._id);
    if (error) return res.status(error.status).json({ message: error.message });

    const documents = [];
    for (const role of ROLES) {
      const party = partyOf(app, role);
      if (!party || !Object.keys(party).length) continue;
      for (const [field, label] of docsFor(role)) {
        documents.push(documentView(app, role, field, label));
      }
    }

    return res.status(200).json({
      applicationId: String(app._id),
      loanNumber: app.formId || "",
      customerName: partyOf(app, "applicant").name || "",
      status: app.status || "",
      workflowStage: app.workflowStage || "",
      pendingActions: pendingActionsFor(app),
      documents,
    });
  } catch (err) {
    console.error("getApplicationActions error:", err);
    return res.status(500).json({ message: "Server error loading application actions" });
  }
};

/* ── POST /api/dealer-actions/:applicationId/documents/:role/:field ──────── */

/**
 * Accept one replacement file. Reuses the existing multer middleware; multer's
 * own failures (type, size) surface as 400s, matching POST /api/upload.
 */
export const receiveReplacement = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (!err) return next();
    const isValidation =
      err.code === "LIMIT_FILE_SIZE" || /Unsupported file type/.test(err.message || "");
    console.error("[DEALER-REUPLOAD] error:", err.message || err);
    return res
      .status(isValidation ? 400 : 500)
      .json({ message: "Upload failed", details: String(err.message || err) });
  });
};

const FIELD_ALIASES = ["document", "file", "photo", "image", "upload"];
const pickFile = (files) => {
  if (!files?.length) return null;
  const named = files.find((f) => FIELD_ALIASES.includes(String(f.fieldname || "").toLowerCase()));
  return named || files[0];
};

/**
 * Replace a document the admin asked for.
 *
 * The superseded file is NOT overwritten: the replacement is written to a
 * versioned name (pan-v2.jpg, pan-v3.jpg …) and the previous path is pushed
 * onto `versions`. Status becomes Pending — a dealer can never self-verify.
 */
export const replaceDocument = async (req, res) => {
  const files = req.files || [];
  const discard = async () => {
    for (const f of files) await removeRel(`${STAGING_REL}/${f.filename}`);
  };

  try {
    const { applicationId, role, field } = req.params;
    const response = String(req.body?.response ?? req.body?.remarks ?? "").trim();

    if (!ROLES.includes(role) || !isKnownField(role, field)) {
      await discard();
      return res.status(400).json({ message: "Unknown document." });
    }

    const file = pickFile(files);
    if (!file) {
      return res.status(400).json({ message: "No file uploaded. Send the replacement document." });
    }

    const { app, Model, error } = await findOwnedApplication(applicationId, req.user._id);
    if (error) {
      await discard();
      return res.status(error.status).json({ message: error.message });
    }

    const state = app?.documentVerification?.[role]?.[field] || {};
    const party = partyOf(app, role);
    const currentPath = party?.[field] || "";

    // A dealer may only replace what the admin asked for. Anything else would
    // let them quietly swap a document that has already been verified.
    if (state.status !== DOC_STATUS.REUPLOAD) {
      await discard();
      return res.status(409).json({
        message: `No re-upload has been requested for ${labelFor(role, field)}.`,
      });
    }

    // Next version number: existing versions + the file being superseded.
    const existing = Array.isArray(state.versions) ? state.versions : [];
    const nextVersion = existing.length + 2; // v1 = the original file

    const storedRel = await moveIntoApp(
      app.formId,
      FOLDER[role],
      `${BASENAME[field] || field}-v${nextVersion}`,
      `${STAGING_REL}/${file.filename}`
    );
    if (!storedRel) {
      await discard();
      return res.status(500).json({ message: "Could not store the replacement document." });
    }

    const now = new Date();
    const dealerName = req.user?.name || req.user?.email || "Dealer";
    const base = `documentVerification.${role}.${field}`;

    // The superseded file stays on disk; only its path moves into history.
    const supersededEntry = {
      version: nextVersion - 1,
      path: currentPath,
      status: DOC_STATUS.REUPLOAD,
      remarks: state.remarks || "",
      actionedBy: state.reuploadRequestedBy || "",
      replacedAt: now,
    };

    await Model.updateOne(
      { _id: applicationId },
      {
        $set: {
          [`${role}.${field}`]: storedRel,          // new active document
          [`${base}.status`]: DOC_STATUS.PENDING,   // awaiting admin verification
          [`${base}.dealerResponse`]: response,
          [`${base}.dealerUploadedAt`]: now,
          [`${base}.remarks`]: "",                  // the admin's reason is now history
        },
        $push: { [`${base}.versions`]: supersededEntry },
      },
      { timestamps: false }
    );

    // ── Audit — the SAME trail the admin reads ──────────────────────────
    const label = labelFor(role, field);
    const who = role === "applicant" ? "Applicant" : "Co-Applicant";
    try {
      await ApplicationHistory.create({
        applicationId,
        formId: app.formId,
        actionType: "DEALER_DOCUMENT_UPLOADED",
        oldValue: { document: label, owner: who, status: DOC_STATUS.REUPLOAD, path: currentPath },
        newValue: {
          document: label, owner: who, status: DOC_STATUS.PENDING,
          path: storedRel, version: nextVersion, response,
        },
        remarks: response
          ? `Dealer re-uploaded ${who} ${label} (v${nextVersion}) — ${response}`
          : `Dealer re-uploaded ${who} ${label} (v${nextVersion})`,
        updatedBy: dealerName,
        updatedByEmail: req.user?.email || "",
        updatedByRole: "dealer",
        updatedAt: now,
      });
    } catch (logErr) {
      console.error("Failed to write dealer upload history:", logErr);
    }

    logEvent("dealer_document_replaced", {
      applicationId: String(applicationId),
      formId: app.formId,
      role,
      field,
      version: nextVersion,
      dealerId: String(req.user._id),
      at: now.toISOString(),
    });

    return res.status(200).json({
      message: `${label} uploaded. Awaiting verification.`,
      document: {
        role, field, label,
        status: DOC_STATUS.PENDING,
        path: storedRel,
        version: nextVersion,
        dealerResponse: response,
      },
    });
  } catch (err) {
    console.error("replaceDocument error:", err);
    await discard();
    return res.status(500).json({ message: "Server error uploading the document" });
  }
};

export default {
  listDealerActions,
  getApplicationActions,
  receiveReplacement,
  replaceDocument,
};
