// src/pages/PendingCibilView.jsx
//
// Phase 5A — read-only Application Details for a Pending CIBIL application.
// Displays ONLY: Applicant, CoApplicant, Vehicle, Documents, and the CIBIL
// summary (Meter, Score, Status, Report Date, Request ID).
//
// It deliberately does NOT show: raw JSON, vendor report, download report,
// report URL — and offers NO approve / workflow controls (Credit Team is
// view-only; the Application document no longer carries the report URL/raw).
//
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";

const BRAND = { blue: "#0B1F4D", orange: "#F59E0B", green: "#16A34A", red: "#EF4444" };

const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

function Field({ label, value }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>{label}</div>
      <div style={{ fontSize: 14, color: "#0f172a" }}>{value || value === 0 ? String(value) : "—"}</div>
    </div>
  );
}

function DocImg({ label, src }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 6 }}>{label}</div>
      {src && typeof src === "string" && src.startsWith("http") ? (
        <a href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={label} style={{ width: 150, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid #E5E7EB" }} />
        </a>
      ) : (
        <span style={{ color: "#94A3B8", fontSize: 13 }}>No Image</span>
      )}
    </div>
  );
}

const card = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 18 };
const heading = { color: BRAND.blue, fontWeight: 700, fontSize: 18, marginBottom: 14 };
const twoCol = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };

