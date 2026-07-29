import React from "react";
import { show } from "../cibil/format";

const DECISION_CLASS = {
  APPROVED: "uw-dec-approved",
  "CONDITIONAL APPROVAL": "uw-dec-conditional",
  REJECTED: "uw-dec-rejected",
  PENDING: "uw-dec-pending",
};

/** Prominent decision + risk grade badge. */
export default function DecisionBanner({ decision }) {
  const cls = DECISION_CLASS[decision.recommended] || "uw-dec-pending";
  return (
    <section className="cr-section uw-decision">
      <div className={`uw-decision-main ${cls}`}>
        <div className="uw-decision-label">Recommended Decision</div>
        <div className="uw-decision-value">{show(decision.recommended)}</div>
        <div className="uw-decision-reason">{show(decision.reason)}</div>
      </div>
      <div className="uw-grade-box">
        <div className="uw-decision-label">Risk Grade</div>
        <div className={`uw-grade uw-grade-${(decision.grade || "x").toLowerCase()}`}>
          {show(decision.grade)}
        </div>
        <div className="uw-grade-label">{show(decision.riskCategory)}</div>
        <div className="uw-current">Current status: <strong>{show(decision.current)}</strong></div>
      </div>
    </section>
  );
}
