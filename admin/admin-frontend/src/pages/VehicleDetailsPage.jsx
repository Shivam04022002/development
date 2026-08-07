// src/pages/VehicleDetailsPage.jsx
//
// Phase 6 — Vehicle Details (view & edit).
//
// Reads GET /api/admin/vehicle/:applicationId and writes PUT to the same path.
// Only the four editable fields are ever sent, and only when they have actually
// changed; customer information is never part of a request body.
//
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import { useAuth } from "../context/AuthContext";
import TableSkeleton from "../components/TableSkeleton";
import StatusBadge from "../components/StatusBadge";
import FilePreview from "../components/FilePreview";
import Toast from "../components/Toast";

const BRAND = { blue: "#0B1F4D", red: "#EF4444" };
const RC_STATUSES = ["Pending", "Uploaded"];

const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtAmount = (v) =>
  typeof v === "number" && Number.isFinite(v) ? `₹ ${v.toLocaleString("en-IN")}` : "—";

/** Canonical plate-number form — trimmed, inner whitespace collapsed, upper-cased. */
const normalisePlate = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/* ─── Presentational bits, matching the portal's card language ───────────── */
const Card = ({ title, right, children }) => (
  <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, marginBottom: 22, overflow: "hidden", boxShadow: "0 2px 12px rgba(11,31,77,0.06)" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 22px", background: "#FAFBFC", borderBottom: "1px solid #F1F5F9" }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "#374151", textTransform: "uppercase", letterSpacing: "0.6px" }}>
        {title}
      </span>
      {right}
    </div>
    <div style={{ padding: 22 }}>{children}</div>
  </div>
);

const ReadOnlyField = ({ label, value }) => (
  <div style={{ minWidth: 180, flex: "1 1 180px" }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
      {label}
    </div>
    <div style={{ fontSize: 14.5, color: "#0f172a", fontWeight: 600 }}>{value || "—"}</div>
  </div>
);

const EmptySlot = ({ text }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 190, borderRadius: 8, border: "1px dashed #E5E7EB", background: "#F9FAFB", color: "#9CA3AF", fontSize: 13, fontWeight: 600 }}>
    {text}
  </div>
);

/** One image slot — preview when present, placeholder when not. */
const ImageSlot = ({ label, file, emptyText }) => (
  <div style={{ flex: "1 1 260px", minWidth: 240 }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8 }}>{label}</div>
    {file?.path ? (
      <FilePreview
        src={file.path}
        alt={label}
        style={{ width: "100%", height: 190, objectFit: "cover", borderRadius: 8, border: "1px solid #E5E7EB" }}
      />
    ) : (
      <EmptySlot text={emptyText} />
    )}
  </div>
);

