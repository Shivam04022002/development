// pdf/CibilCirDocument.js
//
// Composes the Consumer CIR PDF from the normalised report model produced by
// utils/cibilReportData.js. Receives no MongoDB documents and no raw bureau
// JSON — rawResponse, steps[], TrueLinkCreditReport, Borrower, InquiryPartition
// and TradeLinePartition are never touched here.
//
// Section order, proportions and typography follow the same reference sheet as
// the web renderer (components/cibil/*), so the download matches the QA view.

import React from "react";
import { Document, Page, View, Text, Svg, Path, Polygon, G } from "@react-pdf/renderer";
import { styles, COLORS, FS, u, CONTENT_UNITS } from "./cirStyles.js";
import { show, inr, rate, NA, DASH, MONTHS, reportState } from "./cirFormat.js";

const h = React.createElement;

/* ── Primitives ────────────────────────────────────────────────────────────── */

/** Stacked LABEL : value rows. `labelUnits` sizes the fixed label column. */
const Fields = ({ rows, labelUnits = 90, colonUnits = 12.4 }) =>
  h(
    View,
    null,
    rows.map(([label, value], i) =>
      h(
        View,
        { key: `${label}-${i}`, style: styles.fieldRow },
        h(Text, { style: [styles.label, { width: u(labelUnits) }] }, String(label).toUpperCase()),
        h(Text, { style: [styles.colon, { width: u(colonUnits) }] }, ":"),
        h(Text, { style: styles.value }, value)
      )
    )
  );

/** One LABEL : value pair on a single line, for strips and one-line boxes. */
const Inline = ({ label, value }) =>
  h(
    View,
    { style: styles.inline },
    h(Text, { style: styles.inlineLabel }, `${String(label).toUpperCase()} `),
    h(Text, { style: styles.inlineValue }, `: ${value}`)
  );

const Pipe = () => h(Text, { style: styles.pipe }, "|");

/** A table with explicit column proportions, as measured off the sheet. */
const Table = ({ head, rows, widths, padUnits = 9.7, strongFirst = false }) => {
  const cell = (w) => ({ width: `${w}%`, paddingHorizontal: u(padUnits) });
  return h(
    View,
    null,
    head &&
      h(
        View,
        { style: styles.thead },
        head.map((t, i) =>
          h(Text, { key: i, style: [styles.th, cell(widths[i])] }, String(t).toUpperCase())
        )
      ),
    rows.map((r, ri) =>
      h(
        View,
        { key: ri, style: ri === rows.length - 1 ? styles.trLast : styles.tr, wrap: false },
        r.map((c, ci) =>
          h(
            View,
            { key: ci, style: cell(widths[ci]) },
            Array.isArray(c)
              ? c.map((line, li) =>
                  h(Text, { key: li, style: [styles.td, { paddingHorizontal: 0 }] }, line)
                )
              : h(
                  Text,
                  {
                    style: [
                      styles.td,
                      { paddingHorizontal: 0 },
                      strongFirst && ci === 0 ? styles.tdStrong : null,
                    ],
                  },
                  c
                )
          )
        )
      )
    )
  );
};

/* ── Score gauge ───────────────────────────────────────────────────────────
   Geometry measured off the sheet: a 135.6-unit grey arc with a 13.1-unit
   stroke (61.25-unit centreline radius) and an 8 x 9-unit pointer. */
const CX = 107.5;
const CY = 100;
const R = 61.25;
const STROKE = 13.1;

