import React from "react";

/**
 * Credit Officer and Underwriter remarks. These are not captured by the
 * current Credit Note form, so the boxes print blank for completion by hand
 * rather than showing invented text.
 */
export default function RemarksSection({ remarks }) {
  const box = (title, value) => (
    <div className="uw-remark-block">
      <h3 className="cr-h3">{title}</h3>
      <div className="uw-remarks">{value || ""}</div>
      {!value && <p className="uw-note">Not recorded in the system.</p>}
    </div>
  );
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Remarks</h2>
      {box("Credit Officer Remarks", remarks.creditOfficer)}
      {box("Underwriter Remarks", remarks.underwriter)}
    </section>
  );
}
