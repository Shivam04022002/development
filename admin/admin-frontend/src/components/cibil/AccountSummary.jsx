import React from "react";
import { show, money } from "./format";

/** Calculated account totals — accounts / balances / opened dates. */
export default function AccountSummary({ summary }) {
  const g = [
    ["Accounts", [
      ["Total", show(summary.total)],
      ["Zero Balance", show(summary.zeroBalance)],
      ["Overdue", show(summary.overdueCount)],
    ]],
    ["Balances", [
      ["High Credit / Sanctioned", money(summary.highCreditTotal)],
      ["Current Balance", money(summary.currentBalanceTotal)],
      ["Overdue Amount", money(summary.overdueTotal)],
    ]],
    ["Account Opened", [
      ["Recent", show(summary.recentOpened)],
      ["Oldest", show(summary.oldestOpened)],
    ]],
  ];
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Consumer Account Summary</h2>
      <div className="cr-grid-3">
        {g.map(([title, rows]) => (
          <div className="cr-panel" key={title}>
            <h3 className="cr-h3">{title}</h3>
            <table className="cr-kv-table"><tbody>
              {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
            </tbody></table>
          </div>
        ))}
      </div>
    </section>
  );
}
