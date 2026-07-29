import React from "react";
import { show } from "./format";

/** Report identification block — top of page 1. */
export default function ReportHeader({ header }) {
  const rows = [
    ["Report Date & Time", `${show(header.reportDate)} (${show(header.reportTime)})`],
    ["Control Number", show(header.controlNumber)],
    ["Member ID", show(header.memberId)],
    ["Reference Number", show(header.referenceNumber)],
    ["Application No.", show(header.applicationNo)],
  ];
  return (
    <header className="cr-header">
      <div className="cr-brand">
        <div className="cr-brand-name">SURJIT FINANCE</div>
        <div className="cr-brand-sub">Consumer Credit Information Report</div>
      </div>
      <dl className="cr-header-meta">
        {rows.map(([k, v]) => (
          <div className="cr-kv" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
