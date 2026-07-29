import React from "react";
import UnderwritingHeader from "./UnderwritingHeader";
import ApplicationSummary from "./ApplicationSummary";
import CustomerProfile from "./CustomerProfile";
import CreditSummaryPanel from "./CreditSummaryPanel";
import CreditNoteSection from "./CreditNoteSection";
import RemarksSection from "./RemarksSection";
import DecisionSection from "./DecisionSection";
import UnderwritingFooter from "./UnderwritingFooter";
import "../cibil/cibilReport.css";
import "./creditUnderwriting.css";

/**
 * Credit Underwriting Decision Report — a factual internal decision sheet.
 *
 * Consumes ONLY the normalised model from utils/creditUnderwritingData.js.
 * It reports stored data: it does not grade risk, score, recommend, or apply
 * any credit policy. The decision shown is the one already recorded on the
 * application.
 *
 * Layout, typography, tables, spacing and print rules are inherited from the
 * CIBIL report design system.
 */
export default function CreditUnderwritingReport({ model }) {
  if (!model) return null;

  return (
    <div className="cibil-report uw-report">
      <UnderwritingHeader header={model.header} />
      <h1 className="uw-title">{model.header.title}</h1>

      <ApplicationSummary application={model.application} header={model.header} />
      <CustomerProfile customer={model.customer} />
      <CreditSummaryPanel summary={model.creditSummary} />
      <CreditNoteSection creditNote={model.creditNote} />
      <RemarksSection remarks={model.remarks} />
      <DecisionSection decision={model.decision} />

      <UnderwritingFooter header={model.header} application={model.application} />
    </div>
  );
}
