import React from "react";
import { show } from "./format";

/** Calculated enquiry buckets — a single banded row, as the bureau prints it. */
export default function EnquirySummary({ summary }) {
  const cells = [
    ["Total Enquiries", summary.total],
    ["Most Recent", summary.mostRecent],
    ["Past 30 Days", summary.past30Days],
    ["Past 12 Months", summary.past12Months],
    ["Past 24 Months", summary.past24Months],
  ];
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Enquiry Summary</h2>
      <div className="cr-box cr-box-flush">
        <table className="cr-table">
          <thead><tr>{cells.map(([k]) => <th key={k}>{k}</th>)}</tr></thead>
          <tbody><tr>{cells.map(([k, v]) => <td key={k}>{show(v)}</td>)}</tr></tbody>
        </table>
      </div>
    </section>
  );
}
