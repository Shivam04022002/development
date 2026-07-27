// src/pages/AdminAnalytics.jsx
//
// Phase 6 — Admin dashboard analytics. Read-only: cards, charts, date filters,
// and Excel export. Built entirely on existing backend endpoints
// (/workflow/dashboard-stats + the list endpoints). No business logic here.
//
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import API from "../services/api";

const BRAND = { blue: "#0B1F4D", orange: "#F59E0B", green: "#16A34A", red: "#EF4444", cyan: "#0E7490" };

// ── Date-range presets ───────────────────────────────────────────────────────
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const iso = (d) => startOfDay(d).toISOString().slice(0, 10);
function presetRange(key) {
  const now = new Date();
  switch (key) {
    case "today": return { from: iso(now), to: iso(now) };
    case "yesterday": { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) }; }
    case "week": { const s = new Date(now); s.setDate(s.getDate() - s.getDay()); return { from: iso(s), to: iso(now) }; }
    case "month": { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { from: iso(s), to: iso(now) }; }
    default: return { from: "", to: "" }; // all / custom
  }
}

const CARD_DEFS = [
  ["total", "Total Applications", BRAND.blue],
  ["pendingCibil", "Pending CIBIL", BRAND.cyan],
  ["contactCreation", "Contact Creation", "#6D28D9"],
  ["houseVisit", "House Visit", "#1D4ED8"],
  ["creditSanction", "Credit Sanction", "#92400E"],
  ["agreement", "Agreement", "#86198F"],
  ["preDisbursement", "Pre-Disbursement", "#B45309"],
  ["disbursed", "Disbursed", BRAND.green],
  ["rejected", "Rejected", BRAND.red],
  ["lowCibilRejected", "Low CIBIL Rejected", "#9F1239"],
];

const PIE_COLORS = [BRAND.green, BRAND.red];

// ── Excel export helpers ─────────────────────────────────────────────────────
async function fetchAll(endpoint, params = {}) {
  const rows = [];
  let page = 1, pages = 1;
  do {
    const { data } = await API.get(endpoint, { params: { ...params, page, limit: 100 } });
    (data?.items || []).forEach((it) => rows.push(it));
    pages = data?.pages || 1;
    page += 1;
  } while (page <= pages && page <= 100); // hard safety cap
  return rows;
}
const rowOut = (it) => ({
  "Application #": it.formId || it.applicationId || "",
  "Applicant": it.applicantName || it?.applicant?.applicant?.name || it?.applicant?.name || "",
  "Mobile": it?.applicant?.mobileNumber || it?.applicant?.mobile || "",
  "PAN": it?.applicant?.panNo || "",
  "Dealer": it.dealerName || it?.dealerDetails?.name || "",
  "Branch": it.branchName || it?.dealerDetails?.branch || "",
  "Stage": it.workflowStage || "",
  "Status": it.status || "",
  "CIBIL Score": it?.cibil?.score ?? it?.cibilScore ?? "",
  "Reason": it?.rejection?.reason || "",
  "Date": it.createdAt ? new Date(it.createdAt).toLocaleDateString() : "",
});
function saveXlsx(rows, name) {
  const ws = XLSX.utils.json_to_sheet(rows.map(rowOut));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Applications");
  XLSX.writeFile(wb, `${name}.xlsx`);
}

