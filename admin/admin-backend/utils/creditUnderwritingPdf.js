// utils/creditUnderwritingPdf.js
//
// Server-side PDF for the Credit Underwriting Decision Report.
//
// Renders the SAME normalised model as the React renderer
// (components/underwriting/CreditUnderwritingReport.jsx) and follows the same
// design language: navy section bands, label/value tables, a coloured decision
// block, A4 portrait with automatic page breaks and a footer on every page.
//
// Dependency-free, like utils/cibilReportPdf.js — the admin backend has no
// headless browser and no PDF library, so the React component cannot be
// rasterised on the server. This module is the server-side implementation of
// that same design, driven by the identical model so the two cannot drift on
// content.
//
// Presentation only: no business logic, no decisions, no calculations.

const PAGE_W = 595; // A4
const PAGE_H = 842;
const MX = 45; // side margin
const TOP_Y = PAGE_H - 50;
const BOTTOM_Y = 58;
const CONTENT_W = PAGE_W - MX * 2;

const NAVY = [0.043, 0.122, 0.302]; // #0B1F4D
const AMBER = [0.961, 0.62, 0.043]; // #F59E0B
const GREY = [0.39, 0.45, 0.55];
const LINE = [0.84, 0.87, 0.91];
const BAND = [0.945, 0.961, 0.976];
const GREEN = [0.086, 0.639, 0.29];
const RED = [0.937, 0.267, 0.267];
const SLATE = [0.28, 0.33, 0.41];

/** Escape a PDF literal string. */
const esc = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");

