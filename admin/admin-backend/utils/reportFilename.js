// utils/reportFilename.js
//
// Suggested download filenames for generated reports. Filename only — nothing
// here affects report contents or PDF generation.

// Characters not permitted in filenames on Windows or POSIX.
const ILLEGAL = /[\\/:*?"<>|]/g;
// Control characters, written as an escape so no literal control byte appears.
const CONTROL = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

/**
 * Make a value safe for use as a filename segment:
 *   • strip illegal characters  \ / : * ? " < > |  and control characters
 *   • trim leading / trailing whitespace
 *   • replace remaining whitespace runs with a single underscore
 *   • collapse repeated underscores and trim them from both ends
 * Returns "" when nothing usable remains.
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
