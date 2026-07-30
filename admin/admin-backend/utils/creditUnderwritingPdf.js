// utils/creditUnderwritingPdf.js
//
// Credit Underwriting Decision Report — single A4 page, laid out to match the
// approved reference document:
//
//   centred logo -> SURJIT FINANCE -> tagline -> address -> orange rule
//   -> CREDIT UNDERWRITING DECISION REPORT -> orange rule
//   -> ten-row, two-column table (grey label column, white value column)
//
// Presentation only. It consumes the normalised model from
// utils/creditUnderwritingData.js and adds no sections, decisions or
// calculations of its own. Dependency-free: standard Type1 fonts plus a
// FlateDecode image XObject for the logo (see utils/pngEmbed.js).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pngToPdfImage } from "./pngEmbed.js";

const PAGE_W = 595; // A4 points
const PAGE_H = 842;
const MX = 45;
const CONTENT_W = PAGE_W - MX * 2;

const INK = [0.13, 0.13, 0.13];
const GREY_TEXT = [0.42, 0.45, 0.5];
const ORANGE = [0.937, 0.588, 0.129];
const ORANGE_TEXT = [0.902, 0.494, 0.133];
const BORDER = [0.867, 0.878, 0.898];
const LABEL_BG = [0.976, 0.98, 0.984];

// Table geometry, proportioned from the reference.
const ROW_H = 26;
const LABEL_W = Math.round(CONTENT_W * 0.395);
const PAD_X = 12;

const LOGO_W = 150; // points; height follows the source aspect ratio

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, "..", "assets", "logo-surjit.png");

/** Escape a PDF literal string. */
const esc = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");

/** The standard fonts encode Latin-1; the rupee sign is outside it. */
const lat1 = (s) =>
  String(s ?? "")
    .replace(/₹/g, "Rs.")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

// Per-font average advance factors, good enough for centring.
const ADV = { H: 0.5, HB: 0.53, TB: 0.48 };
const widthOf = (s, size, font = "H") => String(s ?? "").length * size * ADV[font];

const dash = (v) => (v === null || v === undefined || v === "" ? "Not Available" : String(v));

/** Indian digit grouping, matching the renderer's money() helper. */
function money(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return null;
  const i = String(Math.round(Number(n)));
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3);
  return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
}

/** Rupee-prefixed amount, or "Not Available". */
const rupees = (n) => {
  const m = money(n);
  return m === null ? "Not Available" : `Rs.${m}`;
};

/** Load and prepare the logo once per process; null if unavailable. */
let logoCache;
function getLogo() {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = pngToPdfImage(fs.readFileSync(LOGO_PATH));
  } catch (err) {
    console.warn("[creditUnderwritingPdf] logo unavailable, falling back to text:", err?.message);
    logoCache = null;
  }
  return logoCache;
}

/**
 * generateCreditUnderwritingPdf(model) → Buffer
 * `model` is the output of utils/creditUnderwritingData.js.
 */
