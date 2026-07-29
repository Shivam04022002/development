import React from "react";
import { show, money, NA } from "../cibil/format";

export default function FinancialAssessment({ financial }) {
  const rows = [
    ["Monthly Income", money(financial.monthlyIncome, NA)],
    ["Existing EMI", money(financial.existingEmi)],
    ["Requested Loan Amount", money(financial.requestedAmount)],
    ["Requested Loan EMI (indicative)", money(financial.requestedEmi)],
    ["Total EMI Obligation", money(financial.totalEmi)],
    ["FOIR", financial.foir === null ? NA : `${financial.foir}%`],
    ["Debt Ratio", financial.debtRatio === null ? NA : `${financial.debtRatio}%`],
    ["Disposable Income", money(financial.disposableIncome, NA)],
    ["Eligible EMI", money(financial.eligibleEmi, NA)],
    ["Loan Eligibility", money(financial.loanEligibility, NA)],
  ];
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Financial Assessment</h2>
      <div className="cr-grid-2">
        <table className="cr-kv-table"><tbody>
          {rows.slice(0, 5).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody></table>
        <table className="cr-kv-table"><tbody>
          {rows.slice(5).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody></table>
      </div>
      <p className="uw-note">
        Requested EMI is indicative, calculated as principal over tenure; the application
        does not capture an interest rate. Items marked Not Available are not recorded
        against this application.
      </p>
    </section>
  );
}
