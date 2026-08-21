// src/pages/AdminAnalytics.jsx
//
// Phase 6 — Admin dashboard analytics. Read-only: cards, charts, date filters,
// and Excel export. Built entirely on existing backend endpoints
// (/workflow/dashboard-stats + the list endpoints). No business logic here.
//
// The presentation follows the Applications page's design language (the same
// surfaces, pills, inputs and shadows as Dashboard.jsx) so the two read as one
// product. Data, endpoints, date-filter behaviour and every calculation are
// untouched — this file's logic half is identical to what it always was.
//
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import API from "../services/api";
import logo from "../assets/logo-surjit.png";

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

const DATE_FILTERS = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["week", "This Week"],
  ["month", "This Month"], ["all", "All Time"], ["custom", "Custom"],
];

// ── Presentation-only formatting ─────────────────────────────────────────────
// The API returns `date` as "YYYY-MM-DD" and `month` as "YYYY-MM" (fillDaily /
// fillMonthly). These shorten the tick text so 30 days of labels fit; anything
// not matching the expected shape is passed straight through untouched.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayTick = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(v);
};
const dayFull = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(v);
};
const monthTick = (v) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(v));
  return m ? `${MONTHS[Number(m[2]) - 1]} '${m[1].slice(2)}` : String(v);
};
const monthFull = (v) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(v));
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(v);
};
const num = (v) => (typeof v === "number" ? v.toLocaleString() : v);

// ── Shared chart chrome ──────────────────────────────────────────────────────
// Solid hairline grid (never dashed), recessive axes, one tooltip style. Kept
// in one place so all five charts read as the same instrument.
const AXIS_TICK = { fontSize: 11, fill: "#94A3B8", fontWeight: 500 };
const GRID = { stroke: "#EEF2F7", strokeWidth: 1, vertical: false };
const TOOLTIP = {
  contentStyle: {
    background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10,
    boxShadow: "0 8px 24px rgba(11,31,77,0.12)", fontSize: 12, padding: "8px 12px",
  },
  labelStyle: { color: "#6B7280", fontWeight: 600, fontSize: 11, marginBottom: 4 },
  itemStyle: { color: "#111827", fontWeight: 700, fontSize: 13, padding: 0 },
};
const BAR_CURSOR = { fill: "rgba(11,31,77,0.05)" };
const LINE_CURSOR = { stroke: "#CBD5E1", strokeWidth: 1 };

