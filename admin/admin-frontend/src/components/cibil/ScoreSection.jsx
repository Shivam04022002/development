import React from "react";
import { show, scoreBand } from "./format";

/** Score gauge (300-900) plus the bureau's scoring factors. */
export default function ScoreSection({ score }) {
  const { value, min, max, factors } = score;
  const band = scoreBand(value);
  const pct = value === null ? 0 : ((Math.min(Math.max(value, min), max) - min) / (max - min)) * 100;

  return (
    <section className="cr-section cr-score">
      <h2 className="cr-h2">CIBIL Score</h2>
      <div className="cr-score-body">
        <div className="cr-gauge-wrap">
          <div className="cr-score-name">{show(score.name, "Enhanced CreditVision Score")}</div>
          <div className="cr-score-value" style={{ color: band.color }}>
            {value === null ? "-" : value}
          </div>
          <div className="cr-score-band" style={{ color: band.color }}>{band.label}</div>
          <div className="cr-gauge">
            <div className="cr-gauge-fill" style={{ width: `${pct}%`, background: band.color }} />
            {value !== null && <div className="cr-gauge-marker" style={{ left: `${pct}%` }} />}
          </div>
          <div className="cr-gauge-scale"><span>{min} (high risk)</span><span>{max} (low risk)</span></div>
        </div>
        <div className="cr-factors">
          <h3 className="cr-h3">Scoring Factors</h3>
          {factors.length === 0 ? (
            <p className="cr-empty">No scoring factors reported.</p>
          ) : (
            <ol className="cr-factor-list">{factors.map((f, i) => <li key={i}>{f}</li>)}</ol>
          )}
        </div>
      </div>
    </section>
  );
}
