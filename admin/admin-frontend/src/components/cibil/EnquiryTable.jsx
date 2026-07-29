import React from "react";
import { show, money } from "./format";

/** Consumer enquiry details — unbounded row count. */
export default function EnquiryTable({ enquiries }) {
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Consumer Enquiry Details</h2>
      {enquiries.length === 0 ? (
        <p className="cr-empty">No enquiries reported.</p>
      ) : (
        <table className="cr-table">
          <thead>
            <tr><th>#</th><th>Member Name</th><th>Enquiry Date</th><th>Purpose</th><th className="cr-num">Amount</th></tr>
          </thead>
          <tbody>
            {enquiries.map((e, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{show(e.memberName)}</td>
                <td>{show(e.date)}</td>
                <td>{show(e.purpose)}</td>
                <td className="cr-num">{money(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
