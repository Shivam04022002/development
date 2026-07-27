// utils/creditNotePdf.js
//
// Dependency-free PDF generator for the Credit Note. Produces a single-page A4
// PDF (Helvetica, one of the 14 standard fonts — no font embedding needed) as a
// Buffer. Kept dependency-free on purpose so the admin backend gains no new npm
// package for this one document.
//
// Not a general PDF library — it lays out a title plus label/value rows, which
// is all the Credit Note needs.

/** Escape text for a PDF literal string. */
function esc(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");
}

/**
 * generateCreditNotePdf({ title, subtitle, rows })
 *   rows: [{ label, value }]
 * Returns a Buffer containing a valid PDF.
 */
export function generateCreditNotePdf({ title = "Credit Note", subtitle = "", rows = [] }) {
  // ── Build the content stream ───────────────────────────────────────────
  let content = "";
  content += "BT\n";
  content += "/F1 20 Tf\n";
  content += "50 790 Td\n";
  content += `(${esc(title)}) Tj\n`;

  if (subtitle) {
    content += "/F1 11 Tf\n";
    content += "0 -22 Td\n";
    content += `(${esc(subtitle)}) Tj\n`;
    content += "0 -28 Td\n";
  } else {
    content += "0 -40 Td\n";
  }

  // Field rows: label (bold-ish via size) + value on the same line.
  content += "/F1 12 Tf\n";
  for (const { label, value } of rows) {
    const line = `${label}:  ${value === null || value === undefined || value === "" ? "-" : value}`;
    content += `(${esc(line)}) Tj\n`;
    content += "0 -22 Td\n";
  }
  content += "ET";

  const contentBytes = Buffer.from(content, "latin1");

  // ── Assemble PDF objects ───────────────────────────────────────────────
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

export default { generateCreditNotePdf };
