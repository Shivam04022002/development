import React from "react";
import { show } from "./format";
import { Inline } from "./ui";

/**
 * Masthead, document title and the identification box — top of page 1,
 * following the Consumer CIR sheet: the meta pair on the left above the gold
 * rule, the bureau wordmark on the right.
 *
 * The wordmark is set as text rather than reproduced as logo artwork.
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
        <div className="cr-wordmark">
          <span className="cr-wordmark-a">TransUnion</span>
          <span className="cr-wordmark-b">CIBIL</span>
        </div>
      </div>
      <div className="cr-masthead-rule" />

      <h1 className="cr-doc-title cr-doc-title-lead">CONSUMER CIR</h1>

      <section className="cr-section">
        <div className="cr-box cr-id-box">
          <div className="cr-masthead-meta cr-id-row">
            <Inline label="Member ID" value={show(header.memberId)} />
            <Inline label="Reference Number" value={show(header.referenceNumber)} />
            {/* Not on the sheet; carried in the same style so no mapped field is lost. */}
            <Inline label="Application No." value={show(header.applicationNo)} />
          </div>
        </div>
      </section>
    </header>
  );
}
