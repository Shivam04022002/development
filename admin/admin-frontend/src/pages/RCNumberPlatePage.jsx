// src/pages/RCNumberPlatePage.jsx
//
// RC & Number Plate listing — one table, both sections.
//
// Search, dealer filtering and pagination are ALL server-side: the page never
// holds more than one page of rows. Only column sorting is client-side, because
// GET /api/admin/vehicle/list exposes no sort parameter and this phase must not
// change the backend (see the report's Known Limitations).
//
// UI: this page renders the portal's shared top navigation (SuperAdminNav,
// extracted from SuperAdminDashboard) with "RC & Number Plate" active, over the
// same Bootstrap list-page idiom the other admin lists use. It defines no
// navigation, layout, palette or table of its own.
//
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from "@tanstack/react-table";
import API from "../services/api";
import SuperAdminNav from "../components/SuperAdminNav";
import TableSkeleton from "../components/TableSkeleton";
import StatusBadge from "../components/StatusBadge";
import DealerFilterSelect from "../components/DealerFilterSelect";

// The one colour this page names, and only for the sort glyph — the same
// constant and the same icon Dashboard and FilesManagementTable use.
const BRAND_BLUE = "#0B1F4D";

// The endpoint caps `limit` at 100 (Math.min(100, …), the same cap the other
// paginated admin lists use). Offering 200 here would silently return 100 rows
// while the footer still counted in 200s.
const PAGE_SIZES = [25, 50, 100];

/* ─── Summary card — the same treatment as the analytics page's cards ───── */
function SummaryCard({ label, value, color, note }) {
  return (
    <div style={S.card}>
      <div style={S.cardLabel}>{label}</div>
      <div style={{ ...S.cardValue, color }}>{value}</div>
      {note ? <div style={S.cardNote}>{note}</div> : null}
    </div>
  );
}

/* Design tokens lifted from the analytics cards and the dashboard table card,
   so this page carries no palette or spacing of its own. */
