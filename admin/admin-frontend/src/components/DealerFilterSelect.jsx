import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * DealerFilterSelect — a searchable dealer dropdown.
 *
 * The project has no combobox component, and a plain <select> over hundreds of
 * dealers is unusable, so this is a minimal one built from the Bootstrap form
 * controls the admin pages already use (`form-control`), with no new dependency.
 *
 * Filtering the OPTION LIST is local and intentional — the dealer list is a
 * small reference set already held in memory. The dealer selection itself is
 * then applied server-side by the caller as a query parameter.
 *
 * `value` is a dealer _id (or ""), `onChange` receives the id.
 */
export default function DealerFilterSelect({
  dealers = [],
  value = "",
  onChange,
  placeholder = "Select Dealer",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);

  const selected = useMemo(
    () => dealers.find((d) => String(d._id) === String(value)) || null,
    [dealers, value]
  );

  // Close on outside click — same interaction the Navbar dropdown uses.
  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const label = (d) => {
    const name = d?.name || d?.UserId || d?.email || "Unnamed dealer";
    const branch = d?.Branch || d?.branch;
    return branch ? `${name} — ${branch}` : name;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dealers;
    return dealers.filter((d) => label(d).toLowerCase().includes(q));
  }, [dealers, query]);

  const pick = (id) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", minWidth: 240 }}>
      <button
        type="button"
        className="form-control"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          textAlign: "left",
          background: "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          color: selected ? "#0f172a" : "#6B7280",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? label(selected) : placeholder}
        </span>
        <span style={{ fontSize: 10, color: "#94A3B8" }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 40,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: 10,
            boxShadow: "0 14px 36px rgba(0,0,0,.08)",
            padding: 8,
          }}
        >
          <input
            className="form-control"
            autoFocus
            placeholder="Search dealer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 6 }}
          />

          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            <button type="button" style={optionStyle(!value)} onClick={() => pick("")}>
              All dealers
            </button>

            {filtered.length === 0 ? (
              <div style={{ padding: "10px 8px", color: "#94A3B8", fontSize: 13 }}>
                No dealers found.
              </div>
            ) : (
              filtered.map((d) => (
                <button
                  key={d._id}
                  type="button"
                  style={optionStyle(String(d._id) === String(value))}
                  onClick={() => pick(d._id)}
                >
                  {label(d)}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const optionStyle = (active) => ({
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 10px",
  border: 0,
  borderRadius: 8,
  fontSize: 13.5,
  fontWeight: active ? 800 : 500,
  color: active ? "#0B1F4D" : "#0f172a",
  background: active ? "#EEF2FF" : "#fff",
  cursor: "pointer",
});
