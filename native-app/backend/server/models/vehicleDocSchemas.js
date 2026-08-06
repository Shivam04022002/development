// models/vehicleDocSchemas.js
//
// RC & Number Plate module — the shared shape of the three vehicle-document
// sections, mirroring admin-backend/models/vehicleDocSchemas.js field for
// field. Both backends read and write the same `approvedApplications`
// collection, so the two definitions MUST stay identical: a field missing here
// would be silently stripped from a dealer upload by Mongoose strict mode.
//
// (The two backends are separate services with separate node_modules and no
// shared package, so this file is duplicated the same way utils/fileStorage.js
// and utils/log.js already are.)
//
import mongoose from "mongoose";

/** The only two upload states a section can be in. */
export const UPLOAD_STATUSES = ["Pending", "Uploaded"];

/** Dealer-uploaded Registration Certificate — front and back images. */
export const rcDetails = {
  status: { type: String, enum: UPLOAD_STATUSES, default: "Pending" },
  frontImage: String, // relative path under the uploads root
  backImage: String,  // relative path under the uploads root
  uploadedAt: Date,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
};

/** Dealer-uploaded number plate — the plate number and one photo. */
export const numberPlateDetails = {
  status: { type: String, enum: UPLOAD_STATUSES, default: "Pending" },
  plateNumber: String,
  image: String, // relative path under the uploads root
  uploadedAt: Date,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
};

/**
 * SPDC (Second Party Delivery Challan) — admin-maintained only. Declared here
 * so the field survives any write from this backend; there is no dealer-facing
 * write path for it. `updatedBy` references the Admin model, which this
 * backend does not register — the reference is stored but never populated here.
 */
export const spdcDetails = {
  number: String,
  image: String, // relative path under the uploads root
  updatedAt: Date,
  updatedBy: mongoose.Schema.Types.ObjectId,
};

export default { UPLOAD_STATUSES, rcDetails, numberPlateDetails, spdcDetails };
