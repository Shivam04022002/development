import React, { useState } from "react";
import api from "../services/api";
import LoanEligibilityPanel from "./LoanEligibilityPanel";

/**
 * ApplicantSwapCards — the two compact summary cards at the top of Application
 * Details, with the role-swap action between them.
 *
 * Self-contained so ApplicationView only gains one line. It renders above the
 * existing sections and changes nothing else on the page.
 *
 * On success it calls onSwapped(), which is wired to the page's existing
 * refreshApplication() — that re-fetches the application and bumps the refresh
 * key the Timeline and Credit Note summary remount on. No page reload.
 */

const BLUE = "#2563eb";

/** Name of a party, tolerating the legacy nested shape and firstName/surname. */
const partyName = (party) => {
  const p = party?.applicant || party || {};
  return p.name || `${p.firstName || ""} ${p.surname || ""}`.trim() || "";
};
const partyMobile = (party) => {
  const p = party?.applicant || party || {};
  return p.mobileNumber || p.mobile || "";
};
const partyPan = (party) => {
  const p = party?.applicant || party || {};
  return String(p.panNo || p.pan || "").trim().toUpperCase();
};

const Card = ({ role, party, cibil, status }) => (
  <div style={S.card}>
    <div style={S.role}>{role}</div>
    <div style={S.name}>{partyName(party) || "—"}</div>

    <div style={S.row}>
      <span style={S.label}>Mobile</span>
      <span style={S.value}>{partyMobile(party) || "—"}</span>
    </div>
    <div style={S.row}>
      <span style={S.label}>CIBIL Score</span>
      <span style={{ ...S.value, ...(cibil.available ? S.score : S.muted) }}>
        {cibil.available ? cibil.score : "No CIBIL Report Available"}
      </span>
    </div>
    <div style={S.row}>
      <span style={S.label}>Status</span>
      <span style={S.value}>{status || "—"}</span>
    </div>
  </div>
);

