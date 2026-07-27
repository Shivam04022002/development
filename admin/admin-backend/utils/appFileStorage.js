// utils/appFileStorage.js
//
// Phase 7 — organize an application's uploaded documents into
// uploads/applications/<ApplicationNumber>/... and rewrite the embedded fields
// to RELATIVE paths (never absolute). Legacy remote URLs (e.g. old Cloudinary
// links) and empty fields are left untouched, so existing applications keep
// working without any UI change.
//
import { toLocalRel, moveIntoApp } from "./fileStorage.js";

// [object key, field, folder category, canonical base name]
const APPLICANT_MAP = [
  ["photo", "applicant", "selfie"],
  ["aadharFront", "applicant", "aadhaar-front"],
  ["aadharBack", "applicant", "aadhaar-back"],
  ["panImage", "applicant", "pan"],
];
const COAPPLICANT_MAP = [
  ["photo", "co-applicant", "selfie"],
  ["aadharFront", "co-applicant", "aadhaar-front"],
  ["aadharBack", "co-applicant", "aadhaar-back"],
  ["panImage", "co-applicant", "pan"],
  ["form60", "co-applicant", "form60"],
];
const VEHICLE_MAP = [
  ["vehiclePhoto", "vehicle", "vehicle-photo"],
  ["vehicleImage", "vehicle", "vehicle-image"],
];

async function organizeGroup(formId, obj, map) {
  if (!obj || typeof obj !== "object") return;
  for (const [field, category, baseName] of map) {
    const rel = toLocalRel(obj[field]);
    if (!rel) continue; // empty or legacy-remote → leave as-is
    const newRel = await moveIntoApp(formId, category, baseName, rel);
    if (newRel) obj[field] = newRel; // store RELATIVE path only
  }
}

/**
 * organizeApplicationFiles(formId, { applicant, coApplicant, vehicleDetails })
 * Mutates the embedded objects in place. Never throws (best-effort per file).
 */
export async function organizeApplicationFiles(formId, { applicant, coApplicant, vehicleDetails }) {
  await organizeGroup(formId, applicant, APPLICANT_MAP);
  await organizeGroup(formId, coApplicant, COAPPLICANT_MAP);
  await organizeGroup(formId, vehicleDetails, VEHICLE_MAP);
}

export default { organizeApplicationFiles };