export default function PendingCibilView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Credit Note (staff-entered fields; Customer Name / Address / CIBIL prefill
  // read-only from the Application).
  const emptyCn = {
    dpdDays: "", enquiryCount: "", suitFiled: "No", writeOff: "No",
    totalOverdue: "", totalEmiAmount: "", totalEmiCount: "", distanceFromBranch: "",
  };
  const [cn, setCn] = useState(emptyCn);
  const [cnSaving, setCnSaving] = useState(false);
  const [cnMsg, setCnMsg] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await API.get(`/workflow/${id}`);
        if (active) setApp(data);
      } catch (err) {
        console.error("Failed to load application:", err);
        if (active) setError(err?.response?.data?.error || "Failed to load application.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  // Load any previously saved Credit Note for this application.
  useEffect(() => {
    if (!app) return;
    let active = true;
    (async () => {
      try {
        const { data } = await API.get(`/credit-notes/${id}`);
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
  }, [app, id]);

  const setCnField = (name, value) => setCn((f) => ({ ...f, [name]: value }));

  const handleUpdateDownload = async () => {
    setCnSaving(true);
    setCnMsg(null);
    try {
      const res = await API.post(`/credit-notes/${id}`, cn, { responseType: "blob" });
      // Download the returned PDF.
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `credit-note-${app.formId || id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setCnMsg({ type: "success", message: "Credit Note saved. Application moved to Contact Creation." });
      setTimeout(() => navigate("/pending-cibil"), 1400);
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

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (error) return <div style={{ padding: 40, color: BRAND.red }}>{error}</div>;
  if (!app) return null;

  const applicant = app.applicant?.applicant || app.applicant || {};
  const co = app.coApplicant || {};
  const vehicle = app.vehicleDetails || {};
  const docs = app.documents || {};
  const c = app.cibil || {};

  const hasScore = typeof c.score === "number" && !Number.isNaN(c.score);
  const clamped = hasScore ? Math.max(300, Math.min(900, c.score)) : 0;
  const pct = hasScore ? ((clamped - 300) / 600) * 100 : 0;
  const meterColor = !hasScore ? "#CBD5E1" : c.score >= 750 ? BRAND.green : c.score >= 650 ? BRAND.orange : BRAND.red;

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", padding: "22px 0" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 18px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <h2 style={{ color: BRAND.blue, fontWeight: 800, margin: 0 }}>{applicant.name || "Applicant"}</h2>
            <div style={{ color: "#6B7280", fontFamily: "monospace" }}>{app.formId || app._id}</div>
          </div>
          <button className="btn btn-outline-secondary" onClick={() => navigate("/pending-cibil")}>← Back to Pending CIBIL</button>
        </div>

        {/* CIBIL summary (meter + score + status + report date + request id) */}
        <div style={card}>
          <div style={heading}>CIBIL</div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 800, color: meterColor, fontSize: 26 }}>{hasScore ? c.score : "—"}</span>
              <span style={{ color: "#6B7280", fontSize: 12 }}>300–900</span>
            </div>
            <div style={{ height: 12, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: meterColor, borderRadius: 999, transition: "width .3s" }} />
            </div>
          </div>
          <div style={twoCol}>
            <Field label="CIBIL Score" value={hasScore ? c.score : "—"} />
            <Field label="Status" value={app.status || "—"} />
            <Field label="Report Date" value={fmtDate(c.reportDate)} />
            <Field label="Request ID" value={c.requestId || "—"} />
          </div>
        </div>

        {/* Credit Note — final step of Pending CIBIL (below the CIBIL meter) */}
        <div style={card}>
          <div style={heading}>Credit Note</div>

          {cnMsg && (
            <div style={{
              marginBottom: 14, padding: "10px 14px", borderRadius: 8, color: "#fff",
              background: cnMsg.type === "success" ? BRAND.green : BRAND.red,
            }}>
              {cnMsg.message}
            </div>
          )}

          <div style={twoCol}>
            {/* Auto-populated (read-only) */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>Customer Name</label>
              <input className="form-control" value={applicant.name || ""} readOnly />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>CIBIL Score</label>
              <input className="form-control" value={hasScore ? c.score : ""} readOnly />
            </div>
            <div style={{ gridColumn: "1 / span 2" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>House Address</label>
              <input className="form-control" value={applicant.address || ""} readOnly />
            </div>

            {/* Editable */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>DPD Days</label>
              <input type="number" className="form-control" value={cn.dpdDays} onChange={(e) => setCnField("dpdDays", e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>Enquiry Count</label>
              <input type="number" className="form-control" value={cn.enquiryCount} onChange={(e) => setCnField("enquiryCount", e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>Suit Filed</label>
              <select className="form-select" value={cn.suitFiled} onChange={(e) => setCnField("suitFiled", e.target.value)}>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>Write Off</label>
              <select className="form-select" value={cn.writeOff} onChange={(e) => setCnField("writeOff", e.target.value)}>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>Total Overdue</label>
              <input type="number" className="form-control" value={cn.totalOverdue} onChange={(e) => setCnField("totalOverdue", e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>Total EMI Amount</label>
              <input type="number" className="form-control" value={cn.totalEmiAmount} onChange={(e) => setCnField("totalEmiAmount", e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>Total EMI Count</label>
              <input type="number" className="form-control" value={cn.totalEmiCount} onChange={(e) => setCnField("totalEmiCount", e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>Distance From Branch</label>
              <input type="number" className="form-control" value={cn.distanceFromBranch} onChange={(e) => setCnField("distanceFromBranch", e.target.value)} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button
              className="btn"
              disabled={cnSaving}
              onClick={handleUpdateDownload}
              style={{ background: BRAND.orange, color: "#fff", fontWeight: 700, minWidth: 190 }}
            >
              {cnSaving ? "Processing…" : "Update & Download"}
            </button>
          </div>
        </div>

        {/* Applicant */}
        <div style={card}>
          <div style={heading}>Applicant</div>
          <div style={twoCol}>
            <Field label="Name" value={applicant.name} />
            <Field label="Mobile" value={applicant.mobileNumber || applicant.mobile} />
            <Field label="Email" value={applicant.email} />
            <Field label="Gender" value={applicant.gender} />
            <Field label="Father's Name" value={applicant.fatherName} />
            <Field label="Date of Birth" value={applicant.dateOfBirth ? fmtDate(applicant.dateOfBirth) : "—"} />
            <Field label="PAN" value={applicant.panNo} />
            <Field label="Aadhaar" value={applicant.aadharNo} />
            <Field label="Address" value={applicant.address} />
            <Field label="Pincode" value={applicant.pincode} />
          </div>
        </div>

        {/* CoApplicant */}
        <div style={card}>
          <div style={heading}>Co-Applicant</div>
          <div style={twoCol}>
            <Field label="Name" value={co.name} />
            <Field label="Mobile" value={co.mobile || co.mobileNumber} />
            <Field label="Email" value={co.email} />
            <Field label="Relation" value={co.relation} />
            <Field label="Father's Name" value={co.fatherName} />
            <Field label="PAN" value={co.panNo} />
            <Field label="Aadhaar" value={co.aadharNo} />
            <Field label="Address" value={co.address} />
          </div>
        </div>

        {/* Vehicle */}
        <div style={card}>
          <div style={heading}>Vehicle</div>
          <div style={twoCol}>
            <Field label="Brand" value={vehicle.brandName} />
            <Field label="Model" value={vehicle.modelName} />
            <Field label="Price of Vehicle" value={vehicle.priceOfVehicle} />
            <Field label="Finance Required" value={vehicle.financeRequired} />
            <Field label="Tenure" value={vehicle.tenure} />
          </div>
        </div>

        {/* Documents */}
        <div style={card}>
          <div style={heading}>Documents</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
            <DocImg label="Applicant Photo" src={docs.applicant?.photo || applicant.photo} />
            <DocImg label="Aadhaar Front" src={docs.applicant?.aadharFront || applicant.aadharFront} />
            <DocImg label="Aadhaar Back" src={docs.applicant?.aadharBack || applicant.aadharBack} />
            <DocImg label="PAN" src={docs.applicant?.panImage || applicant.panImage} />
            <DocImg label="Co-Applicant Photo" src={docs.coApplicant?.photo || co.photo} />
            <DocImg label="Co-Applicant Form 60" src={docs.coApplicant?.form60 || co.form60} />
            <DocImg label="Vehicle Photo" src={docs.vehicle?.vehiclePhoto || vehicle.vehiclePhoto || vehicle.vehicleImage} />
          </div>
        </div>
      </div>
    </div>
  );
}
