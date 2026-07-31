// utils/creditUnderwritingPdf.js
//
// Credit Underwriting Decision Report renderer.
//
// Architecture mirrors the Xaler report generator: a context builder flattens
// the normalised model into display-ready values, a declarative template renders
// it, and the renderer returns bytes.
//
//   buildUnderwritingModel()                 (utils/creditUnderwritingData.js)
//        -> creditUnderwritingTemplateContext()   (pdf/templateContext.js)
//        -> CreditUnderwritingDocument            (pdf/*.js)
//        -> renderToBuffer()                      (@react-pdf/renderer)
//        -> credit-note.pdf
//
// Presentation only: no business logic, no decisions, no calculations. The
// mapping layer is imported read-only and never modified.

import React from "react";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { renderToBuffer } from "@react-pdf/renderer";
import CreditUnderwritingDocument from "../pdf/CreditUnderwritingDocument.js";
import { creditUnderwritingTemplateContext } from "../pdf/templateContext.js";
import { registerFonts } from "../pdf/styles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, "..", "assets", "logo-surjit.png");

let fontsReady = false;

/**
 * Existing Surjit Finance logo, read once into a Buffer. react-pdf resolves a
 * bare path as a URL under Node, so the bytes are supplied directly. Returns
 * null if unreadable, so a missing logo never costs the whole PDF.
 */
let logoCache;
function resolveLogo() {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = { data: fs.readFileSync(LOGO_PATH), format: "png" };
  } catch (err) {
    console.warn("[creditUnderwritingPdf] logo unavailable:", err?.message);
    logoCache = null;
  }
  return logoCache;
}

/**
 * generateCreditUnderwritingPdf(model) → Promise<Buffer>
 *
 * `model` is the output of utils/creditUnderwritingData.js. renderToBuffer is
 * asynchronous, so the caller awaits the buffer; the returned value is the same
 * Buffer the previous generator produced.
 */
export async function generateCreditUnderwritingPdf(model) {
  if (!fontsReady) fontsReady = registerFonts();

  const context = creditUnderwritingTemplateContext(model);
  const element = React.createElement(CreditUnderwritingDocument, {
    context,
    logo: resolveLogo(),
  });

  return renderToBuffer(element);
}

export default { generateCreditUnderwritingPdf };
