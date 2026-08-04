// pdf/cirStyles.js
//
// Stylesheet for the Consumer CIR PDF, proportioned from the same reference
// sheet as the web renderer (components/cibil/cibilReport.css).
//
// ── Scale system ────────────────────────────────────────────────────────────
// Sizes are expressed in *reference units* — the units of the bureau's Consumer
// CIR sheet, whose text column measures 683 units across. u() converts a
// reference unit into PDF points so the printed page matches the web view:
//
//   683 units -> 170mm -> 481.9pt, inside A4 with 20mm side margins
//
// Declarative only: no business logic, no calculations, no data access.

import { StyleSheet } from "@react-pdf/renderer";

/** One reference unit in PDF points. */
export const U = 0.7055;
export const u = (n) => n * U;

export const CONTENT_UNITS = 683;

export const COLORS = {
  cyan: "#00A6CA",
  ink: "#2C2C2C",
  line: "#D5D5D5",
  gold: "#FCD800",
  muted: "#ACACAC",
  ok: "#3BB012",
  wordmark: "#00A2D1",
  white: "#FFFFFF",
};

export const FS = {
  titleLead: u(24),
  title: u(19.2),
  h2: u(14.4),
  h3: u(10.8),
  label: u(9.6),
  value: u(11.4),
  colon: u(10.8),
  summary: u(13.2),
  scoreName: u(16.8),
  scoreValue: u(43.8),
  gaugeEnd: u(12.75),
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: 39.7,
    paddingBottom: 39.7,
    paddingHorizontal: 56.7,
    fontFamily: "NotoSans",
    fontSize: FS.value,
    color: COLORS.ink,
    lineHeight: 1.26,
  },

  // ── Masthead ──────────────────────────────────────────────────────────────
  masthead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  mastheadMeta: { flexDirection: "row", alignItems: "baseline" },
  sep: { width: 0.6, height: u(13), backgroundColor: COLORS.line, marginHorizontal: u(14) },
  wordmark: { color: COLORS.wordmark, fontSize: u(26), paddingBottom: u(2) },
  mastheadRule: { height: u(3.1), width: "70.3%", backgroundColor: COLORS.gold, marginTop: u(9) },

  // ── Titles ────────────────────────────────────────────────────────────────
  docTitleLead: { fontSize: FS.titleLead, fontWeight: "bold", marginTop: u(45), marginBottom: u(15) },
  docTitle: { fontSize: FS.title, fontWeight: "bold", marginBottom: u(13) },
  h2: { fontSize: FS.h2, fontWeight: "bold", marginBottom: u(5) },
  h3: { fontSize: FS.h3, fontWeight: "bold" },
  section: { marginBottom: u(12.6) },
  subsection: { marginBottom: u(12.6) },
  footnote: { fontSize: FS.h3, marginTop: u(6) },
  empty: { fontSize: FS.value },
  emptyPadded: { fontSize: FS.value, paddingVertical: u(11), paddingHorizontal: u(9.7) },

  // ── Box ───────────────────────────────────────────────────────────────────
  box: {
    borderWidth: 0.6,
    borderColor: COLORS.line,
    borderRadius: u(2.5),
    paddingVertical: u(11),
    paddingHorizontal: u(9.7),
  },
  boxFlush: { borderWidth: 0.6, borderColor: COLORS.line, borderRadius: u(2.5) },
  idBox: { paddingVertical: u(8), paddingHorizontal: u(9.7) },

  // ── Field rows: LABEL : value ─────────────────────────────────────────────
  fieldsGrid: { flexDirection: "row" },
  fieldRow: { flexDirection: "row", marginBottom: u(5.4) },
  label: { fontSize: FS.label, fontWeight: "bold", color: COLORS.cyan, lineHeight: 1.5 },
  colon: { fontSize: FS.colon, width: u(12.4), textAlign: "left" },
  /* flexBasis:0 + minWidth:0 are load-bearing, not cosmetic. Yoga defaults a
     flex item to flexBasis:auto and min-width:auto, which size a Text from its
     content and refuse to shrink below it — so a long value (a full postal
     address) overflowed its column and overprinted the neighbouring one. A
     definite zero basis makes the item wrap at the space actually available. */
  value: { fontSize: FS.value, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  inline: { flexDirection: "row", alignItems: "baseline" },
  inlineLabel: { fontSize: FS.label, fontWeight: "bold", color: COLORS.cyan },
  inlineValue: { fontSize: FS.value },
  pipe: { color: COLORS.line, fontSize: FS.value, marginHorizontal: u(5) },

  // ── Tables ────────────────────────────────────────────────────────────────
  thead: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: COLORS.line },
  th: {
    fontSize: FS.label,
    fontWeight: "bold",
    color: COLORS.cyan,
    paddingVertical: u(6.2),
    paddingHorizontal: u(9.7),
  },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: COLORS.line },
  trLast: { flexDirection: "row" },
  td: { fontSize: FS.value, paddingVertical: u(4.8), paddingHorizontal: u(9.7) },
  tdStrong: { fontWeight: "bold" },
  boxTitle: {
    fontSize: FS.h2,
    fontWeight: "bold",
    paddingVertical: u(9),
    paddingHorizontal: u(9.7),
    borderBottomWidth: 0.6,
    borderBottomColor: COLORS.line,
  },

  // ── Score ─────────────────────────────────────────────────────────────────
  scoreBody: { flexDirection: "row", alignItems: "center", minHeight: u(150) },
  scoreName: { fontSize: FS.scoreName, fontWeight: "bold", lineHeight: 1.25 },
  scoreRange: { fontSize: FS.label, fontWeight: "bold", color: COLORS.cyan, marginTop: u(9), lineHeight: 1.45 },
  factorHead: { fontSize: FS.h3, fontWeight: "bold", color: COLORS.cyan, marginBottom: u(6) },
  factorItem: { fontSize: FS.value, lineHeight: 1.6 },

  // ── Account summary ───────────────────────────────────────────────────────
  summaryGrid: { flexDirection: "row" },
  summaryCol: { width: "33.33%", paddingHorizontal: u(14) },
  summaryDivider: { borderLeftWidth: 0.6, borderLeftColor: COLORS.line },
  summaryRows: { marginTop: u(12) },
  summaryRow: { flexDirection: "row", alignItems: "baseline", marginBottom: u(3.2) },
  summaryK: { fontSize: FS.summary, flexGrow: 1, flexBasis: 0, minWidth: 0 },
  summaryColon: { fontSize: FS.summary, width: u(12) },
  summaryV: { fontSize: FS.summary, fontWeight: "bold", textAlign: "right" },

  // ── Account cards ─────────────────────────────────────────────────────────
  acctIndex: { fontSize: FS.h2, fontWeight: "bold", marginBottom: u(7) },
  acct: { borderWidth: 0.6, borderColor: COLORS.line, borderRadius: u(2.5), marginBottom: u(35) },
  acctStrip: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: u(11),
    paddingLeft: u(9.7),
    paddingRight: u(22),
    borderBottomWidth: 0.6,
    borderBottomColor: COLORS.line,
  },
  stripTitle: { fontSize: FS.h3, fontWeight: "bold" },
  status: { fontSize: FS.value, fontWeight: "bold", marginLeft: "auto" },
  acctBody: { flexDirection: "row" },
  acctCol: { paddingVertical: u(10), paddingHorizontal: u(9.7) },
  colHead: { fontSize: FS.label, fontWeight: "bold", marginBottom: u(8) },
  acctDpd: { borderTopWidth: 0.6, borderTopColor: COLORS.line },
  dpdStrip: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: u(11),
    paddingHorizontal: u(9.7),
    borderBottomWidth: 0.6,
    borderBottomColor: COLORS.line,
  },

  // ── DPD grid ──────────────────────────────────────────────────────────────
  dpdHead: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: COLORS.line },
  dpdRow: { flexDirection: "row" },
  dpdCellHead: { fontSize: FS.value, fontWeight: "bold", color: COLORS.cyan, paddingVertical: u(6.55) },
  dpdCell: { fontSize: FS.value, paddingVertical: u(6.55) },

  // ── Notice (partial / error) ──────────────────────────────────────────────
  noticeLead: { fontSize: FS.value, marginBottom: u(8) },
  noticeMsg: {
    fontSize: FS.value,
    marginVertical: u(10),
    paddingVertical: u(8),
    paddingHorizontal: u(11),
    borderLeftWidth: u(2.5),
    borderLeftColor: COLORS.cyan,
    backgroundColor: "#F5FBFD",
  },

  // ── Closing ───────────────────────────────────────────────────────────────
  end: { flexDirection: "row", alignItems: "center", marginTop: u(40), marginBottom: u(30) },
  endLine: { flexGrow: 1, height: 0.6, backgroundColor: COLORS.line },
  endText: { fontSize: FS.h3, fontWeight: "bold", color: COLORS.cyan, marginHorizontal: u(12) },
  disclaimerBox: { borderWidth: 0.6, borderColor: COLORS.line, borderRadius: u(2.5) },
  disclaimerHead: {
    fontSize: FS.label,
    fontWeight: "bold",
    color: COLORS.cyan,
    paddingVertical: u(9),
    paddingHorizontal: u(9.7),
    borderBottomWidth: 0.6,
    borderBottomColor: COLORS.line,
  },
  disclaimer: { fontSize: FS.label, lineHeight: 1.75, paddingVertical: u(10), paddingHorizontal: u(9.7) },
  footerMeta: { marginTop: u(22), paddingTop: u(10), borderTopWidth: 0.6, borderTopColor: COLORS.line },
  copyright: { fontSize: FS.label, lineHeight: 1.6 },
  cin: { fontSize: FS.label, fontWeight: "bold", marginTop: u(4) },
});

export default { styles, COLORS, FS, u, U, CONTENT_UNITS };
