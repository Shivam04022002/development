// src/pages/CibilSettings.jsx
//
// Super Admin → System Settings → CIBIL Configuration (Phase 3).
// Stores configuration only. Does NOT call the TransUnion API or validate
// credentials. Secret fields are write-only: the API never returns their values.
//
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import { useAuth } from "../context/AuthContext";

const BRAND = { blue: "#0B1F4D", orange: "#F59E0B", green: "#16A34A", red: "#EF4444" };

const emptyForm = {
  apiUrl: "",
  username: "",
  password: "",
  clientId: "",
  clientSecret: "",
  minimumScore: 650,
  autoRejectLowCibil: true,
  lowCibilRejectionReason: "Low CIBIL Score",
};

export default function CibilSettings() {
  const navigate = useNavigate();
  const { admin } = useAuth();

  const [form, setForm] = useState(emptyForm);
  const [passwordSet, setPasswordSet] = useState(false);
  const [clientSecretSet, setClientSecretSet] = useState(false);
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
          username: c.username || "",
          password: "",
          clientId: c.clientId || "",
          clientSecret: "",
          minimumScore: c.minimumScore ?? 650,
          autoRejectLowCibil:
            typeof c.autoRejectLowCibil === "boolean" ? c.autoRejectLowCibil : true,
          lowCibilRejectionReason: c.lowCibilRejectionReason || "Low CIBIL Score",
        });
        setPasswordSet(!!c.passwordSet);
        setClientSecretSet(!!c.clientSecretSet);
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

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    try {
      // Only send secrets when the user actually typed a new value.
      const payload = {
        apiUrl: form.apiUrl,
        username: form.username,
        clientId: form.clientId,
        minimumScore: Number(form.minimumScore),
        autoRejectLowCibil: !!form.autoRejectLowCibil,
        lowCibilRejectionReason: form.lowCibilRejectionReason,
      };
      if (form.password) payload.password = form.password;
      if (form.clientSecret) payload.clientSecret = form.clientSecret;

      const { data } = await API.put("/settings/cibil", payload);
      const c = data?.cibil || {};
      setPasswordSet(!!c.passwordSet);
      setClientSecretSet(!!c.clientSecretSet);
      // Clear secret inputs after a successful save.
      setForm((f) => ({ ...f, password: "", clientSecret: "" }));
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
    <div style={{ background: "#F8FAFC", minHeight: "100vh", padding: "24px 0" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ color: BRAND.blue, fontWeight: 800, margin: 0 }}>CIBIL Configuration</h2>
            <p style={{ color: "#6B7280", margin: "4px 0 0" }}>
              System-wide credit-bureau settings. Configuration only — no API is called.
            </p>
          </div>
          <button
            className="btn btn-outline-secondary"
            onClick={() => navigate("/superadmin-dashboard")}
          >
            ← Back
          </button>
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
                  placeholder="https://api.transunion.example/cibil"
                  value={form.apiUrl}
                  onChange={(e) => setField("apiUrl", e.target.value)}
                />
              </div>

              <div className="row">
                <div className="col-md-6" style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Username</label>
                  <input
                    type="text"
                    className="form-control"
                    autoComplete="off"
                    value={form.username}
                    onChange={(e) => setField("username", e.target.value)}
                  />
                </div>
                <div className="col-md-6" style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Password</label>
                  <input
                    type="password"
                    className="form-control"
                    autoComplete="new-password"
                    placeholder={passwordSet ? "•••••••• (saved — leave blank to keep)" : "Enter password"}
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                  />
                </div>
              </div>

              <div className="row">
                <div className="col-md-6" style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Client ID</label>
                  <input
                    type="text"
                    className="form-control"
                    autoComplete="off"
                    value={form.clientId}
                    onChange={(e) => setField("clientId", e.target.value)}
                  />
                </div>
                <div className="col-md-6" style={{ marginBottom: 4 }}>
                  <label style={labelStyle}>Client Secret</label>
                  <input
                    type="password"
                    className="form-control"
                    autoComplete="new-password"
                    placeholder={clientSecretSet ? "•••••••• (saved — leave blank to keep)" : "Enter client secret"}
                    value={form.clientSecret}
                    onChange={(e) => setField("clientSecret", e.target.value)}
                  />
                </div>
              </div>
              <p style={{ color: "#9CA3AF", fontSize: 13, margin: "10px 0 0" }}>
                Password and Client Secret are encrypted at rest and never displayed again.
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
                disabled={saving}
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
