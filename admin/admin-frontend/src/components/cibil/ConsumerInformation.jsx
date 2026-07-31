import React from "react";
import { show, NA, DASH } from "./format";
import { Fields } from "./ui";

/**
 * Consumer identity box — two field columns, identity on the left and
 * identifiers on the right, in the bureau's field order.
 */
export default function ConsumerInformation({ consumer }) {
  const id = consumer.identification;
  const address = consumer.addresses.length ? consumer.addresses[0].line : null;

  const left = [
    ["Consumer Name", show(consumer.name)],
    ["DOB", show(consumer.dob)],
    ["Age", show(consumer.age)],
    ["Telephone No.", consumer.telephones.length ? consumer.telephones[0].number : DASH],
    ["Email ID", consumer.emails.length ? consumer.emails[0] : DASH],
    ["Gender", show(consumer.gender)],
    ["Address", show(address)],
  ];
  const right = [
    ["PAN", show(id.pan)],
    ["Driving Licence No", show(id.drivingLicence, NA)],
    ["Voter ID", show(id.voterId)],
    ["Passport No.", show(id.passport, NA)],
    ["Aadhaar Number (UID)", show(id.aadhaar, NA)],
    ["CKYC", show(id.ckyc)],
  ];

  return (
    <section className="cr-section">
      <h2 className="cr-h2">Consumer Information</h2>
      <div className="cr-box">
        <div className="cr-grid-2">
          <Fields rows={left} />
          <Fields rows={right} />
        </div>
      </div>
    </section>
  );
}
