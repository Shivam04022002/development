// src/pages/CibilSettings.jsx
//
// Super Admin → System Settings → CIBIL Configuration (Phase 3).
// Stores configuration only. Does NOT call the TransUnion API or validate
// credentials. Secret fields are write-only: the API never returns their values.
//
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SuperAdminNav from "../components/SuperAdminNav";
import API from "../services/api";
import { useAuth } from "../context/AuthContext";

const BRAND = { blue: "#0B1F4D", orange: "#F59E0B", green: "#16A34A", red: "#EF4444" };

const emptyForm = {
  apiUrl: "",
  apiKey: "",
  minimumScore: 650,
  pendingRange: { min: -1, max: 200 },
  rejectRange: { min: 201, max: 649 },
  passRange: { min: 650, max: 900 },
  autoRejectLowCibil: true,
  lowCibilRejectionReason: "Low CIBIL Score",
};

export default function CibilSettings() {
  const navigate = useNavigate();
  const { admin } = useAuth();

  const [form, setForm] = useState(emptyForm);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { type, message }

  const isSuperAdmin =
    String(admin?.role || "").toLowerCase() === "superadmin" ||
    String(admin?.role || "").toLowerCase() === "sadmin";

  useEffect(() => {
    // Client-side guard; the API is the real gate (requireSuperAdmin).
    if (admin && !isSuperAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [admin, isSuperAdmin, navigate]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await API.get("/settings/cibil");
        if (!active) return;
        const c = data?.cibil || {};
        setForm({
          apiUrl: c.apiUrl || "",
          apiKey: "",
          minimumScore: c.minimumScore ?? 650,
          pendingRange: c.pendingRange ?? { min: -1, max: 200 },
          rejectRange: c.rejectRange ?? { min: 201, max: 649 },
          passRange: c.passRange ?? { min: 650, max: 900 },
          autoRejectLowCibil:
            typeof c.autoRejectLowCibil === "boolean" ? c.autoRejectLowCibil : true,
          lowCibilRejectionReason: c.lowCibilRejectionReason || "Low CIBIL Score",
        });
        setApiKeySet(!!c.apiKeySet);
      } catch (err) {
        console.error("Failed to load CIBIL settings:", err);
        setToast({ type: "error", message: "Failed to load CIBIL settings." });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const RANGES = [
    ["pendingRange", "Pending"],
    ["rejectRange", "Reject"],
    ["passRange", "Pass"],
  ];

  const setRange = (key, edge, value) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], [edge]: value } }));

  // Same rules the backend enforces, shown before saving.
  const rangeErrors = (() => {
    const errs = [];
    const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
    const vals = {};
    for (const [key, label] of RANGES) {
      const min = num(form[key]?.min);
      const max = num(form[key]?.max);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        errs.push(`${label} range: minimum and maximum must both be numbers.`);
        continue;
      }
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        errs.push(`${label} range: minimum and maximum must be whole numbers.`);
      }
      if (min > max) errs.push(`${label} range: minimum (${min}) must be <= maximum (${max}).`);
      vals[key] = { min, max };
    }
    if (errs.length) return errs;
    for (let i = 0; i < RANGES.length - 1; i++) {
      const [aKey, aLabel] = RANGES[i];
      const [bKey, bLabel] = RANGES[i + 1];
      const a = vals[aKey], b = vals[bKey];
      if (b.min <= a.max) {
        errs.push(`${bLabel} range overlaps ${aLabel} range: ${bLabel} starts at ${b.min} but ${aLabel} ends at ${a.max}.`);
      } else if (b.min !== a.max + 1) {
        errs.push(`Gap between ${aLabel} and ${bLabel}: ${bLabel} must start at ${a.max + 1} (got ${b.min}).`);
      }
    }
    return errs;
  })();

  const handleSave = async (e) => {
    if (rangeErrors.length > 0) { e.preventDefault(); return; }
    e.preventDefault();
    setSaving(true);
    setToast(null);
    try {
      // Only send the API key when the user actually typed a new value.
      const payload = {
        apiUrl: form.apiUrl,
        minimumScore: Number(form.minimumScore),
        autoRejectLowCibil: !!form.autoRejectLowCibil,
        lowCibilRejectionReason: form.lowCibilRejectionReason,
        pendingRange: { min: Number(form.pendingRange.min), max: Number(form.pendingRange.max) },
        rejectRange: { min: Number(form.rejectRange.min), max: Number(form.rejectRange.max) },
        passRange: { min: Number(form.passRange.min), max: Number(form.passRange.max) },
      };
      if (form.apiKey) payload.apiKey = form.apiKey;

      const { data } = await API.put("/settings/cibil", payload);
      const c = data?.cibil || {};
      setApiKeySet(!!c.apiKeySet);
      // Clear the secret input after a successful save.
      setForm((f) => ({ ...f, apiKey: "" }));
      setShowApiKey(false);
      setToast({ type: "success", message: "CIBIL settings saved." });
    } catch (err) {
      console.error("Failed to save CIBIL settings:", err);
      setToast({
        type: "error",
        message: err?.response?.data?.error || "Failed to save CIBIL settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  const labelStyle = { fontWeight: 600, color: BRAND.blue, marginBottom: 6, display: "block" };
  const cardStyle = {
    background: "#fff",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
  };

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", padding: 24, boxSizing: "border-box" }}>
      <SuperAdminNav active="cibilSettings" />
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* Header — the shared navigation replaces the standalone back button. */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ color: BRAND.blue, fontWeight: 800, margin: 0 }}>CIBIL Configuration</h2>
          <p style={{ color: "#6B7280", margin: "4px 0 0" }}>
            System-wide credit-bureau settings. Configuration only — no API is called.
          </p>
        </div>

        {toast && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              borderRadius: 8,
              color: "#fff",
              background: toast.type === "success" ? BRAND.green : BRAND.red,
            }}
          >
            {toast.message}
          </div>
        )}

        {loading ? (
          <div style={cardStyle}>Loading…</div>
        ) : (
          <form onSubmit={handleSave}>
            {/* Credentials */}
            <div style={cardStyle}>
              <h5 style={{ color: BRAND.blue, fontWeight: 700, marginBottom: 16 }}>API Credentials</h5>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>API URL</label>
                <input
                  type="url"
                  className="form-control"
                  placeholder="https://xaler.in/api/transunion-cibil/fulfill-offer-advanced/"
                  value={form.apiUrl}
                  onChange={(e) => setField("apiUrl", e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 4 }}>
                <label style={labelStyle}>API Key</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type={showApiKey ? "text" : "password"}
                    className="form-control"
                    autoComplete="new-password"
                    placeholder={apiKeySet ? "•••••••• (saved — leave blank to keep)" : "Enter API key"}
                    value={form.apiKey}
                    onChange={(e) => setField("apiKey", e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    style={{ whiteSpace: "nowrap", minWidth: 72 }}
                    onClick={() => setShowApiKey((v) => !v)}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <p style={{ color: "#9CA3AF", fontSize: 13, margin: "10px 0 0" }}>
                The API Key is encrypted at rest and never displayed again after saving.
              </p>
            </div>

            {/* Scoring rules */}
            <div style={cardStyle}>
              <h5 style={{ color: BRAND.blue, fontWeight: 700, marginBottom: 16 }}>Scoring Rules</h5>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Minimum CIBIL Score</label>
                <input
                  type="number"
                  className="form-control"
                  min={0}
                  max={900}
                  style={{ maxWidth: 200 }}
                  value={form.minimumScore}
                  onChange={(e) => setField("minimumScore", e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!form.autoRejectLowCibil}
                    onChange={(e) => setField("autoRejectLowCibil", e.target.checked)}
                    style={{ width: 18, height: 18 }}
                  />
                  Auto Reject Low CIBIL
                </label>
                <span style={{ color: "#9CA3AF", fontSize: 13 }}>
                  When enabled, applications below the minimum score are flagged for auto-rejection
                  (behavior implemented in a later phase).
                </span>
              </div>

              {/* ── Decision bands ── */}
              <div style={{ marginBottom: 16, paddingTop: 6, borderTop: "1px solid #E5E7EB" }}>
                <label style={{ ...labelStyle, marginTop: 12 }}>Decision Ranges</label>
                <span style={{ color: "#9CA3AF", fontSize: 13, display: "block", marginBottom: 10 }}>
                  Ranges must be continuous and must not overlap. A score is matched against
                  Pending, then Reject, then Pass.
                </span>

                {RANGES.map(([key, label]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ minWidth: 90, fontWeight: 600, color: BRAND.blue, fontSize: 14 }}>{label}</span>
                    <input
                      type="number"
                      className="form-control"
                      style={{ maxWidth: 120 }}
                      value={form[key]?.min ?? ""}
                      onChange={(e) => setRange(key, "min", e.target.value)}
                      aria-label={`${label} minimum score`}
                    />
                    <span style={{ color: "#9CA3AF" }}>to</span>
                    <input
                      type="number"
                      className="form-control"
                      style={{ maxWidth: 120 }}
                      value={form[key]?.max ?? ""}
                      onChange={(e) => setRange(key, "max", e.target.value)}
                      aria-label={`${label} maximum score`}
                    />
                  </div>
                ))}

                {rangeErrors.length > 0 && (
                  <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8,
                                background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13 }}>
                    {rangeErrors.map((msg, i) => (<div key={i}>• {msg}</div>))}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Low CIBIL Rejection Reason</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.lowCibilRejectionReason}
                  onChange={(e) => setField("lowCibilRejectionReason", e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                type="submit"
                className="btn"
                disabled={saving || rangeErrors.length > 0}
                style={{ background: BRAND.orange, color: "#fff", fontWeight: 700, minWidth: 140 }}
              >
                {saving ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