const Gauge = ({ value, min, max }) => {
  const pct = value === null ? 0 : ((Math.min(Math.max(value, min), max) - min) / (max - min)) * 100;
  const theta = Math.PI * (1 - pct / 100);
  const px = CX + R * Math.cos(theta);
  const py = CY - R * Math.sin(theta);
  const tx = Math.sin(theta);
  const ty = Math.cos(theta);
  const pointer = [
    [px + tx * 5.5, py + ty * 5.5],
    [px - tx * 3 + ty * 4.2, py - ty * 3 - tx * 4.2],
    [px - tx * 3 - ty * 4.2, py - ty * 3 + tx * 4.2],
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  // Travelled arc: sweep to the current angle so no dash array is needed.
  const travelled = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${px.toFixed(2)} ${py.toFixed(2)}`;

  return h(
    Svg,
    { viewBox: "36 30 143 98", style: { width: u(143), height: u(98) } },
    h(Path, { d: arc, stroke: COLORS.line, strokeWidth: STROKE, fill: "none" }),
    value !== null &&
      h(Path, { d: travelled, stroke: COLORS.cyan, strokeWidth: STROKE, fill: "none" }),
    value !== null && h(Polygon, { points: pointer, fill: "#000000" }),
    h(
      G,
      null,
      h(
        Text,
        {
          x: CX,
          y: CY - 6,
          style: { fontSize: FS.scoreValue / 0.7055, fontWeight: "bold", fill: COLORS.ink },
          textAnchor: "middle",
        },
        value === null ? "-" : String(value)
      ),
      h(
        Text,
        { x: CX - R, y: CY + 20, style: { fontSize: FS.gaugeEnd / 0.7055, fill: COLORS.muted }, textAnchor: "middle" },
        String(min)
      ),
      h(
        Text,
        { x: CX + R, y: CY + 20, style: { fontSize: FS.gaugeEnd / 0.7055, fill: COLORS.muted }, textAnchor: "middle" },
        String(max)
      )
    )
  );
};

/* ── Sections ──────────────────────────────────────────────────────────────── */

const Masthead = ({ header }) =>
  h(
    View,
    null,
    h(
      View,
      { style: styles.masthead },
      h(
        View,
        { style: styles.mastheadMeta },
        h(Inline, {
          label: "Report Date & Time",
          value: `${show(header.reportDate)} (${show(header.reportTime)})`,
        }),
        h(View, { style: styles.sep }),
        h(Inline, { label: "Control Number", value: show(header.controlNumber) })
      ),
      h(Text, { style: styles.wordmark }, "TransUnion CIBIL")
    ),
    h(View, { style: styles.mastheadRule })
  );

const IdBox = ({ header }) =>
  h(
    View,
    { style: styles.section },
    h(
      View,
      { style: [styles.box, styles.idBox] },
      h(
        View,
        { style: [styles.mastheadMeta, { justifyContent: "space-between" }] },
        h(Inline, { label: "Member ID", value: show(header.memberId) }),
        h(Inline, { label: "Reference Number", value: show(header.referenceNumber) }),
        h(Inline, { label: "Application No.", value: show(header.applicationNo) })
      )
    )
  );

const ConsumerInformation = ({ consumer }) => {
  const id = consumer.identification;
  const address = consumer.addresses.length ? consumer.addresses[0].line : null;
  const left = [
    ["Consumer Name", show(consumer.name)],
    ["DOB", show(consumer.dob)],
    ["Age", show(consumer.age)],
    ["Telephone No.", consumer.telephones.length ? consumer.telephones[0].number : DASH],
    ["Email ID", consumer.emails.length ? consumer.emails[0] : DASH],
    ["Gender", show(consumer.gender)],
    ["Address", show(address)],
  ];
  const right = [
    ["PAN", show(id.pan)],
    ["Driving Licence No", show(id.drivingLicence, NA)],
    ["Voter ID", show(id.voterId)],
    ["Passport No.", show(id.passport, NA)],
    ["Aadhaar Number (UID)", show(id.aadhaar, NA)],
    ["CKYC", show(id.ckyc)],
    ["Ration Card", show(id.rationCard, NA)],
    ["Social ID", show(id.socialId, NA)],
  ];
  return h(
    View,
    { style: styles.section, wrap: false },
    h(Text, { style: styles.h2 }, "CONSUMER INFORMATION"),
    h(
      View,
      { style: styles.box },
      h(
        View,
        { style: styles.fieldsGrid },
        h(View, { style: { width: "50%" } }, h(Fields, { rows: left })),
        h(View, { style: { width: "50%" } }, h(Fields, { rows: right }))
      )
    )
  );
};

/*
 * Scoring factors are normally a handful of short lines, and the block is kept
 * atomic so the three columns stay aligned and the gauge stays vertically
 * centred, exactly as on the reference sheet.
 *
 * But the bureau can also return them as full paragraphs — one live report
 * carries ten factors totalling ~5,700 characters — which makes the block
 * taller than a page. A wrap:false View that exceeds the page cannot be broken,
 * so react-pdf paints it over whatever follows. Simply allowing the row to wrap
 * is not a fix either: alignItems:center is undefined across a page boundary
 * and strands the gauge in the middle of the next page.
 *
 * So the block stays atomic up to the point where it still fits a page, and
 * only beyond that switches to a top-aligned, breakable row. Every report whose
 * factors fit — including the reference — renders byte-identically; nothing is
 * ever truncated or dropped.
 */
const FACTORS_ATOMIC_LIMIT = 1200; // characters; ~half a page in the factor column

/** Name + range block — identical in both paths. */
const ScoreName = ({ score }) =>
  h(
    View,
    { style: { width: u(168) } },
    h(
      Text,
      { style: styles.scoreName },
      `${show(score.name, "Enhanced CreditVision")}® Score`
    ),
    h(
      Text,
      { style: styles.scoreRange },
      `Ranges from:
${score.min} (high risk) to ${score.max} (low risk)`
    )
  );

const FactorList = ({ factors }) =>
  h(
    View,
    null,
    h(Text, { style: styles.factorHead }, "SCORING FACTORS"),
    factors.length === 0
      ? h(Text, { style: styles.empty }, "No scoring factors reported.")
      : factors.map((f, i) => h(Text, { key: i, style: styles.factorItem }, `${i + 1}. ${f}`))
  );

const ScoreSection = ({ score }) => {
  const atomic = score.factors.join("").length <= FACTORS_ATOMIC_LIMIT;

  // Normal path: the sheet's three-column row, kept whole so the gauge stays
  // vertically centred and the columns stay aligned.
  const atomicBody = h(
    View,
    { style: styles.scoreBody },
    h(ScoreName, { score }),
    h(
      View,
      { style: { width: u(182), alignItems: "center" } },
      h(Gauge, { value: score.value, min: score.min, max: score.max })
    ),
    h(
      View,
      { style: { flexGrow: 1, flexBasis: 0, minWidth: 0 } },
      h(FactorList, { factors: score.factors })
    )
  );

  // Overflow path: the factor list moves below the name/gauge row so the block
  // is a plain column that react-pdf can break. Reached only when the factors
  // would otherwise make the block taller than a page.
  const flowBody = h(
    View,
    null,
    h(
      View,
      { style: styles.scoreBody },
      h(ScoreName, { score }),
      h(
        View,
        { style: { width: u(182), alignItems: "center" } },
        h(Gauge, { value: score.value, min: score.min, max: score.max })
      )
    ),
    h(FactorList, { factors: score.factors })
  );

  return h(
    View,
    { style: styles.section, wrap: atomic ? false : true },
    h(Text, { style: styles.h2 }, "CIBIL TRANSUNION SCORE(S)"),
    h(View, { style: styles.box }, atomic ? atomicBody : flowBody)
  );
};

const AccountSummary = ({ summary }) => {
  const groups = [
    ["Accounts", [
      ["Total", show(summary.total)],
      ["Zero balance", show(summary.zeroBalance)],
      ["Overdue", show(summary.overdueCount)],
    ]],
    ["Balances", [
      ["High Cr/Sanc. Amt", inr(summary.highCreditTotal)],
      ["Current", inr(summary.currentBalanceTotal)],
      ["Overdue", inr(summary.overdueTotal)],
    ]],
    ["Account Opened Date", [
      ["Recent", show(summary.recentOpened)],
      ["Oldest", show(summary.oldestOpened)],
    ]],
  ];
  return h(
    View,
    { style: styles.section, wrap: false },
    h(Text, { style: styles.h2 }, "CONSUMER ACCOUNT SUMMARY"),
    h(
      View,
      { style: styles.box },
      h(
        View,
        { style: styles.summaryGrid },
        groups.map(([title, rows], gi) =>
          h(
            View,
            {
              key: title,
              style: [
                styles.summaryCol,
                gi > 0 ? styles.summaryDivider : null,
                gi === 0 ? { paddingLeft: 0 } : null,
                gi === 2 ? { paddingRight: 0 } : null,
              ],
            },
            h(Text, { style: styles.h3 }, title.toUpperCase()),
            h(
              View,
              { style: styles.summaryRows },
              rows.map(([k, v]) =>
                h(
                  View,
                  { key: k, style: styles.summaryRow },
                  h(Text, { style: styles.summaryK }, k),
                  h(Text, { style: styles.summaryColon }, ":"),
                  h(Text, { style: styles.summaryV }, v)
                )
              )
            )
          )
        )
      )
    )
  );
};

const EnquirySummary = ({ summary }) =>
  h(
    View,
    { style: styles.section, wrap: false },
    h(Text, { style: styles.h2 }, "ENQUIRY SUMMARY"),
    h(
      View,
      { style: styles.boxFlush },
      h(Table, {
        head: ["Total Enquiries", "Most Recent", "Past 30 Days", "Past 12 Months", "Past 24 Months"],
        rows: [[
          show(summary.total), show(summary.mostRecent), show(summary.past30Days),
          show(summary.past12Months), show(summary.past24Months),
        ]],
        widths: [20, 20, 20, 20, 20],
      })
    )
  );

const CreditVision = ({ algorithms }) =>
  h(
    View,
    { style: styles.section, wrap: false },
    h(Text, { style: styles.h2 }, "CREDITVISION® ALGORITHM(S)"),
    h(
      View,
      { style: styles.box },
      algorithms.length === 0
        ? h(Text, { style: styles.empty }, "No CreditVision algorithm(s) available.")
        : algorithms.map((a, i) => h(Text, { key: i, style: styles.factorItem }, a))
    )
  );

/**
 * A titled table in a bordered box, with the sheet's optional footnote.
 *
 * The block itself may split across pages — an enquiry list is unbounded and a
 * non-wrapping wrapper would overflow a single page — while each row stays
 * whole via wrap:false on the row in Table().
 */
const DetailTable = ({ title, head, rows, widths, empty, note, padUnits, strongFirst }) =>
  h(
    View,
    { style: styles.subsection },
    h(Text, { style: styles.h2 }, title.toUpperCase()),
    h(
      View,
      { style: styles.boxFlush },
      rows.length === 0
        ? h(Text, { style: styles.emptyPadded }, empty)
        : h(Table, { head, rows, widths, padUnits, strongFirst })
    ),
    note && h(Text, { style: styles.footnote }, note)
  );

const ConsumerDetails = ({ consumer, score }) => {
  const id = consumer.identification;
  return h(
    View,
    null,
    h(Text, { style: styles.docTitle }, "CONSUMER DETAILS"),
    h(
      View,
      { style: styles.subsection, wrap: false },
      h(Text, { style: styles.h2 }, "CONSUMER INFORMATION"),
      h(
        View,
        { style: [styles.box, styles.idBox] },
        h(
          View,
          { style: [styles.mastheadMeta, { justifyContent: "space-between" }] },
          h(Inline, { label: "Consumer Name", value: show(consumer.name) }),
          h(Inline, { label: "D.O.B", value: show(consumer.dob) }),
          h(Inline, { label: "Gender", value: show(consumer.gender) }),
          h(Inline, { label: "CreditVision® Score", value: show(score?.value) })
        )
      )
    ),
    h(DetailTable, {
      title: "Identification(s)",
      head: ["Identification Type", "Identification Number", "Issue Date", "Expiration Date"],
      widths: [24.3, 24.3, 24.4, 27],
      padUnits: 28,
      rows: [
        ["PAN Card", show(id.pan), DASH, DASH],
        ["Voter ID", show(id.voterId), DASH, DASH],
        ["Aadhaar ID", show(id.aadhaar, NA), DASH, DASH],
        ["Passport", show(id.passport, NA), DASH, DASH],
        ["Driving Licence", show(id.drivingLicence, NA), DASH, DASH],
        ["Ration Card", show(id.rationCard, NA), DASH, DASH],
        ["Social ID", show(id.socialId, NA), DASH, DASH],
        ["CKYC", show(id.ckyc), DASH, DASH],
      ],
      empty: "No identification reported.",
      note: "(e) - IDENTIFICATION REPORTED FROM ENQUIRY",
    }),
    h(DetailTable, {
      title: "Telephone(s)",
      head: ["Type", "Telephone Number", "Telephone Extension"],
      widths: [32.4, 32.4, 35.2],
      padUnits: 28,
      rows: consumer.telephones.map((t) => [show(t.type), show(t.number), DASH]),
      empty: "No telephone numbers reported.",
      note: "(e) - TELEPHONE REPORTED FROM ENQUIRY",
    }),
    h(DetailTable, {
      title: "Email Contact(s)",
      head: null,
      widths: [100],
      padUnits: 28,
      rows: consumer.emails.map((e) => [show(e)]),
      empty: "No email addresses reported.",
    }),
    h(DetailTable, {
      title: "Consumer's Reported Address(es)",
      head: ["Address", "Category", "Residence Code", "Reported By", "Date Reported"],
      widths: [34, 17, 16, 16, 17],
      rows: consumer.addresses.map((a) => [
        show(a.line), show(a.category), show(a.residenceCode), show(a.reportedBy), show(a.dateReported),
      ]),
      empty: "No addresses reported.",
      note: "(e) - ADDRESSES REPORTED FROM ENQUIRY",
    }),
    h(DetailTable, {
      title: "Employment Information",
      head: [
        "Account Type (Date Reported)", "Employer", "Occupation Code", "Income",
        "Net/Gross Income Indicator", "Monthly/Annual Income Indicator",
      ],
      widths: [20, 16, 16, 16, 16, 16],
      rows: consumer.employment.map((e) => [
        [show(e.accountType), `(${show(e.dateReported)})`],
        show(e.employerName, NA),
        show(e.occupation, NA),
        inr(e.income) === DASH ? NA : inr(e.income),
        show(e.netGrossIndicator, NA),
        show(e.incomeFrequency, NA),
      ]),
      empty: "No employment information reported.",
    })
  );
};

/* Cell styles flattened once rather than rebuilt per cell. Measured: no
   material effect on render time (the cost is in the layout engine), kept
   only because it is the clearer expression. */
const DPD_YEAR_HEAD = { ...styles.dpdCellHead, width: "8%", paddingLeft: u(9.7) };
const DPD_MONTH_HEAD = { ...styles.dpdCellHead, width: "7.666%" };
const DPD_MONTH_CELL = { ...styles.dpdCell, width: "7.666%" };

const DpdGrid = ({ dpd }) => {
  if (!dpd || dpd.years.length === 0) {
    return h(Text, { style: styles.emptyPadded }, "No payment history reported.");
  }
  return h(
    View,
    null,
    h(
      View,
      { style: styles.dpdHead },
      h(Text, { style: DPD_YEAR_HEAD }, "YEAR"),
      MONTHS.map((m) => h(Text, { key: m, style: DPD_MONTH_HEAD }, m))
    ),
    dpd.years.map((y) =>
      h(
        View,
        { key: y, style: styles.dpdRow },
        h(Text, { style: DPD_YEAR_HEAD }, String(y)),
        MONTHS.map((m, i) => {
          const code = dpd.byYear[y] ? dpd.byYear[y][i + 1] : null;
          return h(Text, { key: m, style: DPD_MONTH_CELL }, code || DASH);
        })
      )
    )
  );
};

const AccountCard = ({ account: a }) => {
  const accountCol = [
    ["Type", show(a.accountType)],
    ["Member Name", show(a.memberName)],
    ["Account Number", show(a.accountNumber)],
    ["Ownership", show(a.ownership)],
  ];
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
  // Fields the sheet never prints but the mapper carries: shown only when set,
  // so a typical card keeps the reference height and no data is dropped.
  const opt = ([l, v]) => (v === DASH ? null : [l, v]);
  const amountExtras = [
    opt(["Cash Limit", inr(a.cashLimit)]),
    opt(["Written Off (Principal)", inr(a.writtenOffPrincipal)]),
    opt(["Settlement Amount", inr(a.settlementAmount)]),
  ].filter(Boolean);
  const termExtras = [opt(["Collateral", show(a.collateral)])].filter(Boolean);
  const statusRows = [
    opt(["Date of Status", show(a.dateAccountStatus)]),
    opt(["Dispute", show(a.disputeFlag)]),
  ].filter(Boolean);

  return h(
    View,
    { wrap: false },
    h(Text, { style: styles.acctIndex }, `${a.index}. ACCOUNT`),
    h(
      View,
      { style: styles.acct },
      h(
        View,
        { style: styles.acctStrip },
        h(Text, { style: styles.stripTitle }, "ACCOUNT INFORMATION  "),
        h(Inline, { label: "Date Opened", value: show(a.dateOpened) }),
        h(Pipe),
        h(Inline, { label: "Date Closed", value: show(a.dateClosed) }),
        h(Pipe),
        h(Inline, { label: "Date Reported & Certified", value: show(a.dateReported) }),
        h(Text, { style: styles.status }, show(a.status))
      ),
      h(
        View,
        { style: styles.acctBody },
        h(
          View,
          { style: [styles.acctCol, { width: "27.5%" }] },
          h(Text, { style: styles.colHead }, "ACCOUNT"),
          h(Fields, { rows: accountCol, labelUnits: 63, colonUnits: 7.5 })
        ),
        h(
          View,
          {
            style: [
              styles.acctCol,
              { width: "44.8%", borderLeftWidth: 0.6, borderLeftColor: COLORS.line },
            ],
          },
          h(Text, { style: styles.colHead }, "AMOUNTS"),
          h(
            View,
            { style: { flexDirection: "row" } },
            h(
              View,
              { style: { width: "50%" } },
              h(Fields, { rows: [...amountsCol, ...amountExtras], labelUnits: 63, colonUnits: 7.5 })
            ),
            h(
              View,
              { style: { width: "50%" } },
              h(Fields, { rows: [...termsCol, ...termExtras], labelUnits: 63, colonUnits: 7.5 })
            )
          )
        ),
        h(
          View,
          {
            style: [
              styles.acctCol,
              { width: "27.7%", borderLeftWidth: 0.6, borderLeftColor: COLORS.line },
            ],
          },
          h(Text, { style: styles.colHead }, "STATUS"),
          h(Text, { style: styles.value }, show(a.accountCondition)),
          statusRows.length > 0 && h(Fields, { rows: statusRows, labelUnits: 63, colonUnits: 7.5 })
        )
      ),
      h(
        View,
        { style: styles.acctDpd },
        h(
          View,
          { style: styles.dpdStrip },
          h(Text, { style: styles.stripTitle }, "DAYS PAST DUE/ASSET CLASSIFICATION  "),
          h(Inline, { label: "Start Date", value: show(a.dpd?.startDate) }),
          h(Pipe),
          h(Inline, { label: "End Date", value: show(a.dpd?.endDate) }),
          h(Pipe),
          h(Inline, { label: "Last Payment", value: show(a.lastPayment) })
        ),
        h(DpdGrid, { dpd: a.dpd })
      )
    )
  );
};

/* Glossary rows follow the reference sheet section for section. */
const GLOSSARY = [
  ["Report name", "-", ["Consumer CIR"]],
  ["Consumer Details", "e", ["Enriched through Enquiry"]],
  ["Identification(s)", "ID Types", [
    "Income Tax ID Number (PAN)", "Passport Number", "Voter ID",
    "Driver’s License Number", "Ration Card Number", "Universal ID Number (UID)",
  ]],
  ["Telephone(s) :", "Telephone Types", [
    "Latest 4 Telephone details reported.", "Mobile phone", "Home Phone", "Office phone", "Not Classified",
  ]],
  ["Email Contact(s) :", "-", ["Latest 4 emails reported."]],
  ["Employment Information(s) :", "Occupation Codes", [
    "Latest Employment detail reported.", "Salaried", "Self Employed Professionals", "Self Employed", "Others",
  ]],
  ["Address(es) :", "Address Category", [
    "Latest 4 address reported.", "Permanent Address", "Residence Address", "Office Address", "Not categorized",
  ]],
  ["Consumer Account Details:", "Account Information", [
    "Active: Account not closed", "Inactive: Closed account",
    "Date Opened: Date of first disbursement", "Date Closed: Date of account closure",
    "Date reported & Certified: Most recent date reported by reporting member",
    "Last Payment Date: Most recent date a payment was made on the account.",
  ]],
  ["Consumer Account Details:", "Day Past Due/Asset Classification", [
    "Start date: Beginning of the payment history", "End Date: End of the payment history",
    "000: Payment is made on the due date",
    "001-900: Payment is missed by number of days from the due date",
    "STD: Payments being made within 90 days",
    "SMA: Special account created for reporting Standard Accounts moving toward Sub-Standard",
    "SUB: Payments being made after 90 days",
    "DBT : The account has remained Sub-Standard for 12 months",
    "LSS : The account where loss has been identified and remains uncollectable",
    "XXX : Data not reported by Institution",
  ]],
  ["Consumer Account Details:", "Information under dispute", [
    "Consumer has raised grievance request regarding issue in correctness of the data reported by Financial Institution",
  ]],
  ["Enquiry Details :", "Not Disclosed", ["Enquiry made with other Members"]],
];

const Glossary = () =>
  h(
    View,
    null,
    h(Text, { style: styles.docTitle }, "GLOSSARY"),
    h(
      View,
      { style: styles.boxFlush },
      h(Text, { style: styles.boxTitle }, "CIR Data Glossary"),
      h(Table, {
        head: ["Report Section", "Key Term / Code", "Description"],
        widths: [25, 25, 50],
        strongFirst: true,
        rows: GLOSSARY.map(([s, t, lines]) => [s, t, lines]),
      })
    )
  );

const Closing = ({ consumerName }) =>
  h(
    View,
    null,
    h(
      View,
      { style: styles.end, wrap: false },
      h(View, { style: styles.endLine }),
      h(Text, { style: styles.endText }, `END OF REPORT${consumerName ? ` ON ${consumerName}` : ""}`),
      h(View, { style: styles.endLine })
    ),
    h(
      View,
      { style: styles.disclaimerBox, wrap: false },
      h(Text, { style: styles.disclaimerHead }, "DISCLAIMER"),
      h(
        Text,
        { style: styles.disclaimer },
        "All information contained in this credit report has been collated by TransUnion CIBIL " +
          "Limited (TU CIBIL) based on information provided/ submitted by its various members " +
          "(“Members”), as part of periodic data submission and Members are required to ensure " +
          "accuracy, completeness and veracity of the information submitted. The credit report is " +
          "generated using the proprietary search and match logic of TU CIBIL. TU CIBIL uses its best " +
          "efforts to ensure accuracy, completeness and veracity of the information contained in the " +
          "Report, and shall only be liable and / or responsible if any discrepancies are directly " +
          "attributable to TU CIBIL. The use of this report is governed by the terms and conditions of " +
          "the Operating Rules for TU CIBIL and its Members."
      )
    ),
    h(
      View,
      { style: styles.footerMeta, wrap: false },
      h(
        Text,
        { style: styles.copyright },
        "© 2023 TransUnion CIBIL Limited. (Formerly: Credit Information Bureau (India) Limited). All rights reserved."
      ),
      h(Text, { style: styles.cin }, "TransUnion CIBIL CIN : U72300MH2000PLC128359")
    )
  );

/* ── Document ──────────────────────────────────────────────────────────────── */

export default function CibilCirDocument({ model, statusMessage = null }) {
  const state = reportState(model, statusMessage);

  // B / C — no bureau report. A clean page, never empty tables.
  if (state.kind !== "full") {
    const isError = state.kind === "error";
    return h(
      Document,
      { title: "Consumer CIR", author: "TransUnion CIBIL" },
      h(
        Page,
        { size: "A4", style: styles.page },
        h(Masthead, { header: model.header }),
        h(Text, { style: styles.docTitleLead }, "CONSUMER CIR"),
        h(IdBox, { header: model.header }),
        h(
          View,
          { style: styles.section },
          h(Text, { style: styles.h2 }, isError ? "BUREAU REPORT UNAVAILABLE" : "BUREAU REPORT PENDING"),
          h(
            View,
            { style: styles.box },
            h(
              Text,
              { style: styles.noticeLead },
              isError
                ? "The credit bureau could not complete this enquiry, so no report was returned."
                : "The credit bureau enquiry has not yet returned a report for this applicant."
            ),
            state.message && h(Text, { style: styles.noticeMsg }, `Bureau message: ${state.message}`),
            h(
              Text,
              { style: styles.noticeLead },
              "No credit information is available to display. Once the bureau returns a report, this document will populate automatically."
            ),
            h(Fields, {
              rows: [
                ["Application No.", show(model.header.applicationNo)],
                ["Reference Number", show(model.header.referenceNumber)],
              ],
            })
          )
        ),
        h(Closing, { consumerName: model.consumer.name })
      )
    );
  }

  // A — full report. Sections flow; cards and grids stay whole.
  return h(
    Document,
    { title: "Consumer CIR", author: "TransUnion CIBIL" },
    h(
      Page,
      { size: "A4", style: styles.page },
      h(Masthead, { header: model.header }),
      h(Text, { style: styles.docTitleLead }, "CONSUMER CIR"),
      h(IdBox, { header: model.header }),
      h(ConsumerInformation, { consumer: model.consumer }),
      h(ScoreSection, { score: model.score }),
      h(AccountSummary, { summary: model.summary.accounts }),
      h(EnquirySummary, { summary: model.summary.enquiries }),
      h(CreditVision, { algorithms: model.creditVision.algorithms }),
      h(ConsumerDetails, { consumer: model.consumer, score: model.score }),

      h(Text, { style: styles.docTitle }, "CONSUMER ACCOUNT DETAILS"),
      model.accounts.length === 0
        ? h(View, { style: styles.box }, h(Text, { style: styles.empty }, "No accounts reported."))
        : model.accounts.map((a) =>
            h(AccountCard, { key: `${a.index}-${a.accountNumber || "na"}`, account: a })
          ),

      h(Text, { style: styles.docTitle }, "CONSUMER ENQUIRY DETAILS"),
      h(DetailTable, {
        title: "Enquiries",
        head: ["Member Name", "Enquiry Date", "Enquiry Purpose", "Enquiry Amount", "Control Number"],
        widths: [25, 18, 25, 16, 16],
        rows: model.enquiries.map((e) => [
          show(e.memberName), show(e.date), show(e.purpose), inr(e.amount), show(e.controlNumber),
        ]),
        empty: "No enquiries reported.",
      }),

      h(Glossary),
      h(Closing, { consumerName: model.consumer.name })
    )
  );
}
