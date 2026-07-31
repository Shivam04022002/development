import React from "react";
import ReportHeader from "./ReportHeader";
import ConsumerInformation from "./ConsumerInformation";
import ScoreSection from "./ScoreSection";
import AccountSummary from "./AccountSummary";
import EnquirySummary from "./EnquirySummary";
import ConsumerDetails from "./ConsumerDetails";
import AccountCard from "./AccountCard";
import EnquiryTable from "./EnquiryTable";
import Glossary from "./Glossary";
import ReportFooter from "./ReportFooter";
import { reportState, show } from "./format";
import { Fields } from "./ui";
import "./cibilReport.css";

/** Small "nothing reported" mark used beside empty-state copy. */
const NoteIcon = () => (
  <svg className="cr-note-icon" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.2 1.8h6l3.6 3.6v8.8H3.2z" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinejoin="round" />
    <path d="M9.2 1.8v3.6h3.6" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinejoin="round" />
    <path d="M2 14.2 14 2.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

/**
 * Composes the CIBIL report from the normalised model produced by
 * utils/cibilReportData.js. The raw Xaler response is never read here.
 *
 * Props:
 *   model         — the normalised report model (required)
 *   statusMessage — bureau message for a failed flow, supplied by the caller
 *
 * Pagination is entirely data-driven: page breaks come from CSS rules that
 * keep account cards and tables intact, so page count follows content.
 */
export default function CibilReport({ model, statusMessage = null }) {
  if (!model) return null;
  const state = reportState(model, statusMessage);

  // B / C — no bureau report. Render a clean page, never empty tables.
  if (state.kind !== "full") {
    const isError = state.kind === "error";
    return (
      <div className="cibil-report">
        <ReportHeader header={model.header} />
        <section className="cr-section">
          <h2 className="cr-h2">{isError ? "Bureau Report Unavailable" : "Bureau Report Pending"}</h2>
          <div className="cr-box">
            <p className="cr-notice-lead">
              {isError
                ? "The credit bureau could not complete this enquiry, so no report was returned."
                : "The credit bureau enquiry has not yet returned a report for this applicant."}
            </p>
            {state.message && (
              <p className="cr-notice-msg"><strong>Bureau message:</strong> {state.message}</p>
            )}
            <p className="cr-notice-lead">
              No credit information is available to display. Once the bureau returns a
              report, this document will populate automatically.
            </p>
            <Fields rows={[
              ["Application No.", show(model.header.applicationNo)],
              ["Reference Number", show(model.header.referenceNumber)],
            ]} />
          </div>
        </section>
        <ReportFooter header={model.header} consumerName={model.consumer.name} />
      </div>
    );
  }

  // A — full report.
  return (
    <div className="cibil-report">
      <ReportHeader header={model.header} />
      <ConsumerInformation consumer={model.consumer} />
      <ScoreSection score={model.score} />
      <AccountSummary summary={model.summary.accounts} />
      <EnquirySummary summary={model.summary.enquiries} />

      <section className="cr-section">
        <h2 className="cr-h2">CreditVision Algorithm(s)</h2>
        <div className="cr-box cr-algo-box">
          {model.creditVision.algorithms.length === 0 ? (
            <>
              <NoteIcon />
              <p className="cr-empty">No CreditVision algorithm(s) available.</p>
            </>
          ) : (
            <ul className="cr-factor-list">
              {model.creditVision.algorithms.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
        </div>
      </section>

      <div className="cr-page-break" />
      <ConsumerDetails consumer={model.consumer} score={model.score} />

      <div className="cr-page-break" />
      <section className="cr-section cr-section-flow">
        <h1 className="cr-doc-title">CONSUMER ACCOUNT DETAILS</h1>
        {model.accounts.length === 0 ? (
          <div className="cr-box"><p className="cr-empty">No accounts reported.</p></div>
        ) : (
          model.accounts.map((a) => <AccountCard key={`${a.index}-${a.accountNumber || "na"}`} account={a} />)
        )}
      </section>

      <div className="cr-page-break" />
      <EnquiryTable enquiries={model.enquiries} />

      <div className="cr-page-break" />
      <Glossary />
      <ReportFooter header={model.header} consumerName={model.consumer.name} />
    </div>
  );
}
