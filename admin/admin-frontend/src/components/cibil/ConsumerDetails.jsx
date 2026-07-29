import React from "react";
import { show, money, NA } from "./format";

const Table = ({ title, head, rows, empty }) => (
  <div className="cr-subsection">
    <h3 className="cr-h3">{title}</h3>
    {rows.length === 0 ? (
      <p className="cr-empty">{empty}</p>
    ) : (
      <table className="cr-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
        ))}</tbody>
      </table>
    )}
  </div>
);

/** Identification, telephones, emails, addresses and employment. */
export default function ConsumerDetails({ consumer }) {
  const id = consumer.identification;
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Consumer Details</h2>
      <Table title="Identification" head={["ID Type", "Number"]}
        rows={[
          ["Income Tax ID (PAN)", show(id.pan)],
          ["Aadhaar (UID)", show(id.aadhaar, NA)],
          ["Voter ID", show(id.voterId)],
          ["Passport Number", show(id.passport, NA)],
          ["Driving Licence", show(id.drivingLicence, NA)],
          ["CKYC", show(id.ckyc)],
        ]}
        empty="No identification reported." />
      <Table title="Telephone Number(s)" head={["Telephone Number", "Type"]}
        rows={consumer.telephones.map((t) => [show(t.number), show(t.type)])}
        empty="No telephone numbers reported." />
      <Table title="Email Address(es)" head={["Email"]}
        rows={consumer.emails.map((e) => [show(e)])}
        empty="No email addresses reported." />
      <Table title="Address(es)" head={["Address", "Category", "Reported By", "Date Reported"]}
        rows={consumer.addresses.map((a) => [
          show(a.line), show(a.category), show(a.reportedBy), show(a.dateReported)])}
        empty="No addresses reported." />
      <Table title="Employment Information" head={["Employer", "Account Type", "Occupation", "Income", "Date Reported"]}
        rows={consumer.employment.map((e) => [
          show(e.employerName), show(e.accountType), show(e.occupation),
          money(e.income), show(e.dateReported)])}
        empty="No employment information reported." />
    </section>
  );
}