const EXPORTS = [
  ["Total Applications", async () => [
    ...await fetchAll("/workflow/pending"),
    ...await fetchAll("/workflow/pending-cibil"),
    ...await fetchAll("/workflow/applications/approved"),
    ...await fetchAll("/workflow/applications/rejected"),
  ]],
  ["Pending CIBIL", () => fetchAll("/workflow/pending-cibil")],
  ["Contact Creation", () => fetchAll("/workflow/pending", { stage: "contact creation" })],
  ["House Visit", () => fetchAll("/workflow/pending", { stage: "house visit" })],
  ["Credit Sanction", () => fetchAll("/workflow/pending", { stage: "credit sanction" })],
  ["Agreement", () => fetchAll("/workflow/pending", { stage: "agreement" })],
  ["Rejected", () => fetchAll("/workflow/applications/rejected")],
  ["Low CIBIL", () => fetchAll("/workflow/applications/rejected", { reason: "low_cibil" })],
];

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const [filterKey, setFilterKey] = useState("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = filterKey === "custom" ? custom : presetRange(filterKey);
      const params = {};
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      const { data } = await API.get("/workflow/dashboard-stats", { params });
      setStats(data);
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [filterKey, custom]);

  useEffect(() => { load(); }, [load]);

  const cards = stats?.cards || {};
  const dist = (stats?.workflowDistribution || []).map((d) => ({ name: d.label, count: d.count }));
  const daily = stats?.daily || [];
  const monthly = stats?.monthly || [];
  const avr = stats?.approvalVsRejection || { approved: 0, rejected: 0 };
  const avrData = [{ name: "Approved", value: avr.approved }, { name: "Rejected", value: avr.rejected }];
  const lowTrend = stats?.lowCibilTrend?.daily || [];

  const doExport = async (label, fn) => {
    setExporting(label);
    try {
      const rows = await fn();
      if (!rows.length) { alert(`No records to export for ${label}.`); return; }
      saveXlsx(rows, label.replace(/\s+/g, "_"));
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed.");
    } finally {
      setExporting("");
    }
  };

  const chartCard = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 18 };

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", padding: "22px 0" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ color: BRAND.blue, fontWeight: 800, margin: 0 }}>Dashboard Analytics</h2>
          <button className="btn btn-outline-secondary" onClick={() => navigate("/dashboard")}>← Dashboard</button>
        </div>

        {/* Date filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
          {[["today", "Today"], ["yesterday", "Yesterday"], ["week", "This Week"], ["month", "This Month"], ["all", "All Time"], ["custom", "Custom"]].map(([k, label]) => (
            <button key={k} className={`btn btn-sm ${filterKey === k ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setFilterKey(k)}>
              {label}
            </button>
          ))}
          {filterKey === "custom" && (
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input type="date" className="form-control form-control-sm" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              <span>→</span>
              <input type="date" className="form-control form-control-sm" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              <button className="btn btn-sm btn-primary" onClick={load}>Apply</button>
            </span>
          )}
        </div>

        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 22 }}>
          {CARD_DEFS.map(([key, label, color]) => (
            <div key={key} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color, marginTop: 6 }}>{loading ? "…" : (cards[key] ?? 0)}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16, marginBottom: 22 }}>
          <div style={chartCard}>
            <h6 style={{ fontWeight: 700, color: BRAND.blue }}>Workflow Distribution</h6>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dist} margin={{ top: 10, right: 10, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" angle={-30} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip />
                <Bar dataKey="count" fill={BRAND.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={chartCard}>
            <h6 style={{ fontWeight: 700, color: BRAND.blue }}>Approval vs Rejection</h6>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={avrData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {avrData.map((e, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={chartCard}>
            <h6 style={{ fontWeight: 700, color: BRAND.blue }}>Daily Applications (30d)</h6>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={daily} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} /><YAxis allowDecimals={false} /><Tooltip />
                <Line type="monotone" dataKey="count" stroke={BRAND.orange} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={chartCard}>
            <h6 style={{ fontWeight: 700, color: BRAND.blue }}>Monthly Applications (12m)</h6>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} /><Tooltip />
                <Bar dataKey="count" fill={BRAND.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={chartCard}>
            <h6 style={{ fontWeight: 700, color: BRAND.blue }}>Low CIBIL Trend (30d)</h6>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={lowTrend} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} /><YAxis allowDecimals={false} /><Tooltip />
                <Line type="monotone" dataKey="count" stroke={BRAND.red} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Excel export */}
        <div style={{ ...chartCard, marginBottom: 30 }}>
          <h6 style={{ fontWeight: 700, color: BRAND.blue, marginBottom: 12 }}>Excel Export</h6>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {EXPORTS.map(([label, fn]) => (
              <button key={label} className="btn btn-sm btn-outline-success" disabled={!!exporting} onClick={() => doExport(label, fn)}>
                {exporting === label ? "Exporting…" : `Export ${label}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
