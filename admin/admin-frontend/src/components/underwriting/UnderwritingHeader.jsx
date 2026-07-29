import React from "react";
import { show } from "../cibil/format";

/** Company identity + report title. */
export default function UnderwritingHeader({ header }) {
  return (
    <header className="cr-header uw-header">
      <div className="cr-brand">
        <div className="cr-brand-name">{header.companyName}</div>
        <div className="uw-tagline">{header.tagline}</div>
        <div className="cr-brand-sub">{header.address}</div>
      </div>
      <dl className="cr-header-meta">
        <div className="cr-kv"><dt>Report Date</dt><dd>{show(header.reportDate)}</dd></div>
        <div className="cr-kv"><dt>Generated</dt><dd>{show(header.reportTime)}</dd></div>
      </dl>
    </header>
  );
}
