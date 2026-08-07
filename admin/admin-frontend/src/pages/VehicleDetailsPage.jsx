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
import SuperAdminNav from "../components/SuperAdminNav";
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

/** Card — one radius, one padding, one shadow, used by every section. */
const Card = ({ title, subtitle, right, children }) => (
  <section style={S.card}>
    <header style={S.cardHead}>
      <div>
        <h3 style={S.cardTitle}>{title}</h3>
        {subtitle ? <p style={S.cardSubtitle}>{subtitle}</p> : null}
      </div>
      {right}
    </header>
    <div style={S.cardBody}>{children}</div>
  </section>
);

/** One customer field: icon, label, value. Tiles flow in a responsive grid. */
const InfoTile = ({ icon, label, value }) => (
  <div style={S.tile}>
    <span style={S.tileIcon} aria-hidden="true">{icon}</span>
    <div style={{ minWidth: 0 }}>
      <div style={S.tileLabel}>{label}</div>
      <div style={S.tileValue} title={typeof value === "string" ? value : undefined}>
        {value || "—"}
      </div>
    </div>
  </div>
);

/** Centred empty state — an icon, what is missing, and what to do about it. */
const EmptyState = ({ icon, title, hint }) => (
  <div style={S.empty}>
    <div style={S.emptyIcon} aria-hidden="true">{icon}</div>
    <div style={S.emptyTitle}>{title}</div>
    {hint ? <div style={S.emptyHint}>{hint}</div> : null}
  </div>
);

/**
 * One document slot: a large preview when the file exists, a centred empty
 * state when it does not. FilePreview is unchanged — it still fetches with the
 * admin token and opens the file on click.
 */
const ImageSlot = ({ label, file, emptyIcon, emptyTitle, emptyHint, note }) => (
  <figure style={S.slot}>
    <figcaption style={S.slotLabel}>{label}</figcaption>
    {file?.path ? (
      <FilePreview src={file.path} alt={label} style={S.preview} />
    ) : (
      <EmptyState icon={emptyIcon} title={emptyTitle} hint={emptyHint} />
    )}
    {note ? <div style={S.slotNote}>{note}</div> : null}
  </figure>
);

export default function VehicleDetailsPage() {
  const { applicationId } = useParams();
  const navigate = useNavigate();

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
    <div style={S.page}>
      <SuperAdminNav active="rcNumberPlate" />

      <div style={S.shell}>
        {/* Header — title and subtitle on the left, actions on the right.
            The account menu and logout live in the shared navigation above. */}
        <div style={S.header}>
          <div>
            <h2 style={S.title}>Vehicle Details</h2>
            <p style={S.subtitle}>Review and manage RC, Number Plate and SPDC information</p>
          </div>

          <div style={S.actions}>
            <button
              className="btn btn-outline-secondary"
              onClick={() => navigate("/superadmin/rc-number-plate")}
            >
              ← Back to List
            </button>

            {!loading && !error && data && !editing && (
              <button className="btn btn-primary" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}

            {editing && (
              <>
                <button className="btn btn-outline-secondary" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving || uploading}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </>
            )}
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
              <div style={S.tileGrid}>
                <InfoTile icon="🔖" label="Loan Number" value={data.loanNumber} />
                <InfoTile icon="🏢" label="Branch" value={data.branch} />
                <InfoTile icon="👤" label="Customer Name" value={data.customerName} />
                <InfoTile icon="🏬" label="Dealer Name" value={data.dealerName} />
                <InfoTile icon="📞" label="Contact Number" value={data.contact} />
                <InfoTile icon="📅" label="Disbursement Date" value={fmtDate(data.disbursementDate)} />
                <InfoTile icon="₹" label="Loan Amount" value={fmtAmount(data.amount)} />
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
                <div style={S.slotRow}>
                  <ImageSlot
                    label="RC Front"
                    file={data.rc?.frontImage}
                    emptyIcon="📄"
                    emptyTitle="No RC Front Uploaded"
                    emptyHint="Upload an RC document to continue."
                  />
                  <ImageSlot
                    label="RC Back"
                    file={data.rc?.backImage}
                    emptyIcon="📄"
                    emptyTitle="No RC Back Uploaded"
                    emptyHint="Upload an RC document to continue."
                  />
                </div>
              ) : (
                <EmptyState
                  icon="📄"
                  title="No RC Uploaded"
                  hint="Upload an RC document to continue."
                />
              )}
            </Card>

            {/* Number Plate */}
            <Card title="Number Plate" right={<StatusBadge status={data.numberPlate?.status} />}>
              <div style={S.slotRow}>
                <div style={S.field}>
                  <label style={S.fieldLabel}>Number Plate</label>
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
                    <div style={S.fieldError}>{fieldErrors.numberPlate}</div>
                  )}
                </div>

                <ImageSlot
                  label="Number Plate Image"
                  file={data.numberPlate?.image}
                  emptyIcon="🚗"
                  emptyTitle="No Number Plate Uploaded"
                  emptyHint="Upload a number plate photograph to continue."
                />
              </div>
            </Card>

            {/* SPDC */}
            <Card title="SPDC">
              <div style={S.slotRow}>
                <div style={S.field}>
                  <label style={S.fieldLabel}>SPDC Number</label>
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
                    <div style={{ marginTop: 20 }}>
                      <label style={S.fieldLabel}>SPDC Image</label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="form-control"
                        style={{ maxWidth: 320 }}
                        disabled={uploading || saving}
                        onChange={handleSpdcFile}
                      />
                      <div style={{ ...S.fieldHint, maxWidth: 320 }}>
                        {uploading
                          ? "Uploading…"
                          : data.spdc?.image?.path
                            ? "Choosing a new image replaces the current one immediately."
                            : "JPG, PNG or WebP, up to 15MB."}
                      </div>
                      {fieldErrors.spdcImage && (
                        <div style={S.fieldError}>{fieldErrors.spdcImage}</div>
                      )}
                    </div>
                  )}
                </div>

                <ImageSlot
                  label="SPDC Image"
                  file={spdcPreview}
                  emptyIcon="🧾"
                  emptyTitle="No SPDC Image"
                  emptyHint="Add an SPDC image while editing."
                  note={spdcPreview?.pending ? "Staged — press Save Changes to apply it." : null}
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