export function generateCreditUnderwritingPdf(model) {
  const m = model || {};
  const h = m.header || {};
  const cust = m.customer || {};
  const app = m.application || {};
  const cs = m.creditSummary || {};
  const cn = m.creditNote || {};

  const logo = getLogo();
  let s = "";

  const text = (x, y, str, { size = 9.5, font = "H", rgb = INK } = {}) => {
    const f = font === "HB" ? "/F2" : font === "TB" ? "/F3" : "/F1";
    s += `BT ${f} ${size} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg 1 0 0 1 ${x} ${y} Tm (${esc(lat1(str))}) Tj ET\n`;
  };
  const centre = (y, str, opts) => {
    const w = widthOf(lat1(str), opts.size, opts.font || "H");
    text((PAGE_W - w) / 2, y, str, opts);
  };
  const rect = (x, y, w, hh, rgb) => {
    s += `${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x} ${y} ${w} ${hh} re f\n`;
  };
  const stroke = (x, y, w, hh, rgb = BORDER, lw = 0.7) => {
    s += `${lw} w ${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${x} ${y} ${w} ${hh} re S\n`;
  };

  // ── Header ────────────────────────────────────────────────────────────────
  let y = PAGE_H - 150;

  if (logo) {
    const lw = LOGO_W;
    const lh = Math.round((logo.height / logo.width) * lw);
    const lx = (PAGE_W - lw) / 2;
    s += `q ${lw} 0 0 ${lh} ${lx} ${y} cm /Im0 Do Q\n`;
    y -= 34;
  } else {
    y -= 6;
  }

  centre(y, "SURJIT FINANCE", { size: 23, font: "TB", rgb: [0, 0, 0] });
  y -= 20;
  centre(y, h.tagline || "TODAY. TOMORROW. TOGETHER.", { size: 8, font: "HB", rgb: ORANGE_TEXT });
  y -= 15;
  centre(y, h.address || "", { size: 8.5, font: "H", rgb: GREY_TEXT });
  y -= 16;

  rect(MX, y, CONTENT_W, 1.6, ORANGE);
  y -= 30;

  const title = h.title || "CREDIT UNDERWRITING DECISION REPORT";
  centre(y, title, { size: 13.5, font: "HB", rgb: [0, 0, 0] });
  y -= 12;
  rect(MX, y, CONTENT_W, 1.6, ORANGE);
  y -= 26;

  // ── Table: exactly the ten reference rows ─────────────────────────────────
  const emiCombined = (() => {
    const amt = money(cn.totalEmiAmount);
    const cnt = cn.totalEmiCount;
    if (amt === null && (cnt === null || cnt === undefined)) return "Not Available";
    return `Rs.${amt === null ? "0" : amt} / ${cnt === null || cnt === undefined ? "0" : cnt} months`;
  })();

  const rows = [
    ["Customer Name", dash(cust.name || app.customerName), false],
    ["Address", dash(cust.address), false],
    ["CIBIL Score", cs.score === null || cs.score === undefined ? "Not Available" : String(cs.score), false],
    ["DPD Days (Last 6 Months)", cn.dpdDays === null || cn.dpdDays === undefined ? "Not Available" : String(cn.dpdDays), false],
    ["Enquiry (Last 3 months)", cn.enquiryCount === null || cn.enquiryCount === undefined ? "Not Available" : String(cn.enquiryCount), false],
    ["Suit Filled", dash(cn.suitFiled), false],
    ["Write-Off", dash(cn.writeOff), false],
    ["Total Overdue", rupees(cn.totalOverdue), true],
    ["Total EMI Amount / Count", emiCombined, false],
    ["Distance From Branch", cn.distanceFromBranch === null || cn.distanceFromBranch === undefined
      ? "Not Available" : `${cn.distanceFromBranch} KM`, false],
  ];

  const tableTop = y;
  rows.forEach(([label, value, accent], i) => {
    const rowY = tableTop - (i + 1) * ROW_H;
    // Grey label cell, white value cell, then borders on top.
    rect(MX, rowY, LABEL_W, ROW_H, LABEL_BG);
    rect(MX + LABEL_W, rowY, CONTENT_W - LABEL_W, ROW_H, [1, 1, 1]);
    stroke(MX, rowY, LABEL_W, ROW_H);
    stroke(MX + LABEL_W, rowY, CONTENT_W - LABEL_W, ROW_H);

    const baseline = rowY + (ROW_H - 9.5) / 2 + 1.5;
    text(MX + PAD_X, baseline, label, { size: 9.5, font: "HB", rgb: INK });
    text(MX + LABEL_W + PAD_X, baseline, value, {
      size: 9.5,
      font: "HB",
      rgb: accent ? ORANGE_TEXT : INK,
    });
  });

  // ── Assemble ──────────────────────────────────────────────────────────────
  const objects = [];
  const hasLogo = !!logo;
  // 1 catalog, 2 pages, 3 page, 4 contents, 5-7 fonts, [8 image, 9 smask]
  const O_IMG = 8;
  const O_SMASK = 9;

  const xobj = hasLogo ? `/XObject << /Im0 ${O_IMG} 0 R >>` : "";
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[2] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
    `/Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> ${xobj} >> /Contents 4 0 R >>`;
  const bytes = Buffer.from(s, "latin1");
  objects[3] = `<< /Length ${bytes.length} >>\nstream\n${s}\nendstream`;
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[6] = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>";

  const binaries = {};
  if (hasLogo) {
    const smask = logo.mask ? ` /SMask ${O_SMASK} 0 R` : "";
    objects[O_IMG - 1] =
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
      `/Length ${logo.image.length}${smask} >>`;
    binaries[O_IMG] = logo.image;
    if (logo.mask) {
      objects[O_SMASK - 1] =
        `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} ` +
        `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode ` +
        `/Length ${logo.mask.length} >>`;
      binaries[O_SMASK] = logo.mask;
    }
  }

  const chunks = [];
  let offset = 0;
  const push = (buf) => { chunks.push(buf); offset += buf.length; };

  push(Buffer.from("%PDF-1.4\n", "latin1"));
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    const num = i + 1;
    offsets[i] = offset;
    if (binaries[num]) {
      push(Buffer.from(`${num} 0 obj\n${objects[i]}\nstream\n`, "latin1"));
      push(binaries[num]);
      push(Buffer.from("\nendstream\nendobj\n", "latin1"));
    } else {
      push(Buffer.from(`${num} 0 obj\n${objects[i]}\nendobj\n`, "latin1"));
    }
  }
  const xrefPos = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { xref += `${String(o).padStart(10, "0")} 00000 n \n`; });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  push(Buffer.from(xref, "latin1"));

  return Buffer.concat(chunks);
}

export default { generateCreditUnderwritingPdf };
