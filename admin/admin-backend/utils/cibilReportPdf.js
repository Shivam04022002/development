// utils/cibilReportPdf.js
//
// Dependency-free multi-page PDF generator for the CIBIL report: standard
// Type1 fonts, no font embedding and no npm package, with multi-page support
// and a monospace appendix so the stored Xaler JSON can be included verbatim.
//
// Nothing is written to disk — generateCibilReportPdf() returns a Buffer.

const PAGE_W = 595; // A4 points
const PAGE_H = 842;
const MARGIN_X = 45;
const TOP_Y = PAGE_H - 55;
const BOTTOM_Y = 50;

// Helvetica ~0.5em average advance; Courier is exactly 0.6em.
const MONO_SIZE = 6.5;
const MONO_LEADING = 8.2;
const MONO_CHARS_PER_LINE = Math.floor((PAGE_W - MARGIN_X * 2) / (MONO_SIZE * 0.6));

// A full TransUnion payload is ~1 MB of pretty JSON — several hundred pages.
// The appendix is capped so the document stays openable; the complete JSON is
// always available unabridged through the Download JSON endpoint.
const MAX_APPENDIX_PAGES = 60;

/** Escape text for a PDF literal string. */
function esc(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");
}

/** Latin-1 is what the standard fonts encode; drop anything outside it. */
function toLatin1(s) {
  return String(s ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

/** Wrap a long monospace line to the page width. */
function wrapMono(line) {
  const out = [];
  let rest = line;
  while (rest.length > MONO_CHARS_PER_LINE) {
    out.push(rest.slice(0, MONO_CHARS_PER_LINE));
    rest = rest.slice(MONO_CHARS_PER_LINE);
  }
  out.push(rest);
  return out;
}

/**
 * Page builder: accumulates text operators and starts a new page when the
 * cursor runs past the bottom margin.
 */
class Doc {
  constructor() {
    this.pages = [];
    this.buf = "";
    this.y = TOP_Y;
  }

  newPage() {
    if (this.buf) this.pages.push(this.buf);
    this.buf = "";
    this.y = TOP_Y;
  }

  /** Draw one line of text; font is "H" (Helvetica) or "M" (Courier). */
  text(str, { size = 10, font = "H", dy = 15, indent = 0 } = {}) {
    if (this.y - dy < BOTTOM_Y) this.newPage();
    const f = font === "M" ? "/F2" : "/F1";
    this.buf +=
      `BT ${f} ${size} Tf 1 0 0 1 ${MARGIN_X + indent} ${this.y} Tm (${esc(toLatin1(str))}) Tj ET\n`;
    this.y -= dy;
  }

  /** Horizontal rule. */
  rule() {
    if (this.y - 8 < BOTTOM_Y) this.newPage();
    this.buf += `0.75 w 0.80 0.80 0.80 RG ${MARGIN_X} ${this.y} m ${PAGE_W - MARGIN_X} ${this.y} l S\n`;
    this.y -= 14;
  }

  gap(n = 8) {
    this.y -= n;
  }

  sectionHeading(title) {
    if (this.y - 40 < BOTTOM_Y) this.newPage();
    this.gap(6);
    this.text(title, { size: 12, dy: 16 });
    this.rule();
  }

  /** Label / value on one line, value right-aligned-ish via a fixed column. */
  field(label, value) {
    const v = value === null || value === undefined || value === "" ? "N/A" : String(value);
    if (this.y - 15 < BOTTOM_Y) this.newPage();
    this.buf +=
      `BT /F1 9.5 Tf 1 0 0 1 ${MARGIN_X} ${this.y} Tm (${esc(toLatin1(label))}) Tj ET\n` +
      `BT /F1 9.5 Tf 1 0 0 1 ${MARGIN_X + 190} ${this.y} Tm (${esc(toLatin1(v))}) Tj ET\n`;
    this.y -= 15;
  }

  finish() {
    if (this.buf) this.pages.push(this.buf);
    if (this.pages.length === 0) this.pages.push("");
    return this.pages;
  }
}

/** Assemble page content streams into a valid PDF Buffer. */
function assemble(pages) {
  const objects = [];
  const pageCount = pages.length;

  // 1 catalog, 2 pages tree, then per page: page object + content object,
  // then the two fonts.
  const firstPageObj = 3;
  const kids = [];
  for (let i = 0; i < pageCount; i++) kids.push(`${firstPageObj + i * 2} 0 R`);
  const fontHelv = firstPageObj + pageCount * 2;
  const fontCour = fontHelv + 1;

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`;

  pages.forEach((content, i) => {
    const pageIdx = firstPageObj + i * 2;
    const contentIdx = pageIdx + 1;
    objects[pageIdx - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontHelv} 0 R /F2 ${fontCour} 0 R >> >> ` +
      `/Contents ${contentIdx} 0 R >>`;
    const bytes = Buffer.from(content, "latin1");
    objects[contentIdx - 1] = `<< /Length ${bytes.length} >>\nstream\n${content}\nendstream`;
  });

  objects[fontHelv - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[fontCour - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefPos = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  });
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

/** Read a value from anywhere in the JSON tree by key name (first match). */
function deepGet(node, keys, depth = 0) {
  if (depth > 16 || node === null || node === undefined) return undefined;
  if (Array.isArray(node)) {
    for (const v of node) {
      const hit = deepGet(v, keys, depth + 1);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (keys.includes(String(k).toLowerCase()) && (v === null || typeof v !== "object")) {
        if (v !== null && v !== undefined && v !== "") return v;
      }
    }
    for (const v of Object.values(node)) {
      const hit = deepGet(v, keys, depth + 1);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

/** Count TrueLink account entries by open/closed, tolerating a missing tree. */
function accountTotals(raw) {
  let total = 0;
  let open = 0;
  let closed = 0;
  const visit = (node, depth = 0) => {
    if (depth > 16 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    for (const [k, v] of Object.entries(node)) {
      if (/^tradeline$/i.test(k) || /^account$/i.test(k)) {
        const arr = Array.isArray(v) ? v : [v];
        arr.forEach((a) => {
          if (!a || typeof a !== "object") return;
          total += 1;
          const status = String(a.OpenClosed ?? a.openClosed ?? a.AccountStatus ?? "").toLowerCase();
          if (status.startsWith("c")) closed += 1;
          else open += 1;
        });
      }
      visit(v, depth + 1);
    }
  };
  visit(raw);
  return { total: total || null, open: open || null, closed: closed || null };
}

/**
 * generateCibilReportPdf({ app, cibil, raw })
 *   app   — Application document (formId, applicant, ...)
 *   cibil — the stored summary { score, status, reportDate, requestId }
 *   raw   — the complete stored Xaler JSON (source of truth)
 * Returns a Buffer. Nothing is written to disk.
 */
export function generateCibilReportPdf({ app = {}, cibil = {}, raw = null } = {}) {
  const applicant = app?.applicant?.applicant || app?.applicant || {};
  const name =
    applicant.name ||
    `${applicant.firstName || ""} ${applicant.surname || ""}`.trim() ||
    "N/A";

  const d = new Doc();

  // ── Header ────────────────────────────────────────────────────────────
  d.text("SURJIT FINANCE", { size: 18, dy: 22 });
  d.text("CIBIL REPORT", { size: 13, dy: 18 });
  d.rule();

  d.field("Application No", app.formId || app._id);
  d.field("Applicant Name", name);
  d.field("PAN", applicant.panNo || applicant.pan);
  d.field("Mobile", applicant.mobileNumber || applicant.mobile);
  d.field("Generated Date", new Date().toISOString().slice(0, 10));

  // ── CIBIL summary ─────────────────────────────────────────────────────
  d.sectionHeading("CIBIL Summary");
  d.field("Score", cibil.score);
  d.field("Status", cibil.status || cibil.state);
  d.field("Report Date", cibil.reportDate);
  d.field("Request ID", cibil.requestId);

  // ── Credit summary (best-effort extraction from the stored JSON) ───────
  d.sectionHeading("Credit Summary");
  const accounts = accountTotals(raw);
  d.field("Credit Score", deepGet(raw, ["riskscore"]) ?? cibil.score);
  d.field("Credit Utilization", deepGet(raw, ["creditcardutilization"]));
  d.field("Credit Mix", deepGet(raw, ["creditmix"]));
  d.field("On Time Payment History", deepGet(raw, ["ontimepaymenthistory"]));
  d.field("Oldest Account", deepGet(raw, ["oldestcreditaccountperiod"]));
  d.field("Enquiries", deepGet(raw, ["inquires", "inquiries", "enquiries"]));
  d.field("DPD", deepGet(raw, ["dpd", "daringpastdue", "dayspastdue"]));
  d.field("Total Accounts", accounts.total);
  d.field("Open Accounts", accounts.open);
  d.field("Closed Accounts", accounts.closed);
  d.field("Write Off", deepGet(raw, ["writeoff", "writtenoff"]));
  d.field("Suit Filed", deepGet(raw, ["suitfiled", "suitfilled"]));
  d.field("Outstanding", deepGet(raw, ["totaloutstanding", "outstanding", "currentbalance"]));

  // ── Raw JSON appendix ─────────────────────────────────────────────────
  d.newPage();
  d.text("Raw CIBIL Response (Appendix)", { size: 12, dy: 16 });
  d.rule();

  if (raw === null || raw === undefined) {
    d.text("No stored JSON available.", { size: 9 });
  } else {
    let pretty;
    try {
      pretty = JSON.stringify(raw, null, 2);
    } catch {
      pretty = String(raw);
    }
    const startPages = d.pages.length;
    let truncated = false;
    for (const line of pretty.split("\n")) {
      if (d.pages.length - startPages >= MAX_APPENDIX_PAGES) {
        truncated = true;
        break;
      }
      for (const chunk of wrapMono(line)) {
        d.text(chunk, { size: MONO_SIZE, font: "M", dy: MONO_LEADING });
      }
    }
    if (truncated) {
      d.gap(10);
      d.text(
        "-- Appendix truncated. Use Download JSON for the complete response. --",
        { size: 9 }
      );
    }
  }

  return assemble(d.finish());
}

export default { generateCibilReportPdf };
