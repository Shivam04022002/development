import * as XLSX from "xlsx";

const formatDate = (val) => {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return String(val);
  }
};

const isoDate = (val) => {
  if (!val) return "";
  try {
    return new Date(val).toISOString().slice(0, 10);
  } catch {
    return "";
  }
};

const getApplicantName = (app) =>
  app?.applicant?.applicant?.name || app?.applicant?.name || "—";

const getDealerName = (app) =>
  app?.dealerDetails?.name || app?.dealer?.name || "—";

const getBranch = (app) =>
  app?.branchName ||
  app?.dealerDetails?.branch ||
  app?.dealerDetails?.Branch ||
  app?.dealer?.Branch ||
  app?.dealer?.branch ||
  "—";

const getMobile = (app) =>
  app?.applicant?.applicant?.mobileNumber ||
  app?.applicant?.mobileNumber ||
  app?.applicant?.applicant?.mobile ||
  app?.applicant?.mobile ||
  "—";

const getVehicle = (app) =>
  app?.applicant?.applicant?.vehicleName ||
  app?.applicant?.vehicleName ||
  app?.applicant?.applicant?.vehicle ||
  app?.applicant?.vehicle ||
  "—";

// "Created Date" = the dealer's ORIGINAL submission date.
// The record's own createdAt is unreliable for approved records — it was
// re-stamped at approval time. The true submission timestamp is preserved on
// the embedded applicant sub-document (canonical) and corroborated by the
// vehicle-details submission. Fall back to the record createdAt last (correct
// for pending and for records fixed after the createdAt-preservation change).
const getCreatedTs = (app) =>
  app?.applicant?.createdAt ||
  app?.applicant?.applicant?.createdAt ||
  app?.vehicleDetails?.createdAt ||
  app?.createdAt;

// "Updated Date" business rule:
//   pending  -> last update            (updatedAt)
//   approved -> approval time          (updatedAt is stamped at approval)
//   rejected -> rejection time         (rejection.rejectedAt — updatedAt is
//               unreliable: historical records left it equal to createdAt)
const getUpdatedTs = (app, status) =>
  status === "rejected"
    ? (app?.rejection?.rejectedAt || app?.updatedAt)
    : app?.updatedAt;

// Shared helper — whole-calendar-day difference between two dates.
//   • Accepts a Date or ISO string.
//   • Ignores hours/minutes/seconds (compares calendar dates only).
//   • Returns a non-negative integer day difference (0 when same day).
//   • Never returns a negative value.
//   • Returns null for missing or invalid dates.
const calculateProcessingDays = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const startMidnight = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endMidnight = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = Math.floor((endMidnight - startMidnight) / 86400000);
  return diff < 0 ? 0 : diff;
};

// Immutable workflow-completion timestamps for the Processing Days calc.
// These must NEVER drift if the record is edited after the workflow finishes,
// so they read the DEDICATED workflow field — not the generic Mongo `updatedAt`.

// Rejected: the rejection time lives in the nested `rejection.rejectedAt` field,
// set once at rejection and never rewritten by timestamp bookkeeping. If a legacy
// record lacks it, return null (-> "N/A") rather than a drift-prone updatedAt.
const getRejectionTs = (app) => app?.rejection?.rejectedAt || null;

// Approved: `approvedAt` is the dedicated, immutable approval timestamp, set once
// when the application moves into the approved collection. The schema also carries
// the generic `updatedAt` ({ timestamps: true }), which any later save rewrites, so
// it is only a fallback for legacy records approved before `approvedAt` existed —
// which the backfill script fills in.
const getApprovalTs = (app) =>
  app?.approvedAt || app?.disbursedAt || app?.updatedAt || null;

// The business date the admin entered when the application was disbursed. It is
// its own field, distinct from every timestamp above — never approvedAt,
// createdAt, updatedAt or disbursedAt (which records when the entry was made,
// not the date it happened). Records approved before the disbursement step
// existed carry no `disbursement` block at all.
const getDisbursementTs = (app) => app?.disbursement?.disbursementDate || null;

