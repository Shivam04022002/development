import React from "react";
import { show } from "../cibil/format";

/** End-of-report block with an original disclaimer. */
export default function UnderwritingFooter({ header, application }) {
  return (
    <footer className="cr-footer">
      <div className="cr-end">End of credit underwriting decision report</div>
      <h3 className="cr-h3">Disclaimer</h3>
      <p className="cr-disclaimer">
        This report is prepared by {header.companyName} for internal record. It sets
        out information supplied by the applicant and the dealer together with credit
        bureau data retrieved at the time of the enquiry, and the decision recorded
        against the application. Values shown as &quot;Not Available&quot; were not
        recorded in the system. The report states existing information only; it does
        not assess risk or make a lending recommendation.
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
