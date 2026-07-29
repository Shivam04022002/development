import React from "react";
import { show, money, scoreBand, NA } from "../cibil/format";

/**
 * Bureau summary — simple counts and totals only. No thresholds are applied to
 * drive a decision; the score colour reuses the existing CIBIL display palette
 * purely for readability.
 */
export default function CreditSummaryPanel({ summary }) {
  const band = scoreBand(summary.score);
  const rows = [
    ["Total Accounts", show(summary.totalAccounts, NA)],
    ["Active Accounts", show(summary.activeAccounts, NA)],
    ["Closed Accounts", show(summary.closedAccounts, NA)],
    ["Current Balance", money(summary.currentBalance, NA)],
    ["High Credit", money(summary.highCredit, NA)],
    ["Total Overdue", money(summary.totalOverdue, NA)],
    ["Recent Enquiries (12 months)", show(summary.recentEnquiries, NA)],
    ["Total Enquiries", show(summary.totalEnquiries, NA)],
  ];
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Credit Summary</h2>
      {!summary.hasBureauData && (
        <p className="cr-empty">No bureau report on file for this application.</p>
      )}
      <div className="uw-score-row">
        <div className="uw-score-box">
          <div className="cr-score-name">CIBIL Score</div>
          <div className="cr-score-value" style={{ color: band.color }}>
            {summary.score === null ? NA : summary.score}
          </div>
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
