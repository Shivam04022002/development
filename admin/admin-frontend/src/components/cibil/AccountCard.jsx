import React from "react";
import { show, rate } from "./format";
import { Fields, Inline, Pipe, StatusCorner } from "./ui";
import { inr } from "./currency";
import DPDGrid from "./DPDGrid";

/**
 * One tradeline, laid out as the bureau does it: an "ACCOUNT INFORMATION"
 * strip carrying the account dates and a status corner flag, a three-column
 * body (account / amounts / status), then the payment history block.
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
  // The bureau splits the amounts block into two sub-columns: the money on the
  // left, the repayment terms on the right.
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
        </div>
        <span className={active ? "cr-status cr-status-on" : "cr-status cr-status-off"}>
          {a.status}
        </span>
        <StatusCorner active={active} />

        <div className="cr-account-body">
          <div>
            <h4 className="cr-h4">Account</h4>
            <Fields rows={accountCol} />
          </div>
          <div>
            <h4 className="cr-h4">Amounts</h4>
            <div className="cr-amounts-grid">
              <Fields rows={amountsCol} />
              <Fields rows={termsCol} />
            </div>
          </div>
          <div>
            <h4 className="cr-h4">Status</h4>
            <div className="cr-val">{show(a.accountCondition)}</div>
          </div>
        </div>

        <div className="cr-account-dpd">
          <div className="cr-dpd-strip">
            <span className="cr-strip-title">Days Past Due / Asset Classification</span>
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
