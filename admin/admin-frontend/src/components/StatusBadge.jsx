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
  // Additive. The vehicle endpoints only ever emit Pending/Uploaded today, so
  // these are here so one badge system covers every state the portal shows —
  // an unknown status still falls back to Pending, exactly as before.
  verified: { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE", label: "Verified" },
  rejected: { bg: "#FFF1F2", color: "#7F1D1D", border: "#FECACA", label: "Rejected" },
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
