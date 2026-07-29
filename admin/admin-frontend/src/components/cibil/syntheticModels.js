// Synthetic models for pagination QA. Shaped exactly like the mapper's output
// so the renderer cannot tell them apart from production data.

const dpdFor = (n) => {
  const years = ["2026", "2025", "2024"];
  const byYear = {};
  years.forEach((y, yi) => {
    byYear[y] = {};
    for (let m = 1; m <= 12; m++) {
      const k = (n + yi + m) % 11;
      byYear[y][m] = k === 0 ? "030" : k === 1 ? "090" : k === 2 ? "XXX" : k === 3 ? "SUB" : "000";
    }
  });
  return { startDate: "01/01/2024", endDate: "01/07/2026", years, byYear };
};

const account = (i) => ({
  index: i + 1,
  status: i % 3 === 0 ? "CLOSED" : "ACTIVE",
  accountCondition: i % 3 === 0 ? "CLOSED" : "ACTIVE",
  accountType: ["CONSUMER LOAN", "CREDIT CARD", "TWO-WHEELER LOAN", "PERSONAL LOAN", "HOUSING LOAN"][i % 5],
  memberName: `SAMPLE LENDER ${(i % 9) + 1}`,
  accountNumber: `QA${String(100000 + i)}`,
  ownership: ["INDIVIDUAL", "JOINT", "GUARANTOR"][i % 3],
  dateOpened: `0${(i % 9) + 1}/0${(i % 9) + 1}/202${i % 6}`,
  dateClosed: i % 3 === 0 ? "15/06/2025" : null,
  dateReported: "09/07/2026",
  dateAccountStatus: "02/07/2026",
  lastPayment: "05/06/2026",
  sanctionedAmount: 25000 + i * 1500,
  currentBalance: i % 4 === 0 ? 0 : 5000 + i * 300,
  overdueAmount: i % 7 === 0 ? 1200 + i : 0,
  actualPayment: 2400 + i * 10,
  creditLimit: i % 5 === 1 ? 50000 : null,
  cashLimit: null,
  emi: 2425,
  interestRate: i % 6 === 0 ? null : 12 + (i % 10),
  repaymentTenure: 12 + (i % 48),
  paymentFrequency: "MONTHLY",
  collateralType: i % 4 === 0 ? "PROPERTY" : "NOT APPLICABLE",
  collateral: null,
  writtenOffTotal: null,
  writtenOffPrincipal: null,
  settlementAmount: null,
  disputeFlag: null,
  dpd: dpdFor(i),
});

const enquiry = (i) => ({
  memberName: `SAMPLE LENDER ${(i % 9) + 1}`,
  date: `1${i % 9}/0${(i % 9) + 1}/2026`,
  purpose: ["PERSONAL LOAN", "CONSUMER LOAN", "CREDIT CARD", "AUTO LOAN"][i % 4],
  amount: 50000 + i * 2500,
  controlNumber: String(90000000 + i),
});

/** Build a full-report model with `n` accounts and `e` enquiries. */
export function syntheticModel(n, e = Math.min(n, 25), label = "QA") {
  const accounts = Array.from({ length: n }, (_, i) => account(i));
  const enquiries = Array.from({ length: e }, (_, i) => enquiry(i));
  const sum = (f) => accounts.reduce((s, a) => s + (a[f] ?? 0), 0);
  return {
    header: {
      reportDate: "29/07/2026", reportTime: "12:00:00",
      controlNumber: null, memberId: null,
      referenceNumber: `tu_synthetic_${label}`, applicationNo: `FORM-${label}`,
    },
    consumer: {
      name: "QA SAMPLE CONSUMER", dob: "01/01/1980", age: 46, gender: "Male",
      telephones: [{ number: "9000000001", type: "MOBILE PHONE" }, { number: "9000000002", type: "OFFICE PHONE" }],
      emails: ["qa.sample@example.com"],
      addresses: [
        { line: "12 QA STREET, LUCKNOW, UTTAR PRADESH, 226010", street: "12 QA STREET", city: "LUCKNOW",
          region: "UTTAR PRADESH", postalCode: "226010", category: "PERMANENT ADDRESS",
          residenceCode: null, reportedBy: "QA BANK", dateReported: "07/07/2025" },
      ],
      employment: [{ employerName: null, accountType: "CONSUMER LOAN", occupation: "Self Employed",
        income: null, netGrossIndicator: null, incomeFrequency: null, dateReported: "09/07/2026" }],
      identification: { pan: "AAAAA0000A", voterId: "QA1234567", ckyc: "20000000000000",
        socialId: "600000000", aadhaar: null, passport: null, drivingLicence: null, rationCard: null },
    },
    score: { value: 753, name: "CIBILTUSC3", model: "CIBILTUSC3", noScoreReason: null,
      factors: ["Length of credit history", "Recent enquiries on the file", "Utilisation of revolving credit"],
      min: 300, max: 900 },
    creditVision: { algorithms: [] },
    summary: {
      accounts: {
        total: accounts.length,
        zeroBalance: accounts.filter((a) => (a.currentBalance ?? 0) === 0).length,
        overdueCount: accounts.filter((a) => (a.overdueAmount ?? 0) > 0).length,
        highCreditTotal: sum("sanctionedAmount"),
        currentBalanceTotal: sum("currentBalance"),
        overdueTotal: sum("overdueAmount"),
        recentOpened: accounts.length ? "01/01/2025" : null,
        oldestOpened: accounts.length ? "01/01/2020" : null,
      },
      enquiries: { total: enquiries.length, mostRecent: enquiries.length ? enquiries[0].date : null,
        past30Days: 0, past12Months: Math.min(enquiries.length, 4), past24Months: enquiries.length },
      creditSummary: null,
    },
    accounts,
    enquiries,
  };
}