// A calendar date, not a timestamp: the day the admin picked, with no time
// component. Rendered in LOCAL time, because the value is stored as that local
// midnight converted to an instant (DisbursementModal sends
// `new Date("YYYY-MM-DDT00:00:00").toISOString()`, which is local, not UTC) —
// so 08 Aug picked in IST is stored as 07 Aug 18:30Z and only local formatting
// reads it back as the 8th. This matches every other surface that shows the
// field. Blank — never "—" or "Invalid Date" — when there is nothing to show.
const formatBusinessDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// End date for the Processing Days calculation, per business rule:
//   approved -> approval timestamp   (getApprovalTs — dedicated field, else updatedAt)
//   rejected -> rejection timestamp  (rejection.rejectedAt — dedicated, immutable)
//   pending  -> exportDate           (computed once per export, passed in)
const getProcessingEndTs = (app, status, exportDate) => {
  if (status === "pending") return exportDate;
  if (status === "rejected") return getRejectionTs(app);
  return getApprovalTs(app);
};

const buildRows = (applications, status, exportDate) =>
  applications.map((app) => {
    const createdTs = getCreatedTs(app);
    const days = calculateProcessingDays(
      createdTs,
      getProcessingEndTs(app, status, exportDate)
    );
    const row = {
      "Application ID": app?.formId || app?._id || "—",
      "Applicant Name": getApplicantName(app),
      Branch: getBranch(app),
      "Dealer Name": getDealerName(app),
      "Mobile Number": getMobile(app),
      "Vehicle Name": getVehicle(app),
      Status: status.charAt(0).toUpperCase() + status.slice(1),
      // Original dealer submission date (see getCreatedTs) — the same value the
      // table's Created column shows.
      "Created Date": formatDate(createdTs),
      // New column — immediately after Created Date.
      "Processing Days": days === null ? "N/A" : days,
      "Updated Date": formatDate(getUpdatedTs(app, status)),
    };

    // Approved sheet only: the disbursement date sits immediately beside the
    // approval date (for approved records, "Updated Date" is the approval
    // time — see getUpdatedTs). The key is set on every approved row so the
    // header is present even when no record has been disbursed yet; the pending
    // and rejected sheets keep exactly the columns they had.
    if (status === "approved") {
      row["Disbursement Date"] = formatBusinessDate(getDisbursementTs(app));
    }

    return row;
  });

const COL_WIDTHS = [
  { wch: 20 }, // Application ID
  { wch: 28 }, // Applicant Name
  { wch: 18 }, // Branch
  { wch: 28 }, // Dealer Name
  { wch: 18 }, // Mobile Number
  { wch: 25 }, // Vehicle Name
  { wch: 12 }, // Status
  { wch: 24 }, // Created Date
  { wch: 16 }, // Processing Days
  { wch: 24 }, // Updated Date
  { wch: 24 }, // Disbursement Date (approved sheet only; ignored elsewhere)
];

const buildDateSuffix = (dateFrom, dateTo) => {
  const from = dateFrom ? isoDate(dateFrom) : "";
  const to = dateTo ? isoDate(dateTo) : "";
  if (from && to && from !== to) return `_${from}_to_${to}`;
  if (from) return `_${from}`;
  return "";
};

export const exportApplicationsToExcel = (applications, status, dateFrom = null, dateTo = null) => {
  if (!applications || applications.length === 0) {
    alert(`No ${status} applications to export.`);
    return;
  }

  // Compute the export date ONCE and reuse it for every pending row.
  const exportDate = new Date();
  const rows = buildRows(applications, status, exportDate);
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = COL_WIDTHS;

  const wb = XLSX.utils.book_new();
  const sheetName = status.charAt(0).toUpperCase() + status.slice(1) + " Applications";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const suffix = buildDateSuffix(dateFrom, dateTo);
  const filename = `${status.charAt(0).toUpperCase()}${status.slice(1)}_Applications${suffix}.xlsx`;
  XLSX.writeFile(wb, filename);
};

export const exportAllToExcel = (pendingApps, approvedApps, rejectedApps, dateFrom = null, dateTo = null) => {
  const total = (pendingApps?.length || 0) + (approvedApps?.length || 0) + (rejectedApps?.length || 0);
  if (total === 0) {
    alert("No applications to export.");
    return;
  }

  const wb = XLSX.utils.book_new();

  // Compute the export date ONCE and reuse it for every pending row across sheets.
  const exportDate = new Date();

  const addSheet = (apps, status) => {
    const rows = buildRows(apps || [], status, exportDate);
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ "Application ID": "No data" }]);
    ws["!cols"] = COL_WIDTHS;
    XLSX.utils.book_append_sheet(wb, ws, status.charAt(0).toUpperCase() + status.slice(1));
  };

  addSheet(pendingApps, "pending");
  addSheet(approvedApps, "approved");
  addSheet(rejectedApps, "rejected");

  const suffix = buildDateSuffix(dateFrom, dateTo);
  XLSX.writeFile(wb, `Applications${suffix}.xlsx`);
};
