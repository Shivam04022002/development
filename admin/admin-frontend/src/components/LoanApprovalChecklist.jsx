import React, { useState } from "react";

/**
 * LoanApprovalChecklist — readiness summary shown directly above the
 * Approve / Reject buttons.
 *
 * Purely presentational. Every status, reason and blocker is decided on the
 * server by utils/approvalChecklist.js, which reads existing state and reuses
 * existing rules. This component contains **no business logic** — it renders
 * what it is given.
 */

const GREEN = "#047857";
const AMBER = "#92400e";
const GREY = "#6b7280";
const RED = "#b91c1c";
const BLUE = "#2563eb";

const ICON = { Completed: "✔", Pending: "❌", "Not Applicable": "—" };
const COLOUR = { Completed: GREEN, Pending: AMBER, "Not Applicable": GREY };

function Row({ item }) {
  const [open, setOpen] = useState(false);
  const details = Object.entries(item.details || {});
  const expandable = details.length > 0 || item.reason;

  return (
    <div style={S.row}>
      <button
        style={{ ...S.rowHead, cursor: expandable ? "pointer" : "default" }}
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span style={{ ...S.icon, color: COLOUR[item.status] }}>{ICON[item.status]}</span>
        <span style={S.label}>{item.label}</span>
        <span style={{ ...S.statusTag, color: COLOUR[item.status] }}>{item.status}</span>
        {expandable ? <span style={S.chev}>{open ? "▾" : "▸"}</span> : <span style={S.chev} />}
      </button>

      {open && (
        <div style={S.detailBox}>
          {item.reason ? <div style={S.reason}>{item.reason}</div> : null}
          {details.map(([k, v]) => (
            <div key={k} style={S.detailRow}>
              <span style={S.detailKey}>{k}</span>
              <span style={S.detailVal}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LoanApprovalChecklist({ checklist }) {
  // Older responses simply omit the block.
  if (!checklist) return null;

  const { items = [], missing = [], summary, approval } = checklist;

  return (
    <div style={S.wrap}>
      <div style={S.title}>Loan Approval Checklist</div>

      <div>
        {items.map((i) => (
          <Row key={i.key} item={i} />
        ))}
      </div>

      {/* Status summary + progress */}
      <div style={S.summaryWrap}>
        <div style={S.sumCell}>
          <div style={S.sumLabel}>Completed</div>
          <div style={S.sumValue}>
            {summary.completed} / {summary.total}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={S.sumLabel}>Progress</div>
          <div style={S.barTrack}>
            <div
              style={{
                ...S.barFill,
                width: `${summary.percent}%`,
                background: summary.ready ? GREEN : BLUE,
              }}
            />
          </div>
        </div>
        <div style={S.sumCell}>
          <div style={S.sumLabel}>Ready</div>
          <div style={{ ...S.sumValue, color: summary.ready ? GREEN : AMBER }}>
            {summary.ready ? "Yes" : "No"}
          </div>
        </div>
      </div>

      {/* Missing requirements */}
      {missing.length > 0 && (
        <div style={S.missingWrap}>
          <div style={S.missingTitle}>Missing Requirements</div>
          {missing.map((m) => (
            <div key={m.key} style={S.missingRow}>
              <span style={{ color: m.blocking ? RED : AMBER, fontWeight: 800 }}>❌</span>
              <div>
                <div style={S.missingLabel}>
                  {m.label}
                  {m.blocking ? <span style={S.blockingTag}>blocks approval</span> : null}
                </div>
                {m.reason ? <div style={S.missingReason}>{m.reason}</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Overall status */}
      <div
        style={{
          ...S.overall,
          background: approval.blocked ? "#fef2f2" : summary.ready ? "#ecfdf5" : "#fffbeb",
          color: approval.blocked ? RED : summary.ready ? GREEN : AMBER,
          borderColor: approval.blocked ? "#fecaca" : summary.ready ? "#a7f3d0" : "#fde68a",
        }}
      >
        {approval.blocked
          ? approval.message
          : summary.ready
            ? "Ready for Approval"
            : "Outstanding items — review before approving."}
      </div>
    </div>
  );
}

/* Matches the page's card language: white surface, #e5e7eb border, 10px radius. */
const S = {
  wrap: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 14,
  },
  title: {
    fontSize: 11,
    fontWeight: 800,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    marginBottom: 8,
  },
  row: { borderBottom: "1px solid #f8fafc" },
  rowHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "transparent",
    border: 0,
    padding: "7px 0",
    textAlign: "left",
  },
  icon: { fontSize: 13, fontWeight: 800, width: 14 },
  label: { flex: 1, fontSize: 13.5, color: "#111827", fontWeight: 600 },
  statusTag: { fontSize: 11.5, fontWeight: 700 },
  chev: { width: 12, color: "#cbd5e1", fontSize: 11 },

  detailBox: { padding: "2px 0 10px 22px" },
  reason: { fontSize: 12, color: AMBER, marginBottom: 6, fontWeight: 600 },
  detailRow: { display: "flex", justifyContent: "space-between", gap: 12, padding: "2px 0" },
  detailKey: { fontSize: 12, color: "#9ca3af" },
  detailVal: { fontSize: 12, color: "#374151", fontWeight: 600, textAlign: "right" },

  summaryWrap: { display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginTop: 12 },
  sumCell: { minWidth: 74 },
  sumLabel: { fontSize: 11, color: "#9ca3af", marginBottom: 3 },
  sumValue: { fontSize: 14, fontWeight: 800, color: "#111827" },
  barTrack: { height: 8, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999, transition: "width .25s" },

  missingWrap: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 8,
    background: "#fffbeb",
    border: "1px solid #fde68a",
  },
  missingTitle: { fontSize: 11.5, fontWeight: 800, color: AMBER, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 },
  missingRow: { display: "flex", gap: 8, alignItems: "flex-start", padding: "3px 0" },
  missingLabel: { fontSize: 13, fontWeight: 700, color: "#111827" },
  missingReason: { fontSize: 12, color: GREY },
  blockingTag: {
    marginLeft: 8,
    fontSize: 10,
    fontWeight: 800,
    color: RED,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 999,
    padding: "1px 7px",
    textTransform: "uppercase",
  },

  overall: {
    marginTop: 12,
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid",
    fontSize: 13,
    fontWeight: 700,
    textAlign: "center",
  },
};
