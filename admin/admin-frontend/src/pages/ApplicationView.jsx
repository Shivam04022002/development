// src/pages/ApplicationView.jsx
import React, { useRef, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import FilePreview from "../components/FilePreview";
import CreditNoteForm from "../components/CreditNoteForm";
import DashboardLayout from "../components/layout/DashboardLayout";
import ActivityHistoryDrawer from "../components/ActivityHistoryDrawer";
import Timeline from "../components/Timeline";
import CreditNoteSummary from "../components/CreditNoteSummary";
import ApplicantSwapCards from "../components/ApplicantSwapCards";
import AssignmentPanel from "../components/AssignmentPanel";
import LoanApprovalChecklist from "../components/LoanApprovalChecklist";
import DocumentVerification from "../components/DocumentVerification";
import { usePendingInvalidate } from "../hooks/useApplications";
import {
  WORKFLOW_STAGES,
  toStage,
  stageLabel,
  isFinalStage,
  getNextStage,
} from "../utils/workflowConfig";

export default function ApplicationView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { admin } = useAuth() || {};
  const invalidatePending = usePendingInvalidate();

  // Refs for right-column sections
  const applicantRef = useRef(null);
  const coApplicantRef = useRef(null);
  const vehicleRef = useRef(null);
  const financeRef = useRef(null);
  const dealerRef = useRef(null);
  const statusRef = useRef(null);
  const workflowRef = useRef(null);
  const creditNoteRef = useRef(null);

  const [activeSection, setActiveSection] = useState("Applicant");
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);

  const pendingUpdatesRef = useRef(new Set());
  const [updating, setUpdating] = useState(false);
  const [approving, setApproving] = useState(false);

  const [adminWorkflow, setAdminWorkflow] = useState([]);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [stageChanging, setStageChanging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCreditNote, setShowCreditNote] = useState(false);
  // Bumped after a successful Credit Note so the Timeline and Credit Note
  // summary remount and re-fetch through their own existing endpoints.
  const [refreshKey, setRefreshKey] = useState(0);
  const [cibilJson, setCibilJson] = useState(null);
  const [cibilBusy, setCibilBusy] = useState("");

  // Re-fetch the application through the existing workflow endpoint so the
  // workflow indicator reflects the stage the backend set, with no page reload.
  const refreshApplication = async () => {
    try {
      const { data } = await api.get(`/workflow/${id}`);
      setApp(data);
      setRefreshKey((k) => k + 1);
      invalidatePending();
    } catch (err) {
      console.error("Refresh after Credit Note failed:", err?.response?.status, err?.message);
    }
  };

  // ── CIBIL: stored JSON is the source of truth; PDFs are generated on
  //    demand by the backend and never stored. All four calls reuse the
  //    existing admin auth via the shared api instance.
  const cibilFetch = async (path, responseType) =>
    api.get(`/cibil/${app._id}${path}`, responseType ? { responseType } : undefined);

  const saveBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const cibilError = (err) =>
    alert(err?.response?.status === 404
      ? "CIBIL data not available."
      : `Failed: ${err?.response?.data?.message || err?.message || "unknown error"}`);

  const handleViewJson = async () => {
    setCibilBusy("viewJson");
    try { setCibilJson((await cibilFetch("/json")).data); }
    catch (err) { cibilError(err); }
    finally { setCibilBusy(""); }
  };

  const handleDownloadJson = async () => {
    setCibilBusy("dlJson");
    try {
      const { data } = await cibilFetch("/json");
      saveBlob(new Blob([JSON.stringify(data.rawResponse, null, 2)], { type: "application/json" }),
               `${app.formId || app._id}-cibil.json`);
    } catch (err) { cibilError(err); }
    finally { setCibilBusy(""); }
  };

  const handleViewPdf = async () => {
    setCibilBusy("viewPdf");
    try {
      const res = await cibilFetch("/pdf", "blob");
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) { cibilError(err); }
    finally { setCibilBusy(""); }
  };

  const handleDownloadPdf = async () => {
    setCibilBusy("dlPdf");
    try {
      const res = await cibilFetch("/pdf/download", "blob");
      saveBlob(new Blob([res.data], { type: "application/pdf" }),
               `${app.formId || app._id}-CIBIL-Report.pdf`);
    } catch (err) { cibilError(err); }
    finally { setCibilBusy(""); }
  };

  // ================== Update / Approve ==================
  const handleUpdate = async () => {
    if (!app?._id) return;
    if (pendingUpdatesRef.current.has(app._id)) {
      console.log("Update already in progress for", app._id);
      return;
    }
    pendingUpdatesRef.current.add(app._id);
    setUpdating(true);

    try {
      const currentStage = toStage(app.workflowStage || "");
      const nextStage = getNextStage(currentStage);
      const currentIsFinal = isFinalStage(currentStage);

      if (currentIsFinal) {
        try {
          await api.post(`/workflow/approve/${app._id}`, { note: "Approved via UI" });
        } catch (approveErr) {
          const msg = approveErr?.response?.data?.message || approveErr?.message || "Approve failed";
          alert("Approve failed: " + msg);
          return;
        }
      } else {
        try {
          await api.patch(`/workflow/update/${app._id}`, {
            nextWorkflowStage: nextStage,
            expectedCurrentStage: currentStage,
          });
        } catch (err) {
          const status = err?.response?.status;
          if (status === 409) {
            try {
              const { data: refreshed } = await api.get(`/workflow/${app._id}`);
              setApp(refreshed);
            } catch (reErr) {
              console.warn("Refetch after 409 failed:", reErr?.response || reErr);
            }
            alert("Application stage changed by another user; reloaded latest stage.");
            return;
          }
          if (status === 404) {
            alert("Update endpoint not found on server.");
            return;
          }
          const msg = err?.response?.data?.message || err?.message || "Update failed";
          alert("Update failed: " + msg);
          return;
        }
      }

      try {
        const { data: refreshed } = await api.get(`/workflow/${app._id}`);
        setApp(refreshed);
      } catch (reFetchErr) {
        if (reFetchErr?.response?.status === 404) {
          alert("Application approved and moved to Approved collection.");
          navigate("/approved");
          return;
        }
      }

      if (!currentIsFinal) {
        alert(`Moved to stage: ${nextStage}`);
      } else {
        invalidatePending();
        navigate("/approved");
      }
    } finally {
      pendingUpdatesRef.current.delete(app._id);
      setUpdating(false);
    }
  };

  const changeStage = async (targetStage) => {
    if (!app?._id) return;
    if (stageChanging) return;
    setStageChanging(true);
    try {
      const currentStage = toStage(app.workflowStage || "");
      if (toStage(targetStage) === currentStage) {
        setStageChanging(false);
        return;
      }

      try {
        await api.patch(`/workflow/update/${app._id}`, {
          nextWorkflowStage: targetStage,
          expectedCurrentStage: currentStage,
        });
      } catch (err) {
        const status = err?.response?.status;
        if (status === 400) {
          const allowed = err?.response?.data?.allowedStages;
          const msg = err?.response?.data?.message || "Invalid stage requested";
          if (Array.isArray(allowed) && allowed.length > 0) {
            alert(`${msg}. Allowed stages: ${allowed.join(", ")}`);
          } else {
            alert(msg);
          }
          return;
        }
        if (status === 409) {
          alert("Current stage mismatch. Reloading latest application...");
          try {
            const { data: refreshed } = await api.get(`/workflow/${app._id}`);
            setApp(refreshed);
          } catch (reErr) { /* ignore */ }
          return;
        }
        const msg = err?.response?.data?.message || err?.message || "Stage change failed";
        alert("Stage change failed: " + msg);
        return;
      }

      try {
        const { data: refreshed } = await api.get(`/workflow/${app._id}`);
        setApp(refreshed);
      } catch (reFetchErr) {
        if (reFetchErr?.response?.status === 404) {
          alert("Application approved and moved to Approved collection.");
          navigate("/approved");
          return;
        }
      }
      alert(`Stage changed to ${targetStage}`);
    } finally {
      setStageChanging(false);
    }
  };

  // Approve button handler
  const handleApprove = async () => {
    if (!app?._id) return;
    if (pendingUpdatesRef.current.has(app._id)) return;
    pendingUpdatesRef.current.add(app._id);
    setApproving(true);
    try {
      const res = await api.post(`/workflow/approve/${app._id}`, {
        note: "Approved via admin UI",
        approvedByName: "Admin",
      });
      alert(res.data?.message || "Application approved successfully");
      invalidatePending();
      if (admin?.role === "superadmin") {
        navigate("/superadmin-dashboard", { state: { focus: "files", filesTab: "pending" } });
      } else {
        navigate("/dashboard", { state: { focus: "pending" } });
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Approve failed";
      alert("Approve failed: " + msg);
    } finally {
      pendingUpdatesRef.current.delete(app._id);
      setApproving(false);
    }
  };

  // Reject
  const handleReject = async () => {
    if (!app?._id) return;
    const reason = prompt("Enter rejection reason:");
    if (!reason) return;
    try {
      await api.post(`/workflow/reject/${app._id}`, {
        reason,
        note: "Rejected by admin",
        rejectedByName: "Admin",
      });
      alert("Application rejected!");
      invalidatePending();
      if (admin?.role === "superadmin") {
        navigate("/superadmin-dashboard", { state: { focus: "files", filesTab: "pending" } });
      } else {
        navigate("/dashboard", { state: { focus: "pending" } });
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || err.message || "Reject failed";
      alert(msg);
    }
  };

  // Fetch application
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/workflow/${id}`);
        setApp(data);
      } catch (err) {
        console.error("Application fetch error:", err?.response?.status, err?.response?.data || err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Admin's allowed stages come from auth context; fall back to full list
  useEffect(() => {
    const raw = admin?.workflows;
    if (raw && (Array.isArray(raw) ? raw.length > 0 : String(raw).trim())) {
      const parsed = Array.isArray(raw)
        ? raw.flat().map(toStage).filter(Boolean)
        : String(raw).replace(/[\[\]"']/g, "").split(/[\n,]+/).map(toStage).filter(Boolean);
      setAdminWorkflow([...new Set(parsed)]);
    } else {
      setAdminWorkflow(WORKFLOW_STAGES);
    }
  }, [admin]);

  // Helpers
  const applicantData = app?.applicant?.applicant || app?.applicant || null;
  const applicantPhoto = applicantData?.photo || "";
  // New records store firstName / surname alongside the composed `name`;
  // legacy records have `name` only.
  const fullName = (a) =>
    a?.name || `${a?.firstName || ""} ${a?.surname || ""}`.trim() || "";
  const applicantName = fullName(applicantData) || "Applicant";

  // Verification badge for one document. Closes over the application and the
  // page's existing refresh, so each call site stays a single line and the
  // surrounding layout is unchanged.
  const DocVerify = ({ role, field, label }) => {
    const party = role === "applicant" ? applicantData : app?.coApplicant;
    return (
      <DocumentVerification
        applicationId={app?._id}
        role={role}
        field={field}
        label={label}
        hasFile={Boolean(party?.[field])}
        state={app?.documentVerification?.[role]?.[field]}
        onChanged={refreshApplication}
      />
    );
  };

  // Approval is gated only by checklist items the backend already enforces
  // (see utils/approvalChecklist.js — `blocking`). Reject is never gated.
  const approvalBlocked = Boolean(app?.checklist?.approval?.blocked);

  // The existing endpoint accepts a Credit Note only at Pending CIBIL, so the
  // menu item is disabled elsewhere rather than letting the user hit a 400.
  const creditNoteAvailable = toStage(app?.workflowStage || "") === "pending_cibil";
  const CREDIT_NOTE_UNAVAILABLE_MSG =
    "Credit Note can only be created while the application is in Pending CIBIL.";

  // DOB is stored as an ISO date/timestamp. Show DD/MM/YYYY plus the age
  // derived from it. The date part is read textually so no timezone shift
  // can move the day.
  const dobWithAge = (value) => {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "— / —";
    const [, y, mo, d] = m;
    const birth = new Date(Number(y), Number(mo) - 1, Number(d));
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (
      now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
    ) {
      age -= 1;
    }
    return `${d}/${mo}/${y} / ${age >= 0 && age < 150 ? age : "—"}`;
  };

  const scrollTo = (ref, section) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(section);
    }
  };

  // Track visible section via IntersectionObserver
  useEffect(() => {
    const sections = [
      { ref: applicantRef, id: "Applicant" },
      { ref: coApplicantRef, id: "Co-Applicant" },
      { ref: vehicleRef, id: "Vehicle Details" },
      { ref: financeRef, id: "Finance Details" },
      { ref: dealerRef, id: "Dealer Details" },
      { ref: statusRef, id: "Status" },
      { ref: workflowRef, id: "Workflow" },
      { ref: creditNoteRef, id: "Credit Note" },
    ];

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActiveSection(e.target.dataset.id)),
      { threshold: 0.5 }
    );

    sections.forEach((s) => {
      if (s.ref.current) {
        s.ref.current.dataset.id = s.id;
        observer.observe(s.ref.current);
      }
    });

    return () => {
      sections.forEach((s) => s.ref.current && observer.unobserve(s.ref.current));
    };
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div style={S.centerWrap}>
          <div style={S.loader}>Loading…</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ display: "flex", height: "100%", gap: "16px", width: "100%", overflow: "hidden" }}>

        {/* ═══════════ LEFT SIDEBAR ═══════════ */}
        <div style={S.sidebar}>
          <button onClick={() => navigate(-1)} style={S.backBtn}>
            ← Back
          </button>

          {/* Applicant */}
          <h2
            style={{
              ...S.sidebarTitle,
              color: activeSection === "Applicant" ? "#2563eb" : "#374151",
              cursor: "pointer",
            }}
            onClick={() => scrollTo(applicantRef, "Applicant")}
          >
            Applicant
          </h2>

          <div style={S.photoWrap}>
            <div style={S.photoBox}>
              {applicantPhoto ? (
                <FilePreview src={applicantPhoto} alt="Applicant" style={S.photoImg} />
              ) : (
                <div style={S.photoPlaceholder}>No Photo</div>
              )}
            </div>
            <div style={S.photoName}>{applicantName}</div>
          </div>

          <hr style={S.divider} />

          {/* Co-Applicant */}
          <h2
            style={{
              ...S.sidebarTitle,
              textAlign: "center",
              color: activeSection === "Co-Applicant" ? "#2563eb" : "#374151",
              cursor: "pointer",
            }}
            onClick={() => scrollTo(coApplicantRef, "Co-Applicant")}
          >
            Co-Applicant
          </h2>

          <div style={S.photoWrap}>
            <div style={S.photoBox}>
              {app?.coApplicant?.photo ? (
                <FilePreview src={app.coApplicant.photo} alt="Co-Applicant" style={S.photoImg} />
              ) : (
                <div style={S.photoPlaceholder}>No Photo</div>
              )}
            </div>
            <div style={S.photoName}>{app?.coApplicant?.name || "Co-Applicant"}</div>
          </div>

          <hr style={S.divider} />

          {/* Other navigation */}
          <h2 style={{ ...S.sidebarTitle, textAlign: "center", color: "#374151" }}>Other</h2>
          <ul style={S.navList}>
            {["Vehicle Details", "Finance Details", "Dealer Details", "Status", "Workflow", "Credit Note"].map((item) => (
              <li
                key={item}
                title={item === "Credit Note" && !creditNoteAvailable ? CREDIT_NOTE_UNAVAILABLE_MSG : undefined}
                style={{
                  ...S.navItem,
                  color:
                    item === "Credit Note" && !creditNoteAvailable
                      ? "#9ca3af"
                      : activeSection === item ? "#2563eb" : "#374151",
                  fontWeight: activeSection === item ? 700 : 500,
                  cursor: item === "Credit Note" && !creditNoteAvailable ? "not-allowed" : S.navItem.cursor,
                  opacity: item === "Credit Note" && !creditNoteAvailable ? 0.6 : 1,
                }}
                onClick={() => {
                  if (item === "Credit Note") {
                    if (!creditNoteAvailable) return;
                    setShowCreditNote(true);
                    setActiveSection("Credit Note");
                    return;
                  }
                  const map = {
                    "Vehicle Details": vehicleRef,
                    "Finance Details": financeRef,
                    "Dealer Details": dealerRef,
                    Status: statusRef,
                    Workflow: workflowRef,
                    "Credit Note": creditNoteRef,
                  };
                  scrollTo(map[item], item);
                }}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* ═══════════ RIGHT / CONTENT COLUMN ═══════════ */}
        <div style={S.content}>

          {/* ──── Task ownership (assignment never changes the workflow) ──── */}
          <AssignmentPanel
            applicationId={app?._id}
            assignment={app?.assignment}
            onChanged={refreshApplication}
          />

          {/* ──── Applicant / Co-Applicant summary + role swap ──── */}
          <ApplicantSwapCards app={app} onSwapped={refreshApplication} />

          {/* ──── Applicant Section ──── */}
          <div ref={applicantRef} style={S.section}>
            <h2 style={S.sectionHeading}>Applicant</h2>
            <div style={S.sectionDividerWrap}><hr style={S.sectionDivider} /><hr style={S.sectionDivider} /></div>

            <div style={S.twoCol}>
              {/* LEFT: Images */}
              <div style={S.colStack}>
                <div>
                  <div style={S.fieldLabel}><b>Profile</b></div>
                  <div style={S.imgThumbBox}>
                    {applicantData?.photo ? (
                      <>
                        <FilePreview src={applicantData.photo} alt="Applicant" style={S.imgThumb} />
                        <DocVerify role="applicant" field="photo" label="Photograph" />
                      </>
                    ) : (
                      <span style={S.noImgText}>No Image</span>
                    )}
                  </div>
                </div>

                <div>
                  <div style={S.fieldLabel}><b>Aadhaar Number</b></div>
                  <p style={S.fieldValue}>{applicantData?.aadharNo || "—"}</p>
                </div>

                <div>
                  <div style={S.fieldLabel}><b>Aadhaar Front</b></div>
                  {applicantData?.aadharFront ? (
                    <>
                      <FilePreview src={applicantData.aadharFront} alt="Aadhaar Front" style={S.docImg} />
                      <DocVerify role="applicant" field="aadharFront" label="Aadhaar Front" />
                    </>
                  ) : (
                    <span style={S.noImgText}>No Image</span>
                  )}
                </div>

                <div>
                  <div style={S.fieldLabel}><b>PAN Image</b></div>
                  {applicantData?.panImage ? (
                    <>
                      <FilePreview src={applicantData.panImage} alt="PAN" style={S.docImg} />
                      <DocVerify role="applicant" field="panImage" label="PAN Card" />
                    </>
                  ) : (
                    <span style={S.noImgText}>No Image</span>
                  )}
                </div>
              </div>

              {/* RIGHT: Text details */}
              <div style={S.colStack}>
                <FieldPair label="Name" value={fullName(applicantData)} />
                <FieldPair label="Mobile Number" value={applicantData?.mobileNumber || applicantData?.mobile} />
                <FieldPair label="Email" value={applicantData?.email} />
                <FieldPair label="Gender" value={applicantData?.gender} />
                <FieldPair label="Father's Name" value={applicantData?.fatherName} />
                <FieldPair label="DOB / Age" value={dobWithAge(applicantData?.dateOfBirth)} />

                <div>
                  <div style={S.fieldLabel}><b>Aadhaar Back</b></div>
                  {applicantData?.aadharBack ? (
                    <>
                      <FilePreview src={applicantData.aadharBack} alt="Aadhaar Back" style={S.docImg} />
                      <DocVerify role="applicant" field="aadharBack" label="Aadhaar Back" />
                    </>
                  ) : (
                    <span style={S.noImgText}>No Image</span>
                  )}
                </div>

                <FieldPair label="PAN No" value={applicantData?.panNo} />
                <FieldPair label="Address" value={applicantData?.address} />
              </div>
            </div>
          </div>

          {/* ──── Co-Applicant Section ──── */}
          <div ref={coApplicantRef} style={S.section}>
            <h2 style={S.sectionHeading}>Co-Applicant</h2>
            <div style={S.sectionDividerWrap}><hr style={S.sectionDivider} /><hr style={S.sectionDivider} /></div>

            <div style={S.twoCol}>
              {/* LEFT: Images */}
              <div style={S.colStack}>
                <div>
                  <div style={S.fieldLabel}><b>Profile</b></div>
                  <div style={S.imgThumbBox}>
                    {app?.coApplicant?.photo ? (
                      <>
                        <FilePreview src={app.coApplicant.photo} alt="Co-Applicant" style={S.imgThumb} />
                        <DocVerify role="coApplicant" field="photo" label="Photograph" />
                      </>
                    ) : (
                      <span style={S.noImgText}>No Image</span>
                    )}
                  </div>
                </div>

                <div>
                  <div style={S.fieldLabel}><b>Aadhaar No</b></div>
                  <p style={S.fieldValue}>{app?.coApplicant?.aadharNo || "—"}</p>
                </div>

                <div>
                  <div style={S.fieldLabel}><b>Aadhaar Front</b></div>
                  {app?.coApplicant?.aadharFront ? (
                    <>
                      <FilePreview src={app.coApplicant.aadharFront} alt="Aadhaar Front" style={S.docImg} />
                      <DocVerify role="coApplicant" field="aadharFront" label="Aadhaar Front" />
                    </>
                  ) : (
                    <span style={S.noImgText}>No Image</span>
                  )}
                </div>

                <div>
                  <div style={S.fieldLabel}><b>Aadhaar Back</b></div>
                  {app?.coApplicant?.aadharBack ? (
                    <>
                      <FilePreview src={app.coApplicant.aadharBack} alt="Aadhaar Back" style={S.docImg} />
                      <DocVerify role="coApplicant" field="aadharBack" label="Aadhaar Back" />
                    </>
                  ) : (
                    <span style={S.noImgText}>No Image</span>
                  )}
                </div>

                <div>
                  <div style={S.fieldLabel}><b>PAN Image</b></div>
                  {app?.coApplicant?.panImage ? (
                    <>
                      <FilePreview src={app.coApplicant.panImage} alt="PAN" style={S.docImg} />
                      <DocVerify role="coApplicant" field="panImage" label="PAN Card" />
                    </>
                  ) : (
                    <span style={S.noImgText}>No Image</span>
                  )}
                </div>

                <div>
                  <div style={S.fieldLabel}><b>Form 60</b></div>
                  {app?.coApplicant?.form60 ? (
                    <>
                      <FilePreview src={app.coApplicant.form60} alt="Form 60" style={S.docImg} />
                      <DocVerify role="coApplicant" field="form60" label="Form 60" />
                    </>
                  ) : (
                    <span style={S.noImgText}>No Image</span>
                  )}
                </div>
              </div>

              {/* RIGHT: Text details */}
              <div style={S.colStack}>
                <FieldPair label="Name" value={app?.coApplicant?.name} />
                <FieldPair label="Mobile Number" value={app?.coApplicant?.mobileNumber || app?.coApplicant?.mobile} />
                <FieldPair label="Email" value={app?.coApplicant?.email} />
                <FieldPair label="Gender" value={app?.coApplicant?.gender} />
                <FieldPair label="Father's Name" value={app?.coApplicant?.fatherName} />
                <FieldPair label="DOB / Age" value={dobWithAge(app?.coApplicant?.dateOfBirth)} />
                <FieldPair label="PAN No" value={app?.coApplicant?.panNo} />
                <FieldPair label="Address" value={app?.coApplicant?.address} />
                <FieldPair label="Pincode" value={app?.coApplicant?.pincode} />
                <FieldPair label="Police Station" value={app?.coApplicant?.policeStation} />
                <FieldPair label="Post Office" value={app?.coApplicant?.postOffice} />
                <FieldPair label="Relation" value={app?.coApplicant?.relation} />
                <FieldPair label="Document Type" value={app?.coApplicant?.documentType} />
              </div>
            </div>
          </div>

          {/* ──── Vehicle Details ──── */}
          <div ref={vehicleRef} style={S.section}>
            <h2 style={S.sectionHeading}>Vehicle Details</h2>
            <div style={S.sectionDividerWrap}><hr style={S.sectionDivider} /><hr style={S.sectionDivider} /></div>

            <div style={S.twoCol}>
              <div style={S.colStack}>
                <FieldPair label="Brand Name" value={app?.vehicleDetails?.brandName} />
                <FieldPair label="Model Name" value={app?.vehicleDetails?.modelName} />
                <div>
                  <div style={S.fieldLabel}><b>Vehicle Image</b></div>
                  {(app?.vehicleDetails?.vehicleImage || app?.vehicleDetails?.vehiclePhoto) ? (
                    <FilePreview src={app.vehicleDetails.vehicleImage || app.vehicleDetails.vehiclePhoto} alt="Vehicle Image" style={S.docImg} />
                  ) : (
                    <span style={S.noImgText}>No Image</span>
                  )}
                </div>
              </div>
              <div style={S.colStack}>
                <FieldPair label="Price of Vehicle" value={app?.vehicleDetails?.priceOfVehicle} />
              </div>
            </div>
          </div>

          {/* ──── Finance Details ──── */}
          <div ref={financeRef} style={S.section}>
            <h2 style={S.sectionHeading}>Finance Details</h2>
            <div style={S.sectionDividerWrap}><hr style={S.sectionDivider} /><hr style={S.sectionDivider} /></div>

            <div style={S.twoCol}>
              <div style={S.colStack}>
                <FieldPair label="Finance Required" value={app?.vehicleDetails?.financeRequired} />
              </div>
              <div style={S.colStack}>
                <FieldPair label="Tenure" value={app?.vehicleDetails?.tenure} />
              </div>
            </div>
          </div>

          {/* ──── Dealer Details ──── */}
          <div ref={dealerRef} style={S.section}>
            <h2 style={S.sectionHeading}>Dealer Details</h2>
            <div style={S.sectionDividerWrap}><hr style={S.sectionDivider} /><hr style={S.sectionDivider} /></div>

            <div style={S.twoCol}>
              <div style={S.colStack}>
                <FieldPair label="Email" value={app?.dealerDetails?.email} />
                <FieldPair label="Branch" value={app?.dealerDetails?.branch} />
              </div>
              <div style={S.colStack}>
                <FieldPair label="Name" value={app?.dealerDetails?.name} />
                <FieldPair label="District" value={app?.dealerDetails?.district} />
              </div>
            </div>
          </div>

          {/* ──── Status ──── */}
          <div ref={statusRef} style={S.section}>
            <h2 style={S.sectionHeading}>Status</h2>
            <div style={S.sectionDividerWrap}><hr style={S.sectionDivider} /><hr style={S.sectionDivider} /></div>

            <div style={S.fieldLabel}><b>Current Status</b></div>
            <span style={{ fontWeight: 600 }}>{app?.status || "—"}</span>
          </div>

          {/* ──── CIBIL (summary only — internal report is never exposed) ──── */}
          <div style={S.section}>
            <h2 style={S.sectionHeading}>CIBIL</h2>
            <div style={S.sectionDividerWrap}><hr style={S.sectionDivider} /><hr style={S.sectionDivider} /></div>

            {(() => {
              const c = app?.cibil || {};
              const hasScore = typeof c.score === "number" && !Number.isNaN(c.score);
              const clamped = hasScore ? Math.max(300, Math.min(900, c.score)) : 0;
              const pct = hasScore ? ((clamped - 300) / 600) * 100 : 0;
              const meterColor = !hasScore
                ? "#CBD5E1"
                : c.score >= 750
                ? "#16A34A"
                : c.score >= 650
                ? "#F59E0B"
                : "#EF4444";
              const fmtDate = (d) => {
                if (!d) return "—";
                const dt = new Date(d);
                return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString();
              };
              return (
                <>
                  {/* CIBIL Meter */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: meterColor, fontSize: 22 }}>
                        {hasScore ? c.score : "—"}
                      </span>
                      <span style={{ color: "#6B7280", fontSize: 12 }}>300–900</span>
                    </div>
                    <div style={{ height: 12, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: meterColor, borderRadius: 999, transition: "width .3s" }} />
                    </div>
                  </div>

                  <div style={S.twoCol}>
                    <div style={S.colStack}>
                      <FieldPair label="CIBIL Score" value={hasScore ? String(c.score) : "—"} />
                      <FieldPair label="Status" value={c.status || c.state || "—"} />
                    </div>
                    <div style={S.colStack}>
                      <FieldPair label="Report Date" value={fmtDate(c.reportDate)} />
                      <FieldPair label="Request ID" value={c.requestId || "—"} />
                    </div>
                  </div>

                  {/* Stored JSON is the source of truth; PDFs are generated on demand. */}
                  <div style={S.cibilActions}>
                    <button style={S.cibilBtn} disabled={!!cibilBusy} onClick={handleViewJson}>
                      {cibilBusy === "viewJson" ? "Loading…" : "View JSON"}
                    </button>
                    <button style={S.cibilBtn} disabled={!!cibilBusy} onClick={handleDownloadJson}>
                      {cibilBusy === "dlJson" ? "Preparing…" : "Download JSON"}
                    </button>
                    <button style={S.cibilBtnPrimary} disabled={!!cibilBusy} onClick={handleViewPdf}>
                      {cibilBusy === "viewPdf" ? "Generating…" : "View PDF"}
                    </button>
                    <button style={S.cibilBtnPrimary} disabled={!!cibilBusy} onClick={handleDownloadPdf}>
                      {cibilBusy === "dlPdf" ? "Generating…" : "Download PDF"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>

          {/* ──── Credit Note ──── */}
          <div ref={creditNoteRef} data-id="Credit Note" style={S.section}>
            <h2 style={S.sectionHeading}>Credit Note</h2>
            <div style={S.sectionDividerWrap}><hr style={S.sectionDivider} /><hr style={S.sectionDivider} /></div>
            <CreditNoteSummary key={refreshKey} applicationId={app?._id} />
          </div>

          {/* ──── Timeline ──── */}
          <div style={S.section}>
            <h2 style={S.sectionHeading}>Timeline</h2>
            <div style={S.sectionDividerWrap}><hr style={S.sectionDivider} /><hr style={S.sectionDivider} /></div>
            <Timeline key={refreshKey} applicationId={app?._id} />
          </div>

          {/* ──── Workflow ──── */}
          <div ref={workflowRef} style={{ ...S.section, borderBottom: "none" }}>
            <h2 style={S.sectionHeading}>Workflow</h2>
            <div style={S.sectionDividerWrap}><hr style={S.sectionDivider} /><hr style={S.sectionDivider} /></div>

            <div style={S.fieldLabel}><b>Current Stage</b></div>
            <p style={{ ...S.fieldValue, fontWeight: 700, textTransform: "capitalize" }}>
              {stageLabel(app?.workflowStage) || "—"}
            </p>
            {stageChanging && <p style={{ fontSize: 12, color: "#64748b" }}>Changing stage…</p>}
            <div style={{ marginTop: 8 }}>
              <label style={{ ...S.fieldLabel, marginBottom: 4 }}><b>Change Stage</b></label>
              <select
                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
                value={toStage(app?.workflowStage || "")}
                disabled={stageChanging}
                onChange={(e) => changeStage(e.target.value)}
              >
                {WORKFLOW_STAGES.filter((s) => adminWorkflow.includes(s) || adminWorkflow.length === 0).map((s) => (
                  <option key={s} value={s}>{stageLabel(s)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ──── Approval readiness ────
               Rendered as the last block of the content column, directly above
               the action bar. The bar itself is position:fixed, so placing the
               checklist inside it would turn it into an overlay. */}
          <LoanApprovalChecklist checklist={app?.checklist} />

          {/* ──── Floating Buttons ──── */}
          <div style={S.floatingBtns}>
            <button
              onClick={() => setShowHistory(true)}
              style={{
                ...S.actionBtn,
                background: "linear-gradient(135deg, #1e3a5f, #1d4ed8)",
                color: "#fff",
                boxShadow: "0 4px 18px rgba(29,78,216,0.35)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              📋 Activity History
            </button>
            {isFinalStage(app?.workflowStage) ? (
              <button
                onClick={handleApprove}
                // Blocked only by requirements the approval endpoint itself
                // enforces, so nothing approvable today becomes unapprovable.
                disabled={approving || approvalBlocked}
                title={approvalBlocked ? app?.checklist?.approval?.message : undefined}
                style={{
                  ...S.actionBtn,
                  backgroundColor: approving ? "#d1fae5" : approvalBlocked ? "#f1f5f9" : "white",
                  color: approving ? "#065f46" : approvalBlocked ? "#94a3b8" : "black",
                  cursor: approving || approvalBlocked ? "not-allowed" : "pointer",
                }}
              >
                {approving ? "Approving…" : "Approve"}
              </button>
            ) : (
              <button
                onClick={handleUpdate}
                disabled={updating}
                style={{
                  ...S.actionBtn,
                  backgroundColor: updating ? "#d1fae5" : "white",
                  color: updating ? "#065f46" : "black",
                  cursor: updating ? "not-allowed" : "pointer",
                }}
              >
                {updating ? "Approving…" : "Approve"}
              </button>
            )}

            <button onClick={handleReject} style={S.actionBtn}>
              Reject
            </button>
          </div>

        </div>
      </div>
        {/* ──── CIBIL raw JSON modal ──── */}
        {cibilJson && (
          <div style={S.cnOverlay} onClick={() => setCibilJson(null)}>
            <div style={{ ...S.cnModal, maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
              <div style={S.cnHeader}>
                <h2 style={S.cnTitle}>CIBIL Response (JSON)</h2>
                <button type="button" aria-label="Close" onClick={() => setCibilJson(null)} style={S.cnClose}>×</button>
              </div>
              <div style={{ ...S.cnBody, background: "#0f172a" }}>
                <pre style={S.jsonPre}>{JSON.stringify(cibilJson.rawResponse, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}

        {/* ──── Credit Note modal ──── */}
        {showCreditNote && (
          <div
            style={S.cnOverlay}
            onClick={() => setShowCreditNote(false)}
          >
            <div style={S.cnModal} onClick={(e) => e.stopPropagation()}>
              <div style={S.cnHeader}>
                <h2 style={S.cnTitle}>Credit Note</h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setShowCreditNote(false)}
                  style={S.cnClose}
                >
                  ×
                </button>
              </div>
              <div style={S.cnBody}>
                {!creditNoteAvailable ? (
                  <div style={{ color: "#B91C1C", fontWeight: 600 }}>
                    {CREDIT_NOTE_UNAVAILABLE_MSG}
                  </div>
                ) : (
                <CreditNoteForm
                  applicationId={app?._id}
                  formId={app?.formId}
                  applicantName={fullName(applicantData)}
                  applicantAddress={applicantData?.address}
                  cibilScore={typeof app?.cibil?.score === "number" ? app.cibil.score : null}
                  onCompleted={async () => {
                    await refreshApplication();
                    setShowCreditNote(false);
                  }}
                />
                )}
              </div>
            </div>
          </div>
        )}

      {showHistory && (
        <ActivityHistoryDrawer
          app={app}
          onClose={() => setShowHistory(false)}
        />
      )}
    </DashboardLayout>
  );
}

/* ═══════════ Reusable FieldPair Component ═══════════ */
function FieldPair({ label, value }) {
  return (
    <div>
      <div style={S.fieldLabel}><b>{label}</b></div>
      <p style={S.fieldValue}>{value || "—"}</p>
    </div>
  );
}

/* ═══════════ Styles ═══════════ */
const S = {
  /* -- Left sidebar -- */
  backBtn: {
    border: "1px solid #e5e7eb",
    background: "#fff",
    borderRadius: 8,
    padding: "6px 12px",
    fontWeight: 600,
    marginBottom: 16,
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "#374151",
    transition: "background 0.2s",
  },
  sidebar: {
    width: 200,
    minWidth: 200,
    height: "100%",
    overflowY: "auto",
    borderRadius: 16,
    background: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
    padding: 16,
    flexShrink: 0,
    border: "1px solid #e5e7eb",
  },
  sidebarTitle: {
    fontSize: "1.15rem",
    fontWeight: 700,
    margin: "0 0 12px 0",
    letterSpacing: "0.01em",
  },
  photoWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 8,
  },
  photoBox: {
    width: 140,
    height: 140,
    borderRadius: 14,
    overflow: "hidden",
    border: "3px solid #fff",
    background: "linear-gradient(145deg, #f9fafb, #e5e7eb)",
    boxShadow: "0 6px 15px rgba(0,0,0,0.12), inset 0 2px 6px rgba(255,255,255,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.3s ease",
    cursor: "pointer",
  },
  photoImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  photoPlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#e5e7eb",
    color: "#6b7280",
    fontSize: 14,
    fontWeight: 700,
  },
  photoName: {
    marginTop: 10,
    fontWeight: 700,
    textAlign: "center",
    fontSize: "1rem",
    color: "#222",
    width: "100%",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  divider: {
    border: "none",
    borderTop: "1px solid #d1d5db",
    margin: "14px 0",
  },
  navList: {
    margin: 0,
    padding: "0 0 0 18px",
    listStyle: "disc",
  },
  navItem: {
    cursor: "pointer",
    padding: "4px 0",
    fontSize: 14,
    transition: "color 0.15s",
  },

  /* -- Right content -- */
  content: {
    flex: 1,
    height: "100%",
    overflowY: "auto",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
    padding: 24,
    boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
  },

  /* -- Sections -- */
  section: {
    marginBottom: 40,
    paddingBottom: 20,
    borderBottom: "2px solid #e5e7eb",
  },
  sectionHeading: {
    fontSize: "1.6rem",
    fontWeight: 700,
    textAlign: "center",
    margin: "0 0 8px 0",
    color: "#111827",
  },
  sectionDividerWrap: {
    marginBottom: 16,
  },
  sectionDivider: {
    border: "none",
    borderTop: "1px solid #d1d5db",
    margin: "4px 0",
  },

  /* -- Two column layout -- */
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
  },
  colStack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  /* -- Fields -- */
  fieldLabel: {
    fontWeight: 600,
    fontSize: 14,
    color: "#111827",
    marginBottom: 2,
  },
  fieldValue: {
    margin: "2px 0 0 0",
    fontSize: 14,
    color: "#2563eb",
    fontWeight: 400,
  },

  /* -- Images -- */
  imgThumbBox: {
    width: 143,
    height: 144,
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  imgThumb: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  docImg: {
    width: 150,
    height: 100,
    objectFit: "cover",
    borderRadius: 4,
  },
  cibilActions: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 },
  cibilBtn: {
    padding: "7px 14px", borderRadius: 8, border: "1px solid #cbd5e1",
    background: "#fff", color: "#0B1F4D", fontWeight: 700, fontSize: 13, cursor: "pointer",
  },
  cibilBtnPrimary: {
    padding: "7px 14px", borderRadius: 8, border: "1px solid #2563eb",
    background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
  },
  jsonPre: {
    margin: 0, color: "#e2e8f0", fontSize: 11.5, lineHeight: 1.5,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    whiteSpace: "pre", overflowX: "auto",
  },
  cnOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 1000,
  },
  cnModal: {
    background: "#fff",
    borderRadius: 12,
    width: "100%",
    maxWidth: 720,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 45px rgba(0,0,0,0.25)",
  },
  cnHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid #e5e7eb",
  },
  cnTitle: { margin: 0, fontSize: 18, fontWeight: 800, color: "#0B1F4D" },
  cnClose: {
    background: "transparent",
    border: "none",
    fontSize: 26,
    lineHeight: 1,
    color: "#6b7280",
    cursor: "pointer",
    padding: "0 4px",
  },
  cnBody: { padding: 20, overflowY: "auto" },
  noImgText: {
    color: "#6b7280",
    fontSize: 13,
  },

  /* -- Floating action buttons -- */
  floatingBtns: {
    position: "fixed",
    bottom: 20,
    right: 40,
    display: "flex",
    gap: 20,
    zIndex: 1000,
  },
  actionBtn: {
    fontWeight: 700,
    letterSpacing: "0.1em",
    border: "none",
    borderRadius: "1.1em",
    cursor: "pointer",
    padding: "1em 2.5em",
    backgroundColor: "white",
    color: "black",
    transition: "all 0.3s ease-in-out",
    boxShadow: "4px 4px 15px rgba(0,0,0,0.2)",
  },

  /* -- Loading / center -- */
  centerWrap: {
    minHeight: "70vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  loader: {
    padding: "10px 14px",
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 10,
    boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
    fontWeight: 700,
  },
};
