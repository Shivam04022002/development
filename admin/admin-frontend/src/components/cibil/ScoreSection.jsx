import React from "react";
import { show } from "./format";

/* The sheet draws a single cyan travelled arc against a light remainder, with
   a dark pointer riding the arc. No risk banding is applied to the colour. */
const ARC_TRAVELLED = "#00A6CA";
const ARC_REMAINING = "#D5D5D5";
const POINTER = "#000000";

/* Gauge geometry, in the same reference units as the stylesheet. */
const CX = 107.5;
const CY = 100;
const R = 68.75;
const STROKE = 11.25;

/**
 * Score block: score name and range on the left, the semicircular gauge in the
 * middle, scoring factors on the right — the sheet's arrangement.
 *
 * The gauge is inline SVG so the arc, the pointer and the centred value print
 * exactly as laid out.
 */
export default function ScoreSection({ score }) {
  const { value, min, max, factors } = score;
  const pct = value === null ? 0 : ((Math.min(Math.max(value, min), max) - min) / (max - min)) * 100;

  // 180° at the low end sweeping to 0° at the high end.
  const theta = Math.PI * (1 - pct / 100);
  const px = CX + R * Math.cos(theta);
  const py = CY - R * Math.sin(theta);
  // Unit vectors at that point: t runs along the arc toward a higher score.
  const tx = Math.sin(theta);
  const ty = Math.cos(theta);
  const pointer = [
    [px + tx * 7, py + ty * 7],
    [px - tx * 4 + ty * 5.5, py - ty * 4 - tx * 5.5],
    [px - tx * 4 - ty * 5.5, py - ty * 4 + tx * 5.5],
  ].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  return (
    <section className="cr-section">
      <h2 className="cr-h2">CIBIL TransUnion Score(s)</h2>
      <div className="cr-box">
        <div className="cr-score-body">
          <div>
            <div className="cr-score-name">
              {show(score.name, "Enhanced CreditVision")}{" "}
              <span className="cr-score-word">Score</span>
            </div>
            <div className="cr-score-range">
              Ranges from:<br />
              {min} (high risk) to {max} (low risk)
            </div>
          </div>

          <div className="cr-gauge-wrap">
            <svg className="cr-gauge-svg" viewBox="0 0 215 128" role="img"
              aria-label={`Score ${value === null ? "not available" : value} out of ${max}`}>
              <path d={arc} fill="none" stroke={ARC_REMAINING} strokeWidth={STROKE} />
              {value !== null && (
                <path d={arc} fill="none" stroke={ARC_TRAVELLED} strokeWidth={STROKE}
                  pathLength="100" strokeDasharray={`${pct} 100`} />
              )}
              {value !== null && <polygon points={pointer} fill={POINTER} />}
              <text className="cr-gauge-value" x={CX} y={CY - 6} textAnchor="middle">
                {value === null ? "-" : value}
              </text>
              <text className="cr-gauge-end" x={CX - R} y={CY + 20} textAnchor="middle">{min}</text>
              <text className="cr-gauge-end" x={CX + R} y={CY + 20} textAnchor="middle">{max}</text>
            </svg>
          </div>

          <div>
            <div className="cr-factor-head">Scoring Factors</div>
            {factors.length === 0 ? (
              <p className="cr-empty">No scoring factors reported.</p>
            ) : (
              <ol className="cr-factor-list">
                {factors.map((f, i) => <li key={i}>{`${i + 1}. ${f}`}</li>)}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
