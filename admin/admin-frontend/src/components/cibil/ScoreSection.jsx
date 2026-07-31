import React from "react";
import { show } from "./format";

/* The bureau prints a neutral gauge — a charcoal travelled arc against a light
   remainder, with a dark needle. No risk colour is used. */
const ARC_TRAVELLED = "#6E7A85";
const ARC_REMAINING = "#DFE4E9";

/**
 * Score block: score name and range on the left, a semicircular gauge in the
 * middle, scoring factors on the right — the bureau's arrangement.
 *
 * The gauge is inline SVG so the arc, the needle and the centred value print
 * exactly as laid out.
 */
export default function ScoreSection({ score }) {
  const { value, min, max, factors } = score;
  const pct = value === null ? 0 : ((Math.min(Math.max(value, min), max) - min) / (max - min)) * 100;

  // Gauge geometry: 180° arc, centre (100,104), radius 84.
  const cx = 100;
  const cy = 104;
  const r = 84;
  const theta = Math.PI * (1 - pct / 100);     // 180° at the low end, 0° at the high end
  const nx = cx + r * Math.cos(theta);
  const ny = cy - r * Math.sin(theta);
  const needleDeg = 90 - (theta * 180) / Math.PI;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <section className="cr-section">
      <h2 className="cr-h2">CIBIL TransUnion Score(s)</h2>
      <div className="cr-box">
        <div className="cr-score-body">
          <div>
            <div className="cr-score-name">{show(score.name, "Enhanced CreditVision Score")}</div>
            <div className="cr-score-range">
              Ranges from:<br />
              {min} (high risk) to {max} (low risk)
            </div>
          </div>

          <div className="cr-gauge-wrap">
            <svg className="cr-gauge-svg" viewBox="0 0 200 124" role="img"
              aria-label={`Score ${value === null ? "not available" : value} out of ${max}`}>
              <path d={arc} fill="none" stroke={ARC_REMAINING} strokeWidth="11.5" strokeLinecap="round" />
              {value !== null && (
                <path d={arc} fill="none" stroke={ARC_TRAVELLED} strokeWidth="11.5" strokeLinecap="round"
                  pathLength="100" strokeDasharray={`${pct} 100`} />
              )}
              {value !== null && (
                <polygon points={`${nx},${ny - 7} ${nx - 5.5},${ny + 4} ${nx + 5.5},${ny + 4}`}
                  fill="#253746" transform={`rotate(${needleDeg} ${nx} ${ny})`} />
              )}
              <text className="cr-gauge-value" x={cx} y="99" textAnchor="middle">
                {value === null ? "-" : value}
              </text>
              <text className="cr-gauge-end" x="16" y="120" textAnchor="middle">{min}</text>
              <text className="cr-gauge-end" x="184" y="120" textAnchor="middle">{max}</text>
            </svg>
          </div>

          <div>
            <div className="cr-factor-head">Scoring Factors</div>
            {factors.length === 0 ? (
              <p className="cr-empty">No scoring factors reported.</p>
            ) : (
              <ol className="cr-factor-list">
                {factors.map((f, i) => <li key={i}>{f}</li>)}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
