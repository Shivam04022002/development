// controllers/vehicleDocsController.js
//
// RC & Number Plate module — the dealer-facing half.
//
// Eligibility: an application becomes eligible for RC / Number Plate upload
// once it is APPROVED. Approved applications live in the `approvedApplications`
// collection (approval copies the record there and deletes the pending one), so
// every query in this file runs against ApprovedApplication.
//
// Ownership: every read and every write is scoped to req.user._id, the dealer
// resolved by requireAuth. A dealer can never see or touch another dealer's
// application, and a dealer can never edit a section that has already been
// uploaded — that is an admin-only correction.
//
// Files: uploads land in applications/_staging via the existing multer
// middleware, then move into applications/<formId>/vehicle/... exactly the way
// application documents are stored. Only the RELATIVE path is persisted; the
// public URL is derived on the way out.
//
import mongoose from "mongoose";
import ApprovedApplication from "../models/ApprovedApplication.js";
import upload, { STAGING_REL } from "../middleware/upload.js";
import { moveIntoApp, removeRel } from "../utils/fileStorage.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import { logEvent } from "../utils/log.js";

const PENDING = "Pending";
const UPLOADED = "Uploaded";

/** Canonical plate-number form — trimmed, whitespace collapsed, upper-cased. */
const normalisePlateNumber = (value) =>
  String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/* ─────────────────────────── shared helpers ─────────────────────────────── */

/**
 * Match a section that has not been uploaded yet. Records approved before this
 * module existed carry no section at all, so "missing" counts as Pending —
 * otherwise the entire existing book would be invisible to the dealer.
 */
const pendingClause = (path) => ({
  $or: [{ [path]: PENDING }, { [path]: { $exists: false } }, { [path]: null }],
});

/** Search by Loan Number, Customer Name or Mobile Number. */
const searchClause = (term) => {
  const re = new RegExp(escapeRegex(term), "i");
  return {
    $or: [
      { "disbursement.loanNumber": re },   // Loan Number — the real one
      // Form ID stays searchable: records approved before the disbursement step
      // existed have no loan number, and this is the only identifier search the
      // dealer has. It is a second way in, never the Loan Number itself.
      { formId: re },                      // Form ID
      { "applicant.name": re },            // Customer Name
      { "applicant.applicant.name": re },  // …legacy nested shape
      { "applicant.mobileNumber": re },    // Mobile Number
      { "applicant.mobile": re },          // …legacy field name
    ],
  };
};

/** Build the dealer-scoped filter for a pending list. */
const pendingFilter = (dealerId, statusPath, search) => {
  const clauses = [{ dealer: dealerId }, pendingClause(statusPath)];
  if (search) clauses.push(searchClause(search));
  return { $and: clauses };
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

/** Shape one row of a dealer pending list. */
const toPendingItem = (app) => ({
  id: String(app._id),
  applicationId: String(app._id),
  // The lender's loan number, captured at disbursement. Blank when the record
  // has not been disbursed — never the Form ID, which is a different identifier.
  loanNumber: app?.disbursement?.loanNumber || "",
  customerName: customerName(app),
  mobileNumber: customerMobile(app),
  vehicle: [app?.vehicleDetails?.brandName, app?.vehicleDetails?.modelName]
    .filter(Boolean)
    .join(" "),
  // Phase 7 — carried on the row so the details screen renders everything it
  // shows from this one response. Previously it fetched the whole approved
  // application again just for these three values.
  dealerName: app?.dealerDetails?.name || "",
  branch: branchName(app),
  amount: loanAmount(app),
  approvedAt: app.approvedAt || app.updatedAt || null,
  createdAt: app.createdAt || null,
});

const LIST_FIELDS =
  "formId applicant vehicleDetails dealer dealerDetails branch rcDetails numberPlateDetails disbursement approvedAt createdAt updatedAt";

/* ──────────────────────────── file handling ─────────────────────────────── */

// Canonical field name → accepted aliases (lowercased). The mobile client is
// built in a later phase; accepting the obvious spellings keeps a field-name
// mismatch from becoming an integration failure.
const FIELD_ALIASES = {
  rcFront: ["rcfront", "rcfrontimage", "rc_front", "front"],
  rcBack: ["rcback", "rcbackimage", "rc_back", "back"],
  plateImage: ["plateimage", "numberplateimage", "number_plate_image", "plate", "image"],
};

const pickFile = (files, key) => {
  const names = FIELD_ALIASES[key];
  return (files || []).find((f) => names.includes(String(f.fieldname || "").toLowerCase())) || null;
};

const stagedRel = (file) => `${STAGING_REL}/${file.filename}`;

/** Discard staged files for a request that failed validation. */
const discard = async (files) => {
  for (const f of files || []) await removeRel(stagedRel(f));
};

/**
 * Express middleware: accept the multipart body and surface multer's own
 * validation failures (file too large, unsupported type) as 400s, matching
 * how the existing POST /api/upload route reports them.
 */
export const receiveVehicleFiles = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (!err) return next();
    const isValidation =
      err.code === "LIMIT_FILE_SIZE" || /Unsupported file type/.test(err.message || "");
    console.error("[VEHICLE-UPLOAD] error:", err.message || err);
    return res
      .status(isValidation ? 400 : 500)
      .json({ message: "Upload failed", details: String(err.message || err) });
  });
};

