import React from "react";

/**
 * Static glossary, laid out as the sheet's three-column "CIR data glossary":
 * report section, key term or code, description — inside a titled box.
 *
 * The row set follows the sheet section for section. The definitions are
 * written in our own words; only the standard bureau codes themselves, which
 * are the data values, are reproduced.
 */
const ROWS = [
  ["Report name", "-", ["Consumer CIR"]],
  ["Consumer Details", "e", ["Enriched through enquiry"]],
  ["Identification(s)", "ID Types", [
    "Income Tax ID Number (PAN)",
    "Passport Number",
    "Voter ID",
    "Driver's Licence Number",
    "Ration Card Number",
    "Universal ID Number (UID)",
  ]],
  ["Telephone(s)", "Telephone Types", [
    "Latest 4 telephone details reported.",
    "Mobile phone",
    "Home phone",
    "Office phone",
    "Not classified",
  ]],
  ["Email Contact(s)", "-", ["Latest 4 emails reported."]],
  ["Employment Information(s)", "Occupation Codes", [
    "Latest employment detail reported.",
    "Salaried",
    "Self employed professionals",
    "Self employed",
    "Others",
  ]],
  ["Address(es)", "Address Category", [
    "Latest 4 addresses reported.",
    "Permanent address",
    "Residence address",
    "Office address",
    "Not categorised",
  ]],
  ["Consumer Account Details", "Account Information", [
    "Active: the account has not been closed",
    "Inactive: the account has been closed",
    "Date Opened: date of first disbursement",
    "Date Closed: date the account was closed",
    "Date Reported & Certified: most recent date the member reported this account",
    "Last Payment Date: most recent date a payment was recorded on the account",
  ]],
  ["Consumer Account Details", "Days Past Due/Asset Classification", [
    "Start Date: beginning of the payment history",
    "End Date: end of the payment history",
    "000: payment made on or before the due date",
    "001-900: number of days the payment is past its due date",
    "STD: payments being made within 90 days",
    "SMA: special mention account, reported while moving toward sub-standard",
    "SUB: payments being made after 90 days",
    "DBT: the account has remained sub-standard for 12 months",
    "LSS: the account where loss has been identified and remains uncollectable",
    "XXX: not reported by the credit institution for that month",
  ]],
  ["Consumer Account Details", "Information under dispute", [
    "The consumer has raised a grievance about the correctness of the data reported by the credit institution",
  ]],
  ["Enquiry Details", "Not Disclosed", ["Enquiry made with another member"]],
  ["Throughout", "Unavailable values", [
    "-  : the field was not present in the bureau response",
    "Not Available: the bureau reported the field as undisclosed",
  ]],
];

export default function Glossary() {
  return (
    <section className="cr-section cr-section-flow">
      <h1 className="cr-doc-title">GLOSSARY</h1>
      <div className="cr-box cr-box-flush">
        <div className="cr-box-title">CIR Data Glossary</div>
        <table className="cr-table cr-t-glossary">
          <thead>
            <tr><th>Report Section</th><th>Key Term / Code</th><th>Description</th></tr>
          </thead>
          <tbody>
            {ROWS.map(([section, term, lines]) => (
              <tr key={`${section}-${term}`}>
                <td className="cr-strong">{section}</td>
                <td>{term}</td>
                <td>{lines.map((l) => <div key={l}>{l}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