const S = {
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
    marginBottom: 18,
  },
  card: { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px" },
  cardLabel: { fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em" },
  cardValue: { fontSize: 30, fontWeight: 800, marginTop: 6, lineHeight: 1.1 },
  cardNote: { fontSize: 11, color: "#94A3B8", marginTop: 2 },

  tableCard: {
    background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB",
    boxShadow: "0 2px 12px rgba(11,31,77,0.06)", overflow: "hidden",
  },
  // Roomier rows than the Bootstrap default, and evenly distributed columns.
  th: { padding: "14px 16px", whiteSpace: "nowrap" },
  td: { padding: "16px", verticalAlign: "middle" },
};

/* ─── Sort icon — same treatment as FilesManagementTable ─────────────────── */
function SortIcon({ dir }) {
  if (!dir)
    return (
      <svg width="10" height="12" viewBox="0 0 10 12" fill="none" style={{ opacity: 0.35 }}>
        <path d="M5 1L2 4H8L5 1Z" fill="currentColor" />
        <path d="M5 11L2 8H8L5 11Z" fill="currentColor" />
      </svg>
    );
  return dir === "asc" ? (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
      <path d="M5 1L2 5H8L5 1Z" fill={BRAND_BLUE} />
      <path d="M5 11L2 8H8L5 11Z" fill="currentColor" opacity="0.2" />
    </svg>
  ) : (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
      <path d="M5 1L2 4H8L5 1Z" fill="currentColor" opacity="0.2" />
      <path d="M5 11L2 7H8L5 11Z" fill={BRAND_BLUE} />
    </svg>
  );
}

export default function RCNumberPlatePage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dealer, setDealer] = useState("");

  const [dealers, setDealers] = useState([]);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sorting, setSorting] = useState([]);

  /* ── Dealer list: the existing admin dealer endpoint, loaded once ──────── */
  useEffect(() => {
    let active = true;
    API.get("/superadmin/dealers")
      .then(({ data }) => {
        if (active) setDealers(Array.isArray(data?.dealers) ? data.dealers : []);
      })
      .catch((err) => {
        // Non-fatal: the table still works, the filter just has no options.
        console.error("Failed to load dealers", err?.response?.data || err.message);
      });
    return () => { active = false; };
  }, []);

  /* ── Debounce the search box (400ms) before it reaches the server ──────── */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  /* ── Server-side load ─────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // No `type`: the endpoint treats it as an optional narrowing filter and
      // returns rcStatus AND numberPlateStatus on every row regardless, which
      // is exactly what one combined table needs.
      const { data } = await API.get("/admin/vehicle/list", {
        params: {
          page,
          limit,
          search: debouncedSearch || undefined,
          dealer: dealer || undefined,
        },
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(data?.total || 0);
      setPages(data?.pages || 1);
    } catch (err) {
      console.error("Failed to load vehicle list:", err?.response?.data || err.message);
      setError(err?.response?.data?.error || "Failed to load RC & Number Plate records.");
      setItems([]);
      setTotal(0);
      setPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, dealer]);

  useEffect(() => { load(); }, [load]);

  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setDealer("");
    setPage(1);
  };

  const hasFilters = Boolean(search || dealer);

  /* ── Columns ──────────────────────────────────────────────────────────── */
  const columns = useMemo(
    () => [
      { accessorKey: "loanNumber", header: "Loan Number",
        cell: (c) => (
          <span className="text-primary fw-semibold">{c.getValue() || "—"}</span>
        ) },
      { accessorKey: "customerName", header: "Customer Name", cell: (c) => c.getValue() || "—" },
      { accessorKey: "mobileNumber", header: "Mobile Number", cell: (c) => c.getValue() || "—" },
      { accessorKey: "dealerName", header: "Dealer Name", cell: (c) => c.getValue() || "—" },
      { accessorKey: "branch", header: "Branch", cell: (c) => c.getValue() || "—" },
      { accessorKey: "rcStatus", header: "RC Status",
        cell: (c) => <StatusBadge status={c.getValue()} /> },
      { accessorKey: "numberPlateStatus", header: "Number Plate Status",
        cell: (c) => <StatusBadge status={c.getValue()} /> },
      { id: "action", header: "", enableSorting: false,
        cell: (c) => (
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={() => navigate(`/vehicle-details/${c.row.original.applicationId}`)}
          >
            View
          </button>
        ) },
    ],
    [navigate]
  );

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    // Sorting only — filtering and pagination are done by the server.
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualFiltering: true,
    pageCount: pages,
  });

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  /* ── Summary cards ─────────────────────────────────────────────────────
     `total` is the server's count for the whole filtered set. The three
     breakdowns are counted from the rows THIS PAGE holds, because the list
     endpoint returns one page at a time and no extra call may be made for
     them — so each is labelled "on this page" rather than implying a global
     figure. */
  const summary = useMemo(() => {
    const pending = (v) => String(v || "").toLowerCase() !== "uploaded";
    return {
      rcPending: items.filter((r) => pending(r.rcStatus)).length,
      npPending: items.filter((r) => pending(r.numberPlateStatus)).length,
      completed: items.filter((r) => !pending(r.rcStatus) && !pending(r.numberPlateStatus)).length,
    };
  }, [items]);

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", padding: 24, boxSizing: "border-box" }}>
      <SuperAdminNav active="rcNumberPlate" />
      {/* Full width: the table has eight columns and was being squeezed into
          a centred container. */}
      <div>
        <div className="container-fluid px-0">
          {/* Header */}
          <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
            <div>
              <h2 className="mb-1">RC &amp; Number Plate</h2>
              <p className="text-muted mb-0" style={{ fontSize: 13.5 }}>
                Manage RC documents and Number Plate uploads.
              </p>
            </div>
          </div>

          {/* Summary — same card treatment as the analytics page. */}
          <div style={S.cardGrid}>
            <SummaryCard label="Total Applications" value={loading ? "…" : total.toLocaleString()} color="#0B1F4D" />
            <SummaryCard label="RC Pending" value={loading ? "…" : summary.rcPending} color="#92400E" note="on this page" />
            <SummaryCard label="Number Plate Pending" value={loading ? "…" : summary.npPending} color="#92400E" note="on this page" />
            <SummaryCard label="Completed" value={loading ? "…" : summary.completed} color="#047857" note="on this page" />
          </div>

          {/* Toolbar — search, dealer filter, reset and refresh on one row. */}
          <div className="d-flex align-items-center gap-2 flex-wrap mb-3">
            <input
              type="search"
              className="form-control form-control-sm"
              style={{ maxWidth: 380 }}
              placeholder="Search by Loan Number, Mobile Number or Customer Name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div style={{ minWidth: 240 }}>
              <DealerFilterSelect
                dealers={dealers}
                value={dealer}
                onChange={(id) => { setDealer(id); setPage(1); }}
              />
            </div>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={resetFilters}
              disabled={!hasFilters}
            >
              Reset
            </button>
            <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={load}>
              Refresh
            </button>
          </div>

          {/* Count + rows per page */}
          <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
            <small className="text-muted">
              Showing {from}–{to} of {total.toLocaleString()} records
            </small>
            <div className="d-flex align-items-center gap-2">
              <small className="text-muted">Rows per page:</small>
              <select
                className="form-select form-select-sm w-auto"
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              >
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <TableSkeleton rows={8} cols={8} />
          ) : error ? (
            <div className="alert alert-danger">
              {error}{" "}
              <button className="btn btn-sm btn-link p-0" onClick={load}>Retry</button>
            </div>
          ) : table.getRowModel().rows.length === 0 ? (
            <p className="text-muted">No Records Found</p>
          ) : (
            <div style={S.tableCard}>
              <div className="table-responsive">
              <table className="table table-hover align-middle mb-0" style={{ tableLayout: "fixed" }}>
                <thead className="table-light">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header) => {
                        const canSort = header.column.getCanSort();
                        const dir = header.column.getIsSorted();
                        return (
                          <th
                            key={header.id}
                            onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                            style={{ ...S.th, ...(canSort ? { cursor: "pointer", userSelect: "none" } : null) }}
                          >
                            <div className="d-flex align-items-center gap-1">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {canSort && <SortIcon dir={dir || null} />}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cell.column.id === "action" ? "text-end" : undefined}
                          style={{ ...S.td, ...(cell.column.id === "action" ? null : { overflow: "hidden", textOverflow: "ellipsis" }) }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Pagination — same controls as before, in the portal's pagination style */}
          {pages > 1 && !loading && !error && (
            <div className="d-flex justify-content-between align-items-center mt-3">
              <small className="text-muted">Page {page} of {pages} · {total} total</small>
              <nav>
                <ul className="pagination pagination-sm mb-0">
                  <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => setPage(1)}>« First</button>
                  </li>
                  <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
                  </li>
                  <li className={`page-item ${page >= pages ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next ›</button>
                  </li>
                  <li className={`page-item ${page >= pages ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => setPage(pages)}>Last »</button>
                  </li>
                </ul>
              </nav>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
