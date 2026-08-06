// models/vehicleDocSchemas.js
//
// RC & Number Plate module — the shared shape of the three vehicle-document
// sections. Defined once here and spread into BOTH Application and
// ApprovedApplication, so the two collections can never drift apart.
//
// Why both collections: approving an application copies it into
// ApprovedApplication and deletes the Application document (see
// workflowController). Approved records — the only ones eligible for RC /
// Number Plate upload — therefore live in `approvedApplications`. Keeping the
// definition on Application as well means an in-flight application carries the
// sections forward through approval rather than having them invented there.
//
// These are plain nested-object definitions (not sub-schemas), matching how the
// existing `cibil`, `rejection` and `documents` sections are declared on
// Application: no _id is generated and every field stays addressable as
// "rcDetails.status" in queries and indexes.
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
 * SPDC (Second Party Delivery Challan) — admin-maintained only. There is no
 * dealer-facing write path, so this section carries no upload status: it is
 * either filled in by an admin or empty.
 */
export const spdcDetails = {
  number: String,
  image: String, // relative path under the uploads root
  updatedAt: Date,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
};

export default { UPLOAD_STATUSES, rcDetails, numberPlateDetails, spdcDetails };
