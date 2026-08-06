// src/pages/RCNumberPlatePage.jsx
//
// Phase 5 — RC & Number Plate listing.
//
// Search, dealer filtering and pagination are ALL server-side: the page never
// holds more than one page of rows. Only column sorting is client-side, because
// GET /api/admin/vehicle/list exposes no sort parameter and this phase must not
// change the backend (see the report's Known Limitations).
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
import { useAuth } from "../context/AuthContext";
import TableSkeleton from "../components/TableSkeleton";
import StatusBadge from "../components/StatusBadge";
import DealerFilterSelect from "../components/DealerFilterSelect";

const BRAND = { blue: "#0B1F4D", red: "#EF4444" };

const TABS = [
  { key: "RC", label: "RC Uploads", statusField: "rcStatus" },
  { key: "NUMBER_PLATE", label: "Number Plate", statusField: "numberPlateStatus" },
];

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
      <path d="M5 1L2 5H8L5 1Z" fill={BRAND.blue} />
      <path d="M5 11L2 8H8L5 11Z" fill="currentColor" opacity="0.2" />
    </svg>
  ) : (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
      <path d="M5 1L2 4H8L5 1Z" fill="currentColor" opacity="0.2" />
      <path d="M5 11L2 7H8L5 11Z" fill={BRAND.blue} />
    </svg>
  );
}

export default function RCNumberPlatePage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [tab, setTab] = useState("RC");

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

  const statusField = TABS.find((t) => t.key === tab)?.statusField || "rcStatus";

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
      const { data } = await API.get("/admin/vehicle/list", {
        params: {
          type: tab,
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
  }, [tab, page, limit, debouncedSearch, dealer]);

  useEffect(() => { load(); }, [load]);

  /* ── Tab switch: reload table data only, never the page ───────────────── */
  const switchTab = (key) => {
    if (key === tab) return;
    setTab(key);
    setPage(1);
    setSorting([]);
  };

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
          <span style={{ fontWeight: 700, color: BRAND.blue, fontFamily: "monospace" }}>
            {c.getValue() || "—"}
          </span>
        ) },
      { accessorKey: "customerName", header: "Customer Name", cell: (c) => c.getValue() || "—" },
      { accessorKey: "mobileNumber", header: "Mobile Number", cell: (c) => c.getValue() || "—" },
      { accessorKey: "dealerName", header: "Dealer Name", cell: (c) => c.getValue() || "—" },
      { accessorKey: "branch", header: "Branch", cell: (c) => c.getValue() || "—" },
      { accessorKey: statusField, id: "status", header: "Status",
        cell: (c) => <StatusBadge status={c.getValue()} /> },
      { id: "action", header: "Action", enableSorting: false,
        cell: (c) => (
          <button
            className="btn btn-sm"
            style={{ background: BRAND.blue, color: "#fff", fontWeight: 700 }}
            onClick={() => navigate(`/vehicle-details/${c.row.original.applicationId}`)}
          >
            View
          </button>
        ) },
    ],
    [statusField, navigate]
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

  const th = { textAlign: "left", padding: "11px 14px", fontSize: 11, fontWeight: 800, color: "#374151", textTransform: "uppercase", letterSpacing: "0.6px", whiteSpace: "nowrap", borderBottom: "2px solid #E5E7EB", background: "#FAFBFC" };
  const td = { padding: "12px 14px", fontSize: 14, color: "#0f172a", borderBottom: "1px solid #F1F5F9", verticalAlign: "middle" };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", padding: "22px 0" }}>
      <style>{`
        .rcnp-th-sort { cursor: pointer; user-select: none; }
        .rcnp-th-sort:hover { background: rgba(11,31,77,0.04) !important; }
        .rcnp-row:hover td { background: rgba(241,245,249,0.7); }
        .rcnp-tab { border: 0; background: transparent; font-weight: 700; color: #6b7280; padding: 8px 16px; border-radius: 999px; cursor: pointer; }
        .rcnp-tab.active { background: #fff; color: ${BRAND.blue}; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ color: BRAND.blue, fontWeight: 800, margin: 0 }}>RC &amp; Number Plate</h2>
            <p style={{ color: "#6B7280", margin: "4px 0 0" }}>
              Manage uploaded RC documents and Number Plate details
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline-secondary" onClick={() => navigate("/superadmin-dashboard")}>
              ← Dashboard
            </button>
            <button className="btn btn-outline-danger" onClick={() => { logout(); navigate("/"); }}>
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "inline-flex", gap: 6, padding: 5, background: "#f1f5f9", borderRadius: 999, marginBottom: 14 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`rcnp-tab ${tab === t.key ? "active" : ""}`}
              onClick={() => switchTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <input
            className="form-control"
            style={{ maxWidth: 420 }}
            placeholder="Search by Loan Number, Mobile Number or Customer Name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <DealerFilterSelect
            dealers={dealers}
            value={dealer}
            onChange={(id) => { setDealer(id); setPage(1); }}
          />
          <button
            className="btn btn-outline-secondary"
            onClick={resetFilters}
            disabled={!hasFilters}
          >
            Reset
          </button>
        </div>

        {/* Table */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
          {/* Info row: count + page size */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 20px", background: "#FAFBFC", borderBottom: "1px solid #F1F5F9", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>
              Showing <b style={{ color: "#111827" }}>{from}–{to}</b> of{" "}
              <b style={{ color: "#111827" }}>{total.toLocaleString()}</b> records
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#6B7280" }}>Rows per page:</span>
              <select
                className="form-select form-select-sm"
                style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              >
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : error ? (
            <div style={{ textAlign: "center", padding: "50px 20px" }}>
              <div style={{ color: BRAND.red, fontWeight: 700, marginBottom: 12 }}>{error}</div>
              <button className="btn btn-outline-secondary btn-sm" onClick={load}>
                Retry
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header) => {
                        const canSort = header.column.getCanSort();
                        const dir = header.column.getIsSorted();
                        return (
                          <th
                            key={header.id}
                            className={canSort ? "rcnp-th-sort" : ""}
                            onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                            style={{ ...th, background: dir ? "rgba(11,31,77,0.03)" : th.background }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
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
                  {table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} style={{ ...td, textAlign: "center", padding: "60px 20px", color: "#9CA3AF", fontWeight: 600 }}>
                        No Records Found
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="rcnp-row">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} style={td}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && !loading && !error && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
            <button className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(1)}>
              « First
            </button>
            <button className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </button>
            <span style={{ alignSelf: "center", color: "#64748B", fontSize: 14 }}>
              Page {page} of {pages}
            </span>
            <button className="btn btn-outline-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
              Next
            </button>
            <button className="btn btn-outline-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(pages)}>
              Last »
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
