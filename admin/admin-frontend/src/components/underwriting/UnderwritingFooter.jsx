import React from "react";
import { show } from "../cibil/format";

/** End-of-report block with an original disclaimer. */
export default function UnderwritingFooter({ header, application }) {
  return (
    <footer className="cr-footer">
      <div className="cr-end">End of credit underwriting decision report</div>
      <h3 className="cr-h3">Disclaimer</h3>
      <p className="cr-disclaimer">
        This report is prepared by {header.companyName} for internal credit assessment.
        It combines information supplied by the applicant and the dealer with credit
        bureau data retrieved at the time of the enquiry. Values shown as &quot;-&quot;
        or &quot;Not Available&quot; were not recorded against this application. The
        recommended decision is advisory and derived from the checks shown above; the
        final decision rests with the approving authority in the matrix.
      </p>
      <div className="cr-footer-meta">
        <span>{header.companyName} &middot; {header.address}</span>
        <span>
          Application {show(application.applicationNo)} &middot; {show(header.reportDate)} {show(header.reportTime)}
        </span>
      </div>
    </footer>
  );
}
