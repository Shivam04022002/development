import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo-surjit.png";

/**
 * SuperAdminNav — the admin portal's top navigation.
 *
 * Extracted verbatim from SuperAdminDashboard, which used to own the only copy.
 * The markup, the CSS declarations and the account dropdown are byte-for-byte
 * the same; only the class names carry an `sa-` prefix so this component's
 * styles cannot collide with a host page's.
 *
 * Two modes, one component:
 *
 *   • Dashboard — pass `onSelect`. Selecting a dashboard tab calls it, and the
 *     dashboard switches tabs exactly as before.
 *   • Standalone page (RC & Number Plate, CIBIL Settings, anything later) —
 *     omit `onSelect`. Every item then routes, which is what those pages did
 *     before by hand.
 *
 * `active` highlights one item. The keys are the dashboard's own tab keys, so
 * the dashboard can pass its `tab` state straight through.
 */

/** One entry per item, in the order the portal has always shown them. */
export const NAV_ITEMS = [
  { key: "admins", label: "Admins", count: "admins", route: "/superadmin-dashboard" },
  { key: "summary", label: "Summary", count: "summary", route: "/superadmin-dashboard" },
  { key: "stats", label: "Stats", route: "/superadmin-dashboard" },
  { key: "files", label: "Files", route: "/superadmin-dashboard" },
  { key: "dealers", label: "Dealers", count: "dealers", route: "/superadmin-dashboard" },
  { key: "dealerActivity", label: "Activity", route: "/superadmin-dashboard" },
  { key: "rcNumberPlate", label: "RC & Number Plate", route: "/superadmin/rc-number-plate" },
  { key: "cibilSettings", label: "CIBIL Settings", route: "/superadmin/cibil-settings" },
];

// The two items that are pages of their own always route, even on the
// dashboard — that is what their buttons did before this extraction.
const ROUTED_ONLY = new Set(["rcNumberPlate", "cibilSettings"]);

export default function SuperAdminNav({ active, onSelect, counts = {} }) {
  const navigate = useNavigate();
  const { admin, logout } = useAuth();

  // Same three pieces of state the dashboard held for its account menu.
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    try {
      if (typeof logout === "function") logout();
    } catch (e) {
      console.warn("logout() threw:", e);
    }
    try {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminInfo");
    } catch (err) {
      console.warn("Failed to clear admin tokens:", err);
    }
    navigate("/");
  };

  const handleClick = (item) => {
    // A dashboard tab when the host handles tabs; a route otherwise.
    if (onSelect && !ROUTED_ONLY.has(item.key)) onSelect(item.key);
    else navigate(item.route);
  };

  return (
    <>
      <style>{`
.sa-nav{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  padding:12px 18px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(250,250,250,0.9));
  border: 1px solid rgba(14,20,36,0.04);
  box-shadow: 0 12px 32px rgba(15,23,42,.06);
  margin-bottom: 18px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
}
.sa-seg{ display:inline-flex; padding:6px; background: rgba(241,245,249,0.7); border-radius:999px; gap:6px; }
.sa-seg button{
  border:0; background:transparent; padding:8px 14px; border-radius:999px; font-weight:700; color:#6b7280;
  cursor: pointer; transition: all 180ms cubic-bezier(.2,.9,.3,1);
  letter-spacing: .2px;
}
.sa-seg button.active{
  background: #fff;
  color: #0f172a;
  box-shadow: 0 8px 20px rgba(12,18,33,0.06);
  transform: translateY(-1px);
}
.sa-badge{ display:inline-block; font-size:11px; font-weight:800; padding:4px 8px; border-radius:999px; margin-left:8px; background: #eef2ff; color: #2563eb; }
@media (max-width: 520px){
  .sa-seg{ display:flex; gap:4px; overflow:auto; padding:4px 6px; }
  .sa-seg button{ padding:6px 10px; font-size:13px; }
}
      `}</style>

      <div className="sa-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={logo} alt="Logo" style={{ height: 40, marginBottom: 4 }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="sa-seg">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                className={active === item.key ? "active" : ""}
                onClick={() => handleClick(item)}
              >
                {item.label}
                {item.count && counts[item.count] !== undefined ? (
                  <span className="sa-badge b-approved">{counts[item.count]}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div style={{ position: "relative" }}>
            <button
              ref={btnRef}
              onClick={() => setOpen((v) => !v)}
              style={USER_BTN}
              aria-haspopup="menu"
              aria-expanded={open ? "true" : "false"}
              title="Account"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 12a5 5 0 100-10 5 5 0 000 10zM21 22a9 9 0 10-18 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>

            {open && (
              <div
                ref={menuRef}
                style={{
                  position: "absolute",
                  right: 0,
                  marginTop: 8,
                  minWidth: 200,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  boxShadow: "0 10px 30px rgba(2,6,23,0.08)",
                  padding: 10,
                  zIndex: 9999,
                }}
                role="menu"
                aria-label="Account menu"
              >
                <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
                  {admin?.name || "Super Admin"}
                </div>
                {admin?.email && (
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{admin.email}</div>
                )}
                <button
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "none",
                    background: "#ef4444",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* The dashboard's `styles.userBtn`, unchanged. */
const USER_BTN = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  padding: "8px 10px",
  borderRadius: 10,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
