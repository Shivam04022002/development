import React from "react";

/**
 * Toast — the admin portal's transient message.
 *
 * The existing toast lives inline inside FilesManagementTable and is not
 * exported. This is the same thing extracted so pages can use it without
 * copying it again: identical position, padding, radius, weight, shadow and
 * the same success / warning / error colours. FilesManagementTable is left
 * untouched.
 *
 * Usage: keep `{ type, msg }` in state, clear it on a timer, render <Toast/>.
 */
const COLORS = { success: "#16A34A", warning: "#F59E0B", error: "#EF4444" };

export default function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 100000,
        padding: "12px 18px",
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 700,
        color: "#fff",
        maxWidth: 380,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        cursor: "pointer",
        background: COLORS[toast.type] || COLORS.error,
      }}
      onClick={onClose}
      role="status"
    >
      {toast.msg}
    </div>
  );
}
