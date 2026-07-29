import React from "react";
import { show, money, rate } from "./format";
import DPDGrid from "./DPDGrid";

/** One tradeline: header strip, three-column detail, payment history. */
export default function AccountCard({ account }) {
  const a = account;
  const cols = [
    ["Account", [
      ["Type", show(a.accountType)],
      ["Member Name", show(a.memberName)],
      ["Account Number", show(a.accountNumber)],
      ["Ownership", show(a.ownership)],
      ["Collateral", show(a.collateralType)],
    ]],
    ["Amounts", [
      ["Sanctioned", money(a.sanctionedAmount)],
      ["Current Balance", money(a.currentBalance)],
      ["Overdue", money(a.overdueAmount)],
      ["Actual Payment", money(a.actualPayment)],
      ["Credit Limit", money(a.creditLimit)],
    ]],
    ["Status", [
      ["Payment Frequency", show(a.paymentFrequency)],
      ["Repayment Tenure", show(a.repaymentTenure)],
      ["Interest Rate", rate(a.interestRate, "%")],
      ["EMI", money(a.emi)],
      ["Written Off", money(a.writtenOffTotal)],
    ]],
  ];
  return (
    <article className="cr-account">
      <div className="cr-account-head">
        <span className="cr-account-no">{a.index}. ACCOUNT</span>
        <span className={a.status === "ACTIVE" ? "cr-badge cr-badge-on" : "cr-badge cr-badge-off"}>
          {a.status}
        </span>
      </div>
      <div className="cr-account-dates">
        <span>Date Opened: {show(a.dateOpened)}</span>
        <span>Date Closed: {show(a.dateClosed)}</span>
        <span>Date Reported: {show(a.dateReported)}</span>
        <span>Last Payment: {show(a.lastPayment)}</span>
      </div>
      <div className="cr-grid-3">
        {cols.map(([title, rows]) => (
          <div key={title}>
            <h4 className="cr-h4">{title}</h4>
            <table className="cr-kv-table"><tbody>
              {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
            </tbody></table>
          </div>
        ))}
      </div>
      <h4 className="cr-h4">Days Past Due / Asset Classification</h4>
      <DPDGrid dpd={a.dpd} />
    </article>
  );
}
