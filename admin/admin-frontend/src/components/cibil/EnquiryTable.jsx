import React from "react";
import { show } from "./format";
import { inr } from "./currency";

/**
 * Consumer enquiry details — unbounded row count, so the table is allowed to
 * split across pages and repeats its header when it does.
 *
 * The control number is not on the sheet but the mapper carries it, so it is
 * kept as a trailing column rather than discarded.
 */
export default function EnquiryTable({ enquiries }) {
  return (
    <section className="cr-section cr-section-flow">
      <h1 className="cr-doc-title">CONSUMER ENQUIRY DETAILS</h1>
      <div className="cr-subsection">
        <h2 className="cr-h2">Enquiries</h2>
        <div className="cr-box cr-box-flush">
          {enquiries.length === 0 ? (
            <p className="cr-empty cr-empty-padded">No enquiries reported.</p>
          ) : (
            <table className="cr-table">
              <thead>
                <tr>
                  <th>Member Name</th>
                  <th className="cr-nowrap">Enquiry Date</th>
                  <th>Enquiry Purpose</th>
                  <th className="cr-nowrap">Enquiry Amount</th>
                  <th className="cr-nowrap">Control Number</th>
                </tr>
              </thead>
              <tbody>
                {enquiries.map((e, i) => (
                  <tr key={i}>
                    <td>{show(e.memberName)}</td>
                    <td className="cr-nowrap">{show(e.date)}</td>
                    <td>{show(e.purpose)}</td>
                    <td className="cr-nowrap">{inr(e.amount)}</td>
                    <td className="cr-nowrap">{show(e.controlNumber)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