export default function ApplicantSwapCards({ app, onSwapped }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!app) return null;

  const applicant = app.applicant;
  const coApplicant = app.coApplicant;

  const applicantName = partyName(applicant) || "Applicant";
  const coApplicantName = partyName(coApplicant) || "Co-Applicant";

  /**
   * A bureau report is pulled against one person's PAN. `cibil.subjectPan`
   * records whose it is; records that predate the swap feature have no subject,
   * which meant "the applicant" at the time.
   */
  const subjectPan = String(app?.cibil?.subjectPan || "").trim().toUpperCase();
  const score = typeof app?.cibil?.score === "number" ? app.cibil.score : null;
  const hasReport = score !== null || Boolean(app?.cibil?.requestId);

  const cibilFor = (party, isApplicant) => {
    if (!hasReport) return { available: false, score: null };
    const owns = subjectPan
      ? partyPan(party) === subjectPan
      : isApplicant; // legacy record: the report was the applicant's
    return owns ? { available: true, score: score ?? "—" } : { available: false, score: null };
  };

  const hasCoApplicant = coApplicant && Object.keys(coApplicant || {}).length > 0;
  const disbursed = String(app.workflowStage || "").trim().toLowerCase() === "disbursed";
  const canSwap = hasCoApplicant && !disbursed;

  const blockedReason = disbursed
    ? "This loan has already been disbursed. The applicant can no longer be swapped."
    : !hasCoApplicant
      ? "This application has no co-applicant to swap with."
      : "";

  const confirmSwap = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/applications/${app._id}/swap-applicant`);
      setConfirming(false);
      if (onSwapped) await onSwapped();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to swap applicant.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={S.wrap}>
        <Card
          role="Applicant"
          party={applicant}
          cibil={cibilFor(applicant, true)}
          status={app.status}
        />

        <div style={S.middle}>
          <button
            style={{ ...S.swapBtn, ...(canSwap ? null : S.swapBtnDisabled) }}
            onClick={() => canSwap && setConfirming(true)}
            disabled={!canSwap}
            title={blockedReason || undefined}
          >
            ⇄ Swap Applicant &amp; Co-Applicant
          </button>
          {blockedReason ? <div style={S.blocked}>{blockedReason}</div> : null}
        </div>

        <Card
          role="Co-Applicant"
          party={coApplicant}
          cibil={cibilFor(coApplicant, false)}
          status={hasCoApplicant ? app.status : "—"}
        />
      </div>

      {/* Advisory decision support. Its swap button opens the same confirmation
          modal below — one modal, one request path, no duplicated logic. */}
      <LoanEligibilityPanel
        eligibility={app.eligibility}
        canSwap={canSwap}
        onSwap={() => setConfirming(true)}
      />

      {confirming && (
        <div style={S.backdrop} onClick={() => !busy && setConfirming(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={S.modalTitle}>Swap Applicant &amp; Co-Applicant</h3>

            <div style={S.modalBlock}>
              <div style={S.modalLabel}>Current Applicant</div>
              <div style={S.modalName}>{applicantName}</div>
              <div style={S.arrow}>↓</div>
              <div style={S.modalLabel}>Will become</div>
              <div style={S.modalRole}>Co-Applicant</div>
            </div>

            <hr style={S.modalRule} />

            <div style={S.modalBlock}>
              <div style={S.modalLabel}>Current Co-Applicant</div>
              <div style={S.modalName}>{coApplicantName}</div>
              <div style={S.arrow}>↓</div>
              <div style={S.modalLabel}>Will become</div>
              <div style={S.modalRole}>Applicant</div>
            </div>

            {error ? <div style={S.error}>{error}</div> : null}

            <div style={S.modalActions}>
              <button style={S.cancelBtn} onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </button>
              <button style={S.confirmBtn} onClick={confirmSwap} disabled={busy}>
                {busy ? "Swapping…" : "Confirm Swap"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* Styles follow the page's existing card language: white surface, #e5e7eb
   border, 10px radius, same greys and the same #2563eb accent. */
const S = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gap: 14,
    alignItems: "center",
    marginBottom: 18,
  },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "14px 16px",
  },
  role: {
    fontSize: 11,
    fontWeight: 800,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    marginBottom: 4,
  },
  name: { fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 8 },
  row: { display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0" },
  label: { fontSize: 12.5, color: "#6b7280" },
  value: { fontSize: 13, color: "#111827", fontWeight: 600, textAlign: "right" },
  score: { color: BLUE, fontWeight: 800 },
  muted: { color: "#9ca3af", fontWeight: 500, fontSize: 12 },
  middle: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, maxWidth: 220 },
  swapBtn: {
    background: BLUE,
    color: "#fff",
    border: 0,
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  swapBtnDisabled: { background: "#cbd5e1", cursor: "not-allowed" },
  blocked: { fontSize: 11, color: "#9ca3af", textAlign: "center", lineHeight: 1.35 },

  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#fff",
    borderRadius: 12,
    padding: 22,
    width: 400,
    maxWidth: "92vw",
    boxShadow: "0 20px 50px rgba(0,0,0,.22)",
  },
  modalTitle: { margin: "0 0 14px", fontSize: 17, fontWeight: 800, color: "#0f172a" },
  modalBlock: { textAlign: "center", padding: "6px 0" },
  modalLabel: { fontSize: 11.5, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.4px" },
  modalName: { fontSize: 15.5, fontWeight: 700, color: "#111827", margin: "2px 0" },
  arrow: { fontSize: 17, color: "#94a3b8", margin: "2px 0" },
  modalRole: { fontSize: 14, fontWeight: 700, color: BLUE },
  modalRule: { border: 0, borderTop: "1px solid #f1f5f9", margin: "12px 0" },
  error: {
    marginTop: 12,
    padding: "8px 10px",
    borderRadius: 8,
    background: "#fef2f2",
    color: "#b91c1c",
    fontSize: 12.5,
    fontWeight: 600,
  },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  cancelBtn: {
    background: "#fff",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "8px 16px",
    fontWeight: 600,
    color: "#374151",
    cursor: "pointer",
  },
  confirmBtn: {
    background: BLUE,
    border: 0,
    borderRadius: 8,
    padding: "8px 18px",
    fontWeight: 700,
    color: "#fff",
    cursor: "pointer",
  },
};