/* ─── One set of tokens: equal radius, equal padding, equal spacing ──────── */
const RADIUS = 14;
const S = {
  page: { minHeight: "100vh", background: "#F8FAFC", padding: 24, boxSizing: "border-box" },
  shell: { maxWidth: 1180, margin: "0 auto" },

  header: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    gap: 20, flexWrap: "wrap", marginBottom: 24,
  },
  title: { color: BRAND.blue, fontWeight: 800, margin: 0, fontSize: 26, letterSpacing: "-0.01em" },
  subtitle: { color: "#6B7280", margin: "6px 0 0", fontSize: 14, lineHeight: 1.5 },
  actions: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },

  card: {
    background: "#fff", border: "1px solid #E5E7EB", borderRadius: RADIUS,
    marginBottom: 22, overflow: "hidden", boxShadow: "0 2px 12px rgba(11,31,77,0.06)",
  },
  cardHead: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 16, padding: "16px 24px", background: "#FAFBFC", borderBottom: "1px solid #F1F5F9",
    flexWrap: "wrap",
  },
  cardTitle: {
    margin: 0, fontSize: 13, fontWeight: 800, color: "#374151",
    textTransform: "uppercase", letterSpacing: "0.6px",
  },
  cardSubtitle: { margin: "3px 0 0", fontSize: 12.5, color: "#94A3B8" },
  cardBody: { padding: 24 },

  // Responsive on its own: tiles reflow from four across to one as width drops.
  tileGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 },
  tile: {
    display: "flex", alignItems: "flex-start", gap: 12,
    padding: "14px 16px", borderRadius: 12, background: "#F8FAFC", border: "1px solid #EEF2F7",
  },
  tileIcon: { fontSize: 18, lineHeight: 1.2, flexShrink: 0 },
  tileLabel: {
    fontSize: 11, fontWeight: 700, color: "#94A3B8",
    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3,
  },
  tileValue: {
    fontSize: 15, color: "#0f172a", fontWeight: 700,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },

  slotRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 },
  slot: { margin: 0, minWidth: 0 },
  slotLabel: { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 10 },
  // Much larger than before (was 190px tall).
  preview: {
    width: "100%", height: 320, objectFit: "cover",
    borderRadius: 12, border: "1px solid #E5E7EB", background: "#F8FAFC",
  },
  slotNote: { fontSize: 11.5, color: "#94A3B8", marginTop: 8 },

  empty: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    height: 320, borderRadius: 12, border: "1px dashed #CBD5E1", background: "#F9FAFB",
    padding: 24, textAlign: "center", boxSizing: "border-box",
  },
  emptyIcon: { fontSize: 40, lineHeight: 1, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: 700, color: "#475569" },
  emptyHint: { fontSize: 13, color: "#94A3B8", marginTop: 6, maxWidth: 260, lineHeight: 1.5 },

  field: { minWidth: 0 },
  fieldLabel: { fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 8 },
  fieldError: { color: BRAND.red, fontSize: 12.5, fontWeight: 700, marginTop: 6 },
  fieldHint: { fontSize: 11.5, color: "#94A3B8", marginTop: 6 },
};
