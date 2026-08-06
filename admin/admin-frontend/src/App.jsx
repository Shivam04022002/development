// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import PendingFiles from "./pages/PendingFiles";
import ApplicationView from "./pages/ApplicationView";
import ApprovedFiles from "./pages/ApprovedFiles";
import RejectedFiles from "./pages/RejectedFiles";
import ApprovedApplicationView from "./pages/ApprovedApplicationView";
import RejectedApplicationView from "./pages/RejectedApplicationView";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import CibilSettings from "./pages/CibilSettings";
import PendingCibil from "./pages/PendingCibil";
import PendingCibilView from "./pages/PendingCibilView";
import AdminAnalytics from "./pages/AdminAnalytics";
import CibilReportQA from "./pages/CibilReportQA";
import CreditUnderwritingQA from "./pages/CreditUnderwritingQA";
import RCNumberPlatePage from "./pages/RCNumberPlatePage";
import VehicleDetailsPage from "./pages/VehicleDetailsPage";

// Feature flag: the CIBIL report QA harness ships only in non-production
// builds, or when VITE_CIBIL_QA=1 is set explicitly.
const CIBIL_QA_ENABLED = import.meta.env.DEV || import.meta.env.VITE_CIBIL_QA === "1";


const App = () => {
  return (
    <Routes>
      {/* Development-only visual QA for the CIBIL report renderer.
          Not linked from the admin navigation. */}
      {CIBIL_QA_ENABLED && <Route path="/cibil-report-qa" element={<CibilReportQA />} />}
      {CIBIL_QA_ENABLED && <Route path="/credit-underwriting-qa" element={<CreditUnderwritingQA />} />}

      {/*  Auth & Dashboard */}
      <Route path="/" element={<LoginPage />} />
      <Route path="/dashboard" element={<Dashboard />} />

      {/*  Admin dashboard analytics (Phase 6) */}
      <Route path="/analytics" element={<AdminAnalytics />} />

      {/*  Pending CIBIL (Phase 5A) — before Contact Creation in the pipeline */}
      <Route path="/pending-cibil" element={<PendingCibil />} />
      <Route path="/pending-cibil/:id" element={<PendingCibilView />} />

      {/*  Pending Applications */}
      <Route path="/pending" element={<PendingFiles />} />
      <Route path="/pending/:id" element={<ApplicationView />} />

      {/*  Application direct link (for universal navigation or older URLs) */}
      <Route path="/application/:id" element={<ApplicationView />} />

      {/*  Approved Applications */}
      <Route path="/approved" element={<ApprovedFiles />} />
      <Route path="/approved/:id" element={<ApprovedApplicationView />} />

      {/*  Rejected Applications */}
      <Route path="/rejected" element={<RejectedFiles />} />
      <Route path="/rejected/:id" element={<RejectedApplicationView />} />

      {/*  Super Admin Dashboard */}
      <Route path="/superadmin-dashboard" element={<SuperAdminDashboard />} />

      {/*  Super Admin → System Settings → CIBIL Configuration */}
      <Route path="/superadmin/cibil-settings" element={<CibilSettings />} />

      {/*  RC & Number Plate (Phase 5) + Vehicle Details (Phase 6) */}
      <Route path="/superadmin/rc-number-plate" element={<RCNumberPlatePage />} />
      <Route path="/vehicle-details/:applicationId" element={<VehicleDetailsPage />} />

      {/*  Catch-all fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;

