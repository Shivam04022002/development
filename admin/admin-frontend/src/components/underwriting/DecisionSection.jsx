import React from "react";
import { show, NA } from "../cibil/format";

const CLS = {
  APPROVED: "uw-dec-approved",
  REJECTED: "uw-dec-rejected",
  PENDING: "uw-dec-pending",
};

/**
 * The decision already recorded on the application. Nothing is calculated,
 * inferred or recommended here.
 */
export default function DecisionSection({ decision }) {
  const cls = CLS[decision.value] || "uw-dec-pending";
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Decision</h2>
      <div className={`uw-decision-main ${cls}`}>
        <div className="uw-decision-label">Application Decision</div>
        <div className="uw-decision-value">{show(decision.value, NA)}</div>
      </div>
      <table className="cr-kv-table cr-kv-wide"><tbody>
        <tr><th>Workflow Stage</th><td>{show(decision.workflowStage, NA)}</td></tr>
        <tr><th>Status</th><td>{show(decision.status, NA)}</td></tr>
      </tbody></table>
    </section>
  );
}
