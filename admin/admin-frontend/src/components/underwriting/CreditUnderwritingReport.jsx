import React from "react";
import UnderwritingHeader from "./UnderwritingHeader";
import DecisionBanner from "./DecisionBanner";
import ApplicationSummary from "./ApplicationSummary";
import CustomerProfile from "./CustomerProfile";
import CreditSummaryPanel from "./CreditSummaryPanel";
import RiskAssessment from "./RiskAssessment";
import FinancialAssessment from "./FinancialAssessment";
import DistanceAnalysis from "./DistanceAnalysis";
import UnderwriterAnalysis from "./UnderwriterAnalysis";
import RecommendationBlock from "./RecommendationBlock";
import ApprovalMatrix from "./ApprovalMatrix";
import DocumentsVerified from "./DocumentsVerified";
import UnderwritingFooter from "./UnderwritingFooter";
import "../cibil/cibilReport.css";
import "./creditUnderwriting.css";

/**
 * Credit Underwriting Decision Report.
 *
 * Consumes ONLY the normalised model from utils/creditUnderwritingData.js —
 * no Mongo documents and no bureau JSON reach this component. Layout, spacing,
 * tables and print rules are inherited from the CIBIL report design system;
 * creditUnderwriting.css adds only the underwriting-specific pieces.
 *
 * Pagination is data-driven: section and card break rules come from CSS, so
 * page count follows content for 0, 1, 10 or 100+ accounts.
 */
export default function CreditUnderwritingReport({ model }) {
  if (!model) return null;

  return (
    <div className="cibil-report uw-report">
      <UnderwritingHeader header={model.header} />

      <h1 className="uw-title">{model.header.title}</h1>

      <DecisionBanner decision={model.decision} />
      <ApplicationSummary application={model.application} header={model.header} />
      <CustomerProfile customer={model.customer} />

      <div className="cr-page-break" />
      <CreditSummaryPanel summary={model.creditSummary} />
      <RiskAssessment risk={model.risk} />
      <FinancialAssessment financial={model.financial} />
      <DistanceAnalysis distance={model.distance} />

      <div className="cr-page-break" />
      <UnderwriterAnalysis analysis={model.analysis} />
      <RecommendationBlock decision={model.decision} />
      <DocumentsVerified documents={model.documents} />
      <ApprovalMatrix approvals={model.approvals} />

      <UnderwritingFooter header={model.header} application={model.application} />
    </div>
  );
}
