import React from "react";
import { MONTHS, dpdClass, show } from "./format";

/**
 * Month-wise days-past-due / asset classification grid.
 * Year rows are data-driven, newest first.
 */
export default function DPDGrid({ dpd }) {
  if (!dpd || dpd.years.length === 0) {
    return <p className="cr-empty">No payment history reported.</p>;
  }
  return (
    <div className="cr-dpd">
      <div className="cr-dpd-meta">
        <span>Start Date: {show(dpd.startDate)}</span>
        <span>End Date: {show(dpd.endDate)}</span>
      </div>
      <table className="cr-table cr-dpd-table">
        <thead>
          <tr><th>Year</th>{MONTHS.map((m) => <th key={m}>{m}</th>)}</tr>
        </thead>
        <tbody>
          {dpd.years.map((y) => (
            <tr key={y}>
              <th>{y}</th>
              {MONTHS.map((m, i) => {
                const code = dpd.byYear[y] ? dpd.byYear[y][i + 1] : null;
                return <td key={m} className={dpdClass(code)}>{code || "-"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
