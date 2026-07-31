// pdf/styles.js
//
// Stylesheet for the Credit Underwriting Decision Report, proportioned from the
// approved reference document. Declarative only — no layout arithmetic.

import { StyleSheet, Font } from "@react-pdf/renderer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");

/**
 * Noto Sans (SIL OFL) carries U+20B9, so the real rupee sign renders.
 *
 * Two static cuts are bundled rather than the variable font's named instances:
 * fontkit can select an instance but cannot subset one for embedding, which is
 * what a PDF needs. Static files keep bold a genuine Bold cut.
 */
export function registerFonts() {
  try {
    Font.register({
      family: "NotoSans",
      fonts: [
        { src: path.join(FONT_DIR, "NotoSans-Regular.ttf"), fontWeight: "normal" },
        { src: path.join(FONT_DIR, "NotoSans-Bold.ttf"), fontWeight: "bold" },
      ],
    });
    return true;
  } catch (err) {
    console.warn("[creditUnderwritingPdf] font registration failed:", err?.message);
    return false;
  }
}

export const COLORS = {
  ink: "#212121",
  greyText: "#6B7280",
  orange: "#EF9621",
  orangeText: "#E67E22",
  border: "#DDE0E5",
  labelBg: "#F9FAFB",
  white: "#FFFFFF",
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: 96,
    paddingBottom: 40,
    paddingHorizontal: 45,
    fontFamily: "NotoSans",
    fontSize: 9.5,
    color: COLORS.ink,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: { alignItems: "center" },
  logo: { width: 150, marginBottom: 4 },
  companyName: {
    fontFamily: "Times-Bold",
    fontSize: 23,
    color: "#000000",
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  tagline: {
    fontFamily: "NotoSans",
    fontWeight: "bold",
    fontSize: 8,
    color: COLORS.orangeText,
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  address: { fontSize: 8.5, color: COLORS.greyText, letterSpacing: 0.3 },

  divider: { height: 1.6, backgroundColor: COLORS.orange, marginTop: 12 },

  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13.5,
    color: "#000000",
    textAlign: "center",
    marginTop: 22,
    marginBottom: 10,
  },

  // ── Table ─────────────────────────────────────────────────────────────────
  table: { marginTop: 22 },
  row: { flexDirection: "row" },
  labelCell: {
    width: "39.5%",
    backgroundColor: COLORS.labelBg,
    borderWidth: 0.7,
    borderColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  valueCell: {
    width: "60.5%",
    backgroundColor: COLORS.white,
    borderWidth: 0.7,
    borderColor: COLORS.border,
    borderLeftWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  labelText: { fontFamily: "NotoSans", fontWeight: "bold", fontSize: 9.5, color: COLORS.ink },
  valueText: { fontFamily: "NotoSans", fontWeight: "bold", fontSize: 9.5, color: COLORS.ink },
  valueAccent: { color: COLORS.orangeText },
});

export default { styles, COLORS, registerFonts };
