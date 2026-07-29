// controllers/cibilReportController.js
//
// Read-only viewing of the stored CIBIL response. The JSON held in
// CibilReport.rawResponse is the source of truth; PDFs are generated in memory
// on every request and never written to disk.
//
// Does not touch the Xaler integration, score parsing, or workflow.
//
import fs from "fs/promises";
import Application from "../models/Application.js";
import ApprovedApplication from "../models/ApprovedApplication.js";
import RejectedApplication from "../models/RejectedApplication.js";
import CibilReport from "../models/CibilReport.js";
import { generateCibilReportPdf } from "../utils/cibilReportPdf.js";
import { buildReportModel } from "../utils/cibilReportData.js";
import { absFromRel } from "../utils/fileStorage.js";
import { logError } from "../utils/log.js";

const NOT_AVAILABLE = { success: false, message: "CIBIL data not available." };

/** The application may have moved to the approved / rejected collection. */
async function findApplication(applicationId) {
  return (
    (await Application.findById(applicationId).lean()) ||
    (await ApprovedApplication.findById(applicationId).lean()) ||
    (await RejectedApplication.findById(applicationId).lean()) ||
    null
  );
}

/**
 * Load the stored response. Prefers the Mongo copy; older records that predate
 * Mongo storage keep the JSON as a file, so fall back to rawResponsePath.
 */
async function loadRawResponse(applicationId) {
  const report = await CibilReport.findOne({ applicationId }).lean();
  if (!report) return { report: null, raw: null };

  if (report.rawResponse !== null && report.rawResponse !== undefined) {
    return { report, raw: report.rawResponse };
  }

  if (report.rawResponsePath) {
    try {
      const text = await fs.readFile(absFromRel(report.rawResponsePath), "utf8");
      return { report, raw: JSON.parse(text) };
    } catch (err) {
      logError("cibil_raw_file_read_failed", {
        applicationId: String(applicationId),
        path: report.rawResponsePath,
        error: err?.message,
      });
    }
  }
  return { report, raw: null };
}

/** GET /api/cibil/:applicationId/json — the stored response, verbatim. */
export const getCibilJson = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const app = await findApplication(applicationId);
    if (!app) return res.status(404).json(NOT_AVAILABLE);

    const { raw } = await loadRawResponse(applicationId);
    if (raw === null) return res.status(404).json(NOT_AVAILABLE);

    return res.json({
      success: true,
      formId: app.formId || String(app._id),
      cibil: app.cibil || {},
      rawResponse: raw,
    });
  } catch (err) {
    logError("cibil_json_failed", { error: err?.message });
    return res.status(500).json({ success: false, message: "Failed to load CIBIL data." });
  }
};

/**
 * GET /api/cibil/:applicationId/model — the NORMALISED report model.
 * Same auth and same underlying data as /json; the renderer consumes this so
 * it never has to touch the raw vendor payload. Also returns the bureau status
 * message for a failed flow, which the model itself does not carry.
 */
export const getCibilModel = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const app = await findApplication(applicationId);
    if (!app) return res.status(404).json(NOT_AVAILABLE);

    const { raw } = await loadRawResponse(applicationId);
    if (raw === null) return res.status(404).json(NOT_AVAILABLE);

    const model = buildReportModel({ app, cibil: app.cibil || {}, raw });
    const statusMessage =
      raw && typeof raw === "object" && raw.status !== "success" && typeof raw.message === "string"
        ? raw.message
        : null;

    return res.json({ success: true, model, statusMessage });
  } catch (err) {
    logError("cibil_model_failed", { applicationId: req.params?.applicationId, error: err?.message });
    return res.status(500).json({ success: false, message: "Failed to build CIBIL report model." });
  }
};

/** Shared PDF path for inline viewing and attachment download. */
async function streamPdf(req, res, disposition) {
  const { applicationId } = req.params;
  const app = await findApplication(applicationId);
  if (!app) return res.status(404).json(NOT_AVAILABLE);

  const { raw } = await loadRawResponse(applicationId);
  if (raw === null) return res.status(404).json(NOT_AVAILABLE);

  const formId = app.formId || String(app._id);
  const pdf = generateCibilReportPdf({ app, cibil: app.cibil || {}, raw });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", pdf.length);
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${formId}-CIBIL-Report.pdf"`
  );
  return res.status(200).send(pdf);
}

/** GET /api/cibil/:applicationId/pdf — generated in memory, shown inline. */
export const viewCibilPdf = async (req, res) => {
  try {
    return await streamPdf(req, res, "inline");
  } catch (err) {
    logError("cibil_pdf_failed", { applicationId: req.params?.applicationId, error: err?.message, stack: err?.stack });
    return res.status(500).json({ success: false, message: "Failed to generate CIBIL PDF." });
  }
};

/** GET /api/cibil/:applicationId/pdf/download — same PDF as an attachment. */
export const downloadCibilPdf = async (req, res) => {
  try {
    return await streamPdf(req, res, "attachment");
  } catch (err) {
    logError("cibil_pdf_download_failed", { applicationId: req.params?.applicationId, error: err?.message, stack: err?.stack });
    return res.status(500).json({ success: false, message: "Failed to generate CIBIL PDF." });
  }
};

export default { getCibilJson, getCibilModel, viewCibilPdf, downloadCibilPdf };
