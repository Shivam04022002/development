import React from "react";
import { show, money, NA } from "../cibil/format";

/** The staff-entered Credit Note fields, reported verbatim. */
export default function CreditNoteSection({ creditNote }) {
  const rows = [
    ["DPD Days (Last 6 Months)", creditNote.dpdDays === null ? NA : String(creditNote.dpdDays)],
    ["Enquiries (Last 3 Months)", creditNote.enquiryCount === null ? NA : String(creditNote.enquiryCount)],
    ["Suit Filed", show(creditNote.suitFiled, NA)],
    ["Write-Off", show(creditNote.writeOff, NA)],
    ["Total Overdue", money(creditNote.totalOverdue, NA)],
    ["Total EMI Amount", money(creditNote.totalEmiAmount, NA)],
    ["Total EMI Count", creditNote.totalEmiCount === null ? NA : `${creditNote.totalEmiCount} months`],
    ["Distance From Branch", creditNote.distanceFromBranch === null ? NA : `${creditNote.distanceFromBranch} KM`],
  ];
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Credit Note</h2>
      {!creditNote.recorded && (
        <p className="cr-empty">No credit note has been recorded for this application.</p>
      )}
      <table className="cr-table">
        <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
        </tbody>
      </table>
    </section>
  );
}
