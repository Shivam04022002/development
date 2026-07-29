import React from "react";

/** Checklist driven by which documents are present on the application file. */
export default function DocumentsVerified({ documents }) {
  const onFile = documents.filter((d) => d.uploaded).length;
  return (
    <section className="cr-section">
      <h2 className="cr-h2">
        Documents
        <span className="cr-count">{onFile} of {documents.length} on file</span>
      </h2>
      <ul className="uw-doc-grid">
        {documents.map((d) => (
          <li key={d.label}>
            <span className={d.uploaded ? "uw-box uw-box-on" : "uw-box"}>{d.uploaded ? "X" : ""}</span>
            {d.label}
          </li>
        ))}
      </ul>
      <p className="uw-note">
        A ticked box indicates the document is present on the application file. Physical
        verification is recorded by the approving officer on the printed copy.
      </p>
    </section>
  );
}
