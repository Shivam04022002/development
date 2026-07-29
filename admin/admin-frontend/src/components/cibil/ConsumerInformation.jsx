import React from "react";
import { show, NA, DASH } from "./format";

/** Two-column consumer identity block. */
export default function ConsumerInformation({ consumer }) {
  const id = consumer.identification;
  const left = [
    ["Consumer Name", show(consumer.name)],
    ["Date of Birth", show(consumer.dob)],
    ["Age", show(consumer.age)],
    ["Gender", show(consumer.gender)],
    ["Telephone", consumer.telephones.length ? consumer.telephones[0].number : DASH],
    ["Email", consumer.emails.length ? consumer.emails[0] : DASH],
  ];
  const right = [
    ["PAN", show(id.pan)],
    ["Aadhaar (UID)", show(id.aadhaar, NA)],
    ["Voter ID", show(id.voterId)],
    ["Passport No.", show(id.passport, NA)],
    ["Driving Licence", show(id.drivingLicence, NA)],
    ["CKYC", show(id.ckyc)],
  ];
  const address = consumer.addresses.length ? consumer.addresses[0].line : null;

  return (
    <section className="cr-section">
      <h2 className="cr-h2">Consumer Information</h2>
      <div className="cr-grid-2">
        <table className="cr-kv-table"><tbody>
          {left.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody></table>
        <table className="cr-kv-table"><tbody>
          {right.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody></table>
      </div>
      <table className="cr-kv-table cr-kv-wide"><tbody>
        <tr><th>Address</th><td>{show(address)}</td></tr>
      </tbody></table>
    </section>
  );
}
