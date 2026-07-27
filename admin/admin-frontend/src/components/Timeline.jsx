// src/components/Timeline.jsx
//
// Phase 6 — Application timeline. Reads ApplicationHistory (via the read-only
// /workflow/applications/:id/timeline endpoint) and renders events in
// chronological order. No raw JSON / vendor response / report URL is shown.
//
import React, { useEffect, useState } from "react";
import API from "../services/api";

const LABELS = {
  FORM_CREATED: "Application Submitted",
  CIBIL_REQUESTED: "CIBIL Requested",
  CIBIL_RESPONSE_RECEIVED: "CIBIL Response Received",
  CIBIL_PENDING: "Pending CIBIL",
  STAGE_CHANGED: "Stage Changed",
  STATUS_CHANGED: "Status Changed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  COMMENT: "Comment",
  COMMENT_ADDED: "Comment",
};

const COLORS = {
  FORM_CREATED: "#1D4ED8",
  CIBIL_REQUESTED: "#0E7490",
  CIBIL_RESPONSE_RECEIVED: "#0E7490",
  CIBIL_PENDING: "#B45309",
  STAGE_CHANGED: "#6D28D9",
  APPROVED: "#16A34A",
  REJECTED: "#EF4444",
};

const fmt = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function Timeline({ applicationId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!applicationId) return;
    let active = true;
    (async () => {
      try {
        const { data } = await API.get(`/workflow/applications/${applicationId}/timeline`);
        if (active) setEntries(data?.entries || []);
      } catch (err) {
        console.error("Failed to load timeline:", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [applicationId]);

  if (loading) return <div style={{ color: "#94A3B8" }}>Loading timeline…</div>;
  if (!entries.length) return <div style={{ color: "#94A3B8" }}>No timeline events yet.</div>;

  return (
    <div style={{ position: "relative", paddingLeft: 22 }}>
      <div style={{ position: "absolute", left: 6, top: 4, bottom: 4, width: 2, background: "#E5E7EB" }} />
      {entries.map((e, i) => {
        const color = COLORS[e.actionType] || "#64748B";
        const label = LABELS[e.actionType] || e.actionType;
        return (
          <div key={i} style={{ position: "relative", marginBottom: 16 }}>
            <div style={{ position: "absolute", left: -22, top: 3, width: 12, height: 12, borderRadius: "50%", background: color, border: "2px solid #fff", boxShadow: "0 0 0 2px " + color }} />
            <div style={{ fontWeight: 700, color: "#0f172a" }}>{label}</div>
            {e.remarks && <div style={{ fontSize: 13, color: "#475569" }}>{e.remarks}</div>}
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
              {fmt(e.at)}{e.performedBy ? ` · ${e.performedBy}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
