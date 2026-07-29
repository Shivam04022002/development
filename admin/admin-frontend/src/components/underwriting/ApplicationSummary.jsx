import React from "react";
import { show, money } from "../cibil/format";

export default function ApplicationSummary({ application, header }) {
  const rows = [
    ["Application Number", show(application.applicationNo)],
    ["Customer Name", show(application.customerName)],
    ["Loan Product", show(application.loanProduct)],
    ["Requested Loan Amount", money(application.requestedAmount)],
    ["Vehicle Price", money(application.vehiclePrice)],
    ["Tenure", application.tenureMonths ? `${application.tenureMonths} months` : "-"],
    ["Branch", show(application.branch)],
    ["Dealer", show(application.dealer)],
    ["Report Date", show(header.reportDate)],
    ["Underwriter", show(application.underwriter)],
    ["Workflow Status", show(application.workflowStage)],
  ];
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Application Summary</h2>
      <div className="cr-grid-2">
        <table className="cr-kv-table"><tbody>
          {rows.slice(0, 6).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody></table>
        <table className="cr-kv-table"><tbody>
          {rows.slice(6).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody></table>
      </div>
    </section>
  );
}
