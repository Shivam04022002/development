// src/pages/PendingCibil.jsx
//
// Phase 5A — Pending CIBIL list. Shows applications with status = "pending_cibil"
// only (they never appear in the normal Pending list). Accessible to admin,
// superadmin and the Credit Team role.
//
// The presentation follows the Applications page (Dashboard.jsx) and the
// Analytics page: the same surfaces, top bar, pills, inputs, badge spec and
// shadows, so the three read as one product. The request, the search, the
// pagination and every value shown are exactly what they were.
//
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import logo from "../assets/logo-surjit.png";

const BRAND = { blue: "#0B1F4D", orange: "#F59E0B", green: "#16A34A", red: "#EF4444" };

/** Rows per request — the value this page has always asked for. Named so the
 *  footer can state the range it is showing without restating the number. */
const PAGE_LIMIT = 50;

const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/* The score chip's tints, on the SAME bands the previous scoreColor helper
   used (>=750, >=650, below) — that helper is gone because this supersedes it. The chip
   is tinted background + dark ink (never the band colour as text), and the
   number itself states the band, so the reading never rests on hue alone. */
const scoreChip = (s) =>
  typeof s !== "number"
    ? { bg: "#F8FAFC", color: "#94A3B8", border: "#E5E7EB" }
    : s >= 750 ? { bg: "#ECFDF5", color: "#065F46", border: "#D1FAE5" }
      : s >= 650 ? { bg: "#FFFBEB", color: "#92400E", border: "#FDE68A" }
        : { bg: "#FFF1F2", color: "#7F1D1D", border: "#FECACA" };

const searchIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
  </svg>
);

const emptyIcon = (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5h16v14H4z" /><path d="M4 9h16" /><path d="M9 13h6" />
  </svg>
);

