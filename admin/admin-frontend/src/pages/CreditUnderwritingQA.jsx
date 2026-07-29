import React, { useEffect, useState, useCallback } from "react";
import api from "../services/api";
import CreditUnderwritingReport from "../components/underwriting/CreditUnderwritingReport";
import { creditNoteFilename } from "../utils/reportFilename";

/**
 * Development-only visual QA harness for the Credit Underwriting Decision
 * Report. Not linked from the admin navigation and not part of any production
 * flow. The production Credit Note PDF is untouched — "Open Existing PDF"
 * simply opens the already-stored file for side-by-side comparison.
 *
 * Route: /credit-underwriting-qa   (guarded by CIBIL_QA_ENABLED in App.jsx)
 */
const LISTS = [
  { key: "pending-cibil", label: "Pending CIBIL", url: "/workflow/pending-cibil?limit=50" },
  { key: "pending", label: "Pending", url: "/workflow/pending?limit=50" },
  { key: "approved", label: "Approved", url: "/workflow/approved?limit=50" },
  { key: "rejected", label: "Rejected", url: "/workflow/rejected?limit=50" },
];

const rowsFrom = (data) =>
  (data?.applications || data?.items || data?.data || (Array.isArray(data) ? data : []) || [])
    .map((a) => ({
      id: a._id,
      formId: a.formId || String(a._id),
      status: a.status || "-",
      stage: a.workflowStage || "-",
      score: a?.cibil?.score ?? null,
    }));

export default function CreditUnderwritingQA() {
  const [listKey, setListKey] = useState("pending-cibil");
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [model, setModel] = useState(null);
  const [existingPdfPath, setExistingPdfPath] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      setError("");
      const entry = LISTS.find((l) => l.key === listKey);
      try {
        const { data } = await api.get(entry.url);
        if (live) setRows(rowsFrom(data));
      } catch (err) {
        if (live) { setRows([]); setError(`Could not load the ${entry.label} list.`); }
      }
    })();
    return () => { live = false; };
  }, [listKey]);

  const load = useCallback(async (row) => {
    setLoading(true); setError(""); setModel(null); setExistingPdfPath(null);
    try {
      const { data } = await api.get(`/underwriting/${row.id}/model`);
      setModel(data.model);
      setExistingPdfPath(data.existingPdfPath || null);
      setSelected(row);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load the model");
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Print / Save as PDF. Browsers take the suggested filename from
   * document.title, so it is set to the Credit Note name for the duration of
   * the print and restored afterwards.
   */
  const printReport = () => {
    const suggested = creditNoteFilename({
      customerName: model?.customer?.name || model?.application?.customerName,
      applicationNo: model?.application?.applicationNo,
    }).replace(/\.pdf$/i, "");

    const previous = document.title;
    document.title = suggested;
    const restore = () => { document.title = previous; };
    window.addEventListener("afterprint", restore, { once: true });
    window.print();
    // Fallback for browsers that do not fire afterprint.
    setTimeout(restore, 1500);
  };

  /** Opens the EXISTING production credit-note PDF, for comparison only. */
  const openExistingPdf = () => {
    if (!existingPdfPath) return;
    api.get(`/files/${existingPdfPath}`, { responseType: "blob" })
      .then((r) => window.open(URL.createObjectURL(new Blob([r.data], { type: "application/pdf" })), "_blank"))
      .catch((e) => setError(`Could not open the stored PDF: ${e.message}`));
  };

  const btn = { padding: "6px 12px", border: "1px solid #cbd5e1", background: "#fff",
    borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, marginRight: 6 };

  return (
    <div style={{ padding: 16, background: "#eef2f7", minHeight: "100vh" }}>
      <div className="cr-toolbar cr-no-print"
        style={{ background: "#fff", border: "1px solid #d7dee8", borderRadius: 8, padding: 12, marginBottom: 14 }}>
        <h1 style={{ fontSize: 16, margin: "0 0 10px", color: "#0b1f4d" }}>
          Credit Underwriting Report — Visual QA{" "}
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>(development only)</span>
        </h1>

        <div style={{ marginBottom: 8 }}>
          <strong style={{ fontSize: 12 }}>Application set:</strong>{" "}
          {LISTS.map((l) => (
            <button key={l.key}
              style={{ ...btn, background: listKey === l.key ? "#dbeafe" : "#fff" }}
              onClick={() => setListKey(l.key)}>{l.label}</button>
          ))}
        </div>

        <div style={{ marginBottom: 8, maxHeight: 96, overflowY: "auto" }}>
          <strong style={{ fontSize: 12 }}>Applications ({rows.length}):</strong>{" "}
          {rows.length === 0 && <span style={{ fontSize: 12, color: "#64748b" }}>none in this list</span>}
          {rows.map((r) => (
            <button key={r.id} style={{ ...btn, marginBottom: 4 }} onClick={() => load(r)}
              title={`status=${r.status} stage=${r.stage} score=${r.score ?? "none"}`}>
              {r.formId}{r.score !== null ? ` · ${r.score}` : " · no score"}
            </button>
          ))}
        </div>

        <div>
          <strong style={{ fontSize: 12 }}>Controls:</strong>{" "}
          <button style={btn} onClick={printReport}>Print</button>
          <button style={btn} onClick={printReport}
            title="Uses the browser's Save as PDF destination; the filename is suggested automatically">
            Download PDF
          </button>
          <button style={btn} disabled={!existingPdfPath} onClick={openExistingPdf}
            title={existingPdfPath ? "Opens the existing production credit-note PDF" : "No stored PDF for this application"}>
            Open Existing PDF
          </button>
          <button style={btn} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>Zoom −</button>
          <span style={{ fontSize: 12, marginRight: 6 }}>{Math.round(zoom * 100)}%</span>
          <button style={btn} onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>Zoom +</button>
          <button style={btn} onClick={() => setZoom(1)}>Reset</button>
        </div>

        {selected && model && (
          <p style={{ fontSize: 12, color: "#64748b", margin: "8px 0 0" }}>
            Showing <strong>{selected.formId}</strong> — decision{" "}
            <strong>{model.decision.value || "Not Available"}</strong>, bureau data{" "}
            <strong>{model.creditSummary.hasBureauData ? "yes" : "no"}</strong>, credit note{" "}
            <strong>{model.creditNote.recorded ? "recorded" : "not recorded"}</strong>
          </p>
        )}
        {loading && <p style={{ fontSize: 12, margin: "6px 0 0" }}>Loading…</p>}
        {error && <p style={{ color: "#b91c1c", fontSize: 12, margin: "6px 0 0" }}>{error}</p>}
      </div>

      <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
        {model
          ? <CreditUnderwritingReport model={model} />
          : <p style={{ textAlign: "center", color: "#64748b" }}>Select an application above.</p>}
      </div>
    </div>
  );
}