export default function VehicleDetailsPage() {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ rcStatus: "Pending", numberPlate: "", spdcNumber: "", spdcImage: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const showToast = useCallback((type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  }, []);

  /** The editable values exactly as the server currently holds them. */
  const baselineOf = (d) => ({
    rcStatus: d?.rc?.status || "Pending",
    numberPlate: d?.numberPlate?.plateNumber || "",
    spdcNumber: d?.spdc?.number || "",
    spdcImage: d?.spdc?.image?.path || "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: d } = await API.get(`/admin/vehicle/${applicationId}`);
      setData(d);
      setForm(baselineOf(d));
      setFieldErrors({});
    } catch (err) {
      console.error("Failed to load vehicle details:", err?.response?.data || err.message);
      setError(err?.response?.data?.error || "Failed to load vehicle details.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => { load(); }, [load]);

  const baseline = useMemo(() => baselineOf(data), [data]);

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const cancelEdit = () => {
    // Restore the loaded values. No API call — a staged upload is simply not
    // committed, so nothing on the record changes.
    setForm(baseline);
    setFieldErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
    setEditing(false);
  };

  /**
   * Send the chosen file to the staging endpoint and hold the returned
   * reference on the form. It is committed by Save, like every other field.
   */
  const handleSpdcFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setFieldErrors((prev) => { const n = { ...prev }; delete n.spdcImage; return n; });

    try {
      const body = new FormData();
      body.append("spdcImage", file);
      const { data: res } = await API.post(`/admin/vehicle/${applicationId}/spdc-image`, body);
      setField("spdcImage", res?.spdcImage?.path || "");
      showToast("success", "Image uploaded. Press Save Changes to apply it.");
    } catch (err) {
      const msg = err?.response?.data?.details || err?.response?.data?.error || "Upload failed.";
      console.error("SPDC image upload failed:", err?.response?.data || err.message);
      setFieldErrors((prev) => ({ ...prev, spdcImage: msg }));
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  };

  /** RC may only be marked Uploaded when both images are on file. */
  const bothRcImagesPresent = Boolean(data?.rc?.frontImage?.path && data?.rc?.backImage?.path);

  /** The SPDC image to show: a freshly staged upload wins over the saved one. */
  const spdcPreview = useMemo(() => {
    const staged = String(form.spdcImage || "").trim();
    if (staged && staged !== baseline.spdcImage) return { path: staged, pending: true };
    return data?.spdc?.image ? { ...data.spdc.image, pending: false } : null;
  }, [form.spdcImage, baseline.spdcImage, data]);

  /** Only the editable fields, and only the ones that actually changed. */
  const buildPayload = () => {
    const payload = {};
    const plate = normalisePlate(form.numberPlate);
    const spdcNo = String(form.spdcNumber ?? "").trim();
    const spdcImg = String(form.spdcImage ?? "").trim();

    if (form.rcStatus !== baseline.rcStatus) payload.rcStatus = form.rcStatus;
    if (plate !== normalisePlate(baseline.numberPlate)) payload.numberPlate = plate;
    if (spdcNo !== String(baseline.spdcNumber).trim()) payload.spdcNumber = spdcNo;
    if (spdcImg !== String(baseline.spdcImage).trim()) payload.spdcImage = spdcImg;
    return payload;
  };

  const handleSave = async () => {
    if (saving) return;

    const payload = buildPayload();

    // The backend rejects a blank plate number, so surface that here rather
    // than letting the request fail.
    if (payload.numberPlate !== undefined && !payload.numberPlate) {
      setFieldErrors({ numberPlate: "Number plate cannot be blank." });
      return;
    }
    // Same for an emptied SPDC image reference: the endpoint only accepts a
    // path under the uploads root, never an empty string.
    if (payload.spdcImage !== undefined && !payload.spdcImage) {
      setFieldErrors({ spdcImage: "Provide a stored file path, or press Cancel to leave it unchanged." });
      return;
    }

    // Mirrors the server rule, so an out-of-date page cannot submit it.
    if (payload.rcStatus === "Uploaded" && !bothRcImagesPresent) {
      setFieldErrors({ rcStatus: "RC status cannot be Uploaded until both RC images exist." });
      return;
    }

    if (Object.keys(payload).length === 0) {
      setEditing(false);
      showToast("warning", "No changes to save.");
      return;
    }

    setSaving(true);
    try {
      await API.put(`/admin/vehicle/${applicationId}`, payload);
      showToast("success", "Vehicle details updated.");
      setEditing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Re-read from the server rather than patching local state.
      await load();
    } catch (err) {
      const msg = err?.response?.data?.error || "Failed to save vehicle details.";
      console.error("Failed to save vehicle details:", err?.response?.data || err.message);
      showToast("error", msg);
      // Stay in Edit Mode with the entered values intact.
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = (invalid) => ({
    borderColor: invalid ? BRAND.red : undefined,
    background: editing ? "#fff" : "#F8FAFC",
    maxWidth: 320,
  });

  /* ─── Render ───────────────────────────────────────────────────────────── */
  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", padding: "22px 0" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 18px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ color: BRAND.blue, fontWeight: 800, margin: 0 }}>Vehicle Details</h2>
            <p style={{ color: "#6B7280", margin: "4px 0 0" }}>
              Review and manage RC, Number Plate and SPDC information
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline-secondary" onClick={() => navigate("/superadmin/rc-number-plate")}>
              ← Back to list
            </button>

            {!loading && !error && data && !editing && (
              <button
                className="btn btn-sm"
                style={{ background: BRAND.blue, color: "#fff", fontWeight: 700, padding: "6px 18px" }}
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            )}

            {editing && (
              <>
                <button className="btn btn-outline-secondary" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: BRAND.blue, color: "#fff", fontWeight: 700, padding: "6px 18px", opacity: saving ? 0.7 : 1 }}
                  onClick={handleSave}
                  disabled={saving || uploading}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </>
            )}

            <button className="btn btn-outline-danger" onClick={() => { logout(); navigate("/"); }}>
              Logout
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
            <TableSkeleton rows={8} cols={4} />
          </div>
        ) : error ? (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, textAlign: "center", padding: "50px 20px" }}>
            <div style={{ color: BRAND.red, fontWeight: 700, marginBottom: 12 }}>{error}</div>
            <button className="btn btn-outline-secondary btn-sm" onClick={load}>Retry</button>
          </div>
        ) : !data ? null : (
          <>
            {/* Customer information — always read-only */}
            <Card title="Customer Information">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
                <ReadOnlyField label="Loan No." value={data.loanNumber} />
                <ReadOnlyField label="Branch" value={data.branch} />
                <ReadOnlyField label="Customer Name" value={data.customerName} />
                <ReadOnlyField label="Contact" value={data.contact} />
                <ReadOnlyField label="Amount" value={fmtAmount(data.amount)} />
                <ReadOnlyField label="Dealer Name" value={data.dealerName} />
                <ReadOnlyField label="Disb. Date" value={fmtDate(data.disbursementDate)} />
              </div>
            </Card>

            {/* RC */}
            <Card
              title="RC"
              right={
                editing ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {!bothRcImagesPresent && (
                      <span style={{ fontSize: 11.5, color: "#94A3B8" }} title="Both RC images must exist first">
                        Uploaded needs both images
                      </span>
                    )}
                    <select
                      className="form-select form-select-sm"
                      style={{ width: "auto" }}
                      value={form.rcStatus}
                      onChange={(e) => setField("rcStatus", e.target.value)}
                    >
                      {RC_STATUSES.map((s) => (
                        // The server rejects Uploaded without both images; mirror
                        // that here so the option is not offered in the first place.
                        <option key={s} value={s} disabled={s === "Uploaded" && !bothRcImagesPresent}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <StatusBadge status={data.rc?.status} />
                )
              }
            >
              {fieldErrors.rcStatus && (
                <div style={{ color: BRAND.red, fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
                  {fieldErrors.rcStatus}
                </div>
              )}
              {data.rc?.frontImage?.path || data.rc?.backImage?.path ? (
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <ImageSlot label="RC Front" file={data.rc.frontImage} emptyText="No RC Front" />
                  <ImageSlot label="RC Back" file={data.rc.backImage} emptyText="No RC Back" />
                </div>
              ) : (
                <EmptySlot text="No RC Uploaded" />
              )}
            </Card>

            {/* Number Plate */}
            <Card title="Number Plate" right={<StatusBadge status={data.numberPlate?.status} />}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 300px" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>
                    Number Plate
                  </label>
                  <input
                    className="form-control"
                    style={inputStyle(!!fieldErrors.numberPlate)}
                    value={form.numberPlate}
                    readOnly={!editing}
                    disabled={!editing}
                    placeholder={editing ? "Example: UP32AB1234" : "—"}
                    onChange={(e) => setField("numberPlate", e.target.value.toUpperCase())}
                  />
                  {fieldErrors.numberPlate && (
                    <div style={{ color: BRAND.red, fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>
                      {fieldErrors.numberPlate}
                    </div>
                  )}
                </div>

                <ImageSlot
                  label="Number Plate Image"
                  file={data.numberPlate?.image}
                  emptyText="No Number Plate Uploaded"
                />
              </div>
            </Card>

            {/* SPDC */}
            <Card title="SPDC">
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 300px" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>
                    SPDC Number
                  </label>
                  <input
                    className="form-control"
                    style={inputStyle(false)}
                    value={form.spdcNumber}
                    readOnly={!editing}
                    disabled={!editing}
                    placeholder={editing ? "Enter SPDC number" : "—"}
                    onChange={(e) => setField("spdcNumber", e.target.value)}
                  />

                  {editing && (
                    <div style={{ marginTop: 14 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>
                        SPDC Image
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="form-control"
                        style={{ maxWidth: 320 }}
                        disabled={uploading || saving}
                        onChange={handleSpdcFile}
                      />
                      <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 4, maxWidth: 320 }}>
                        {uploading
                          ? "Uploading…"
                          : data.spdc?.image?.path
                            ? "Choosing a new image replaces the current one immediately."
                            : "JPG, PNG or WebP, up to 15MB."}
                      </div>
                      {fieldErrors.spdcImage && (
                        <div style={{ color: BRAND.red, fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>
                          {fieldErrors.spdcImage}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <ImageSlot
                  label={spdcPreview?.pending ? "SPDC Image (not saved yet)" : "SPDC Image"}
                  file={spdcPreview}
                  emptyText="No SPDC Image"
                />
              </div>
            </Card>
          </>
        )}
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
