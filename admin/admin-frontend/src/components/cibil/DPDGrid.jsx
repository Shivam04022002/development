import React from "react";
import { MONTHS, dpdClass } from "./format";

/**
 * Month-wise days-past-due / asset classification grid: a year column and
 * twelve equal months, ruled under the header only. Year rows are data-driven,
 * newest first.
 *
 * The sheet prints every code in plain text, so the severity classes are kept
 * on the cells but render unstyled — tinting can be restored from one CSS rule.
 */
export default function DPDGrid({ dpd }) {
  if (!dpd || dpd.years.length === 0) {
    return <p className="cr-empty cr-dpd-empty">No payment history reported.</p>;
  }
  return (
    <table className="cr-dpd-table">
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
  );
}
