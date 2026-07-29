import React from "react";

/**
 * Static glossary. Definitions are written in our own words; only the standard
 * bureau codes themselves are reproduced.
 */
const DPD = [
  ["000", "Payment made on or before the due date"],
  ["001-900", "Number of days the payment is past its due date"],
  ["STD", "Standard - payments being made within 90 days"],
  ["SMA", "Special Mention Account - moving towards sub-standard"],
  ["SUB", "Sub-standard - payments being made after 90 days"],
  ["DBT", "Doubtful - has remained sub-standard for 12 months"],
  ["LSS", "Loss - identified as uncollectable"],
  ["XXX", "Not reported by the credit institution for that month"],
];
const TERMS = [
  ["Active", "The account has not been closed"],
  ["Inactive / Closed", "The account has been closed"],
  ["Date Opened", "Date of first disbursement"],
  ["Date Closed", "Date the account was closed"],
  ["Date Reported", "Most recent date the member reported this account"],
  ["Last Payment", "Most recent date a payment was recorded"],
  ["Sanctioned", "Amount sanctioned, or the highest credit extended"],
  ["Current Balance", "Amount outstanding as last reported"],
  ["Overdue", "Amount past its due date as last reported"],
  ["Ownership", "Whether the consumer is the individual, joint, guarantor or authorised user"],
];

export default function Glossary() {
  return (
    <section className="cr-section cr-page-break">
      <h2 className="cr-h2">Glossary</h2>
      <div className="cr-grid-2">
        <div>
          <h3 className="cr-h3">Payment History Codes</h3>
          <table className="cr-table">
            <thead><tr><th>Code</th><th>Meaning</th></tr></thead>
            <tbody>{DPD.map(([c, d]) => <tr key={c}><td className="cr-mono">{c}</td><td>{d}</td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h3 className="cr-h3">Account Terms</h3>
          <table className="cr-table">
            <thead><tr><th>Term</th><th>Meaning</th></tr></thead>
            <tbody>{TERMS.map(([c, d]) => <tr key={c}><td>{c}</td><td>{d}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
