import React from "react";

/**
 * Closing block, in the sheet's arrangement: the end-of-report rule, the
 * disclaimer box, then the copyright and corporate-identifier lines.
 *
 * The disclaimer and the two footer lines are the bureau's own statements
 * about the bureau's own data, reproduced from the reference sheet.
 */
export default function ReportFooter({ consumerName }) {
  return (
    <footer>
      <div className="cr-end">
        <span className="cr-end-text">
          End of report{consumerName ? ` on ${consumerName}` : ""}
        </span>
      </div>

      <div className="cr-disclaimer-box">
        <div className="cr-disclaimer-head">Disclaimer</div>
        <p className="cr-disclaimer">
          All information contained in this credit report has been collated by TransUnion
          CIBIL Limited (TU CIBIL) based on information provided/ submitted by its various
          members (&ldquo;<strong>Members</strong>&rdquo;), as part of periodic data
          submission and Members are required to ensure accuracy, completeness and veracity
          of the information submitted. The credit report is generated using the proprietary
          search and match logic of TU CIBIL. TU CIBIL uses its best efforts to ensure
          accuracy, completeness and veracity of the information contained in the Report, and
          shall only be liable and / or responsible if any discrepancies are directly
          attributable to TU CIBIL. The use of this report is governed by the terms and
          conditions of the Operating Rules for TU CIBIL and its Members.
        </p>
      </div>

      <div className="cr-footer-meta">
        <div className="cr-copyright">
          © 2023 TransUnion CIBIL Limited. (Formerly: Credit Information Bureau (India)
          Limited). All rights reserved.
        </div>
        <div className="cr-cin">TransUnion CIBIL CIN : U72300MH2000PLC128359</div>
      </div>
    </footer>
  );
}