export default function PendingCibil() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await API.get("/workflow/pending-cibil", {
        params: { page, limit: PAGE_LIMIT, search: search.trim() || undefined },
      });
      setItems(data?.items || []);
      setTotal(data?.total || 0);
      setPages(data?.pages || 1);
    } catch (err) {
      console.error("Failed to load Pending CIBIL:", err);
      setError(err?.response?.data?.error || "Failed to load Pending CIBIL applications.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  /* Presentation only: the first load gets skeleton rows, every later one holds
     the rows it already has at reduced opacity. Search fires per keystroke (as
     it always has), so re-skeletoning on each character would strobe the table.
     Derived by watching `loading` — `load` itself is untouched. */
  const [everLoaded, setEverLoaded] = useState(false);
  useEffect(() => { if (!loading) setEverLoaded(true); }, [loading]);
  const firstLoad = loading && !everLoaded;
  const dim = loading && everLoaded;

  const from = total === 0 ? 0 : (page - 1) * PAGE_LIMIT + 1;
  const to = Math.min(page * PAGE_LIMIT, total);

  return (
    <div className="pc-page">
      <style>{`
        .pc-page { background: #F8FAFC; min-height: 100vh; padding: 18px 0 40px; }
        .pc-wrap { max-width: 1280px; margin: 0 auto; padding: 0 18px; }
        .pc-surface {
          background: #fff; border: 1px solid #E5E7EB; border-radius: 14px;
          box-shadow: 0 2px 10px rgba(11,31,77,0.06);
        }

        /* ── top bar — mirrors the Applications top bar ── */
        .pc-topbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 12px 18px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .pc-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .pc-brand img { height: 38px; }
        .pc-divider { height: 28px; width: 1px; background: #E5E7EB; }
        .pc-title { font-size: 15px; font-weight: 800; color: #0B1F4D; line-height: 1.2; }
        .pc-subtitle { font-size: 11px; color: #6B7280; font-weight: 500; margin-top: 2px; }
        .pc-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .pc-count {
          background: #F5F3FF; border: 1px solid #DDD6FE; border-radius: 8px;
          padding: 4px 12px; text-align: center;
        }
        .pc-count-val {
          font-size: 16px; font-weight: 900; color: #6D28D9; line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .pc-count-cap { font-size: 10px; font-weight: 700; color: #6D28D9; opacity: 0.8; }

        /* ── controls (shared with the Applications page) ── */
        .pc-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 9px; font-size: 13px; font-weight: 700;
          cursor: pointer; border: 1.5px solid transparent; font-family: inherit;
          transition: opacity 0.15s, transform 0.15s, background 0.15s;
        }
        .pc-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .pc-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
        .pc-btn-primary { background: #0B1F4D; color: #fff; border-color: #0B1F4D; }
        .pc-btn-ghost { background: #fff; color: #374151; border-color: #E5E7EB; }
        .pc-btn-ghost:hover:not(:disabled) { background: #F8FAFC; }
        .pc-btn-sm { padding: 5px 14px; font-size: 12px; border-radius: 8px; }

        /* ── search ── */
        .pc-toolbar {
          padding: 14px 18px; margin-bottom: 16px; display: flex;
          align-items: center; gap: 12px; flex-wrap: wrap;
        }
        .pc-search { position: relative; flex: 1 1 340px; max-width: 420px; }
        .pc-search-icon {
          position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
          color: #94A3B8; display: flex; pointer-events: none;
        }
        .pc-input {
          width: 100%; box-sizing: border-box;
          border: 1.5px solid #E5E7EB; border-radius: 10px; padding: 9px 12px 9px 34px;
          font-size: 13px; font-weight: 500; background: #fff; outline: none;
          color: #111827; font-family: inherit;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .pc-input:focus { border-color: #0B1F4D; box-shadow: 0 0 0 3px rgba(11,31,77,0.08); }
        .pc-input::placeholder { color: #9CA3AF; font-weight: 500; }
        .pc-hint { font-size: 12px; color: #6B7280; font-weight: 600; }

        /* ── error ── */
        .pc-error {
          background: #FFF1F2; border: 1px solid #FECACA; color: #7F1D1D;
          border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;
          font-size: 13px; font-weight: 600;
        }

        /* ── table ── */
        .pc-card { overflow: hidden; }
        .pc-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .pc-table { width: 100%; border-collapse: collapse; min-width: 940px; }
        .pc-table thead th {
          position: sticky; top: 0; z-index: 1; background: #FAFBFC;
          text-align: left; padding: 11px 16px; font-size: 11px; font-weight: 700;
          color: #64748B; text-transform: uppercase; letter-spacing: 0.04em;
          border-bottom: 1px solid #E5E7EB; white-space: nowrap;
        }
        .pc-table tbody td {
          padding: 12px 16px; font-size: 13px; color: #111827;
          border-bottom: 1px solid #F1F5F9; vertical-align: middle;
        }
        .pc-table tbody tr:last-child td { border-bottom: none; }
        .pc-table tbody tr { transition: background 0.12s; }
        .pc-table tbody tr:hover td { background: rgba(241,245,249,0.75); }
        .pc-num { text-align: right; font-variant-numeric: tabular-nums; }
        .pc-mid { text-align: center; }
        .pc-right { text-align: right; }
        .pc-appid {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-weight: 700; color: #0B1F4D; font-size: 12.5px; white-space: nowrap;
        }
        .pc-strong { font-weight: 600; color: #111827; }
        .pc-muted { color: #6B7280; }
        .pc-date { color: #475569; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .pc-branch {
          display: inline-block; padding: 2px 9px; border-radius: 6px;
          background: #F1F5F9; color: #475569; font-size: 12px; font-weight: 600;
          white-space: nowrap;
        }
        /* Badge spec copied from StatusBadge so every pill in the portal matches. */
        .pc-badge {
          display: inline-block; padding: 3px 10px; border-radius: 999px;
          font-size: 11px; font-weight: 800; letter-spacing: 0.3px; white-space: nowrap;
          background: #F5F3FF; color: #6D28D9; border: 1px solid #DDD6FE;
        }
        .pc-score {
          display: inline-block; min-width: 52px; text-align: center;
          padding: 3px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 800;
          font-variant-numeric: tabular-nums; border: 1px solid transparent;
        }

        /* ── states ── */
        .pc-skel {
          height: 12px; border-radius: 5px;
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
          background-size: 600px 100%; animation: pc-shimmer 1.4s infinite linear;
        }
        @keyframes pc-shimmer {
          0%   { background-position: -600px 0; }
          100% { background-position:  600px 0; }
        }
        .pc-empty { padding: 56px 20px; text-align: center; color: #94A3B8; }
        .pc-empty-icon { color: #CBD5E1; margin-bottom: 10px; }
        .pc-empty-title { font-size: 14px; font-weight: 700; color: #64748B; }
        .pc-empty-sub { font-size: 12.5px; color: #94A3B8; margin-top: 4px; }

        /* ── footer / pagination ── */
        .pc-foot {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap; padding: 11px 18px;
          background: #FAFBFC; border-top: 1px solid #F1F5F9;
        }
        .pc-foot-info { font-size: 12px; color: #6B7280; font-weight: 500; }
        .pc-foot-info b { color: #111827; font-variant-numeric: tabular-nums; }
        .pc-pager { display: flex; align-items: center; gap: 10px; }
        .pc-pager-label { font-size: 12px; color: #64748B; font-weight: 600; white-space: nowrap; }

        /* ── responsive ── */
        @media (max-width: 860px) {
          .pc-wrap { padding: 0 12px; }
          .pc-topbar { align-items: flex-start; }
          .pc-search { max-width: none; flex-basis: 100%; }
          .pc-hint { display: none; }
          .pc-foot { justify-content: center; }
        }
        @media (max-width: 560px) {
          .pc-brand img { height: 30px; }
          .pc-actions { width: 100%; justify-content: space-between; }
          .pc-foot-info { width: 100%; text-align: center; }
          .pc-pager { width: 100%; justify-content: center; }
        }
      `}</style>

      <div className="pc-wrap">

        {/* ══ Top bar ══ */}
        <header className="pc-surface pc-topbar">
          <div className="pc-brand">
            <img src={logo} alt="Surjit Finance" />
            <div className="pc-divider" />
            <div>
              <div className="pc-title">Pending CIBIL</div>
              <div className="pc-subtitle">Applications awaiting CIBIL review</div>
            </div>
          </div>

          <div className="pc-actions">
            <div className="pc-count">
              <div className="pc-count-val">{total.toLocaleString()}</div>
              <div className="pc-count-cap">Total</div>
            </div>
            <button className="pc-btn pc-btn-ghost" onClick={() => navigate("/dashboard")}>
              ← Dashboard
            </button>
          </div>
        </header>

        {/* ══ Search ══ */}
        <div className="pc-surface pc-toolbar">
          <div className="pc-search">
            <span className="pc-search-icon">{searchIcon}</span>
            <input
              className="pc-input"
              aria-label="Search pending CIBIL applications"
              placeholder="Search by Application #, Applicant, Dealer, Branch…"
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            />
          </div>
          <span className="pc-hint">
            {loading ? "Loading…" : `${total.toLocaleString()} application${total === 1 ? "" : "s"} awaiting CIBIL`}
          </span>
        </div>

        {error && <div className="pc-error">{error}</div>}

        {/* ══ Table ══ */}
        <div className="pc-surface pc-card">
          <div className="pc-scroll">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Application #</th>
                  <th>Applicant Name</th>
                  <th>Dealer</th>
                  <th>Branch</th>
                  <th className="pc-mid">CIBIL Score</th>
                  <th>Submitted Date</th>
                  <th>Status</th>
                  <th className="pc-right">Action</th>
                </tr>
              </thead>
              <tbody style={{ opacity: dim ? 0.55 : 1, transition: "opacity 0.15s" }}>
                {firstLoad ? (
                  Array.from({ length: 8 }).map((_, r) => (
                    <tr key={`s${r}`}>
                      {Array.from({ length: 8 }).map((_, c) => (
                        <td key={c}>
                          <div className="pc-skel" style={{ width: c === 0 ? 90 : c === 7 ? 58 : c === 4 ? 52 : "80%" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ borderBottom: "none" }}>
                      <div className="pc-empty">
                        <div className="pc-empty-icon">{emptyIcon}</div>
                        <div className="pc-empty-title">
                          {search.trim() ? "No matching applications" : "No applications pending CIBIL"}
                        </div>
                        <div className="pc-empty-sub">
                          {search.trim()
                            ? `Nothing matches “${search.trim()}”. Try a different Application #, applicant, dealer or branch.`
                            : "New submissions awaiting CIBIL review will appear here."}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((it) => {
                    const chip = scoreChip(it.cibilScore);
                    return (
                      <tr key={it._id}>
                        <td className="pc-appid">{it.applicationId || it.formId || "—"}</td>
                        <td className="pc-strong">{it.applicantName || <span className="pc-muted">—</span>}</td>
                        <td>{it.dealerName || <span className="pc-muted">—</span>}</td>
                        <td>
                          {it.branchName
                            ? <span className="pc-branch">{it.branchName}</span>
                            : <span className="pc-muted">—</span>}
                        </td>
                        <td className="pc-mid">
                          <span
                            className="pc-score"
                            style={{ background: chip.bg, color: chip.color, borderColor: chip.border }}
                            title={typeof it.cibilScore === "number" ? `CIBIL ${it.cibilScore}` : "No CIBIL score yet"}
                          >
                            {typeof it.cibilScore === "number" ? it.cibilScore : "—"}
                          </span>
                        </td>
                        <td className="pc-date">{fmtDate(it.submittedDate)}</td>
                        <td><span className="pc-badge">Pending CIBIL</span></td>
                        <td className="pc-right">
                          <button
                            className="pc-btn pc-btn-primary pc-btn-sm"
                            onClick={() => navigate(`/application/${it._id}`)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ══ Pagination — unchanged behaviour, Prev / Next by one page ══ */}
          {pages > 1 && (
            <div className="pc-foot">
              <span className="pc-foot-info">
                Showing <b>{from}–{to}</b> of <b>{total.toLocaleString()}</b> applications
              </span>
              <div className="pc-pager">
                <button
                  className="pc-btn pc-btn-ghost pc-btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </button>
                <span className="pc-pager-label">Page {page} of {pages}</span>
                <button
                  className="pc-btn pc-btn-ghost pc-btn-sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
