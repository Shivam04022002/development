// models/documentVerificationSchemas.js
//
// Mirror of admin-backend/models/documentVerificationSchemas.js, field for
// field. Both services write the same `applications` / `approvedApplications`
// documents, and Mongoose strict mode SILENTLY DROPS unknown paths from an
// update — so a field missing here would make a dealer's write a no-op.
//
// (Duplicated the same way utils/fileStorage.js and vehicleDocSchemas.js
// already are: separate services, separate node_modules, no shared package.)
//
import mongoose from "mongoose";

export const DOC_STATUS = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  REUPLOAD: "Re-upload Requested",
};

export const DOC_STATUSES = Object.values(DOC_STATUS);

export const APPLICANT_DOCS = [
  ["photo", "Photograph"],
  ["aadharFront", "Aadhaar Front"],
  ["aadharBack", "Aadhaar Back"],
  ["panImage", "PAN Card"],
];

export const CO_APPLICANT_DOCS = [...APPLICANT_DOCS, ["form60", "Form 60"]];

const documentVersionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    path: { type: String, default: "" },
    status: { type: String, default: "" },
    remarks: { type: String, default: "" },
    actionedBy: { type: String, default: "" },
    replacedAt: { type: Date, default: null },
  },
  { _id: false }
);

const documentStateSchema = new mongoose.Schema(
  {
    status: { type: String, enum: DOC_STATUSES, default: DOC_STATUS.PENDING },
    remarks: { type: String, default: "" },

    versions: { type: [documentVersionSchema], default: undefined },
    dealerResponse: { type: String, default: "" },
    dealerUploadedAt: { type: Date, default: null },

    verifiedBy: { type: String, default: "" },
    verifiedByAdminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    verifiedAt: { type: Date, default: null },

    reuploadRequestedBy: { type: String, default: "" },
    reuploadRequestedByAdminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reuploadRequestedAt: { type: Date, default: null },
  },
  { _id: false }
);

const partyDocsSchema = (fields) =>
  new mongoose.Schema(
    Object.fromEntries(fields.map(([f]) => [f, { type: documentStateSchema, default: undefined }])),
    { _id: false }
  );

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
