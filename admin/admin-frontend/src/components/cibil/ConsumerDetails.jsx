import React from "react";
import { show, NA, DASH } from "./format";
import { Inline } from "./ui";
import { inr } from "./currency";

/**
 * A titled table inside a bordered box, with the sheet's optional footnote
 * beneath it, or a plain note when there is no data.
 */
const Table = ({ title, head, rows, empty, note }) => (
  <div className="cr-subsection">
    <h2 className="cr-h2">{title}</h2>
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
    {note && <p className="cr-footnote">{note}</p>}
  </div>
);

/**
 * Consumer details section: a one-line identity recap followed by the sheet's
 * identification, telephone, email, address and employment tables.
 *
 * Columns the sheet does not print but the mapper carries — the reporting
 * member on an address, the employer on an employment row — are kept as extra
 * columns rather than discarded.
 */
export default function ConsumerDetails({ consumer, score }) {
  const id = consumer.identification;

  return (
    <section className="cr-section cr-section-flow">
      <h1 className="cr-doc-title">CONSUMER DETAILS</h1>

      <div className="cr-subsection">
        <h2 className="cr-h2">Consumer Information</h2>
        <div className="cr-box cr-id-box">
          <div className="cr-masthead-meta">
            <Inline label="Consumer Name" value={show(consumer.name)} />
            <Inline label="D.O.B" value={show(consumer.dob)} />
            <Inline label="Gender" value={show(consumer.gender)} />
            <Inline label="CreditVision Score" value={show(score?.value)} />
          </div>
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
          ["Ration Card", show(id.rationCard, NA), DASH, DASH],
          ["Social ID", show(id.socialId, NA), DASH, DASH],
          ["CKYC", show(id.ckyc), DASH, DASH],
        ]}
        empty="No identification reported."
        note="(e) - IDENTIFICATION REPORTED FROM ENQUIRY"
      />

      <Table
        title="Telephone(s)"
        head={["Type", "Telephone Number", "Telephone Extension"]}
        rows={consumer.telephones.map((t) => [show(t.type), show(t.number), DASH])}
        empty="No telephone numbers reported."
        note="(e) - TELEPHONE REPORTED FROM ENQUIRY"
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
        note="(e) - ADDRESSES REPORTED FROM ENQUIRY"
      />

      <Table
        title="Employment Information"
        head={[
          "Account Type (Date Reported)", "Employer", "Occupation Code", "Income",
          "Net/Gross Income Indicator", "Monthly/Annual Income Indicator",
        ]}
        rows={consumer.employment.map((e) => [
          <>
            {show(e.accountType)}
            <br />
            <span className="cr-strong">({show(e.dateReported)})</span>
          </>,
          show(e.employerName, NA),
          show(e.occupation, NA),
          inr(e.income) === DASH ? NA : inr(e.income),
          show(e.netGrossIndicator, NA),
          show(e.incomeFrequency, NA),
        ])}
        empty="No employment information reported."
      />
    </section>
  );
}
