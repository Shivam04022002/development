import React from "react";
import { show } from "./format";
import { inr } from "./currency";

/** Consumer enquiry details — unbounded row count. */
export default function EnquiryTable({ enquiries }) {
  return (
    <section className="cr-section cr-section-flow">
      <h1 className="cr-doc-title">CONSUMER ENQUIRY DETAILS</h1>
      <h3 className="cr-h3" style={{ marginTop: 0 }}>Enquiries</h3>
      <div className="cr-box cr-box-flush">
        {enquiries.length === 0 ? (
          <p className="cr-empty cr-empty-padded">No enquiries reported.</p>
        ) : (
          <table className="cr-table">
            <thead>
              <tr>
                <th>Member Name</th>
                <th>Enquiry Date</th>
                <th>Enquiry Purpose</th>
                <th className="cr-nowrap">Enquiry Amount</th>
              </tr>
            </thead>
            <tbody>
              {enquiries.map((e, i) => (
                <tr key={i}>
                  <td>{show(e.memberName)}</td>
                  <td className="cr-nowrap">{show(e.date)}</td>
                  <td>{show(e.purpose)}</td>
                  <td className="cr-nowrap">{inr(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
