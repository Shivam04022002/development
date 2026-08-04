// utils/cibilReportPdf.js
//
// Consumer CIR PDF renderer.
//
// Architecture mirrors the Credit Underwriting report: the read-only mapper
// normalises the stored payload, a declarative document renders it, and the
// renderer returns bytes.
//
//   buildReportModel()          (utils/cibilReportData.js, imported read-only)
//        -> CibilCirDocument    (pdf/CibilCirDocument.js)
//        -> renderToBuffer()    (@react-pdf/renderer)
//        -> <formId>-CIBIL-Report.pdf
//
// Presentation only: no business logic, no calculations, no JSON parsing. The
// raw payload is handed straight to the mapper and is never read here — the
// document itself sees only the normalised model, exactly like the web view.

import React from "react";
import { renderToBuffer, Font } from "@react-pdf/renderer";
import CibilCirDocument from "../pdf/CibilCirDocument.js";
import { buildReportModel } from "./cibilReportData.js";
import { registerFonts } from "../pdf/styles.js";

let fontsReady = false;

/**
 * Labels wrap onto a second line on the sheet but are never hyphenated —
 * without this the renderer breaks "AADHAAR NUMBER" as "AADHAAR NUM-BER".
 *
 * The callback is global to @react-pdf/renderer, so it also stops hyphenation
 * in the Credit Underwriting PDF. That document is table-based and its
 * reference is unhyphenated too, so the effect there is either nil or a small
 * improvement — but it is a shared change, not a local one.
 */
function disableHyphenation() {
  try {
    Font.registerHyphenationCallback((word) => [word]);
  } catch (err) {
    console.warn("[cibilReportPdf] hyphenation callback failed:", err?.message);
  }
}

/**
 * Bureau status message for a failed flow, which the normalised model does not
 * carry. Mirrors getCibilModel() in the controller so the PDF and the QA view
 * report the same state. Reads two envelope fields only — no payload parsing.
 */
function statusMessageOf(raw) {
  return raw && typeof raw === "object" && raw.status !== "success" && typeof raw.message === "string"
    ? raw.message
    : null;
}

/**
 * generateCibilReportPdf({ app, cibil, raw }) -> Promise<Buffer>
 *
 * Signature is unchanged from the previous generator so the controller keeps
 * passing what it already loads; the only difference is that the result is now
 * awaited, because the renderer is asynchronous.
 *
 *   app   — Application document (formId, applicant, ...)
 *   cibil — the stored summary { score, status, reportDate, requestId }
 *   raw   — the stored Xaler payload, forwarded to the mapper untouched
 *
 * Nothing is written to disk.
 */
export async function generateCibilReportPdf({ app = {}, cibil = {}, raw = null } = {}) {
  if (!fontsReady) {
    fontsReady = registerFonts();
    disableHyphenation();
  }

  const model = buildReportModel({ app, cibil, raw });
  const statusMessage = statusMessageOf(raw);

  return renderToBuffer(React.createElement(CibilCirDocument, { model, statusMessage }));
}

export default { generateCibilReportPdf };
