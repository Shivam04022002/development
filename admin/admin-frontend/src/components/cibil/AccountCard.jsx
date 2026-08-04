import React from "react";
import { show, rate, DASH } from "./format";
import { Fields, Inline, Pipe, StatusCorner } from "./ui";
import { inr } from "./currency";
import DPDGrid from "./DPDGrid";

/**
 * One tradeline, laid out as the sheet does it: an "ACCOUNT INFORMATION" strip
 * carrying the account dates and a corner status flag, a three-column body
 * (account / amounts / status) divided by vertical rules, then the payment
 * history block.
 *
 * The sheet's own rows are always printed, so a missing figure still shows its
 * label against "-". Fields the sheet never prints but the mapper carries are
 * appended only when they hold a value, which keeps a typical card the same
 * height as the reference while never dropping data.
 */
export default function AccountCard({ account }) {
  const a = account;
  const active = a.status === "ACTIVE";

  const accountCol = [
    ["Type", show(a.accountType)],
    ["Member Name", show(a.memberName)],
    ["Account Number", show(a.accountNumber)],
    ["Ownership", show(a.ownership)],
  ];

  // The sheet splits the amounts block in two: money on the left, terms right.
  const amountsCol = [
    ["Sanctioned Amount", inr(a.sanctionedAmount)],
    ["Current Balance", inr(a.currentBalance)],
    ["Overdue", inr(a.overdueAmount)],
    ["Actual Payment", inr(a.actualPayment)],
    ["Credit Limit", inr(a.creditLimit)],
  ];
  const termsCol = [
    ["Payment Frequency", show(a.paymentFrequency)],
    ["Repayment Tenure", show(a.repaymentTenure)],
    ["Interest Rate", rate(a.interestRate)],
    ["EMI", inr(a.emi)],
    ["Written Off", inr(a.writtenOffTotal)],
    ["Collateral Type", show(a.collateralType)],
  ];

  const extra = ([label, value]) => (value === DASH ? null : [label, value]);
  const amountExtras = [
    extra(["Cash Limit", inr(a.cashLimit)]),
    extra(["Written Off (Principal)", inr(a.writtenOffPrincipal)]),
    extra(["Settlement Amount", inr(a.settlementAmount)]),
  ].filter(Boolean);
  const termExtras = [extra(["Collateral", show(a.collateral)])].filter(Boolean);

  const statusRows = [
    extra(["Date of Status", show(a.dateAccountStatus)]),
    extra(["Dispute", show(a.disputeFlag)]),
  ].filter(Boolean);

  return (
    <>
      <p className="cr-account-index">{a.index}. ACCOUNT</p>
      <article className="cr-account">
        <div className="cr-account-strip">
          <span className="cr-strip-title">Account Information</span>
          <Inline label="Date Opened" value={show(a.dateOpened)} />
          <Pipe />
          <Inline label="Date Closed" value={show(a.dateClosed)} />
          <Pipe />
          <Inline label="Date Reported & Certified" value={show(a.dateReported)} />
          <span className="cr-status">{a.status}</span>
        </div>
        <StatusCorner active={active} />

        <div className="cr-account-body">
          <div>
            <h3 className="cr-col-head">Account</h3>
            <Fields rows={accountCol} />
          </div>
          <div>
            <h3 className="cr-col-head">Amounts</h3>
            <div className="cr-amounts-grid">
              <Fields rows={[...amountsCol, ...amountExtras]} />
              <Fields rows={[...termsCol, ...termExtras]} />
            </div>
          </div>
          <div>
            <h3 className="cr-col-head">Status</h3>
            <div className="cr-val">{show(a.accountCondition)}</div>
            {statusRows.length > 0 && <Fields rows={statusRows} />}
          </div>
        </div>

        <div className="cr-account-dpd">
          <div className="cr-dpd-strip">
            <span className="cr-strip-title">Days Past Due/Asset Classification</span>
            <Inline label="Start Date" value={show(a.dpd?.startDate)} />
            <Pipe />
            <Inline label="End Date" value={show(a.dpd?.endDate)} />
            <Pipe />
            <Inline label="Last Payment" value={show(a.lastPayment)} />
          </div>
          <DPDGrid dpd={a.dpd} />
        </div>
      </article>
    </>
  );
}
