// src/components/CreditNoteSummary.jsx
//
// Phase 6 — read-only Credit Note display for Application Details. Fetches the
// saved Credit Note (if any) and shows its fields. No PDF/generate action here
// (that lives in the Pending CIBIL view).
//
import React, { useEffect, useState } from "react";
import API from "../services/api";

const ROWS = [
  ["customerName", "Customer Name"],
  ["houseAddress", "House Address"],
  ["cibilScore", "CIBIL Score"],
  ["dpdDays", "DPD Days"],
  ["enquiryCount", "Enquiry Count"],
  ["suitFiled", "Suit Filed"],
  ["writeOff", "Write Off"],
  ["totalOverdue", "Total Overdue"],
  ["totalEmiAmount", "Total EMI Amount"],
  ["totalEmiCount", "Total EMI Count"],
  ["distanceFromBranch", "Distance From Branch"],
];

export default function CreditNoteSummary({ applicationId }) {
  const [note, setNote] = useState(undefined); // undefined=loading, null=none

  useEffect(() => {
    if (!applicationId) return;
    let active = true;
    (async () => {
      try {
        const { data } = await API.get(`/credit-notes/${applicationId}`);
        if (active) setNote(data?.creditNote || null);
      } catch {
        if (active) setNote(null);
      }
    })();
    return () => { active = false; };
  }, [applicationId]);

  if (note === undefined) return <div style={{ color: "#94A3B8" }}>Loading…</div>;
  if (note === null) return <div style={{ color: "#94A3B8" }}>No credit note completed yet.</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {ROWS.map(([key, label]) => (
        <div key={key}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>{label}</div>
          <div style={{ fontSize: 14, color: "#0f172a" }}>
            {note[key] === null || note[key] === undefined || note[key] === "" ? "—" : String(note[key])}
          </div>
        </div>
      ))}
    </div>
  );
}
