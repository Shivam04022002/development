import React, { useEffect, useState, useCallback } from "react";
import api from "../services/api";
import CibilReport from "../components/cibil/CibilReport";
import { syntheticModel } from "../components/cibil/syntheticModels";

/**
 * Development-only visual QA harness for the CIBIL report renderer.
 *
 * Not linked from the admin navigation and not used by any production flow;
 * it exists so the renderer can be checked against real payloads and against
 * synthetic datasets before it replaces the current PDF implementation.
 *
 * Route: /cibil-report-qa   (see App.jsx — guarded by CIBIL_QA_ENABLED)
 */
const PRODUCTION_FORMS = ["FORM-094888", "FORM-339824", "FORM-474167", "FORM-662921"];

const SYNTHETIC = [
  { key: "synthetic-1", label: "Synthetic — 1 account", build: () => syntheticModel(1, 1, "SYN1") },
  { key: "synthetic-15", label: "Synthetic — 15 accounts", build: () => syntheticModel(15, 10, "SYN15") },
  { key: "synthetic-200", label: "Synthetic — 200 accounts", build: () => syntheticModel(200, 60, "SYN200") },
];

export default function CibilReportQA() {
  const [apps, setApps] = useState([]);
  const [selected, setSelected] = useState(null);
  const [model, setModel] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Resolve the QA form ids to application ids via the pending/CIBIL lists.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/workflow/pending-cibil?limit=100");
        const rows = (data?.applications || data?.items || []).map((a) => ({
          id: a._id, formId: a.formId,
        }));
        setApps(rows);
      } catch {
        setApps([]);
      }
    })();
  }, []);

  const loadProduction = useCallback(async (applicationId, formId) => {
    setLoading(true); setError(""); setModel(null); setStatusMessage(null);
    try {
      const { data } = await api.get(`/cibil/${applicationId}/model`);
      setModel(data.model);
      setStatusMessage(data.statusMessage || null);
      setSelected({ kind: "production", applicationId, formId });
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load model");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSynthetic = (entry) => {
    setError(""); setStatusMessage(null);
    setModel(entry.build());
    setSelected({ kind: "synthetic", label: entry.label });
  };

  const openPdfTab = () => {
    if (selected?.kind !== "production") return;
    api.get(`/cibil/${selected.applicationId}/pdf`, { responseType: "blob" })
      .then((r) => window.open(URL.createObjectURL(new Blob([r.data], { type: "application/pdf" })), "_blank"))
      .catch((e) => setError(e.message));
  };

  const downloadPdf = () => {
    if (selected?.kind !== "production") return;
    api.get(`/cibil/${selected.applicationId}/pdf/download`, { responseType: "blob" })
      .then((r) => {
        const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = url; a.download = `${selected.formId}-CIBIL-Report.pdf`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      })
      .catch((e) => setError(e.message));
  };

  const btn = { padding: "6px 12px", border: "1px solid #cbd5e1", background: "#fff",
    borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };

  return (
    <div style={{ padding: 16, background: "#eef2f7", minHeight: "100vh" }}>
      <div className="cr-toolbar cr-no-print"
        style={{ background: "#fff", border: "1px solid #d7dee8", borderRadius: 8, padding: 12, marginBottom: 14 }}>
        <h1 style={{ fontSize: 16, margin: "0 0 10px", color: "#0b1f4d" }}>
          CIBIL Report — Visual QA <span style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>(development only)</span>
        </h1>

        <div style={{ marginBottom: 8 }}>
          <strong style={{ fontSize: 12 }}>Production payloads:</strong>{" "}
          {PRODUCTION_FORMS.map((f) => {
            const match = apps.find((a) => a.formId === f);
            return (
              <button key={f} style={{ ...btn, marginRight: 6, opacity: match ? 1 : 0.45 }}
                disabled={!match}
                title={match ? "" : "Application not found in the Pending CIBIL list"}
                onClick={() => match && loadProduction(match.id, f)}>{f}</button>
            );
          })}
        </div>

        <div style={{ marginBottom: 8 }}>
          <strong style={{ fontSize: 12 }}>Synthetic (pagination):</strong>{" "}
          {SYNTHETIC.map((s) => (
            <button key={s.key} style={{ ...btn, marginRight: 6 }} onClick={() => loadSynthetic(s)}>{s.label}</button>
          ))}
        </div>

        <div>
          <strong style={{ fontSize: 12 }}>Controls:</strong>{" "}
          <button style={{ ...btn, marginRight: 6 }} onClick={() => window.print()}>Print</button>
          <button style={{ ...btn, marginRight: 6 }} disabled={selected?.kind !== "production"} onClick={downloadPdf}>Download PDF</button>
          <button style={{ ...btn, marginRight: 6 }} disabled={selected?.kind !== "production"} onClick={openPdfTab}>Open in new tab</button>
          <button style={{ ...btn, marginRight: 4 }} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>Zoom −</button>
          <span style={{ fontSize: 12, margin: "0 6px" }}>{Math.round(zoom * 100)}%</span>
          <button style={{ ...btn, marginRight: 6 }} onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>Zoom +</button>
          <button style={btn} onClick={() => setZoom(1)}>Reset</button>
        </div>

        {selected && (
          <p style={{ fontSize: 12, color: "#64748b", margin: "8px 0 0" }}>
            Showing: <strong>{selected.formId || selected.label}</strong>
            {model && ` — ${model.accounts.length} accounts, ${model.enquiries.length} enquiries`}
          </p>
        )}
        {error && <p style={{ color: "#b91c1c", fontSize: 12, margin: "6px 0 0" }}>{error}</p>}
        {loading && <p style={{ fontSize: 12, margin: "6px 0 0" }}>Loading…</p>}
      </div>

      <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
        {model
          ? <CibilReport model={model} statusMessage={statusMessage} />
          : <p style={{ textAlign: "center", color: "#64748b" }}>Select a payload above.</p>}
      </div>
    </div>
  );
}
