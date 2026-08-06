import React, { useState } from "react";
import api from "../services/api";

/**
 * DocumentVerification — the status badge and actions shown beneath a document.
 *
 * Rendered under each existing document thumbnail; it adds nothing to the page
 * layout and changes no existing markup. All state comes from the application's
 * `documentVerification` block, and every decision (including whether an
 * override is permitted) is made by the backend — this component only presents
 * the current state and issues the action.
 *
 * On success it calls onChanged(), wired to the page's existing
 * refreshApplication(). No page reload.
 */

const STYLES = {
  Pending: { dot: "🟡", colour: "#92400e", bg: "#fffbeb", border: "#fde68a", label: "Pending Verification" },
  Verified: { dot: "🟢", colour: "#047857", bg: "#ecfdf5", border: "#a7f3d0", label: "Verified" },
  Rejected: { dot: "🔴", colour: "#b91c1c", bg: "#fef2f2", border: "#fecaca", label: "Rejected" },
  "Re-upload Requested": { dot: "🔵", colour: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", label: "Re-upload Requested" },
};

const fmt = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const ACTIONS = {
  verify: { path: "verify", title: "Verify document", verb: "Verify", needsRemarks: false },
  reject: { path: "reject", title: "Reject document", verb: "Reject", needsRemarks: true },
  reupload: { path: "request-reupload", title: "Request re-upload", verb: "Request Re-upload", needsRemarks: true },
};

export default function DocumentVerification({
  applicationId,
  role,          // "applicant" | "coApplicant"
  field,         // e.g. "panImage"
  label,         // e.g. "PAN Card"
  hasFile,
  state,         // documentVerification[role][field] or undefined
  onChanged,
}) {
  const [action, setAction] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Nothing to verify until a file exists.
  if (!hasFile) return null;

  const status = state?.status || "Pending";
  const s = STYLES[status] || STYLES.Pending;
  const decided = status === "Verified" || status === "Rejected";

  const open = (key) => {
    setAction(key);
    setRemarks("");
    setError("");
  };

  const submit = async () => {
    if (busy) return;
    const cfg = ACTIONS[action];
    if (cfg.needsRemarks && !remarks.trim()) {
      setError("A reason is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post(
        `/applications/${applicationId}/documents/${role}/${field}/${cfg.path}`,
        { remarks: remarks.trim() }
      );
      setAction(null);
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err?.response?.data?.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={S.wrap}>
      <div style={{ ...S.badge, background: s.bg, borderColor: s.border, color: s.colour }}>
        <span aria-hidden="true">{s.dot}</span> {s.label}
      </div>

      {status === "Verified" && (
        <div style={S.meta}>
          <div><span style={S.metaKey}>Verified By</span> {state?.verifiedBy || "—"}</div>
          <div><span style={S.metaKey}>Verified On</span> {fmt(state?.verifiedAt)}</div>
          {state?.remarks ? <div style={S.remark}>{state.remarks}</div> : null}
        </div>
      )}

      {status === "Rejected" && (
        <div style={S.meta}>
          <div><span style={S.metaKey}>Reason</span> {state?.remarks || "—"}</div>
          <div><span style={S.metaKey}>By</span> {state?.verifiedBy || "—"} · {fmt(state?.verifiedAt)}</div>
        </div>
      )}

      {status === "Re-upload Requested" && (
        <div style={S.meta}>
          <div><span style={S.metaKey}>Reason</span> {state?.remarks || "—"}</div>
          <div>
            <span style={S.metaKey}>Requested By</span> {state?.reuploadRequestedBy || "—"} ·{" "}
            {fmt(state?.reuploadRequestedAt)}
          </div>
        </div>
      )}

      <div style={S.btnRow}>
        {status === "Pending" && (
          <>
            <button style={{ ...S.btn, ...S.verify }} onClick={() => open("verify")}>Verify</button>
            <button style={{ ...S.btn, ...S.reject }} onClick={() => open("reject")}>Reject</button>
          </>
        )}
        {status === "Rejected" && (
          <button style={{ ...S.btn, ...S.reupload }} onClick={() => open("reupload")}>
            Request Re-upload
          </button>
        )}
        {decided && (
          // The backend refuses this for non-superadmins and explains why.
          <button style={{ ...S.btn, ...S.override }} onClick={() => open("verify")}>
            Override
          </button>
        )}
      </div>

      {action && (
        <div style={S.backdrop} onClick={() => !busy && setAction(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={S.modalTitle}>{ACTIONS[action].title}</h3>
            <div style={S.modalDoc}>
              {label} · {role === "applicant" ? "Applicant" : "Co-Applicant"}
            </div>

            <label style={S.lbl}>
              Remarks{ACTIONS[action].needsRemarks ? " (required)" : " (optional)"}
            </label>
            <textarea
              style={S.textarea}
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={
                action === "verify"
                  ? "Original document verified."
                  : action === "reject"
                    ? "e.g. Document blurred. Name mismatch. Expired document."
                    : "e.g. Please upload a clearer copy."
              }
              disabled={busy}
            />

            {error ? <div style={S.error}>{error}</div> : null}

            <div style={S.modalActions}>
              <button style={S.cancel} onClick={() => setAction(null)} disabled={busy}>Cancel</button>
              <button style={{ ...S.confirm }} onClick={submit} disabled={busy}>
                {busy ? "Saving…" : `Confirm ${ACTIONS[action].verb}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { marginTop: 6 },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: 11,
    fontWeight: 700,
  },
  meta: { marginTop: 4, fontSize: 11, color: "#4b5563", lineHeight: 1.5 },
  metaKey: { color: "#9ca3af", marginRight: 4 },
  remark: { fontStyle: "italic", color: "#6b7280" },
  btnRow: { display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" },
  btn: {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 9px",
    borderRadius: 6,
    border: "1px solid",
    background: "#fff",
    cursor: "pointer",
  },
  verify: { borderColor: "#047857", color: "#047857" },
  reject: { borderColor: "#b91c1c", color: "#b91c1c" },
  reupload: { borderColor: "#1d4ed8", color: "#1d4ed8" },
  override: { borderColor: "#94a3b8", color: "#475569" },

  backdrop: {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200,
  },
  modal: {
    background: "#fff", borderRadius: 12, padding: 20, width: 420, maxWidth: "92vw",
    boxShadow: "0 20px 50px rgba(0,0,0,.22)",
  },
  modalTitle: { margin: "0 0 4px", fontSize: 16.5, fontWeight: 800, color: "#0f172a" },
  modalDoc: { fontSize: 12.5, color: "#6b7280", marginBottom: 12 },
  lbl: { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 },
  textarea: {
    width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db",
    borderRadius: 8, padding: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical",
  },
  error: {
    marginTop: 8, padding: "6px 9px", borderRadius: 6,
    background: "#fef2f2", color: "#b91c1c", fontSize: 12, fontWeight: 600,
  },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 },
  cancel: {
    background: "#fff", border: "1px solid #d1d5db", borderRadius: 8,
    padding: "7px 14px", fontWeight: 600, color: "#374151", cursor: "pointer",
  },
  confirm: {
    background: "#2563eb", border: 0, borderRadius: 8,
    padding: "7px 16px", fontWeight: 700, color: "#fff", cursor: "pointer",
  },
};
