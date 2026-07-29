import React from "react";
import { show, money, scoreBand } from "../cibil/format";

/** Bureau summary, reusing the CIBIL score banding. */
export default function CreditSummaryPanel({ summary }) {
  const band = scoreBand(summary.score);
  const rows = [
    ["Total Accounts", show(summary.totalAccounts)],
    ["Active Accounts", show(summary.activeAccounts)],
    ["Closed Accounts", show(summary.closedAccounts)],
    ["Current Balance", money(summary.currentBalance)],
    ["High Credit", money(summary.highCredit)],
    ["Total Overdue", money(summary.totalOverdue)],
    ["Total EMI Amount", money(summary.totalEmiAmount)],
    ["Total EMI Count", show(summary.totalEmiCount)],
    ["Recent Enquiries", show(summary.recentEnquiries)],
    ["DPD (Last 6 Months)", summary.dpdDays === null ? "-" : `${summary.dpdDays} day(s)`],
    ["Credit Utilisation", summary.utilisation === null ? "-" : `${summary.utilisation}%`],
    ["Credit Age", summary.creditAgeYears === null ? "-" : `${summary.creditAgeYears} year(s)`],
  ];
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Credit Summary</h2>
      {!summary.hasBureauData && (
        <p className="cr-empty">No bureau report on file; figures below come from the credit note only.</p>
      )}
      <div className="uw-score-row">
        <div className="uw-score-box">
          <div className="cr-score-name">CIBIL Score</div>
          <div className="cr-score-value" style={{ color: band.color }}>
            {summary.score === null ? "-" : summary.score}
          </div>
          <div className="cr-score-band" style={{ color: band.color }}>{show(summary.scoreBand, band.label)}</div>
        </div>
        <table className="cr-table uw-summary-table">
          <tbody>
            {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td className="cr-num">{v}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
