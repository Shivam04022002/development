// utils/vehicleDocs.js
//
// RC & Number Plate module — approval-time initialisation of the vehicle
// document sections.
//
// Approving an application copies it into the ApprovedApplication collection
// and deletes the Application document (see workflowController). Both the RC
// and the Number Plate section must therefore exist and read "Pending" from
// the moment of approval, because the dealer's pending lists and vehicle
// counts are driven entirely by rcDetails.status / numberPlateDetails.status.
//
// Initialisation is CARRY-FORWARD, never overwrite. Whatever the source
// document already holds wins: a section that has already been uploaded keeps
// its status, images, timestamp and uploader intact. Only a section that has
// never been uploaded is (re)set to "Pending".
//

const PENDING = "Pending";
const UPLOADED = "Uploaded";

/** Drop keys whose value is undefined so Mongoose applies its own defaults. */
const defined = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));

/**
 * initVehicleDocs(source)
 *
 * Returns { rcDetails, numberPlateDetails, spdcDetails } ready to be spread
 * into the ApprovedApplication constructor at approval time.
 *
 * `source` is the Application document being approved. Fields are read
 * explicitly rather than spread, so this behaves identically whether it is
 * handed a Mongoose document or a plain object.
 */
export function initVehicleDocs(source = {}) {
  const rc = source.rcDetails || {};
  const plate = source.numberPlateDetails || {};
  const spdc = source.spdcDetails || {};

  return {
    rcDetails: defined({
      // An already-uploaded section survives approval untouched.
      status: rc.status === UPLOADED ? UPLOADED : PENDING,
      frontImage: rc.frontImage,
      backImage: rc.backImage,
      uploadedAt: rc.uploadedAt,
      uploadedBy: rc.uploadedBy,
    }),
    numberPlateDetails: defined({
      status: plate.status === UPLOADED ? UPLOADED : PENDING,
      plateNumber: plate.plateNumber,
      image: plate.image,
      uploadedAt: plate.uploadedAt,
      uploadedBy: plate.uploadedBy,
    }),
    // SPDC carries no status — it is admin-maintained and simply carried across.
    spdcDetails: defined({
      number: spdc.number,
      image: spdc.image,
      updatedAt: spdc.updatedAt,
      updatedBy: spdc.updatedBy,
    }),
  };
}

export default { initVehicleDocs };
