// src/pages/RCNumberPlatePage.jsx
//
// RC & Number Plate listing — one table, both sections.
//
// Search, dealer filtering and pagination are ALL server-side: the page never
// holds more than one page of rows. Only column sorting is client-side, because
// GET /api/admin/vehicle/list exposes no sort parameter and this phase must not
// change the backend (see the report's Known Limitations).
//
// UI: this page uses the shared admin chrome — DashboardLayout (which carries
// the shared Navbar) and the same Bootstrap list-page idiom as Pending /
// Approved / Rejected Applications. It defines no layout, palette or table of
// its own.
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
import DashboardLayout from "../components/layout/DashboardLayout";
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

  return (
    <DashboardLayout>
      {/* The layout's content row is fixed-height and clipped, so list pages
          scroll inside it — the same arrangement the detail pages use. */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div className="container py-3">
          {/* Header */}
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="mb-0">
              RC &amp; Number Plate
              {total > 0 && <span className="badge bg-primary ms-2 fs-6">{total}</span>}
            </h2>
            <button className="btn btn-sm btn-outline-secondary" onClick={load}>
              Refresh
            </button>
          </div>

          {/* Filters */}
          <div className="row g-2 mb-3 align-items-center">
            <div className="col-12 col-md-5">
              <input
                type="search"
                className="form-control form-control-sm"
                placeholder="Search by Loan Number, Mobile Number or Customer Name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="col-12 col-md-4">
              <DealerFilterSelect
                dealers={dealers}
                value={dealer}
                onChange={(id) => { setDealer(id); setPage(1); }}
              />
            </div>
            <div className="col-12 col-md-3">
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={resetFilters}
                disabled={!hasFilters}
              >
                Reset
              </button>
            </div>
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
            <div className="table-responsive">
              <table className="table table-striped table-hover align-middle mb-0">
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
                            style={canSort ? { cursor: "pointer", userSelect: "none" } : undefined}
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
                        <td key={cell.id} className={cell.column.id === "action" ? "text-end" : undefined}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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
    </DashboardLayout>
  );
}
