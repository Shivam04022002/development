// controllers/creditNoteController.js
//
// Phase 5B — Credit Note module. The final step of the Pending CIBIL stage.
// Only staff with the "pending_cibil" permission (or superadmin) may complete it.
//
import CreditNote from "../models/CreditNote.js";
import Application from "../models/Application.js";
import { createHistoryEntry } from "./formTrackingController.js";
import { normalizeWorkflows } from "../utils/workflowConstants.js";
import { generateCreditNotePdf } from "../utils/creditNotePdf.js";
import { creditNoteFilename } from "../utils/reportFilename.js";
import { writeAppFile } from "../utils/fileStorage.js";
import { logEvent } from "../utils/log.js";

const PENDING_CIBIL_STAGE = "pending_cibil";
const CONTACT_CREATION_STAGE = "contact creation"; // canonical existing stage value

/** Staff may complete this step only if they hold the Pending CIBIL permission. */
function hasPendingCibilPermission(admin) {
  if (!admin) return false;
  if (admin.role === "superadmin") return true;
  return normalizeWorkflows(admin.workflows || []).includes(PENDING_CIBIL_STAGE);
}

/** Safe folder name from a formId (fallback to the application id). */
function safeFolder(name) {
  return String(name || "").replace(/[^A-Za-z0-9_-]/g, "_") || "unknown";
}

const applicantOf = (app) => app?.applicant?.applicant || app?.applicant || {};
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/**
 * GET /api/credit-notes/:applicationId
 * Returns prefill data from the Application plus any previously saved Credit Note.
 */
export const getCreditNote = async (req, res) => {
  try {
    const app = await Application.findById(req.params.applicationId).lean();
    if (!app) return res.status(404).json({ error: "Application not found" });

    const applicant = applicantOf(app);
    const prefill = {
      customerName: applicant.name || "",
      houseAddress: applicant.address || "",
      cibilScore: typeof app.cibil?.score === "number" ? app.cibil.score : null,
    };

    const existing = await CreditNote.findOne({ applicationId: app._id }).lean();
    return res.json({ prefill, creditNote: existing || null });
  } catch (err) {
    console.error("getCreditNote error:", err?.message || err);
    return res.status(500).json({ error: "Failed to load credit note" });
  }
};

/**
 * POST /api/credit-notes/:applicationId  (Update & Download)
 * Saves the Credit Note, generates + stores the PDF, advances the workflowStage
 * pending_cibil → contact creation (status stays "pending"), records history,
 * and returns the PDF for download.
 */
export const completeCreditNote = async (req, res) => {
  try {
    if (!hasPendingCibilPermission(req.admin)) {
      return res.status(403).json({ error: "Pending CIBIL permission required" });
    }

    const app = await Application.findById(req.params.applicationId);
    if (!app) return res.status(404).json({ error: "Application not found" });

    if (app.workflowStage !== PENDING_CIBIL_STAGE) {
      return res.status(400).json({ error: "Application is not at the Pending CIBIL stage" });
    }

    const applicant = applicantOf(app.toObject());
    const staffName = req.admin?.name || req.admin?.email || "Staff";

    // Auto-populated fields (from Application) + staff-entered fields (from body).
    const b = req.body || {};
    const payload = {
      applicationId: app._id,
      customerName: applicant.name || "",
      houseAddress: applicant.address || "",
      cibilScore: typeof app.cibil?.score === "number" ? app.cibil.score : null,
      dpdDays: num(b.dpdDays),
      enquiryCount: num(b.enquiryCount),
      suitFiled: b.suitFiled === "Yes" ? "Yes" : "No",
      writeOff: b.writeOff === "Yes" ? "Yes" : "No",
      totalOverdue: num(b.totalOverdue),
      totalEmiAmount: num(b.totalEmiAmount),
      totalEmiCount: num(b.totalEmiCount),
      distanceFromBranch: num(b.distanceFromBranch),
      updatedBy: staffName,
    };

    // 1) Save the Credit Note (upsert; set createdBy only on first insert).
    const creditNote = await CreditNote.findOneAndUpdate(
      { applicationId: app._id },
      { $set: payload, $setOnInsert: { createdBy: staffName } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 2) Generate the PDF.
    const folder = safeFolder(app.formId || String(app._id));
    const pdfBuffer = generateCreditNotePdf({
      title: "Credit Note",
      subtitle: `Application: ${app.formId || app._id}`,
      rows: [
        { label: "Customer Name", value: creditNote.customerName },
        { label: "House Address", value: creditNote.houseAddress },
        { label: "CIBIL Score", value: creditNote.cibilScore },
        { label: "DPD Days", value: creditNote.dpdDays },
        { label: "Enquiry Count", value: creditNote.enquiryCount },
        { label: "Suit Filed", value: creditNote.suitFiled },
        { label: "Write Off", value: creditNote.writeOff },
        { label: "Total Overdue", value: creditNote.totalOverdue },
        { label: "Total EMI Amount", value: creditNote.totalEmiAmount },
        { label: "Total EMI Count", value: creditNote.totalEmiCount },
        { label: "Distance From Branch", value: creditNote.distanceFromBranch },
        { label: "Prepared By", value: staffName },
        { label: "Date", value: new Date().toLocaleString() },
      ],
    });

    // 3) Store the PDF in the application folder:
    //    uploads/applications/<APPNO>/credit-note.pdf  (relative path saved).
    const pdfRel = await writeAppFile(app.formId || String(app._id), "credit-note.pdf", pdfBuffer);
    await CreditNote.updateOne({ _id: creditNote._id }, { $set: { pdfPath: pdfRel } });

    // 5) Advance workflowStage pending_cibil → contact creation (status stays pending).
    app.workflowStage = CONTACT_CREATION_STAGE;
    await app.save();

    // 6) Application History — Credit Note Completed (performedBy = current staff).
    await createHistoryEntry({
      applicationId: app._id,
      formId: app.formId,
      actionType: "STAGE_CHANGED",
      oldValue: PENDING_CIBIL_STAGE,
      newValue: CONTACT_CREATION_STAGE,
      remarks: "Credit Note Completed",
      updatedBy: staffName,
      updatedByEmail: req.admin?.email || "",
      updatedByRole: req.admin?.role || "admin",
      updatedByAdminId: req.admin?._id || req.admin?.id || null,
    });

    logEvent("credit_note_completed", { applicationId: String(app._id), formId: app.formId, by: staffName });
    logEvent("workflow_changed", { applicationId: String(app._id), formId: app.formId, from: PENDING_CIBIL_STAGE, to: CONTACT_CREATION_STAGE, by: staffName });

    // 4) Download the PDF.
    res.setHeader("Content-Type", "application/pdf");
    // Suggested download name only — the PDF itself is unchanged.
    const downloadName = creditNoteFilename({
      customerName: payload.customerName,
      applicationNo: app.formId || String(app._id),
    });
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("completeCreditNote error:", err?.message || err);
    return res.status(500).json({ error: "Failed to complete credit note" });
  }
};

export default { getCreditNote, completeCreditNote };