/**
 * Load an approved application for a write, enforcing ownership.
 * Returns { app } or { error: { status, message } }.
 */
async function loadOwnedApplication(applicationId, dealerId) {
  // A malformed id is a client error, not a server fault: without this guard
  // findById raises a CastError and the caller reports 500. Mirrors the same
  // check on the admin endpoints.
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    return { error: { status: 400, message: "Invalid application id." } };
  }

  const app = await ApprovedApplication.findById(applicationId)
    .select(`${LIST_FIELDS} spdcDetails`)
    .lean();

  if (!app) {
    return { error: { status: 404, message: "Approved application not found" } };
  }
  const owner = app.dealer?._id?.toString() || app.dealer?.toString();
  if (owner !== dealerId.toString()) {
    return { error: { status: 403, message: "Access denied" } };
  }
  return { app };
}

/* ───────────────────────────── RC endpoints ─────────────────────────────── */

/**
 * GET /api/rc/pending
 * Approved applications belonging to the logged-in dealer whose RC has not
 * been uploaded. Optional ?search= by Loan Number / Customer Name / Mobile.
 */
export const getRcPending = async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const items = await ApprovedApplication.find(
      pendingFilter(req.user._id, "rcDetails.status", search)
    )
      .select(LIST_FIELDS)
      .sort({ approvedAt: -1, updatedAt: -1 })
      .lean();

    return res.status(200).json(items.map(toPendingItem));
  } catch (err) {
    console.error("getRcPending error:", err);
    return res.status(500).json({ message: "Server error fetching pending RC list" });
  }
};

/**
 * POST /api/rc/upload/:applicationId
 * Multipart: rcFront (required), rcBack (required).
 */
export const uploadRc = async (req, res) => {
  const files = req.files || [];
  try {
    const front = pickFile(files, "rcFront");
    const back = pickFile(files, "rcBack");

    // Validation — BOTH images are required; a partial upload is rejected
    // outright rather than half-stored.
    const missing = [];
    if (!front) missing.push("rcFront");
    if (!back) missing.push("rcBack");
    if (missing.length) {
      await discard(files);
      return res.status(400).json({
        message: "RC front and back images are both required.",
        missing,
      });
    }

    const { app, error } = await loadOwnedApplication(req.params.applicationId, req.user._id);
    if (error) {
      await discard(files);
      return res.status(error.status).json({ message: error.message });
    }

    // Dealers may upload once; corrections are an admin action.
    if (app.rcDetails?.status === UPLOADED) {
      await discard(files);
      return res.status(409).json({
        message: "RC has already been uploaded for this application.",
      });
    }

    // Store the files the same way application documents are stored.
    const frontRel = await moveIntoApp(app.formId, "vehicle", "rc-front", stagedRel(front));
    const backRel = await moveIntoApp(app.formId, "vehicle", "rc-back", stagedRel(back));
    if (!frontRel || !backRel) {
      await discard(files);
      return res.status(500).json({ message: "Could not store the uploaded RC images." });
    }

    const uploadedAt = new Date();

    // timestamps: false — `updatedAt` on an approved record is the approval-time
    // proxy that the Processing Days export falls back to for records predating
    // `approvedAt`. An RC upload must not rewrite it.
    await ApprovedApplication.updateOne(
      { _id: app._id },
      {
        $set: {
          "rcDetails.status": UPLOADED,
          "rcDetails.frontImage": frontRel,
          "rcDetails.backImage": backRel,
          "rcDetails.uploadedAt": uploadedAt,
          "rcDetails.uploadedBy": req.user._id,
        },
      },
      { timestamps: false }
    );

    logEvent("rc_uploaded", {
      applicationId: String(app._id),
      formId: app.formId,
      dealerId: String(req.user._id),
      at: uploadedAt.toISOString(),
    });

    return res.status(200).json({
      message: "RC uploaded successfully",
      applicationId: String(app._id),
      loanNumber: app?.disbursement?.loanNumber || "",
      rcDetails: {
        status: UPLOADED,
        // The stored RELATIVE path. These images are deliberately not served
        // publicly (see server.js), so a public URL here would be a dead link;
        // the admin portal reads them through authenticated /api/files.
        frontImage: frontRel,
        backImage: backRel,
        uploadedAt,
      },
    });
  } catch (err) {
    console.error("uploadRc error:", err);
    await discard(files);
    return res.status(500).json({ message: "Server error uploading RC" });
  }
};

