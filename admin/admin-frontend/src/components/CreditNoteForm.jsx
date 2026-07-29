import React, { useEffect, useState } from "react";
import API from "../services/api";
import { creditNoteFilename } from "../utils/reportFilename";

/**
 * CreditNoteForm — the Credit Note step, extracted verbatim from
 * PendingCibilView so both that page and the Applicant Details page share one
 * implementation. No business logic is duplicated or changed here.
 *
 * The single existing endpoint POST /credit-notes/:applicationId performs the
 * whole step server-side: it saves the note, generates the PDF (returned as the
 * response body) and advances the workflow stage. This component only posts,
 * downloads the returned PDF, and reports completion to its host.
 *
 * Props:
 *   applicationId   — id used for both the GET and POST endpoints
 *   formId          — used only for the downloaded file name
 *   applicantName / applicantAddress / cibilScore — read-only prefill
 *   onCompleted     — called after a successful save + download
 */
const emptyCn = {
  dpdDays: "", enquiryCount: "", suitFiled: "No", writeOff: "No",
  totalOverdue: "", totalEmiAmount: "", totalEmiCount: "", distanceFromBranch: "",
};

const LABEL = { fontSize: 12, fontWeight: 700, color: "#64748B" };
const GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };

export default function CreditNoteForm({
  applicationId,
  formId,
  applicantName = "",
  applicantAddress = "",
  cibilScore = null,
  onCompleted,
}) {
  const [cn, setCn] = useState(emptyCn);
  const [cnSaving, setCnSaving] = useState(false);
  const [cnMsg, setCnMsg] = useState(null);

  // Load any previously saved Credit Note for this application.
  useEffect(() => {
    if (!applicationId) return undefined;
    let active = true;
    (async () => {
      try {
        const { data } = await API.get(`/credit-notes/${applicationId}`);
        const saved = data?.creditNote;
        if (active && saved) {
          setCn({
            dpdDays: saved.dpdDays ?? "",
            enquiryCount: saved.enquiryCount ?? "",
            suitFiled: saved.suitFiled || "No",
            writeOff: saved.writeOff || "No",
            totalOverdue: saved.totalOverdue ?? "",
            totalEmiAmount: saved.totalEmiAmount ?? "",
            totalEmiCount: saved.totalEmiCount ?? "",
            distanceFromBranch: saved.distanceFromBranch ?? "",
          });
        }
      } catch { /* no saved note yet */ }
    })();
    return () => { active = false; };
  }, [applicationId]);

  const setCnField = (name, value) => setCn((f) => ({ ...f, [name]: value }));

  const handleUpdateDownload = async () => {
    setCnSaving(true);
    setCnMsg(null);
    try {
      const res = await API.post(`/credit-notes/${applicationId}`, cn, { responseType: "blob" });
      // Download the returned PDF.
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = creditNoteFilename({ customerName: applicantName, applicationNo: formId || applicationId });
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setCnMsg({ type: "success", message: "Credit Note saved. Workflow updated." });
      if (onCompleted) await onCompleted();
    } catch (err) {
      let message = "Failed to complete Credit Note.";
      try {
        const txt = await err?.response?.data?.text?.();
        if (txt) message = JSON.parse(txt).error || message;
      } catch { /* keep default */ }
      setCnMsg({ type: "error", message });
    } finally {
      setCnSaving(false);
    }
  };

  const hasScore = typeof cibilScore === "number" && !Number.isNaN(cibilScore);

  return (
    <>
      {cnMsg && (
        <div
          style={{
            marginBottom: 14, padding: "10px 14px", borderRadius: 8, color: "#fff",
            background: cnMsg.type === "success" ? "#16A34A" : "#EF4444",
          }}
        >
          {cnMsg.message}
        </div>
      )}

      <div style={GRID}>
        {/* Auto-populated (read-only) */}
        <div>
          <label style={LABEL}>Customer Name</label>
          <input className="form-control" value={applicantName || ""} readOnly />
        </div>
        <div>
          <label style={LABEL}>CIBIL Score</label>
          <input className="form-control" value={hasScore ? cibilScore : ""} readOnly />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LABEL}>House Address</label>
          <input className="form-control" value={applicantAddress || ""} readOnly />
        </div>

        {/* Editable */}
        <div>
          <label style={LABEL}>DPD Days (Last 6 Months)</label>
          <input type="number" className="form-control" value={cn.dpdDays} onChange={(e) => setCnField("dpdDays", e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Enquiry (Last 3 Months)</label>
          <input type="number" className="form-control" value={cn.enquiryCount} onChange={(e) => setCnField("enquiryCount", e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Suit Filled</label>
          <select className="form-select" value={cn.suitFiled} onChange={(e) => setCnField("suitFiled", e.target.value)}>
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </div>
        <div>
          <label style={LABEL}>Write-Off</label>
          <select className="form-select" value={cn.writeOff} onChange={(e) => setCnField("writeOff", e.target.value)}>
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </div>
        <div>
          <label style={LABEL}>Total Overdue (₹)</label>
          <input type="number" className="form-control" value={cn.totalOverdue} onChange={(e) => setCnField("totalOverdue", e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Total EMI Amount (₹)</label>
          <input type="number" className="form-control" value={cn.totalEmiAmount} onChange={(e) => setCnField("totalEmiAmount", e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Total Number of EMI</label>
          <input type="number" className="form-control" value={cn.totalEmiCount} onChange={(e) => setCnField("totalEmiCount", e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Distance From Branch (KM)</label>
          <input type="number" className="form-control" value={cn.distanceFromBranch} onChange={(e) => setCnField("distanceFromBranch", e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button
          className="btn"
          disabled={cnSaving}
          onClick={handleUpdateDownload}
          style={{ background: "#F59E0B", color: "#fff", fontWeight: 700, minWidth: 190 }}
        >
          {cnSaving ? "Processing…" : "Update & Download"}
        </button>
      </div>
    </>
  );
}
