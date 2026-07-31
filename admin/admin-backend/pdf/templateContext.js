// pdf/templateContext.js
//
// creditUnderwritingTemplateContext() — the Node equivalent of Xaler's
// build_pdf_context(): it flattens the normalised underwriting model into a
// context whose every value is already display-ready, so the template does no
// formatting and no lookups.
//
// It does NOT re-map anything. All mapping stays in
// utils/creditUnderwritingData.js; this only formats what that produced.

const NA = "Not Available";

/** Indian digit grouping. */
function group(n) {
  const i = String(Math.round(Number(n)));
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3);
  return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
}

const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

/** Real rupee sign — Noto Sans carries U+20B9. */
const rupees = (v) => (isNum(v) ? `\u20B9${group(v)}` : NA);
const plain = (v) => (v === null || v === undefined || v === "" ? NA : String(v));
const count = (v) => (isNum(v) ? String(Number(v)) : NA);

/**
 * creditUnderwritingTemplateContext(model) → display-ready context.
 * `model` is the output of utils/creditUnderwritingData.js.
 */
export function creditUnderwritingTemplateContext(model) {
  const m = model || {};
  const h = m.header || {};
  const cust = m.customer || {};
  const app = m.application || {};
  const cs = m.creditSummary || {};
  const cn = m.creditNote || {};

  const emiCombined = (() => {
    const amt = isNum(cn.totalEmiAmount) ? `\u20B9${group(cn.totalEmiAmount)}` : null;
    const cnt = isNum(cn.totalEmiCount) ? Number(cn.totalEmiCount) : null;
    if (amt === null && cnt === null) return NA;
    return `${amt ?? "\u20B90"} / ${cnt ?? 0} months`;
  })();

  return {
    companyName: h.companyName || "SURJIT FINANCE",
    tagline: h.tagline || "TODAY. TOMORROW. TOGETHER.",
    address: h.address || "",
    title: h.title || "CREDIT UNDERWRITING DECISION REPORT",
    reportDate: plain(h.reportDate),
    applicationNo: plain(app.applicationNo),

    // Exactly the ten reference rows, in order. `accent` marks the one value
    // the reference renders in orange.
    rows: [
      { label: "Customer Name", value: plain(cust.name || app.customerName) },
      { label: "Address", value: plain(cust.address) },
      { label: "CIBIL Score", value: count(cs.score) },
      { label: "DPD Days (Last 6 Months)", value: count(cn.dpdDays) },
      { label: "Enquiry (Last 3 months)", value: count(cn.enquiryCount) },
      { label: "Suit Filled", value: plain(cn.suitFiled) },
      { label: "Write-Off", value: plain(cn.writeOff) },
      { label: "Total Overdue", value: rupees(cn.totalOverdue), accent: true },
      { label: "Total EMI Amount / Count", value: emiCombined },
      {
        label: "Distance From Branch",
        value: isNum(cn.distanceFromBranch) ? `${cn.distanceFromBranch} KM` : NA,
      },
    ],
  };
}

export default { creditUnderwritingTemplateContext };
