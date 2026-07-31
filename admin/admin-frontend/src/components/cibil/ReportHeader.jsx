import React from "react";
import { show } from "./format";
import { Inline } from "./ui";

/**
 * Masthead, document title and the identification box — top of page 1.
 *
 * The layout follows the bureau's Consumer CIR masthead, but the wordmark is
 * OURS: this document is produced by Surjit Finance from bureau data supplied
 * through our authorised provider, so carrying the bureau's own logo would
 * misrepresent who issued it.
 */
export default function ReportHeader({ header }) {
  return (
    <header>
      <div className="cr-masthead">
        <div className="cr-masthead-meta">
          <Inline
            label="Report Date & Time"
            value={`${show(header.reportDate)} (${show(header.reportTime)})`}
          />
          <span className="cr-sep" />
          <Inline label="Control Number" value={show(header.controlNumber)} />
        </div>
        <div className="cr-brand">
          <div className="cr-brand-name">SURJIT FINANCE</div>
          <div className="cr-brand-sub">Credit Information Report</div>
        </div>
      </div>
      <div className="cr-masthead-rule" />

      <h1 className="cr-doc-title">CONSUMER CIR</h1>

      <div className="cr-box cr-id-box">
        <div className="cr-masthead-meta">
          <Inline label="Member ID" value={show(header.memberId)} />
          <span className="cr-sep" />
          <Inline label="Reference Number" value={show(header.referenceNumber)} />
          <span className="cr-sep" />
          <Inline label="Application No." value={show(header.applicationNo)} />
        </div>
      </div>
    </header>
  );
}
