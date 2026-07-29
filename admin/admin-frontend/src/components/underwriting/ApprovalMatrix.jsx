import React from "react";
import { show } from "../cibil/format";

/** Sign-off grid. Blank cells are intentional: completed on the printed copy. */
export default function ApprovalMatrix({ approvals }) {
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Approval Matrix</h2>
      <table className="cr-table uw-matrix">
        <thead>
          <tr><th>Role</th><th>Name</th><th>Decision</th><th>Remarks</th><th>Signature</th><th>Date</th></tr>
        </thead>
        <tbody>
          {approvals.map((a) => (
            <tr key={a.role}>
              <td><strong>{a.role}</strong></td>
              <td>{show(a.name, "")}</td>
              <td>{show(a.decision, "")}</td>
              <td>{show(a.remarks, "")}</td>
              <td className="uw-sign" />
              <td>{show(a.date, "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
