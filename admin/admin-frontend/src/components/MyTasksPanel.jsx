import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";

/**
 * MyTasksPanel — the caller's work queue and counters.
 *
 * Reads GET /api/assignments/my-tasks, which returns both. Quick filters are
 * applied to the already-loaded queue (a small, per-user set), so switching
 * filters costs no request.
 */

const BLUE = "#2563eb";
const RED = "#b91c1c";
const AMBER = "#92400e";
const GREEN = "#047857";

const PRIORITY_STYLE = {
  Low: { bg: "#f1f5f9", color: "#475569" },
  Medium: { bg: "#eff6ff", color: "#1d4ed8" },
  High: { bg: "#fff7ed", color: "#9a3412" },
  Critical: { bg: "#fef2f2", color: "#b91c1c" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "high", label: "High Priority" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

const fmt = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

const Counter = ({ label, value, colour }) => (
  <div style={S.counter}>
    <div style={{ ...S.counterValue, ...(colour ? { color: colour } : null) }}>{value}</div>
    <div style={S.counterLabel}>{label}</div>
  </div>
);

export default function MyTasksPanel({ onOpen }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/assignments/my-tasks");
      setData(d);
      setFailed(false);
    } catch (err) {
      console.error("Failed to load tasks:", err?.response?.data || err.message);
      setFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    const rows = data?.items || [];
    switch (filter) {
      case "today": return rows.filter((r) => r.dueToday);
      case "high": return rows.filter((r) => ["High", "Critical"].includes(r.priority));
      case "overdue": return rows.filter((r) => r.overdue);
      case "completed": return rows.filter((r) => r.taskStatus === "Completed");
      default: return rows.filter((r) => !["Completed", "Cancelled"].includes(r.taskStatus));
    }
  }, [data, filter]);

  const c = data?.counters || {};

  return (
    <div style={S.wrap}>
      <div style={S.title}>My Tasks</div>

      <div style={S.counterRow}>
        <Counter label="Assigned" value={data ? c.applicationsAssigned ?? 0 : "—"} />
        <Counter label="Pending" value={data ? c.pending ?? 0 : "—"} colour={AMBER} />
        <Counter label="In Progress" value={data ? c.inProgress ?? 0 : "—"} colour={BLUE} />
        <Counter label="Completed Today" value={data ? c.completedToday ?? 0 : "—"} colour={GREEN} />
        <Counter label="Overdue" value={data ? c.overdue ?? 0 : "—"} colour={RED} />
      </div>

      <div style={S.filterRow}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            style={{ ...S.filter, ...(filter === f.key ? S.filterActive : null) }}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!data && !failed ? (
        <div style={S.muted}>Loading your queue…</div>
      ) : failed ? (
        <div style={S.muted}>Could not load your tasks.</div>
      ) : items.length === 0 ? (
        <div style={S.muted}>Nothing in this view.</div>
      ) : (
        <div style={S.list}>
          {items.map((it) => {
            const p = PRIORITY_STYLE[it.priority] || PRIORITY_STYLE.Medium;
            return (
              <button key={it.applicationId} style={S.row} onClick={() => onOpen && onOpen(it)}>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={S.loan}>{it.loanNumber || "—"}</div>
                  <div style={S.meta}>
                    {it.customerName || "—"}
                    {it.workflowStage ? ` · ${it.workflowStage}` : ""}
                  </div>
                </div>

                <span style={{ ...S.pill, background: p.bg, color: p.color }}>{it.priority}</span>

                <span style={{ ...S.due, color: it.overdue ? RED : it.dueToday ? AMBER : "#6b7280" }}>
                  {it.overdue ? "Overdue" : it.dueToday ? "Due today" : fmt(it.dueDate)}
                </span>

                <span style={S.status}>{it.taskStatus}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", marginBottom: 16 },
  title: { fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 },
  counterRow: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 },
  counter: { flex: "1 1 96px", background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: 10, padding: "9px 10px", textAlign: "center" },
  counterValue: { fontSize: 18, fontWeight: 800, color: "#111827" },
  counterLabel: { fontSize: 10.5, color: "#6b7280", marginTop: 2 },

  filterRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  filter: {
    border: "1px solid #e2e8f0", background: "#fff", borderRadius: 999,
    padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#475569", cursor: "pointer",
  },
  filterActive: { background: "#eef2ff", color: BLUE, borderColor: "#c7d2fe" },

  list: { display: "flex", flexDirection: "column" },
  row: {
    display: "flex", alignItems: "center", gap: 10, width: "100%",
    background: "transparent", border: 0, borderBottom: "1px solid #f8fafc",
    padding: "9px 0", cursor: "pointer", textAlign: "left",
  },
  loan: { fontSize: 13.5, fontWeight: 700, color: "#111827", fontFamily: "monospace" },
  meta: { fontSize: 11.5, color: "#6b7280" },
  pill: { fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px" },
  due: { fontSize: 11.5, fontWeight: 700, minWidth: 66, textAlign: "right" },
  status: { fontSize: 11.5, color: "#6b7280", minWidth: 76, textAlign: "right" },
  muted: { color: "#9ca3af", fontSize: 13, padding: "10px 0" },
};
