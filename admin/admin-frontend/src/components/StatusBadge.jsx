import React from "react";

/**
 * StatusBadge — upload status pill for the RC & Number Plate module.
 *
 * The badge inside FilesManagementTable is private to that component and models
 * APPLICATION status (pending / approved / rejected). This one models UPLOAD
 * status (Pending / Uploaded) and is exported so the listing page and the
 * Phase 6 details page share one implementation.
 *
 * The visual spec is copied exactly from the existing badge — same padding,
 * radius, size, weight, letter-spacing, and the same amber / green palettes —
 * so the two read as one component on screen.
 */
const CONFIG = {
  pending: { bg: "#FFF7ED", color: "#92400E", border: "#FDE3BF", label: "Pending" },
  uploaded: { bg: "#ECFDF5", color: "#065F46", border: "#D1FAE5", label: "Uploaded" },
};

export default function StatusBadge({ status }) {
  const c = CONFIG[String(status || "").toLowerCase()] || CONFIG.pending;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.3px",
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
      }}
    >
      {c.label}
    </span>
  );
}
