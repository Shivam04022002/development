import React from "react";
import { show, NA, DASH } from "./format";
import { Inline } from "./ui";
import { inr } from "./currency";

/** A titled table inside a bordered box, or a plain note when there is no data. */
const Table = ({ title, head, rows, empty }) => (
  <div className="cr-subsection">
    <h3 className="cr-h3">{title}</h3>
    <div className="cr-box cr-box-flush">
      {rows.length === 0 ? (
        <p className="cr-empty cr-empty-padded">{empty}</p>
      ) : (
        <table className="cr-table">
          {head && <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>}
          <tbody>{rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}</tbody>
        </table>
      )}
    </div>
  </div>
);

/**
 * Consumer details page: a one-line identity recap followed by the bureau's
 * identification, telephone, email, address and employment tables.
 */
export default function ConsumerDetails({ consumer, score }) {
  const id = consumer.identification;

  return (
    <section className="cr-section cr-section-flow">
      <h1 className="cr-doc-title">CONSUMER DETAILS</h1>

      <h3 className="cr-h3" style={{ marginTop: 0 }}>Consumer Information</h3>
      <div className="cr-box">
        <div className="cr-masthead-meta">
          <Inline label="Consumer Name" value={show(consumer.name)} />
          <span className="cr-sep" />
          <Inline label="D.O.B" value={show(consumer.dob)} />
          <span className="cr-sep" />
          <Inline label="Gender" value={show(consumer.gender)} />
          <span className="cr-sep" />
          <Inline label="CreditVision Score" value={show(score?.value)} />
        </div>
      </div>

      <Table
        title="Identification(s)"
        head={["Identification Type", "Identification Number", "Issue Date", "Expiration Date"]}
        rows={[
          ["PAN Card", show(id.pan), DASH, DASH],
          ["Voter ID", show(id.voterId), DASH, DASH],
          ["Aadhaar ID", show(id.aadhaar, NA), DASH, DASH],
          ["Passport", show(id.passport, NA), DASH, DASH],
          ["Driving Licence", show(id.drivingLicence, NA), DASH, DASH],
          ["CKYC", show(id.ckyc), DASH, DASH],
        ]}
        empty="No identification reported."
      />

      <Table
        title="Telephone(s)"
        head={["Type", "Telephone Number", "Telephone Extension"]}
        rows={consumer.telephones.map((t) => [show(t.type), show(t.number), DASH])}
        empty="No telephone numbers reported."
      />

      <Table
        title="Email Contact(s)"
        head={null}
        rows={consumer.emails.map((e) => [show(e)])}
        empty="No email addresses reported."
      />

      <Table
        title="Consumer's Reported Address(es)"
        head={["Address", "Category", "Residence Code", "Reported By", "Date Reported"]}
        rows={consumer.addresses.map((a) => [
          show(a.line), show(a.category), show(a.residenceCode),
          show(a.reportedBy), show(a.dateReported),
        ])}
        empty="No addresses reported."
      />

      <Table
        title="Employment Information"
        head={["Employer", "Account Type", "Occupation Code", "Income", "Date Reported"]}
        rows={consumer.employment.map((e) => [
          show(e.employerName), show(e.accountType), show(e.occupation),
          inr(e.income), show(e.dateReported),
        ])}
        empty="No employment information reported."
      />
    </section>
  );
}
