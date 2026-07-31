import React from "react";

/**
 * Static glossary, laid out as the bureau's three-column "CIR data glossary":
 * report section, key term or code, description. Definitions are written in our
 * own words; only the standard bureau codes themselves are reproduced.
 */
const ROWS = [
  ["Consumer Account Details", "Account Information", [
    "Active: the account has not been closed",
    "Inactive: the account has been closed",
    "Date Opened: date of first disbursement",
    "Date Closed: date the account was closed",
    "Date Reported & Certified: most recent date the member reported this account",
    "Last Payment: most recent date a payment was recorded",
  ]],
  ["Consumer Account Details", "Amounts", [
    "Sanctioned Amount: amount sanctioned, or the highest credit extended",
    "Current Balance: amount outstanding as last reported",
    "Overdue: amount past its due date as last reported",
    "Ownership: whether the consumer is the individual, joint holder, guarantor or authorised user",
  ]],
  ["Consumer Account Details", "Days Past Due / Asset Classification", [
    "000: payment made on or before the due date",
    "001-900: number of days the payment is past its due date",
    "STD: standard — payments being made within 90 days",
    "SMA: special mention account — moving towards sub-standard",
    "SUB: sub-standard — payments being made after 90 days",
    "DBT: doubtful — has remained sub-standard for 12 months",
    "LSS: loss — identified as uncollectable",
    "XXX: not reported by the credit institution for that month",
  ]],
  ["Consumer Enquiry Details", "Enquiries", [
    "Each row is a credit application reported to the bureau by a member institution",
    "Not Disclosed: the enquiring member has not been named in the bureau response",
  ]],
  ["Throughout", "Unavailable values", [
    "-  : the field was not present in the bureau response",
    "Not Available: the bureau reported the field as undisclosed",
  ]],
];

export default function Glossary() {
  return (
    <section className="cr-section cr-section-flow">
      <h1 className="cr-doc-title">GLOSSARY</h1>
      <h3 className="cr-h3" style={{ marginTop: 0 }}>CIR Data Glossary</h3>
      <div className="cr-box cr-box-flush">
        <table className="cr-table">
          <thead>
            <tr><th>Report Section</th><th>Key Term / Code</th><th>Description</th></tr>
          </thead>
          <tbody>
            {ROWS.map(([section, term, lines]) => (
              <tr key={`${section}-${term}`}>
                <td className="cr-strong">{section}</td>
                <td className="cr-strong">{term}</td>
                <td>
                  {lines.map((l) => <div key={l}>{l}</div>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