/* ───────────────────────── Number plate endpoints ───────────────────────── */

/**
 * GET /api/number-plate/pending
 * Approved applications belonging to the logged-in dealer whose number plate
 * has not been uploaded. Optional ?search= by Loan Number / Customer / Mobile.
 */
export const getNumberPlatePending = async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const items = await ApprovedApplication.find(
      pendingFilter(req.user._id, "numberPlateDetails.status", search)
    )
      .select(LIST_FIELDS)
      .sort({ approvedAt: -1, updatedAt: -1 })
      .lean();

    return res.status(200).json(items.map(toPendingItem));
  } catch (err) {
    console.error("getNumberPlatePending error:", err);
    return res.status(500).json({ message: "Server error fetching pending number plate list" });
  }
};

/**
 * POST /api/number-plate/upload/:applicationId
 * Multipart: plateImage (required) + body field plateNumber (required).
 */
export const uploadNumberPlate = async (req, res) => {
  const files = req.files || [];
  try {
    const image = pickFile(files, "plateImage");
    // Trimmed, whitespace-collapsed and upper-cased server-side, so the stored
    // value is canonical regardless of what the client sent. No format rule.
    const plateNumber = normalisePlateNumber(req.body?.plateNumber ?? req.body?.numberPlate);

    // Validation — the image and the plate number are BOTH required.
    const missing = [];
    if (!image) missing.push("plateImage");
    if (!plateNumber) missing.push("plateNumber");
    if (missing.length) {
      await discard(files);
      return res.status(400).json({
        message: "Number plate image and plate number are both required.",
        missing,
      });
    }

    const { app, error } = await loadOwnedApplication(req.params.applicationId, req.user._id);
    if (error) {
      await discard(files);
      return res.status(error.status).json({ message: error.message });
    }

    if (app.numberPlateDetails?.status === UPLOADED) {
      await discard(files);
      return res.status(409).json({
        message: "Number plate has already been uploaded for this application.",
      });
    }

    const imageRel = await moveIntoApp(app.formId, "vehicle", "number-plate", stagedRel(image));
    if (!imageRel) {
      await discard(files);
      return res.status(500).json({ message: "Could not store the uploaded number plate image." });
    }

    const uploadedAt = new Date();

    // timestamps: false — see the note in uploadRc().
    await ApprovedApplication.updateOne(
      { _id: app._id },
      {
        $set: {
          "numberPlateDetails.status": UPLOADED,
          "numberPlateDetails.plateNumber": plateNumber,
          "numberPlateDetails.image": imageRel,
          "numberPlateDetails.uploadedAt": uploadedAt,
          "numberPlateDetails.uploadedBy": req.user._id,
        },
      },
      { timestamps: false }
    );

    logEvent("number_plate_uploaded", {
      applicationId: String(app._id),
      formId: app.formId,
      dealerId: String(req.user._id),
      at: uploadedAt.toISOString(),
    });

    return res.status(200).json({
      message: "Number plate uploaded successfully",
      applicationId: String(app._id),
      loanNumber: app?.disbursement?.loanNumber || "",
      numberPlateDetails: {
        status: UPLOADED,
        plateNumber,
        image: imageRel, // stored RELATIVE path — see the note in uploadRc()
        uploadedAt,
      },
    });
  } catch (err) {
    console.error("uploadNumberPlate error:", err);
    await discard(files);
    return res.status(500).json({ message: "Server error uploading number plate" });
  }
};

/* ─────────────────────────────── Dashboard ──────────────────────────────── */

/**
 * GET /api/dashboard/vehicle-counts
 * Pending-only counts for the logged-in dealer.
 */
export const getVehicleCounts = async (req, res) => {
  try {
    const [rcPending, numberPlatePending] = await Promise.all([
      ApprovedApplication.countDocuments({
        $and: [{ dealer: req.user._id }, pendingClause("rcDetails.status")],
      }),
      ApprovedApplication.countDocuments({
        $and: [{ dealer: req.user._id }, pendingClause("numberPlateDetails.status")],
      }),
    ]);

    return res.status(200).json({ rcPending, numberPlatePending });
  } catch (err) {
    console.error("getVehicleCounts error:", err);
    return res.status(500).json({ message: "Server error fetching vehicle counts" });
  }
};
