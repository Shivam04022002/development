import React from "react";
import { show } from "../cibil/format";

export default function CustomerProfile({ customer }) {
  const left = [
    ["Customer Name", show(customer.name)],
    ["Father / Husband Name", show(customer.fatherName)],
    ["Date of Birth", show(customer.dob)],
    ["Age", customer.age === null ? "-" : `${customer.age} years`],
    ["Gender", show(customer.gender)],
    ["PAN", show(customer.pan)],
  ];
  const right = [
    ["Mobile", show(customer.mobile)],
    ["Email", show(customer.email)],
    ["Occupation", show(customer.occupation, "Not Available")],
    ["Employer", show(customer.employer, "Not Available")],
    ["Branch", show(customer.branch)],
  ];
  return (
    <section className="cr-section">
      <h2 className="cr-h2">Customer Profile</h2>
      <div className="cr-grid-2">
        <table className="cr-kv-table"><tbody>
          {left.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody></table>
        <table className="cr-kv-table"><tbody>
          {right.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody></table>
      </div>
      <table className="cr-kv-table cr-kv-wide"><tbody>
        <tr><th>Address</th><td>{show(customer.address)}</td></tr>
      </tbody></table>
    </section>
  );
}
