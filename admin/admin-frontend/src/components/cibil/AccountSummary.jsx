import React from "react";
import { show } from "./format";
import { inr } from "./currency";

/**
 * Calculated account totals in one box, split into the sheet's three equal
 * groups by vertical rules: accounts, balances, opened dates.
 */
export default function AccountSummary({ summary }) {
  const groups = [
    ["Accounts", [
      ["Total", show(summary.total)],
      ["Zero balance", show(summary.zeroBalance)],
      ["Overdue", show(summary.overdueCount)],
    ]],
    ["Balances", [
      ["High Cr/Sanc. Amt", inr(summary.highCreditTotal)],
      ["Current", inr(summary.currentBalanceTotal)],
      ["Overdue", inr(summary.overdueTotal)],
    ]],
    ["Account Opened Date", [
      ["Recent", show(summary.recentOpened)],
      ["Oldest", show(summary.oldestOpened)],
    ]],
  ];

  return (
    <section className="cr-section">
      <h2 className="cr-h2">Consumer Account Summary</h2>
      <div className="cr-box">
        <div className="cr-summary-grid">
          {groups.map(([title, rows]) => (
            <div key={title}>
              <h3 className="cr-h3">{title}</h3>
              <div className="cr-summary-rows">
                {rows.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <div className="cr-k">{k}</div>
                    <div className="cr-colon">:</div>
                    <div className="cr-v">{v}</div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
