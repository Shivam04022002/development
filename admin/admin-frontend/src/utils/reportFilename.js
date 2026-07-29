// src/utils/reportFilename.js
//
// Suggested download filenames for generated reports. Mirrors
// admin-backend/utils/reportFilename.js so the browser download, the
// server Content-Disposition header and Save-as-PDF all agree.
// Filename only — nothing here affects report contents.

const ILLEGAL = /[\\/:*?"<>|]/g;
const CONTROL = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

/**
 * Make a value safe for use as a filename segment: strip illegal and control
 * characters, trim, turn whitespace runs into single underscores, then
 * collapse and trim underscores. Returns "" when nothing usable remains.
 */
export function sanitizeFilenamePart(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(ILLEGAL, "")
    .replace(CONTROL, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Credit Note download filename.
 *   Credit_Note-<Customer_Name>.pdf
 *   Credit_Note-Application_<ApplicationNumber>.pdf   (no customer name)
 *   Credit_Note.pdf                                   (neither available)
 */
export function creditNoteFilename({ customerName, applicationNo } = {}) {
  const name = sanitizeFilenamePart(customerName);
  if (name) return `Credit_Note-${name}.pdf`;

  const appNo = sanitizeFilenamePart(applicationNo);
  if (appNo) return `Credit_Note-Application_${appNo}.pdf`;

  return "Credit_Note.pdf";
}

export default { sanitizeFilenamePart, creditNoteFilename };
