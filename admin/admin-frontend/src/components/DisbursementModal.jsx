import React, { useEffect, useRef, useState } from "react";

/**
 * DisbursementModal — the final details required before an application can be
 * marked Disbursed.
 *
 * The modal owns the form and its inline validation; it does NOT decide what to
 * submit to. The page passes `onConfirm(payload)`, which performs the actual
 * transition and either resolves (the modal closes) or rejects with the
 * backend's response (the modal stays open and shows the error).
 *
 * That split is deliberate: there are three different actions that reach the
 * Disbursed stage, and all three need this same form.
 */

const BLUE = "#2563eb";

/** Field rules, mirrored from utils/disbursement.js on the backend. */
function validate({ approvedAmount, loanNumber, disbursementDate }) {
  const errors = {};

  const amount = Number(String(approvedAmount).replace(/,/g, "").trim());
  if (approvedAmount === "" || approvedAmount == null) {
    errors.approvedAmount = "Approved Amount is required.";
  } else if (!Number.isFinite(amount)) {
    errors.approvedAmount = "Approved Amount must be a number.";
  } else if (amount <= 0) {
    errors.approvedAmount = "Approved Amount must be greater than 0.";
  }

  if (!String(loanNumber || "").trim()) errors.loanNumber = "Loan Number is required.";
  if (!disbursementDate) errors.disbursementDate = "Disbursement Date is required.";

  return errors;
}

/**
 * A labelled, required field.
 *
 * Declared at MODULE scope, and it must stay there. React identifies a
 * component by its function reference, so a component defined inside another
 * component's body is a different type on every render: React cannot reconcile
 * it against the previous tree and instead unmounts the old subtree and mounts
 * a fresh one. That threw away and recreated the <input> DOM nodes on every
 * keystroke, so the caret left the field after a single character.
 *
 * The error text is passed in as a prop rather than read from a closure over
 * the parent's `errors` state — that closure is the only reason this was ever
 * written inside the component.
 */
function Field({ label, error, hint, children }) {
  return (
    <div style={S.field}>
      <label style={S.label}>
        {label} <span style={S.required}>*</span>
      </label>
      {children}
      {error ? (
        <div style={S.fieldError}>{error}</div>
      ) : hint ? (
        <div style={S.hint}>{hint}</div>
      ) : null}
    </div>
  );
}

export default function DisbursementModal({ open, onCancel, onConfirm, formId }) {
  const [form, setForm] = useState({ approvedAmount: "", loanNumber: "", disbursementDate: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const firstFieldRef = useRef(null);

  // Reset whenever the modal is opened, so a previous attempt's values and
  // errors never carry into a new one.
  useEffect(() => {
    if (open) {
      setForm({ approvedAmount: "", loanNumber: "", disbursementDate: "" });
      setErrors({});
      setServerError("");
      setBusy(false);
      setTimeout(() => firstFieldRef.current?.focus(), 0);
    }
  }, [open]);

  // Escape cancels, but never while a submission is in flight.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const set = (k) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
    // Clear the field's error as soon as it is edited.
    setErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev));
    setServerError("");
  };

  const submit = async () => {
    if (busy) return;                       // no duplicate submissions
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    setServerError("");
    try {
      await onConfirm({
        approvedAmount: Number(String(form.approvedAmount).replace(/,/g, "").trim()),
        loanNumber: String(form.loanNumber).trim(),   // casing preserved
        // Stored and sent as ISO; the picker already gives YYYY-MM-DD.
        disbursementDate: new Date(`${form.disbursementDate}T00:00:00`).toISOString(),
      });
      // Success: the caller closes the modal.
    } catch (err) {
      // Keep the modal open and show what the backend said, field by field
      // where it told us.
      const data = err?.response?.data;
      if (data?.errors && typeof data.errors === "object") setErrors(data.errors);
      setServerError(data?.message || data?.error || err?.message || "Could not save the disbursement details.");
      setBusy(false);
    }
  };

  return (
    <div style={S.backdrop} onClick={() => !busy && onCancel()}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 style={S.title}>Disbursement Details</h3>
        <p style={S.sub}>
          {formId ? `Application ${formId}. ` : ""}
          These details are saved before the application is marked Disbursed.
        </p>

        <Field label="Approved Amount" error={errors.approvedAmount} hint="Amount actually sanctioned, in rupees.">
          <input
            ref={firstFieldRef}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="450000"
            value={form.approvedAmount}
            disabled={busy}
            onChange={set("approvedAmount")}
            style={{ ...S.input, ...(errors.approvedAmount ? S.inputError : null) }}
          />
        </Field>

        <Field label="Loan Number" error={errors.loanNumber}>
          <input
            type="text"
            placeholder="LN-2026-000123"
            value={form.loanNumber}
            disabled={busy}
            onChange={set("loanNumber")}
            style={{ ...S.input, ...(errors.loanNumber ? S.inputError : null) }}
          />
        </Field>

        <Field label="Disbursement Date" error={errors.disbursementDate}>
          <input
            type="date"
            value={form.disbursementDate}
            disabled={busy}
            onChange={set("disbursementDate")}
            style={{ ...S.input, ...(errors.disbursementDate ? S.inputError : null) }}
          />
        </Field>

        {serverError ? <div style={S.serverError}>{serverError}</div> : null}

        <div style={S.actions}>
          <button type="button" style={S.cancel} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" style={{ ...S.confirm, ...(busy ? S.confirmBusy : null) }} onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Confirm Disbursement"}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 12000,
  },
  modal: {
    background: "#fff", borderRadius: 12, padding: 24, width: 460, maxWidth: "94vw",
    boxShadow: "0 20px 50px rgba(0,0,0,.22)", fontFamily: "inherit",
  },
  title: { margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#0f172a" },
  sub: { margin: "0 0 16px", fontSize: 12.5, color: "#64748b", lineHeight: 1.45 },

  field: { marginBottom: 14 },
  label: { display: "block", fontSize: 12.5, fontWeight: 700, color: "#374151", marginBottom: 5 },
  required: { color: "#ef4444" },
  input: {
    width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8,
    padding: "9px 10px", fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#111827",
  },
  inputError: { borderColor: "#ef4444", background: "#fef2f2" },
  fieldError: { marginTop: 5, fontSize: 12, color: "#b91c1c", fontWeight: 600 },
  hint: { marginTop: 5, fontSize: 11.5, color: "#94a3b8" },

  serverError: {
    marginTop: 4, marginBottom: 4, padding: "9px 11px", borderRadius: 8,
    background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c",
    fontSize: 12.5, fontWeight: 600, whiteSpace: "pre-line",
  },

  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  cancel: {
    background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 18px",
    fontWeight: 600, fontSize: 13.5, color: "#374151", cursor: "pointer",
  },
  confirm: {
    background: BLUE, border: 0, borderRadius: 8, padding: "9px 20px",
    fontWeight: 700, fontSize: 13.5, color: "#fff", cursor: "pointer",
  },
  confirmBusy: { background: "#93c5fd", cursor: "not-allowed" },
};