/** The standard fonts encode Latin-1; drop anything outside it. */
const lat1 = (s) => String(s ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

/** Approximate Helvetica width, in points, for wrapping. */
const widthOf = (s, size) => String(s ?? "").length * size * 0.5;

/** Wrap text to a pixel width, on word boundaries. */
function wrap(str, size, maxW) {
  const words = String(str ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const out = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (widthOf(next, size) > maxW && line) {
      out.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out;
}

const dash = (v) => (v === null || v === undefined || v === "" ? "Not Available" : String(v));

/** Indian digit grouping, matching the renderer's money() helper. */
function money(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "Not Available";
  const i = String(Math.round(Number(n)));
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3);
  return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
}

/** Page builder: text/rect primitives plus automatic page breaks. */
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

  need(h) {
    if (this.y - h < BOTTOM_Y) this.newPage();
  }

  rect(x, y, w, h, rgb) {
    this.buf += `${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x} ${y} ${w} ${h} re f\n`;
  }

  line(x1, y1, x2, y2, rgb = LINE, w = 0.7) {
    this.buf += `${w} w ${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${x1} ${y1} m ${x2} ${y2} l S\n`;
  }

  /** Draw one line of text at an absolute position. */
  at(x, y, str, { size = 9.5, bold = false, rgb = [0, 0, 0] } = {}) {
    const f = bold ? "/F2" : "/F1";
    this.buf +=
      `BT ${f} ${size} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg 1 0 0 1 ${x} ${y} Tm (${esc(lat1(str))}) Tj ET\n`;
  }

  /** Navy section band, like the renderer's cr-h2. */
  section(title, note = "") {
    this.need(40);
    this.y -= 6;
    this.rect(MX, this.y - 14, CONTENT_W, 17, NAVY);
    this.at(MX + 7, this.y - 9, String(title).toUpperCase(), { size: 9.5, bold: true, rgb: [1, 1, 1] });
    if (note) {
      this.at(PAGE_W - MX - 7 - widthOf(note, 8), this.y - 9, note, { size: 8, rgb: [0.85, 0.88, 0.93] });
    }
    this.y -= 26;
  }

  subheading(title) {
    this.need(22);
    this.at(MX, this.y, String(title).toUpperCase(), { size: 8.5, bold: true, rgb: NAVY });
    this.y -= 13;
  }

  /** Label / value row. `col` 0 = left half, 1 = right half, undefined = full. */
  kv(label, value, col) {
    const half = (CONTENT_W - 16) / 2;
    const x = col === 1 ? MX + half + 16 : MX;
    const w = col === undefined ? CONTENT_W : half;
    const labelW = col === undefined ? 150 : half * 0.52;
    if (col !== 1) this.need(15);
    const lines = wrap(dash(value), 9, w - labelW - 4);
    this.at(x, this.y, label, { size: 9, rgb: GREY });
    lines.forEach((ln, i) => this.at(x + labelW, this.y - i * 11, ln, { size: 9, bold: true }));
    if (col !== 0) this.y -= 14 + (lines.length - 1) * 11;
    return lines.length;
  }

  /** Two-column block of [label, value] pairs. */
  kvGrid(rows) {
    for (let i = 0; i < rows.length; i += 2) {
      const a = rows[i];
      const b = rows[i + 1];
      const beforeY = this.y;
      this.need(16);
      this.kv(a[0], a[1], 0);
      if (b) this.kv(b[0], b[1], 1);
      else this.y -= 14;
      if (this.y === beforeY) this.y -= 14;
    }
  }

  /** Simple table with a shaded header row; repeats the header on a new page. */
  table(head, rows, widths) {
    const draw = () => {
      this.need(24);
      this.rect(MX, this.y - 12, CONTENT_W, 15, BAND);
      let x = MX + 5;
      head.forEach((h, i) => {
        this.at(x, this.y - 8, String(h).toUpperCase(), { size: 8, bold: true, rgb: SLATE });
        x += widths[i];
      });
      this.y -= 19;
    };
    draw();
    for (const row of rows) {
      const cells = row.map((c, i) => wrap(dash(c), 8.5, widths[i] - 8));
      const h = Math.max(...cells.map((c) => c.length)) * 11 + 4;
      if (this.y - h < BOTTOM_Y) {
        this.newPage();
        draw();
      }
      let x = MX + 5;
      cells.forEach((lines, i) => {
        lines.forEach((ln, j) => this.at(x, this.y - 3 - j * 11, ln, { size: 8.5 }));
        x += widths[i];
      });
      this.y -= h;
      this.line(MX, this.y + 3, PAGE_W - MX, this.y + 3);
    }
    this.y -= 6;
  }

  /** Bordered box for free-text remarks. */
  box(h = 46) {
    this.need(h + 6);
    this.line(MX, this.y + 3, PAGE_W - MX, this.y + 3);
    this.line(MX, this.y + 3 - h, PAGE_W - MX, this.y + 3 - h);
    this.line(MX, this.y + 3, MX, this.y + 3 - h);
    this.line(PAGE_W - MX, this.y + 3, PAGE_W - MX, this.y + 3 - h);
    this.y -= h + 8;
  }

  finish() {
    if (this.buf) this.pages.push(this.buf);
    if (!this.pages.length) this.pages.push("");
    return this.pages;
  }
}

/** Footer with company line and page numbers, stamped on every page. */
function stampFooters(pages, header) {
  return pages.map((content, i) => {
    const y = 40;
    let s = content;
    s += `0.7 w ${LINE[0]} ${LINE[1]} ${LINE[2]} RG ${MX} ${y + 12} m ${PAGE_W - MX} ${y + 12} l S\n`;
    const left = `${header.companyName} - ${header.address}`;
    const right = `Page ${i + 1} of ${pages.length}`;
    s += `BT /F1 7.5 Tf ${GREY[0]} ${GREY[1]} ${GREY[2]} rg 1 0 0 1 ${MX} ${y} Tm (${esc(lat1(left))}) Tj ET\n`;
    s += `BT /F1 7.5 Tf ${GREY[0]} ${GREY[1]} ${GREY[2]} rg 1 0 0 1 ${PAGE_W - MX - widthOf(right, 7.5)} ${y} Tm (${esc(right)}) Tj ET\n`;
    return s;
  });
}

/** Assemble page streams into a PDF buffer. */
function assemble(pages) {
  const objects = [];
  const n = pages.length;
  const first = 3;
  const kids = [];
  for (let i = 0; i < n; i++) kids.push(`${first + i * 2} 0 R`);
  const fReg = first + n * 2;
  const fBold = fReg + 1;

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${n} >>`;
  pages.forEach((content, i) => {
    const p = first + i * 2;
    objects[p - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fReg} 0 R /F2 ${fBold} 0 R >> >> /Contents ${p + 1} 0 R >>`;
    const bytes = Buffer.from(content, "latin1");
    objects[p] = `<< /Length ${bytes.length} >>\nstream\n${content}\nendstream`;
  });
  objects[fReg - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[fBold - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

/**
 * generateCreditUnderwritingPdf(model) → Buffer
 * `model` is the output of utils/creditUnderwritingData.js. Nothing is written
 * to disk here; the caller decides what to do with the buffer.
 */
export function generateCreditUnderwritingPdf(model) {
  const m = model || {};
  const h = m.header || {};
  const app = m.application || {};
  const cust = m.customer || {};
  const cs = m.creditSummary || {};
  const cn = m.creditNote || {};
  const rem = m.remarks || {};
  const dec = m.decision || {};

  const d = new Doc();

  // ── Letterhead ────────────────────────────────────────────────────────────
  d.at(MX, d.y, h.companyName || "SURJIT FINANCE", { size: 18, bold: true, rgb: NAVY });
  d.y -= 15;
  d.at(MX, d.y, h.tagline || "", { size: 7.5, bold: true, rgb: AMBER });
  d.y -= 11;
  d.at(MX, d.y, h.address || "", { size: 8, rgb: GREY });
  const stamp = `${dash(h.reportDate)} ${h.reportTime || ""}`.trim();
  d.at(PAGE_W - MX - widthOf(stamp, 8), TOP_Y, stamp, { size: 8, rgb: GREY });
  d.y -= 10;
  d.rect(MX, d.y, CONTENT_W, 2, AMBER);
  d.y -= 22;

  const title = h.title || "CREDIT UNDERWRITING DECISION REPORT";
  d.at((PAGE_W - widthOf(title, 13)) / 2, d.y, title, { size: 13, bold: true, rgb: NAVY });
  d.y -= 22;

  // ── Application information ────────────────────────────────────────────────
  d.section("Application Information");
  d.kvGrid([
    ["Application Number", dash(app.applicationNo)],
    ["Customer Name", dash(app.customerName)],
    ["Branch", dash(app.branch)],
    ["Dealer", dash(app.dealer)],
    ["Product", dash(app.product)],
    ["Loan Amount", money(app.loanAmount)],
    ["Tenure", app.tenureMonths ? `${app.tenureMonths} months` : "Not Available"],
    ["Report Date", dash(h.reportDate)],
    ["Workflow Stage", dash(app.workflowStage)],
    ["Prepared By", dash(app.preparedBy)],
  ]);

  // ── Customer information ──────────────────────────────────────────────────
  d.section("Customer Information");
  d.kvGrid([
    ["Name", dash(cust.name)],
    ["Father / Husband Name", dash(cust.fatherName)],
    ["Date of Birth", dash(cust.dob)],
    ["Age", cust.age === null || cust.age === undefined ? "Not Available" : `${cust.age} years`],
    ["Gender", dash(cust.gender)],
    ["PAN", dash(cust.pan)],
    ["Mobile", dash(cust.mobile)],
    ["Email", dash(cust.email)],
    ["Occupation", dash(cust.occupation)],
  ]);
  d.kv("Address", dash(cust.address));
  d.y -= 4;

  // ── Credit summary ────────────────────────────────────────────────────────
  d.section("Credit Summary", cs.hasBureauData ? "" : "no bureau report on file");
  d.kvGrid([
    ["CIBIL Score", cs.score === null || cs.score === undefined ? "Not Available" : String(cs.score)],
    ["Total Accounts", dash(cs.totalAccounts)],
    ["Active Accounts", dash(cs.activeAccounts)],
    ["Closed Accounts", dash(cs.closedAccounts)],
    ["Current Balance", money(cs.currentBalance)],
    ["High Credit", money(cs.highCredit)],
    ["Total Overdue", money(cs.totalOverdue)],
    ["Recent Enquiries (12m)", dash(cs.recentEnquiries)],
  ]);

  // ── Credit note ───────────────────────────────────────────────────────────
  d.section("Credit Note", cn.recorded ? "" : "not recorded");
  d.table(
    ["Parameter", "Value"],
    [
      ["DPD Days (Last 6 Months)", cn.dpdDays === null || cn.dpdDays === undefined ? null : String(cn.dpdDays)],
      ["Enquiries (Last 3 Months)", cn.enquiryCount === null || cn.enquiryCount === undefined ? null : String(cn.enquiryCount)],
      ["Suit Filed", cn.suitFiled],
      ["Write-Off", cn.writeOff],
      ["Total Overdue", cn.totalOverdue === null || cn.totalOverdue === undefined ? null : money(cn.totalOverdue)],
      ["Total EMI Amount", cn.totalEmiAmount === null || cn.totalEmiAmount === undefined ? null : money(cn.totalEmiAmount)],
      ["Total EMI Count", cn.totalEmiCount === null || cn.totalEmiCount === undefined ? null : `${cn.totalEmiCount} months`],
      ["Distance From Branch", cn.distanceFromBranch === null || cn.distanceFromBranch === undefined ? null : `${cn.distanceFromBranch} KM`],
    ],
    [300, CONTENT_W - 300]
  );

  // ── Remarks ───────────────────────────────────────────────────────────────
  d.section("Remarks");
  d.subheading("Credit Officer Remarks");
  if (rem.creditOfficer) {
    wrap(rem.creditOfficer, 9, CONTENT_W - 10).forEach((ln) => {
      d.need(13);
      d.at(MX + 3, d.y, ln, { size: 9 });
      d.y -= 12;
    });
    d.y -= 4;
  } else {
    d.box(42);
  }
  d.subheading("Underwriter Remarks");
  if (rem.underwriter) {
    wrap(rem.underwriter, 9, CONTENT_W - 10).forEach((ln) => {
      d.need(13);
      d.at(MX + 3, d.y, ln, { size: 9 });
      d.y -= 12;
    });
    d.y -= 4;
  } else {
    d.box(42);
  }

  // ── Decision (stored value only) ──────────────────────────────────────────
  d.section("Decision");
  const value = dash(dec.value);
  const tint =
    dec.value === "APPROVED" ? [0.94, 0.99, 0.96]
      : dec.value === "REJECTED" ? [0.996, 0.949, 0.949]
      : [0.973, 0.98, 0.988];
  const ink = dec.value === "APPROVED" ? GREEN : dec.value === "REJECTED" ? RED : SLATE;
  d.need(52);
  d.rect(MX, d.y - 34, CONTENT_W, 40, tint);
  d.rect(MX, d.y - 34, 4, 40, ink);
  d.at(MX + 14, d.y - 2, "APPLICATION DECISION", { size: 7.5, bold: true, rgb: GREY });
  d.at(MX + 14, d.y - 22, value, { size: 17, bold: true, rgb: ink });
  d.y -= 46;
  d.kvGrid([["Workflow Stage", dash(dec.workflowStage)], ["Status", dash(dec.status)]]);

  // ── Disclaimer ────────────────────────────────────────────────────────────
  d.y -= 4;
  d.subheading("Disclaimer");
  const disclaimer =
    `This report is prepared by ${h.companyName || "Surjit Finance"} for internal record. It sets out ` +
    "information supplied by the applicant and the dealer together with credit bureau data retrieved " +
    "at the time of the enquiry, and the decision recorded against the application. Values shown as " +
    "Not Available were not recorded in the system. The report states existing information only; it " +
    "does not assess risk or make a lending recommendation.";
  wrap(disclaimer, 7.5, CONTENT_W).forEach((ln) => {
    d.need(11);
    d.at(MX, d.y, ln, { size: 7.5, rgb: GREY });
    d.y -= 10;
  });

  return assemble(stampFooters(d.finish(), h));
}

export default { generateCreditUnderwritingPdf };