/** A chart panel: heading, optional subtitle, fixed-height plot area. */
function ChartCard({ title, subtitle, wide, empty, dim, children }) {
  return (
    <section className={`an-chart${wide ? " an-chart--wide" : ""}`}>
      <header className="an-chart-head">
        <h3 className="an-chart-title">{title}</h3>
        {subtitle ? <span className="an-chart-sub">{subtitle}</span> : null}
      </header>
      <div className={`an-chart-body${wide ? " an-chart-body--wide" : ""}`} style={{ opacity: dim ? 0.5 : 1 }}>
        {empty ? <div className="an-empty">No data for this range</div> : children}
      </div>
    </section>
  );
}

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

  /* A refetch holds the previous render at reduced opacity rather than blanking
     to a skeleton, so the numbers never jump about while a range is applied.
     Only the very first load has nothing to hold. */
  const firstLoad = loading && !stats;
  const dim = loading && !!stats;

  /* Presentational restatement of the filter that is already applied — the
     same affordance the Super Admin stats tab carries. It reads the existing
     presetRange(); it does not compute or request anything. */
  const rangeText = (() => {
    const r = filterKey === "custom" ? custom : presetRange(filterKey);
    if (!r.from && !r.to) return "All time";
    const d = (s) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
      return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(s);
    };
    if (r.from && r.to) return r.from === r.to ? d(r.from) : `${d(r.from)} → ${d(r.to)}`;
    return r.from ? `From ${d(r.from)}` : `Until ${d(r.to)}`;
  })();

  const decided = (avr.approved || 0) + (avr.rejected || 0);

  return (
    <div className="an-page">
      <style>{`
        .an-page { background: #F8FAFC; min-height: 100vh; padding: 18px 0 40px; }
        .an-wrap { max-width: 1360px; margin: 0 auto; padding: 0 18px; }

        /* ── surfaces ── */
        .an-surface {
          background: #fff; border: 1px solid #E5E7EB; border-radius: 14px;
          box-shadow: 0 2px 10px rgba(11,31,77,0.06);
        }

        /* ── top bar — mirrors the Applications top bar ── */
        .an-topbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 12px 18px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .an-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .an-brand img { height: 38px; }
        .an-divider { height: 28px; width: 1px; background: #E5E7EB; }
        .an-title { font-size: 15px; font-weight: 800; color: #0B1F4D; line-height: 1.2; }
        .an-subtitle { font-size: 11px; color: #6B7280; font-weight: 500; margin-top: 2px; }

        /* ── controls (shared with the Applications page) ── */
        .an-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 9px; font-size: 13px; font-weight: 700;
          cursor: pointer; border: 1.5px solid transparent; font-family: inherit;
          transition: opacity 0.15s, transform 0.15s, background 0.15s;
        }
        .an-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .an-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .an-btn-primary { background: #0B1F4D; color: #fff; border-color: #0B1F4D; }
        .an-btn-ghost { background: #fff; color: #374151; border-color: #E5E7EB; }
        .an-btn-ghost:hover:not(:disabled) { background: #F8FAFC; }
        .an-btn-green { background: #ECFDF5; color: #065F46; border-color: #D1FAE5; }
        .an-input {
          border: 1.5px solid #E5E7EB; border-radius: 10px; padding: 7px 11px;
          font-size: 13px; font-weight: 500; background: #fff; outline: none;
          color: #111827; font-family: inherit; transition: border-color 0.15s, box-shadow 0.15s;
        }
        .an-input:focus { border-color: #0B1F4D; box-shadow: 0 0 0 3px rgba(11,31,77,0.08); }

        /* ── filter row — one row, above everything it scopes ── */
        .an-filters { padding: 14px 18px; margin-bottom: 16px; }
        .an-filters-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .an-filters-label {
          font-size: 11px; font-weight: 700; color: #64748B;
          text-transform: uppercase; letter-spacing: 0.04em; margin-right: 2px;
        }
        .an-pill {
          padding: 7px 15px; border-radius: 10px; font-weight: 700; font-size: 13px;
          border: 1.5px solid #E5E7EB; background: #F8FAFC; color: #6B7280;
          cursor: pointer; transition: all 0.15s; font-family: inherit; white-space: nowrap;
        }
        .an-pill:hover { background: #F1F5F9; color: #374151; }
        .an-pill.is-active {
          background: #0B1F4D; color: #fff; border-color: #0B1F4D;
        }
        .an-pill.is-active:hover { background: #0B1F4D; color: #fff; }
        .an-custom {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          padding-left: 10px; margin-left: 2px; border-left: 1px solid #E5E7EB;
        }
        .an-arrow { color: #94A3B8; font-weight: 700; }
        .an-range-badge {
          margin-left: auto; font-size: 12px; font-weight: 700; color: #0B1F4D;
          background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 999px;
          padding: 5px 12px; white-space: nowrap;
        }

        /* ── KPI tiles ── */
        .an-kpis {
          display: grid; grid-template-columns: repeat(5, 1fr);
          gap: 12px; margin-bottom: 18px;
        }
        .an-kpi {
          background: #fff; border: 1px solid #E5E7EB; border-radius: 14px;
          box-shadow: 0 2px 10px rgba(11,31,77,0.06);
          padding: 14px 16px 12px; display: flex; flex-direction: column;
          justify-content: space-between; min-height: 104px;
          transition: box-shadow 0.15s, transform 0.15s;
        }
        .an-kpi:hover { box-shadow: 0 6px 18px rgba(11,31,77,0.10); transform: translateY(-1px); }
        .an-kpi-label {
          font-size: 11px; font-weight: 700; color: #64748B;
          text-transform: uppercase; letter-spacing: 0.04em; line-height: 1.35;
        }
        .an-kpi-value {
          font-size: 30px; font-weight: 800; line-height: 1; margin-top: 10px;
        }
        .an-kpi-rule { height: 3px; border-radius: 99px; margin-top: 10px; opacity: 0.45; }
        .an-kpi--hero { grid-column: span 2; }
        .an-kpi--hero .an-kpi-value { font-size: 44px; }

        /* ── chart grid ── */
        .an-charts {
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px; margin-bottom: 18px;
        }
        .an-chart {
          background: #fff; border: 1px solid #E5E7EB; border-radius: 14px;
          box-shadow: 0 2px 10px rgba(11,31,77,0.06);
          padding: 16px 18px 12px; min-width: 0;
        }
        .an-chart--wide { grid-column: 1 / -1; }
        .an-chart-head {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 10px; flex-wrap: wrap; margin-bottom: 12px;
        }
        .an-chart-title { font-size: 14px; font-weight: 800; color: #0B1F4D; margin: 0; letter-spacing: -0.1px; }
        .an-chart-sub { font-size: 11px; color: #94A3B8; font-weight: 600; }
        /* The body height includes the x-axis band, so no axis is ever cut off
           and no card grows its own nested scrollbar. */
        .an-chart-body { height: 280px; position: relative; transition: opacity 0.2s; }
        .an-chart-body--wide { height: 340px; }
        .an-empty {
          height: 100%; display: flex; align-items: center; justify-content: center;
          color: #94A3B8; font-size: 13px; font-weight: 600;
        }
        .an-donut-centre {
          position: absolute; top: 44%; left: 0; right: 0;
          text-align: center; pointer-events: none;
        }
        .an-donut-total { font-size: 26px; font-weight: 800; color: #0B1F4D; line-height: 1; }
        .an-donut-cap {
          font-size: 10px; font-weight: 700; color: #94A3B8;
          text-transform: uppercase; letter-spacing: 0.06em; margin-top: 3px;
        }

        /* ── export ── */
        .an-export { padding: 16px 18px; }
        .an-export-title { font-size: 14px; font-weight: 800; color: #0B1F4D; margin: 0 0 4px; }
        .an-export-sub { font-size: 11px; color: #94A3B8; font-weight: 600; margin-bottom: 12px; }
        .an-export-row { display: flex; gap: 8px; flex-wrap: wrap; }

        /* ── responsive ── */
        @media (max-width: 1180px) {
          .an-kpis { grid-template-columns: repeat(4, 1fr); }
        }
        @media (max-width: 980px) {
          .an-charts { grid-template-columns: minmax(0, 1fr); }
          .an-chart--wide { grid-column: auto; }
          .an-chart-body--wide { height: 300px; }
          .an-kpis { grid-template-columns: repeat(3, 1fr); }
          .an-range-badge { margin-left: 0; }
        }
        @media (max-width: 720px) {
          .an-wrap { padding: 0 12px; }
          .an-kpis { grid-template-columns: repeat(2, 1fr); }
          .an-kpi--hero { grid-column: span 2; }
          .an-kpi-value { font-size: 26px; }
          .an-kpi--hero .an-kpi-value { font-size: 34px; }
          .an-chart-body, .an-chart-body--wide { height: 260px; }
          .an-topbar { align-items: flex-start; }
        }
        @media (max-width: 460px) {
          .an-kpis { grid-template-columns: minmax(0, 1fr); }
          .an-kpi--hero { grid-column: auto; }
          .an-custom { padding-left: 0; margin-left: 0; border-left: none; width: 100%; }
          .an-brand img { height: 30px; }
        }
      `}</style>

      <div className="an-wrap">

        {/* ══ Top bar ══ */}
        <header className="an-surface an-topbar">
          <div className="an-brand">
            <img src={logo} alt="Surjit Finance" />
            <div className="an-divider" />
            <div>
              <div className="an-title">Dashboard Analytics</div>
              <div className="an-subtitle">{rangeText}</div>
            </div>
          </div>
          <button className="an-btn an-btn-ghost" onClick={() => navigate("/dashboard")}>
            ← Dashboard
          </button>
        </header>

        {/* ══ Date filters — one row, scoping everything below ══ */}
        <div className="an-surface an-filters">
          <div className="an-filters-row">
            <span className="an-filters-label">Date range</span>
            {DATE_FILTERS.map(([k, label]) => (
              <button
                key={k}
                className={`an-pill${filterKey === k ? " is-active" : ""}`}
                aria-pressed={filterKey === k}
                onClick={() => setFilterKey(k)}
              >
                {label}
              </button>
            ))}
            {filterKey === "custom" && (
              <span className="an-custom">
                <input
                  type="date" className="an-input" aria-label="From date"
                  value={custom.from}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                />
                <span className="an-arrow">→</span>
                <input
                  type="date" className="an-input" aria-label="To date"
                  value={custom.to}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                />
                <button className="an-btn an-btn-primary" onClick={load}>Apply</button>
              </span>
            )}
            <span className="an-range-badge">{loading ? "Loading…" : rangeText}</span>
          </div>
        </div>

        {/* ══ KPI tiles ══ */}
        <div className="an-kpis" style={{ opacity: dim ? 0.55 : 1, transition: "opacity 0.2s" }}>
          {CARD_DEFS.map(([key, label, color], i) => (
            <div key={key} className={`an-kpi${i === 0 ? " an-kpi--hero" : ""}`}>
              <div className="an-kpi-label">{label}</div>
              <div>
                <div className="an-kpi-value" style={{ color }}>
                  {firstLoad ? "—" : num(cards[key] ?? 0)}
                </div>
                <div className="an-kpi-rule" style={{ background: color }} />
              </div>
            </div>
          ))}
        </div>

        {/* ══ Charts ══ */}
        <div className="an-charts">

          {/* Full width: ten stage labels need the room to stay readable.
              One series → one colour for every bar (never a hue per stage:
              the ten stage accents are tile identifiers, not a validated
              categorical chart palette). */}
          <ChartCard
            title="Workflow Distribution"
            subtitle="Applications by stage"
            wide
            dim={dim}
            empty={!firstLoad && dist.length === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dist} margin={{ top: 8, right: 8, left: -14, bottom: 62 }}>
                <CartesianGrid {...GRID} />
                <XAxis
                  dataKey="name" angle={-32} textAnchor="end" interval={0}
                  height={72} tick={AXIS_TICK} axisLine={false} tickLine={false}
                />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
                <Tooltip {...TOOLTIP} cursor={BAR_CURSOR} formatter={(v) => [num(v), "Applications"]} />
                <Bar dataKey="count" fill={BRAND.blue} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Approved / Rejected are STATUS colours, not a categorical pair:
              green↔red measures ΔE 3.7 under deuteranopia, so colour alone
              could never carry identity here. The legend names each slice and
              carries its value, the whole sits in the centre, and a 2px surface
              gap separates the arcs — the reading never depends on the hue. */}
          <ChartCard
            title="Approval vs Rejection"
            subtitle="Share of decided applications"
            dim={dim}
            empty={!firstLoad && decided === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={avrData} dataKey="value" nameKey="name"
                  cx="50%" cy="46%" innerRadius={58} outerRadius={92}
                  paddingAngle={2} stroke="#fff" strokeWidth={2}
                >
                  {avrData.map((e, i) => <Cell key={e.name} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip {...TOOLTIP} formatter={(v, n) => [num(v), n]} />
                <Legend
                  verticalAlign="bottom" height={28} iconType="circle" iconSize={9}
                  formatter={(value) => (
                    <span style={{ color: "#374151", fontSize: 12, fontWeight: 600 }}>
                      {value} — {num(avrData.find((d) => d.name === value)?.value ?? 0)}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="an-donut-centre">
              <div className="an-donut-total">{firstLoad ? "—" : num(decided)}</div>
              <div className="an-donut-cap">Decided</div>
            </div>
          </ChartCard>

          <ChartCard
            title="Daily Applications"
            subtitle="Last 30 days"
            dim={dim}
            empty={!firstLoad && daily.length === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 8, right: 12, left: -14, bottom: 4 }}>
                <CartesianGrid {...GRID} />
                <XAxis
                  dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false}
                  tickFormatter={dayTick} interval="preserveStartEnd" minTickGap={28}
                />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  {...TOOLTIP} cursor={LINE_CURSOR}
                  labelFormatter={dayFull} formatter={(v) => [num(v), "Applications"]}
                />
                <Line
                  type="monotone" dataKey="count" stroke={BRAND.orange} strokeWidth={2}
                  dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Monthly Applications"
            subtitle="Last 12 months"
            dim={dim}
            empty={!firstLoad && monthly.length === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
                <CartesianGrid {...GRID} />
                <XAxis
                  dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false}
                  tickFormatter={monthTick} interval="preserveStartEnd" minTickGap={12}
                />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  {...TOOLTIP} cursor={BAR_CURSOR}
                  labelFormatter={monthFull} formatter={(v) => [num(v), "Applications"]}
                />
                <Bar dataKey="count" fill={BRAND.green} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Low CIBIL Trend"
            subtitle="Rejections, last 30 days"
            dim={dim}
            empty={!firstLoad && lowTrend.length === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lowTrend} margin={{ top: 8, right: 12, left: -14, bottom: 4 }}>
                <CartesianGrid {...GRID} />
                <XAxis
                  dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false}
                  tickFormatter={dayTick} interval="preserveStartEnd" minTickGap={28}
                />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  {...TOOLTIP} cursor={LINE_CURSOR}
                  labelFormatter={dayFull} formatter={(v) => [num(v), "Rejections"]}
                />
                <Line
                  type="monotone" dataKey="count" stroke={BRAND.red} strokeWidth={2}
                  dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ══ Excel export ══ */}
        <section className="an-surface an-export">
          <h3 className="an-export-title">Excel Export</h3>
          <div className="an-export-sub">Downloads the full record list for the selected set</div>
          <div className="an-export-row">
            {EXPORTS.map(([label, fn]) => (
              <button
                key={label}
                className="an-btn an-btn-green"
                disabled={!!exporting}
                onClick={() => doExport(label, fn)}
              >
                {exporting === label ? "Exporting…" : `Export ${label}`}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
