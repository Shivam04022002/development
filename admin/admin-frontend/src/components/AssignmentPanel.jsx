import React, { useCallback, useEffect, useState } from "react";
import api from "../services/api";

/**
 * AssignmentPanel — ownership for one application, shown on Application Details.
 *
 * Presentational plus the two calls it owns. Every rule (who may reassign,
 * which priorities and statuses are valid) is enforced by the backend; this
 * surfaces the state and reports the server's refusal verbatim.
 *
 * Assignment is independent of the workflow — nothing here changes a stage.
 */

const BLUE = "#2563eb";
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Pending", "In Progress", "Completed", "On Hold", "Cancelled"];

const PRIORITY_STYLE = {
  Low: { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" },
  Medium: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  High: { bg: "#fff7ed", color: "#9a3412", border: "#fed7aa" },
  Critical: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
};
const STATUS_COLOUR = {
  Pending: "#92400e",
  "In Progress": "#1d4ed8",
  Completed: "#047857",
  "On Hold": "#6b7280",
  Cancelled: "#6b7280",
};

const fmt = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const isOverdue = (a) =>
  Boolean(
    a?.dueDate &&
      !["Completed", "Cancelled"].includes(a?.taskStatus) &&
      new Date(a.dueDate) < new Date(new Date().setHours(0, 0, 0, 0))
  );

export default function AssignmentPanel({ applicationId, assignment, onChanged }) {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ assignedTo: "", priority: "Medium", dueDate: "", remarks: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const assigned = Boolean(assignment?.assignedTo);

  // The staff picker uses the assignment endpoint's own list — the full staff
  // directory is Super Admin-only and a regular admin may also assign.
  const loadStaff = useCallback(async () => {
    try {
      const { data } = await api.get("/assignments/staff");
      setStaff(Array.isArray(data?.staff) ? data.staff : []);
    } catch (err) {
      console.error("Failed to load staff:", err?.response?.data || err.message);
    }
  }, []);

  useEffect(() => {
    if (open && staff.length === 0) loadStaff();
  }, [open, staff.length, loadStaff]);

  const openModal = () => {
    setForm({
      assignedTo: assignment?.assignedTo ? String(assignment.assignedTo) : "",
      priority: assignment?.priority || "Medium",
      dueDate: assignment?.dueDate ? String(assignment.dueDate).slice(0, 10) : "",
      remarks: "",
    });
    setError("");
    setOpen(true);
  };

  const submit = async () => {
    if (busy) return;
    if (!form.assignedTo) {
      setError("Select a staff member.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post(`/assignments/${applicationId}`, {
        assignedTo: form.assignedTo,
        priority: form.priority,
        dueDate: form.dueDate || null,
        remarks: form.remarks,
      });
      setOpen(false);
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to assign.");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (body) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch(`/assignments/${applicationId}`, body);
      if (onChanged) await onChanged();
    } catch (err) {
      // Surface the server's refusal (e.g. someone else's task) rather than
      // guessing the rule client-side.
      alert(err?.response?.data?.message || "Failed to update assignment.");
    } finally {
      setBusy(false);
    }
  };

  const p = PRIORITY_STYLE[assignment?.priority] || PRIORITY_STYLE.Medium;

  return (
    <>
      <div style={S.wrap}>
        <div style={S.title}>Assignment</div>

        {assigned ? (
          <div style={S.grid}>
            <div style={S.cell}>
              <div style={S.label}>Assigned To</div>
              <div style={S.value}>{assignment.assignedToName || "—"}</div>
              <div style={S.sub}>{assignment.assignedToRole === "superadmin" ? "Super Admin" : "Admin"}</div>
            </div>

            <div style={S.cell}>
              <div style={S.label}>Priority</div>
              <select
                style={{ ...S.inlineSelect, background: p.bg, color: p.color, borderColor: p.border }}
                value={assignment.priority || "Medium"}
                disabled={busy}
                onChange={(e) => patch({ priority: e.target.value })}
              >
                {PRIORITIES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>

            <div style={S.cell}>
              <div style={S.label}>Due Date</div>
              <div style={{ ...S.value, color: isOverdue(assignment) ? "#b91c1c" : "#111827" }}>
                {fmt(assignment.dueDate)}
                {isOverdue(assignment) ? <span style={S.overdue}>overdue</span> : null}
              </div>
            </div>

            <div style={S.cell}>
              <div style={S.label}>Status</div>
              <select
                style={{ ...S.inlineSelect, color: STATUS_COLOUR[assignment.taskStatus] || "#111827" }}
                value={assignment.taskStatus || "Pending"}
                disabled={busy}
                onChange={(e) => patch({ taskStatus: e.target.value })}
              >
                {STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>

            <div style={S.actions}>
              <button style={S.btn} onClick={openModal} disabled={busy}>Reassign</button>
            </div>
          </div>
        ) : (
          <div style={S.emptyRow}>
            <span style={S.empty}>Not assigned to anyone yet.</span>
            <button style={S.btn} onClick={openModal}>Assign</button>
          </div>
        )}

        {assignment?.assignedByName ? (
          <div style={S.footnote}>
            Assigned by {assignment.assignedByName} · {fmt(assignment.assignedAt)}
            {assignment.remarks ? ` — ${assignment.remarks}` : ""}
          </div>
        ) : null}
      </div>

      {open && (
        <div style={S.backdrop} onClick={() => !busy && setOpen(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={S.modalTitle}>{assigned ? "Reassign Application" : "Assign Application"}</h3>

            <label style={S.lbl}>Select Staff</label>
            <select
              style={S.input}
              value={form.assignedTo}
              disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
            >
              <option value="">— Select —</option>
              {staff.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}{s.role === "superadmin" ? " (Super Admin)" : ""}
                </option>
              ))}
            </select>

            <label style={S.lbl}>Priority</label>
            <select
              style={S.input}
              value={form.priority}
              disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            >
              {PRIORITIES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>

            <label style={S.lbl}>Due Date (optional)</label>
            <input
              type="date"
              style={S.input}
              value={form.dueDate}
              disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />

            <label style={S.lbl}>Remarks</label>
            <textarea
              style={{ ...S.input, resize: "vertical" }}
              rows={2}
              value={form.remarks}
              disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
            />

            {error ? <div style={S.error}>{error}</div> : null}

            <div style={S.modalActions}>
              <button style={S.cancel} onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
              <button style={S.confirm} onClick={submit} disabled={busy}>
                {busy ? "Saving…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const S = {
  wrap: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", marginBottom: 18 },
  title: { fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 },
  grid: { display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" },
  cell: { minWidth: 132 },
  label: { fontSize: 11, color: "#9ca3af", marginBottom: 3 },
  value: { fontSize: 14, fontWeight: 700, color: "#111827" },
  sub: { fontSize: 11.5, color: "#6b7280" },
  overdue: {
    marginLeft: 6, fontSize: 10, fontWeight: 800, color: "#b91c1c",
    background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 999, padding: "1px 6px",
  },
  inlineSelect: {
    border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 8px",
    fontSize: 12.5, fontWeight: 700, background: "#fff",
  },
  actions: { marginLeft: "auto", alignSelf: "center" },
  emptyRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  empty: { fontSize: 13.5, color: "#6b7280" },
  btn: {
    background: BLUE, color: "#fff", border: 0, borderRadius: 8,
    padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
  },
  footnote: { marginTop: 10, fontSize: 11, color: "#9ca3af" },

  backdrop: {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
  },
  modal: { background: "#fff", borderRadius: 12, padding: 22, width: 420, maxWidth: "92vw", boxShadow: "0 20px 50px rgba(0,0,0,.22)" },
  modalTitle: { margin: "0 0 14px", fontSize: 17, fontWeight: 800, color: "#0f172a" },
  lbl: { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", margin: "10px 0 4px" },
  input: {
    width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db",
    borderRadius: 8, padding: 8, fontSize: 13.5, fontFamily: "inherit", background: "#fff",
  },
  error: { marginTop: 10, padding: "7px 10px", borderRadius: 8, background: "#fef2f2", color: "#b91c1c", fontSize: 12.5, fontWeight: 600 },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  cancel: { background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 16px", fontWeight: 600, color: "#374151", cursor: "pointer" },
  confirm: { background: BLUE, border: 0, borderRadius: 8, padding: "8px 18px", fontWeight: 700, color: "#fff", cursor: "pointer" },
};
