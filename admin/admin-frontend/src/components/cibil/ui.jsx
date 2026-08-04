import React from "react";
/**
 * Presentation primitives shared by the report components.
 *
 * These exist purely to render the sheet's "LABEL : value" field pattern
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
 * Corner marker on an account card: the sheet folds the top-right corner into
 * a filled triangle — a tick for an open account, a cross for a closed one.
 */
export function StatusCorner({ active }) {
  return (
    <svg className="cr-corner" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M0 0 H22 V22 Z" fill={active ? "#3BB012" : "#ACACAC"} />
      {active ? (
        <path d="M11.8 6.6 L14.1 9.1 L18.4 4.2" fill="none" stroke="#fff" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M12.8 4.4 L18 9.6 M18 4.4 L12.8 9.6" fill="none" stroke="#fff" strokeWidth="1.6"
          strokeLinecap="round" />
      )}
    </svg>
  );
}
