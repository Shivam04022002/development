import React from "react";

const List = ({ title, items, empty, tone }) => (
  <div className={`uw-analysis-col uw-tone-${tone}`}>
    <h3 className="cr-h3">{title}</h3>
    {items.length === 0 ? <p className="cr-empty">{empty}</p> : (
      <ul className="uw-list">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    )}
  </div>
);

/** Positive / negative factors, observations, conditions and free-text remarks. */
export default function UnderwriterAnalysis({ analysis }) {
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Underwriter Analysis</h2>
      <div className="cr-grid-2">
        <List title="Positive Factors" items={analysis.positiveFactors}
          empty="No positive factors recorded." tone="good" />
        <List title="Negative Factors" items={analysis.negativeFactors}
          empty="No negative factors recorded." tone="bad" />
      </div>
      <div className="cr-grid-2">
        <List title="Risk Observations" items={analysis.riskObservations}
          empty="No observations recorded." tone="neutral" />
        <List title="Special Conditions" items={analysis.specialConditions}
          empty="No special conditions." tone="neutral" />
      </div>
      <h3 className="cr-h3">Underwriter Remarks</h3>
      <div className="uw-remarks">{analysis.remarks || ""}</div>
    </section>
  );
}
