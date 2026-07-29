import React from "react";
import { show } from "../cibil/format";

/** Recommended decision, reason, risk category and any conditions. */
export default function RecommendationBlock({ decision }) {
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Recommendation</h2>
      <table className="cr-kv-table cr-kv-wide"><tbody>
        <tr><th>Recommended Decision</th><td><strong>{show(decision.recommended)}</strong></td></tr>
        <tr><th>Reason</th><td>{show(decision.reason)}</td></tr>
        <tr><th>Risk Category</th><td>{show(decision.riskCategory)} (Grade {show(decision.grade)})</td></tr>
        <tr><th>Conditions</th><td>
          {decision.conditions.length === 0 ? "None" : (
            <ul className="uw-list">{decision.conditions.map((c, i) => <li key={i}>{c}</li>)}</ul>
          )}
        </td></tr>
      </tbody></table>
    </section>
  );
}
