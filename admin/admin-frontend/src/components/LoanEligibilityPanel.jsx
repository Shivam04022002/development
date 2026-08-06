import React from "react";

/**
 * LoanEligibilityPanel — advisory decision support beneath the Applicant /
 * Co-Applicant summary cards.
 *
 * Purely presentational. Every judgement (band matching, eligibility,
 * recommendation, warnings) is made on the server by utils/loanEligibility.js,
 * which reuses the same score bands the CIBIL workflow uses — so this component
 * contains **no policy logic and no thresholds**. It renders what it is given.
 *
 * It never approves, rejects or swaps anything. The swap button simply opens
 * the existing confirmation modal owned by ApplicantSwapCards.
 */

const BLUE = "#2563eb";
const GREEN = "#047857";
const RED = "#b91c1c";
const AMBER = "#92400e";

const scoreColour = (p) => (p.score === null ? "#9ca3af" : p.eligible ? GREEN : RED);

const PartyRow = ({ role, party }) => (
  <div style={S.party}>
    <div style={S.partyHead}>
      <span style={S.role}>{role}</span>
      <span style={S.partyName}>{party.name || "—"}</span>
    </div>
    <div style={S.metrics}>
      <div style={S.metric}>
        <div style={S.metricLabel}>CIBIL</div>
        <div style={{ ...S.metricValue, color: scoreColour(party) }}>
          {party.score === null ? "—" : party.score}
        </div>
      </div>
      <div style={{ ...S.metric, flex: 1.6 }}>
        <div style={S.metricLabel}>Status</div>
        <div style={{ ...S.status, color: scoreColour(party) }}>
          {party.score === null ? "" : party.eligible ? "✅ " : "❌ "}
          {party.status}
        </div>
      </div>
    </div>
  </div>
);

export default function LoanEligibilityPanel({ eligibility, canSwap, onSwap }) {
  // Older responses (or a settings failure) simply omit the block.
  if (!eligibility) return null;

  const { applicant, coApplicant, summary, recommendation, action, warnings = [] } = eligibility;
  const showSwap = action === "swap" && canSwap;

  return (
    <div style={S.wrap}>
      <div style={S.title}>Loan Eligibility</div>

      <PartyRow role="Applicant" party={applicant} />
      {coApplicant?.present ? (
        <>
          <hr style={S.rule} />
          <PartyRow role="Co-Applicant" party={coApplicant} />
        </>
      ) : null}

      {warnings.length > 0 && (
        <div style={S.warnings}>
          {warnings.map((w, i) => (
            <div
              key={i}
              style={{ ...S.warning, ...(w.level === "warning" ? S.warnLevel : S.infoLevel) }}
            >
              <span aria-hidden="true">{w.icon}</span> {w.text}
            </div>
          ))}
        </div>
      )}

      <hr style={S.rule} />

      {/* Decision summary */}
      <div style={S.summary}>
        <div style={S.sumCell}>
          <div style={S.sumLabel}>Applicant Score</div>
          <div style={S.sumValue}>{summary.applicantScore ?? "—"}</div>
        </div>
        <div style={S.sumCell}>
          <div style={S.sumLabel}>Co-Applicant Score</div>
          <div style={S.sumValue}>{summary.coApplicantScore ?? "—"}</div>
        </div>
        <div style={S.sumCell}>
          <div style={S.sumLabel}>Best Borrower</div>
          <div style={S.sumValue}>{summary.bestBorrower || "—"}</div>
        </div>
        <div style={S.sumCell}>
          <div style={S.sumLabel}>Eligible</div>
          <div style={{ ...S.sumValue, color: summary.eligible ? GREEN : RED }}>
            {summary.eligible ? "Yes" : "No"}
          </div>
        </div>
        <div style={S.sumCell}>
          <div style={S.sumLabel}>Recommended Action</div>
          <div style={S.sumValue}>{summary.recommendedAction}</div>
        </div>
      </div>

      <hr style={S.rule} />

      {/* Recommendation */}
      <div style={S.recoWrap}>
        <div>
          <div style={S.recoLabel}>Recommendation</div>
          <div style={S.recoText}>{recommendation}</div>
        </div>
        {showSwap && (
          <button style={S.swapBtn} onClick={onSwap}>
            Swap Applicant &amp; Co-Applicant
          </button>
        )}
      </div>

      <div style={S.footnote}>
        Advisory only — based on the configured CIBIL policy
        {eligibility.policy?.passRange
          ? ` (pass ${eligibility.policy.passRange.min}–${eligibility.policy.passRange.max})`
          : ""}
        . Approval and rejection remain manual.
      </div>
    </div>
  );
}

/* Matches the page's existing card language: white surface, #e5e7eb border,
   10px radius, the same greys and #2563eb accent. */
const S = {
  wrap: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 18,
  },
  title: {
    fontSize: 11,
    fontWeight: 800,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    marginBottom: 10,
  },
  party: { padding: "2px 0" },
  partyHead: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 },
  role: { fontSize: 11, fontWeight: 700, color: "#6b7280", minWidth: 88 },
  partyName: { fontSize: 14.5, fontWeight: 700, color: "#111827" },
  metrics: { display: "flex", gap: 18, paddingLeft: 96 },
  metric: { flex: "0 0 auto" },
  metricLabel: { fontSize: 11, color: "#9ca3af" },
  metricValue: { fontSize: 15, fontWeight: 800 },
  status: { fontSize: 13, fontWeight: 700 },

  rule: { border: 0, borderTop: "1px solid #f1f5f9", margin: "10px 0" },

  warnings: { display: "flex", flexDirection: "column", gap: 6, marginTop: 10 },
  warning: { fontSize: 12.5, fontWeight: 600, padding: "6px 10px", borderRadius: 6 },
  warnLevel: { background: "#fffbeb", color: AMBER, border: "1px solid #fde68a" },
  infoLevel: { background: "#eff6ff", color: BLUE, border: "1px solid #bfdbfe" },

  summary: { display: "flex", flexWrap: "wrap", gap: 18 },
  sumCell: { minWidth: 118 },
  sumLabel: { fontSize: 11, color: "#9ca3af", marginBottom: 2 },
  sumValue: { fontSize: 13.5, fontWeight: 700, color: "#111827" },

  recoWrap: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 },
  recoLabel: { fontSize: 11, color: "#9ca3af", marginBottom: 2 },
  recoText: { fontSize: 13.5, fontWeight: 700, color: "#111827" },
  swapBtn: {
    background: BLUE,
    color: "#fff",
    border: 0,
    borderRadius: 8,
    padding: "9px 15px",
    fontWeight: 700,
    fontSize: 12.5,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  footnote: { marginTop: 10, fontSize: 11, color: "#9ca3af" },
};
