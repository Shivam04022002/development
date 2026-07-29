import React from "react";
import { show, NA } from "../cibil/format";

export default function DistanceAnalysis({ distance }) {
  const rows = [
    ["Distance from Branch", distance.fromBranch === null ? "-" : `${distance.fromBranch} KM`],
    ["Distance from Dealer", distance.fromDealer === null ? NA : `${distance.fromDealer} KM`],
    ["Residence Verification", show(distance.residenceVerification, NA)],
    ["Office Verification", show(distance.officeVerification, NA)],
  ];
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Distance &amp; Verification</h2>
      <table className="cr-table">
        <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
        <tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody>
      </table>
    </section>
  );
}
