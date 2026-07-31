import React from "react";
/**
 * Presentation primitives shared by the report components.
 *
 * These exist purely to render the bureau's "LABEL : value" field pattern
 * consistently. Nothing is derived or transformed here — formatting rules stay
 * in format.js and the currency symbol in currency.js.
 */

/** Stacked LABEL : value rows. `rows` is [[label, value], ...]. */
export function Fields({ rows }) {
  return (
    <div className="cr-fields">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <div className="cr-label">{label}</div>
          <div className="cr-colon">:</div>
          <div className="cr-val">{value}</div>
        </React.Fragment>
      ))}
    </div>
  );
}

/** One LABEL : value pair on a single line, for header and card strips. */
export function Inline({ label, value }) {
  return (
    <span className="cr-inline">
      <span className="cr-label">{label}</span>
      <span className="cr-colon">:</span>
      <span className="cr-val">{value}</span>
    </span>
  );
}

/** Thin vertical rule between inline fields. */
export const Pipe = () => <span className="cr-pipe">|</span>;

/**
 * Corner marker on an account card: a tick for an open account, a cross for a
 * closed one, mirroring the bureau's corner flag.
 */
export function StatusCorner({ active }) {
  const fill = active ? "#1F9D77" : "#9AA6B2";
  return (
    <svg className="cr-corner" viewBox="0 0 26 26" aria-hidden="true">
      <path d="M0 0 H26 V26 Z" fill={fill} />
      {active ? (
        <path d="M14 8.5 L16.6 11.4 L21.4 6.2" fill="none" stroke="#fff" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M15.4 6.4 L21 12 M21 6.4 L15.4 12" fill="none" stroke="#fff" strokeWidth="1.8"
          strokeLinecap="round" />
      )}
    </svg>
  );
}
