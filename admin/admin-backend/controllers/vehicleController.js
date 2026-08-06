// controllers/vehicleController.js
//
// RC & Number Plate module — the admin-facing half.
//
// Every query runs against ApprovedApplication: only an approved application
// is eligible for RC / Number Plate upload, and approved records live in the
// `approvedApplications` collection.
//
// Admins are not dealer-scoped. Consistent with the existing permission model
// (see accessFilter.js: "ALL admins see ALL finalized records"), any
// authenticated admin may view and edit vehicle documents; no workflow-stage
// gate applies, because these records have already left the workflow.
//
import fsp from "fs/promises";
import mongoose from "mongoose";
import ApprovedApplication from "../models/ApprovedApplication.js";
import ActivityLog from "../models/ActivityLog.js";
import { UPLOAD_STATUSES } from "../models/vehicleDocSchemas.js";
import { toLocalRel, moveIntoApp } from "../utils/fileStorage.js";
import { STAGING_REL } from "../middleware/upload.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import { logEvent } from "../utils/log.js";

const PENDING = "Pending";
const UPLOADED = "Uploaded";

/** Canonical plate-number form — trimmed, whitespace collapsed, upper-cased. */
const normalisePlateNumber = (value) =>
  String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/* ──────────────────────────── shared helpers ────────────────────────────── */

/**
 * Match one section against a status. Records approved before this module
 * existed carry no section at all, so "missing" counts as Pending — otherwise
 * the entire existing book would be missing from a Pending filter.
 */
const statusClause = (path, status) =>
  status === PENDING
    ? { $or: [{ [path]: PENDING }, { [path]: { $exists: false } }, { [path]: null }] }
    : { [path]: status };

/** Search by Loan Number, Customer Name or Mobile Number. */
const searchClause = (term) => {
  const re = new RegExp(escapeRegex(term), "i");
  return {
    $or: [
      { formId: re },                      // Loan Number
      { "applicant.name": re },            // Customer Name
      { "applicant.applicant.name": re },  // …legacy nested shape
      { "applicant.mobileNumber": re },    // Mobile Number
      { "applicant.mobile": re },          // …legacy field name
    ],
  };
};

const customerName = (app) =>
  app?.applicant?.name || app?.applicant?.applicant?.name || "";
const customerMobile = (app) =>
  app?.applicant?.mobileNumber || app?.applicant?.mobile || "";
const branchName = (app) =>
  app?.dealerDetails?.branch || app?.dealerDetails?.Branch || app?.branch?.name || "";
