import React from "react";
import { show } from "../cibil/format";

const cls = (v) =>
  v === "PASS" ? "uw-badge uw-pass" : v === "WARNING" ? "uw-badge uw-warn"
  : v === "FAIL" ? "uw-badge uw-fail" : "uw-badge uw-na";

/** Risk checks with PASS / WARNING / FAIL badges. */
export default function RiskAssessment({ risk }) {
  return (
    <section className="cr-section">
      <h2 className="cr-h2">
        Risk Assessment
        <span className="cr-count">{risk.passes} pass · {risk.warnings} warning · {risk.fails} fail</span>
      </h2>
      <table className="cr-table">
        <thead><tr><th>Check</th><th>Observed</th><th>Result</th><th>Note</th></tr></thead>
        <tbody>
          {risk.checks.map((c) => (
            <tr key={c.label}>
              <td>{c.label}</td>
              <td>{show(c.value)}</td>
              <td><span className={cls(c.verdict)}>{show(c.verdict, "N/A")}</span></td>
              <td>{show(c.note)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
