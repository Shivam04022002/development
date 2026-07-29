// controllers/underwritingReportController.js
//
// Read-only access to the normalised Credit Underwriting model.
//
// Deliberately separate from creditNoteController.js so the production Credit
// Note flow (save + PDF + workflow advance) is not touched. This controller
// only reads; it never writes, never generates a PDF, and never changes a
// workflow stage.
//
import fs from "fs/promises";
import Application from "../models/Application.js";
import ApprovedApplication from "../models/ApprovedApplication.js";
import RejectedApplication from "../models/RejectedApplication.js";
import CreditNote from "../models/CreditNote.js";
import CibilReport from "../models/CibilReport.js";
import { buildUnderwritingModel } from "../utils/creditUnderwritingData.js";
import { absFromRel } from "../utils/fileStorage.js";
import { logError } from "../utils/log.js";

const NOT_FOUND = { success: false, message: "Application not available." };

/** The application may have moved to the approved / rejected collection. */
async function findApplication(applicationId) {
  return (
    (await Application.findById(applicationId).lean()) ||
    (await ApprovedApplication.findById(applicationId).lean()) ||
    (await RejectedApplication.findById(applicationId).lean()) ||
    null
  );
}

/** Stored bureau response: Mongo copy first, then the on-disk fallback. */
async function loadRawResponse(applicationId) {
  const report = await CibilReport.findOne({ applicationId }).lean();
  if (!report) return null;
  if (report.rawResponse !== null && report.rawResponse !== undefined) return report.rawResponse;
  if (report.rawResponsePath) {
    try {
      return JSON.parse(await fs.readFile(absFromRel(report.rawResponsePath), "utf8"));
    } catch (err) {
      logError("underwriting_raw_read_failed", {
        applicationId: String(applicationId), error: err?.message,
      });
    }
  }
  return null;
}

/**
 * GET /api/underwriting/:applicationId/model
 * Returns the normalised underwriting model. Bureau data and the credit note
 * are both optional — the model renders "Not Available" where absent.
 */
export const getUnderwritingModel = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const app = await findApplication(applicationId);
    if (!app) return res.status(404).json(NOT_FOUND);

    const [creditNote, raw] = await Promise.all([
      CreditNote.findOne({ applicationId }).lean(),
      loadRawResponse(applicationId),
    ]);

    const model = buildUnderwritingModel({ app, creditNote: creditNote || null, raw });
    return res.json({
      success: true,
      model,
      // Surfaced so the QA page can offer the existing production PDF for
      // side-by-side comparison; this endpoint does not generate one.
      existingPdfPath: creditNote?.pdfPath || null,
    });
  } catch (err) {
    logError("underwriting_model_failed", {
      applicationId: req.params?.applicationId, error: err?.message,
    });
    return res.status(500).json({ success: false, message: "Failed to build the underwriting model." });
  }
};

export default { getUnderwritingModel };