const loanAmount = (app) => {
  const raw = app?.vehicleDetails?.financeRequired;
  const n = Number(String(raw ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && String(raw ?? "").trim() !== "" ? n : null;
};

/** The section status as the UI should read it (absent → Pending). */
const sectionStatus = (section) => (section?.status === "Uploaded" ? "Uploaded" : PENDING);

/**
 * A stored relative path rendered for the admin SPA. Locally stored files are
 * served by the authenticated GET /api/files/<relative-path> route, which is
 * what FilePreview already consumes.
 */
const fileRef = (rel) => (rel ? { path: rel, url: `/api/files/${rel}` } : null);

/* ───────────────────────────── GET /list ────────────────────────────────── */

/**
 * GET /api/admin/vehicle/list
 * Query: search, dealer, type (RC | NUMBER_PLATE), status (Pending | Uploaded),
 *        page, limit
 *
 * `type` selects WHICH section `status` applies to. `status` on its own matches
 * a record where either section is in that state.
 */
export const listVehicleDocuments = async (req, res) => {
  const t0 = Date.now();
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const search = (req.query.search || "").trim();
    const dealer = (req.query.dealer || "").trim();
    const type = (req.query.type || "").trim().toUpperCase();
    const status = (req.query.status || "").trim();

    if (type && !["RC", "NUMBER_PLATE"].includes(type)) {
      return res.status(400).json({
        error: "Invalid type filter. Expected RC or NUMBER_PLATE.",
      });
    }
    if (status && !UPLOAD_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status filter. Expected one of: ${UPLOAD_STATUSES.join(", ")}.`,
      });
    }
    if (dealer && !mongoose.Types.ObjectId.isValid(dealer)) {
      return res.status(400).json({ error: "Invalid dealer id." });
    }

    const clauses = [];
    if (search) clauses.push(searchClause(search));
    if (dealer) clauses.push({ dealer: new mongoose.Types.ObjectId(dealer) });

    const RC_PATH = "rcDetails.status";
    const NP_PATH = "numberPlateDetails.status";

    if (status) {
      if (type === "RC") clauses.push(statusClause(RC_PATH, status));
      else if (type === "NUMBER_PLATE") clauses.push(statusClause(NP_PATH, status));
      else {
        // No type given — a record matches if EITHER section is in that state.
        clauses.push({
          $or: [statusClause(RC_PATH, status), statusClause(NP_PATH, status)],
        });
      }
    }

    const filter = clauses.length ? { $and: clauses } : {};

    const [rows, total] = await Promise.all([
      ApprovedApplication.find(filter)
        .select(
          "formId applicant dealerDetails branch vehicleDetails rcDetails numberPlateDetails spdcDetails approvedAt createdAt updatedAt"
        )
        .sort({ approvedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ApprovedApplication.countDocuments(filter),
    ]);

    const items = rows.map((app) => ({
      applicationId: String(app._id),
      loanNumber: app.formId || "",
      customerName: customerName(app),
      mobileNumber: customerMobile(app),
      branch: branchName(app),
      dealerName: app?.dealerDetails?.name || "",
      amount: loanAmount(app),
      disbursementDate: app.approvedAt || app.updatedAt || null,
      rcStatus: sectionStatus(app.rcDetails),
      numberPlateStatus: sectionStatus(app.numberPlateDetails),
      plateNumber: app?.numberPlateDetails?.plateNumber || "",
      spdcNumber: app?.spdcDetails?.number || "",
    }));

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[PERF] listVehicleDocuments: page=${page} limit=${limit} total=${total} returned=${items.length} in ${Date.now() - t0}ms`
      );
    }

    return res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("listVehicleDocuments error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/* ──────────────────────── GET /:applicationId ───────────────────────────── */

/**
 * GET /api/admin/vehicle/:applicationId
 * Full vehicle-document view for one approved application.
 */
export const getVehicleDetails = async (req, res) => {
  try {
    const { applicationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ error: "Invalid application id." });
    }

    const app = await ApprovedApplication.findById(applicationId)
      .populate("dealer", "name email branch district")
      .lean();

    if (!app) return res.status(404).json({ error: "Approved application not found" });

    return res.json({
      applicationId: String(app._id),
      loanNumber: app.formId || "",
      branch: branchName(app),
      customerName: customerName(app),
      contact: customerMobile(app),
      amount: loanAmount(app),
      dealerName: app?.dealerDetails?.name || app?.dealer?.name || "",
      disbursementDate: app.approvedAt || app.updatedAt || null,

      rc: {
        status: sectionStatus(app.rcDetails),
        frontImage: fileRef(app?.rcDetails?.frontImage),
        backImage: fileRef(app?.rcDetails?.backImage),
        uploadedAt: app?.rcDetails?.uploadedAt || null,
        uploadedBy: app?.rcDetails?.uploadedBy ? String(app.rcDetails.uploadedBy) : null,
      },

      numberPlate: {
        status: sectionStatus(app.numberPlateDetails),
        plateNumber: app?.numberPlateDetails?.plateNumber || "",
        image: fileRef(app?.numberPlateDetails?.image),
        uploadedAt: app?.numberPlateDetails?.uploadedAt || null,
        uploadedBy: app?.numberPlateDetails?.uploadedBy
          ? String(app.numberPlateDetails.uploadedBy)
          : null,
      },

      spdc: {
        number: app?.spdcDetails?.number || "",
        image: fileRef(app?.spdcDetails?.image),
        updatedAt: app?.spdcDetails?.updatedAt || null,
        updatedBy: app?.spdcDetails?.updatedBy ? String(app.spdcDetails.updatedBy) : null,
      },
    });
  } catch (err) {
    console.error("getVehicleDetails error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/* ──────────────────────── PUT /:applicationId ───────────────────────────── */

/**
 * PUT /api/admin/vehicle/:applicationId
 * Body (all optional, at least one required):
 *   rcStatus    : "Pending" | "Uploaded"
 *   numberPlate : string   — the plate number
 *   spdcNumber  : string
 *   spdcImage   : string   — a path to a file ALREADY stored under the shared
 *                            uploads root (see the note below)
 *
 * Admin-only. Nothing else on the application is writable through this route.
 */
export const updateVehicleDetails = async (req, res) => {
  try {
    const { applicationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ error: "Invalid application id." });
    }

    const { rcStatus, numberPlate, spdcNumber, spdcImage } = req.body || {};

    // Reject a request that asks for nothing, rather than logging a no-op edit.
    const supplied = [rcStatus, numberPlate, spdcNumber, spdcImage].filter(
      (v) => v !== undefined
    );
    if (supplied.length === 0) {
      return res.status(400).json({
        error:
          "Nothing to update. Provide at least one of: rcStatus, numberPlate, spdcNumber, spdcImage.",
      });
    }

    if (rcStatus !== undefined && !UPLOAD_STATUSES.includes(rcStatus)) {
      return res.status(400).json({
        error: `Invalid rcStatus. Expected one of: ${UPLOAD_STATUSES.join(", ")}.`,
      });
    }

    const app = await ApprovedApplication.findById(applicationId)
      .select("formId rcDetails numberPlateDetails spdcDetails")
      .lean();
    if (!app) return res.status(404).json({ error: "Approved application not found" });

    const adminId = req.admin?._id || req.admin?.id || null;
    const now = new Date();
    const $set = {};
    const changed = [];

    if (rcStatus !== undefined) {
      // Business rule: an RC is only "Uploaded" when BOTH sides are on file.
      // Enforced here rather than in the UI because this is the only path that
      // can set the field, and a stale client must not be able to bypass it.
      if (rcStatus === UPLOADED) {
        const hasFront = Boolean(app?.rcDetails?.frontImage);
        const hasBack = Boolean(app?.rcDetails?.backImage);
        if (!hasFront || !hasBack) {
          const missing = [
            ...(hasFront ? [] : ["RC front"]),
            ...(hasBack ? [] : ["RC back"]),
          ];
          return res.status(400).json({
            error: `RC status cannot be set to Uploaded until both images exist. Missing: ${missing.join(" and ")}.`,
            missing,
          });
        }
      }
      $set["rcDetails.status"] = rcStatus;
      changed.push("rcStatus");
    }

    if (numberPlate !== undefined) {
      // Trimmed, whitespace-collapsed and upper-cased server-side, so the stored
      // value is canonical no matter which client sent it. No format rule.
      const plate = normalisePlateNumber(numberPlate);
      if (!plate) {
        return res.status(400).json({ error: "numberPlate cannot be blank." });
      }
      $set["numberPlateDetails.plateNumber"] = plate;
      changed.push("numberPlate");
    }

    if (spdcNumber !== undefined) {
      $set["spdcDetails.number"] = String(spdcNumber).trim();
      $set["spdcDetails.updatedAt"] = now;
      $set["spdcDetails.updatedBy"] = adminId;
      changed.push("spdcNumber");
    }

    if (spdcImage !== undefined) {
      // Supplied as a reference to a file already under the shared uploads root
      // — normally the path returned by POST /:applicationId/spdc-image — and
      // then filed alongside the application's other documents.
      const rel = toLocalRel(spdcImage);
      if (!rel) {
        return res.status(400).json({
          error:
            "spdcImage must reference a file stored under the uploads root (e.g. \"applications/<loanNo>/vehicle/spdc.jpg\" or \"/files/...\").",
        });
      }
      // moveIntoApp returns null when the source does not exist OR when it
      // resolves outside the uploads root. Falling back to the caller's string
      // here would write an unverified path — including a traversal attempt
      // that got past the prefix check — straight into the record. Refuse it.
      const storedRel = await moveIntoApp(app.formId, "vehicle", "spdc", rel);
      if (!storedRel) {
        return res.status(400).json({
          error: "spdcImage does not point at a readable file under the uploads root.",
        });
      }
      $set["spdcDetails.image"] = storedRel;
      $set["spdcDetails.updatedAt"] = now;
      $set["spdcDetails.updatedBy"] = adminId;
      changed.push("spdcImage");
    }

    // timestamps: false — `updatedAt` on an approved record is the approval-time
    // proxy the Processing Days export falls back to for records that predate
    // `approvedAt`. An admin edit here must not rewrite it.
    await ApprovedApplication.updateOne({ _id: app._id }, { $set }, { timestamps: false });

    // Existing logging pattern: ActivityLog row + structured event line.
    try {
      await ActivityLog.create({
        adminId,
        applicationId: app._id,
        action: "UPDATE_VEHICLE_DOCS",
        notes: `Vehicle documents updated (${changed.join(", ")})`,
        meta: { changed },
        at: now,
      });
    } catch (logErr) {
      // Never block the update on a logging failure — same as the workflow
      // controller's approve / reject paths.
      console.error("Failed to log vehicle document update:", logErr);
    }

    logEvent("vehicle_docs_updated", {
      applicationId: String(app._id),
      formId: app.formId,
      adminId: adminId ? String(adminId) : null,
      changed,
      at: now.toISOString(),
    });

    const updated = await ApprovedApplication.findById(app._id)
      .select("formId rcDetails numberPlateDetails spdcDetails")
      .lean();

    return res.json({
      message: "Vehicle details updated",
      applicationId: String(app._id),
      changed,
      rc: {
        status: sectionStatus(updated.rcDetails),
        frontImage: fileRef(updated?.rcDetails?.frontImage),
        backImage: fileRef(updated?.rcDetails?.backImage),
      },
      numberPlate: {
        status: sectionStatus(updated.numberPlateDetails),
        plateNumber: updated?.numberPlateDetails?.plateNumber || "",
        image: fileRef(updated?.numberPlateDetails?.image),
      },
      spdc: {
        number: updated?.spdcDetails?.number || "",
        image: fileRef(updated?.spdcDetails?.image),
        updatedAt: updated?.spdcDetails?.updatedAt || null,
      },
    });
  } catch (err) {
    console.error("updateVehicleDetails error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/* ─────────────── POST /:applicationId/spdc-image (Phase 7) ──────────────── */

/** Best-effort removal of a staged file whose request did not complete. */
const discardStaged = async (file) => {
  if (!file?.path) return;
  await fsp.unlink(file.path).catch(() => {});
};

/**
 * POST /api/admin/vehicle/:applicationId/spdc-image
 * multipart/form-data, field: spdcImage
 *
 * Receives the file into applications/_staging and returns its reference. It
 * does NOT write to the application: the existing PUT commits it, relocating
 * the file to applications/<loanNo>/vehicle/spdc.<ext> via moveIntoApp.
 *
 * That split is deliberate. Committing here would make an upload impossible to
 * undo — Cancel would leave the record changed, and because the stored file
 * always has the same basename, a cancelled upload would already have
 * overwritten the previous SPDC image on disk. Staging first keeps Cancel
 * honest (no API call, nothing changed) at the cost of an orphaned staged file,
 * which is exactly how the dealer upload flow already behaves.
 */
export const uploadSpdcImage = async (req, res) => {
  const file = req.file;
  try {
    const { applicationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      await discardStaged(file);
      return res.status(400).json({ error: "Invalid application id." });
    }
    if (!file) {
      return res.status(400).json({ error: "No file uploaded. Send an image in the 'spdcImage' field." });
    }

    const app = await ApprovedApplication.findById(applicationId).select("formId").lean();
    if (!app) {
      await discardStaged(file);
      return res.status(404).json({ error: "Approved application not found" });
    }

    const stagedRel = `${STAGING_REL}/${file.filename}`;
    const adminId = req.admin?._id || req.admin?.id || null;
    const now = new Date();

    try {
      await ActivityLog.create({
        adminId,
        applicationId,
        action: "UPLOAD_SPDC_IMAGE",
        notes: "SPDC image uploaded (staged, pending save)",
        meta: { staged: stagedRel },
        at: now,
      });
    } catch (logErr) {
      console.error("Failed to log SPDC image upload:", logErr);
    }

    logEvent("spdc_image_uploaded", {
      applicationId: String(applicationId),
      formId: app.formId,
      adminId: adminId ? String(adminId) : null,
      staged: stagedRel,
      at: now.toISOString(),
    });

    return res.json({
      message: "SPDC image uploaded",
      applicationId: String(applicationId),
      spdcImage: fileRef(stagedRel),
    });
  } catch (err) {
    console.error("uploadSpdcImage error:", err);
    await discardStaged(file);
    return res.status(500).json({ error: err.message });
  }
};
