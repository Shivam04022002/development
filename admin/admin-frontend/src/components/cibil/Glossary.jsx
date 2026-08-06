import React from "react";

/**
 * The sheet's three-column "CIR data glossary" — report section, key term or
 * code, description — inside a titled box. Row set and wording follow the
 * reference sheet.
 */
const ROWS = [
  ["Report name", "-", ["Consumer CIR"]],
  ["Consumer Details", "e", ["Enriched through Enquiry"]],
  ["Identification(s)", "ID Types", [
    "Income Tax ID Number (PAN)",
    "Passport Number",
    "Voter ID",
    "Driver’s License Number",
    "Ration Card Number",
    "Universal ID Number (UID)",
  ]],
  ["Telephone(s) :", "Telephone Types", [
    "Latest 4 Telephone details reported.",
    "Mobile phone",
    "Home Phone",
    "Office phone",
    "Not Classified",
  ]],
  ["Email Contact(s) :", "-", ["Latest 4 emails reported."]],
  ["Employment Information(s) :", "Occupation Codes", [
    "Latest Employment detail reported.",
    "Salaried",
    "Self Employed Professionals",
    "Self Employed",
    "Others",
  ]],
  ["Address(es) :", "Address Category", [
    "Latest 4 address reported.",
    "Permanent Address",
    "Residence Address",
    "Office Address",
    "Not categorized",
  ]],
  ["Consumer Account Details:", "Account Information", [
    "Active: Account not closed",
    "Inactive: Closed account",
    "Date Opened: Date of first disbursement",
    "Date Closed: Date of account closure",
    "Date reported & Certified: Most recent date reported by reporting member",
    "Last Payment Date: Most recent date a payment was made on the account.",
  ]],
  ["Consumer Account Details:", "Day Past Due/Asset Classification", [
    "Start date: Beginning of the payment history",
    "End Date: End of the payment history",
    "000: Payment is made on the due date",
    "001-900: Payment is missed by number of days from the due date",
    "STD: Payments being made within 90 days",
    "SMA: Special account created for reporting Standard Accounts moving toward Sub-Standard",
    "SUB: Payments being made after 90 days",
    "DBT : The account has remained Sub-Standard for 12 months",
    "LSS : The account where loss has been identified and remains uncollectable",
    "XXX : Data not reported by Institution",
  ]],
  ["Consumer Account Details:", "Information under dispute", [
    "Consumer has raised grievance request regarding issue in correctness of the data reported by Financial Institution",
  ]],
  ["Enquiry Details :", "Not Disclosed", ["Enquiry made with other Members"]],
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
              <tr key={`${section}-${term}-${lines[0]}`}>
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
