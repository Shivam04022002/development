// models/documentVerificationSchemas.js
//
// Per-document verification state.
//
// Stored as a sibling block rather than by widening `documents.<role>.<field>`,
// because those fields are plain path STRINGS that existing code (the swap
// controller, extractDocuments) copies as-is — turning them into objects would
// break them. This block is keyed the same way (role → field), so it exchanges
// with the parties in one atomic update when applicant and co-applicant swap,
// which is what makes verification follow the person.
//
// Note the read path for the documents themselves is the embedded
// applicant / coApplicant objects, NOT `documents.*` — see the impact analysis.
//
import mongoose from "mongoose";

export const DOC_STATUS = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  REUPLOAD: "Re-upload Requested",
};

export const DOC_STATUSES = Object.values(DOC_STATUS);

/** The document fields each party can carry, and their display labels. */
export const APPLICANT_DOCS = [
  ["photo", "Photograph"],
  ["aadharFront", "Aadhaar Front"],
  ["aadharBack", "Aadhaar Back"],
  ["panImage", "PAN Card"],
];

export const CO_APPLICANT_DOCS = [
  ...APPLICANT_DOCS,
  ["form60", "Form 60"],
];

/**
 * One superseded file. Written when a dealer replaces a document — the previous
 * path is recorded here and the file itself is left on disk untouched, so no
 * version is ever destroyed.
 */
const documentVersionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    path: { type: String, default: "" },
    status: { type: String, default: "" },   // status this version ended in
    remarks: { type: String, default: "" },  // why it was superseded
    actionedBy: { type: String, default: "" },
    replacedAt: { type: Date, default: null },
  },
  { _id: false }
);

/** One document's verification record. Absent = never actioned = Pending. */
const documentStateSchema = new mongoose.Schema(
  {
    status: { type: String, enum: DOC_STATUSES, default: DOC_STATUS.PENDING },
    remarks: { type: String, default: "" },

    // Superseded files, oldest first. Never pruned.
    versions: { type: [documentVersionSchema], default: undefined },
    // The dealer's optional reply when re-uploading.
    dealerResponse: { type: String, default: "" },
    dealerUploadedAt: { type: Date, default: null },

    verifiedBy: { type: String, default: "" },
    verifiedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    verifiedAt: { type: Date, default: null },

    reuploadRequestedBy: { type: String, default: "" },
    reuploadRequestedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    reuploadRequestedAt: { type: Date, default: null },
  },
  { _id: false }
);

const partyDocsSchema = (fields) =>
  new mongoose.Schema(
    Object.fromEntries(fields.map(([f]) => [f, { type: documentStateSchema, default: undefined }])),
    { _id: false }
  );

/**
 * documentVerification — additive, role-keyed, never required.
 * An absent block or field simply means "Pending", so every existing record
 * stays valid with no migration.
 */
export const documentVerification = {
  type: new mongoose.Schema(
    {
      applicant: { type: partyDocsSchema(APPLICANT_DOCS), default: undefined },
      coApplicant: { type: partyDocsSchema(CO_APPLICANT_DOCS), default: undefined },
    },
    { _id: false }
  ),
  default: undefined,
};

export default { documentVerification, DOC_STATUS, DOC_STATUSES, APPLICANT_DOCS, CO_APPLICANT_DOCS };
