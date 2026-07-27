// src/pages/PendingCibil.jsx
//
// Phase 5A — Pending CIBIL list. Shows applications with status = "pending_cibil"
// only (they never appear in the normal Pending list). Accessible to admin,
// superadmin and the Credit Team role.
//
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import { useAuth } from "../context/AuthContext";

const BRAND = { blue: "#0B1F4D", orange: "#F59E0B", green: "#16A34A", red: "#EF4444" };

const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const scoreColor = (s) =>
  typeof s !== "number" ? "#94A3B8" : s >= 750 ? BRAND.green : s >= 650 ? BRAND.orange : BRAND.red;

export default function PendingCibil() {
  const navigate = useNavigate();
  const { logout } = useAuth();

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
        params: { page, limit: 50, search: search.trim() || undefined },
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

  const th = { textAlign: "left", padding: "12px 14px", fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" };
  const td = { padding: "12px 14px", fontSize: 14, color: "#0f172a", borderBottom: "1px solid #F1F5F9", verticalAlign: "middle" };

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", padding: "22px 0" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ color: BRAND.blue, fontWeight: 800, margin: 0 }}>Pending CIBIL</h2>
            <p style={{ color: "#6B7280", margin: "4px 0 0" }}>
              Applications awaiting CIBIL review. {total.toLocaleString()} total.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline-secondary" onClick={() => navigate("/dashboard")}>
              ← Dashboard
            </button>
            <button className="btn btn-outline-danger" onClick={() => { logout(); navigate("/"); }}>
              Logout
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 14 }}>
          <input
            className="form-control"
            style={{ maxWidth: 380 }}
            placeholder="Search by Application #, Applicant, Dealer, Branch…"
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          />
        </div>

        {error && (
          <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: BRAND.red, color: "#fff" }}>
            {error}
          </div>
        )}

        {/* Table */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={th}>Application #</th>
                  <th style={th}>Applicant Name</th>
                  <th style={th}>Dealer</th>
                  <th style={th}>Branch</th>
                  <th style={th}>CIBIL Score</th>
                  <th style={th}>Submitted Date</th>
                  <th style={th}>Status</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td style={td} colSpan={8}>Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td style={{ ...td, color: "#94A3B8" }} colSpan={8}>No applications pending CIBIL.</td></tr>
                ) : (
                  items.map((it) => (
                    <tr key={it._id}>
                      <td style={{ ...td, fontWeight: 700, color: BRAND.blue, fontFamily: "monospace" }}>{it.applicationId || it.formId || "—"}</td>
                      <td style={td}>{it.applicantName || "—"}</td>
                      <td style={td}>{it.dealerName || "—"}</td>
                      <td style={td}>{it.branchName || "—"}</td>
                      <td style={{ ...td, fontWeight: 800, color: scoreColor(it.cibilScore) }}>
                        {typeof it.cibilScore === "number" ? it.cibilScore : "—"}
                      </td>
                      <td style={{ ...td, color: "#475569" }}>{fmtDate(it.submittedDate)}</td>
                      <td style={td}>
                        <span style={{ background: "#F5F3FF", color: "#6D28D9", border: "1px solid #DDD6FE", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                          Pending CIBIL
                        </span>
                      </td>
                      <td style={td}>
                        <button
                          className="btn btn-sm"
                          style={{ background: BRAND.blue, color: "#fff", fontWeight: 700 }}
                          onClick={() => navigate(`/pending-cibil/${it._id}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
            <button className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </button>
            <span style={{ alignSelf: "center", color: "#64748B", fontSize: 14 }}>Page {page} of {pages}</span>
            <button className="btn btn-outline-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
