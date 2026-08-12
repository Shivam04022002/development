/**
 * verifyOptionalPanCibil.mjs
 *
 * PAN is optional for a bureau pull. The identity the vendor requires is
 * mobile, forename, surname and date of birth; a PAN sharpens the match when
 * present and is simply omitted when it is not.
 *
 * This is verified, not assumed. On 2026-08-12 a request carrying only
 * client_key, request_key, partner_customer_id, forename, surname,
 * date_of_birth and phone_number — no pan_id at all — was sent to Xaler from
 * Postman and returned HTTP 200: status "success", message "CIBIL report
 * ready", diagnosis.code SUCCESS, retryable false. Those seven fields are
 * pinned below as an exact set.
 *
 * That makes PAN unusable as the sole subject identifier, and subjectPan is
 * exactly that — the second half of the { applicationId, subjectPan } unique
 * index, the match key for cibilSubjects, and how both UIs decide whose score
 * they are showing. A PAN-less subject therefore gets a DERIVED key.
 *
 * This suite covers the two halves of that change:
 *   1. the request body — pan_id present or absent, never empty;
 *   2. the derived key — stable, distinct from any PAN, and computed
 *      IDENTICALLY by the backend and the admin frontend, which each hold
 *      their own copy of the rule.
 *
 * NO NETWORK, NO VENDOR, NO DATABASE — every function here is pure.
 *
 * Usage:  node scripts/verifyOptionalPanCibil.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildRequestBody } from "../services/xalerCibilService.js";
import {
  partySubjectKey,
  hasRequiredIdentity,
  partyIdentity,
  normalizeMobile,
  normalizeDob,
  subjectDigest,
  subjectKeySource,
  normalizeName,
  normalizePan,
} from "../models/cibilSubjectSchemas.js";
// The other two copies of the same rule. Both are deliberate duplicates — the
// admin UI must run in a browser and the mobile app in React Native, neither
// can import from this package — so they are pulled in here and compared
// directly. Nothing else stops all three from silently drifting apart, and a
// drift means a report is written under one key and looked up under another.
import * as ui from "../../admin-frontend/src/utils/cibilSubjects.js";
import * as apk from "../../../native-app/DealerLogin/utils/cibilSubjectKey.js";

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
};

const WITH_PAN = {
  name: "Asha Verma",
  panNo: "ABCDE1234F",
  mobile: "9876543210",
  dateOfBirth: "1988-03-14T00:00:00.000Z",
};
const NO_PAN = { name: "Asha Verma", mobile: "9876543210", dateOfBirth: "1988-03-14T00:00:00.000Z" };

console.log("request body — pan_id is optional, never empty");

check("pan_id is included when a PAN is on file", () => {
  const body = buildRequestBody(WITH_PAN, "req-1");
  assert.equal(body.pan_id, "ABCDE1234F");
});

check("pan_id is OMITTED — not sent as \"\" — when there is none", () => {
  const body = buildRequestBody(NO_PAN, "req-1");
  assert.equal("pan_id" in body, false, "the key must be absent, not empty");
  assert.equal(JSON.stringify(body).includes("pan_id"), false);
});

check("a blank or whitespace PAN counts as absent", () => {
  for (const pan of ["", "   ", null, undefined]) {
    assert.equal("pan_id" in buildRequestBody({ ...NO_PAN, panNo: pan }, "r"), false, `for ${JSON.stringify(pan)}`);
  }
});

check("a PAN is normalised into the request", () => {
  assert.equal(buildRequestBody({ ...NO_PAN, panNo: " abcde1234f " }, "r").pan_id, "ABCDE1234F");
});

check("the required identity is always sent, with or without a PAN", () => {
  for (const party of [WITH_PAN, NO_PAN]) {
    const body = buildRequestBody(party, "req-1");
    assert.equal(body.forename, "Asha");
    assert.equal(body.surname, "Verma");
    assert.equal(body.date_of_birth, "1988-03-14", "leading date part, no timezone shift");
    assert.equal(body.phone_number, "9876543210");
    assert.equal(body.client_key, "req-1");
    assert.equal(body.request_key, "req-1");
    assert.equal(body.partner_customer_id, "req-1");
  }
});

check("no field beyond the documented set is introduced", () => {
  const withPan = Object.keys(buildRequestBody(WITH_PAN, "r")).sort();
  const without = Object.keys(buildRequestBody(NO_PAN, "r")).sort();
  assert.deepEqual(withPan, [
    "client_key", "date_of_birth", "forename", "pan_id",
    "partner_customer_id", "phone_number", "request_key", "surname",
  ]);
  assert.deepEqual(without, withPan.filter((k) => k !== "pan_id"),
    "the PAN-less body is the same body minus pan_id");
});

/**
 * The PAN-less body is pinned to the request shape verified directly against
 * Xaler in Postman on 2026-08-12, which returned HTTP 200 with
 * status "success", diagnosis.code SUCCESS and retryable false. These SEVEN
 * fields, and no eighth, are what the vendor accepted without a PAN.
 *
 * Pinned as an exact set rather than a subset: an extra field would be a
 * request the vendor has never been shown, and a missing one would be a
 * request it has never accepted.
 */
const VERIFIED_PANLESS_FIELDS = [
  "client_key",
  "request_key",
  "partner_customer_id",
  "forename",
  "surname",
  "date_of_birth",
  "phone_number",
];

check("the PAN-less body matches the Postman-verified request exactly", () => {
  const body = buildRequestBody(NO_PAN, "req-verified");
  assert.deepEqual(
    Object.keys(body).sort(),
    [...VERIFIED_PANLESS_FIELDS].sort(),
    "must be exactly the seven fields Xaler accepted — no more, no fewer"
  );
  for (const f of VERIFIED_PANLESS_FIELDS) {
    assert.notEqual(body[f], undefined, `${f} must carry a value`);
    assert.notEqual(String(body[f]).trim(), "", `${f} must not be blank`);
  }
});

check("the verified shape never regains pan_id by any route", () => {
  // A PAN that is absent, blank, whitespace, null or undefined must all produce
  // the same seven-field body. An empty or null pan_id was never verified and
  // must never be sent.
  for (const panNo of [undefined, null, "", "   ", "\t\n"]) {
    const body = buildRequestBody({ ...NO_PAN, panNo }, "r");
    assert.deepEqual(Object.keys(body).sort(), [...VERIFIED_PANLESS_FIELDS].sort(),
      `panNo=${JSON.stringify(panNo)} must not add pan_id`);
    const serialised = JSON.stringify(body);
    assert.ok(!serialised.includes("pan_id"), "pan_id absent from the wire payload");
    assert.ok(!serialised.includes("null"), "no null identifier is transmitted");
  }
});

check("no PAN is ever invented when one is absent", () => {
  const body = buildRequestBody(NO_PAN, "r");
  const serialised = JSON.stringify(body);
  assert.doesNotMatch(serialised, /[A-Z]{5}[0-9]{4}[A-Z]/, "nothing PAN-shaped appears in the body");
});

check("the PAN case adds pan_id to that same shape and nothing else", () => {
  const body = buildRequestBody(WITH_PAN, "r");
  assert.deepEqual(
    Object.keys(body).sort(),
    [...VERIFIED_PANLESS_FIELDS, "pan_id"].sort(),
    "the verified seven plus pan_id"
  );
});

console.log("\nrequired identity");

check("all four fields are required; PAN is not one of them", () => {
  assert.equal(hasRequiredIdentity(NO_PAN), true, "no PAN is fine");
  assert.equal(hasRequiredIdentity(WITH_PAN), true);
  assert.equal(hasRequiredIdentity({ ...NO_PAN, mobile: undefined }), false, "mobile required");
  assert.equal(hasRequiredIdentity({ ...NO_PAN, dateOfBirth: undefined }), false, "DOB required");
  assert.equal(hasRequiredIdentity({ ...NO_PAN, name: "Asha" }), false, "surname required");
  assert.equal(hasRequiredIdentity({}), false);
});

check("a PAN does NOT substitute for the required identity", () => {
  // Behaviour change, stated explicitly: before this phase a co-applicant with
  // only a PAN and a name was fetched. The vendor cannot match on that, so it
  // is now refused rather than paid for.
  assert.equal(hasRequiredIdentity({ name: "Asha Verma", panNo: "ABCDE1234F" }), false);
});

check("mobile is normalised to its last ten digits", () => {
  for (const m of ["9876543210", "+91 98765 43210", "09876543210", "91-9876543210"]) {
    assert.equal(normalizeMobile(m), "9876543210", m);
  }
  assert.equal(normalizeMobile("12345"), "12345", "short numbers are not padded");
  assert.equal(hasRequiredIdentity({ ...NO_PAN, mobile: "12345" }), false, "and do not qualify");
});

check("DOB accepts a full ISO timestamp or a bare date", () => {
  assert.equal(normalizeDob("1988-03-14T00:00:00.000Z"), "1988-03-14");
  assert.equal(normalizeDob("1988-03-14"), "1988-03-14");
  assert.equal(normalizeDob("14/03/1988"), "", "an unparseable format is not guessed");
});

check("firstName / surname fields win over splitting the name", () => {
  const id = partyIdentity({ firstName: "Asha", surname: "Verma", name: "Wrong Name" });
  assert.equal(id.forename, "Asha");
  assert.equal(id.surname, "Verma");
  // A multi-part surname survives the split.
  assert.equal(partyIdentity({ name: "Asha Devi Verma" }).surname, "Devi Verma");
});

console.log("\nthe derived subject key");

check("a PAN, when present, remains the key — existing records are untouched", () => {
  assert.equal(partySubjectKey(WITH_PAN), "ABCDE1234F");
  assert.equal(partySubjectKey({ panNo: " abcde1234f " }), "ABCDE1234F");
});

check("a PAN-less subject gets a derived key, never the empty string", () => {
  const key = partySubjectKey(NO_PAN);
  assert.match(key, /^K:[0-9A-F]{8}$/);
  assert.notEqual(key, "", "\"\" is the legacy \"unattributed = applicant\" slot and must stay free");
});

check("a derived key can never be mistaken for a PAN", () => {
  const key = partySubjectKey(NO_PAN);
  assert.doesNotMatch(key, /^[A-Z]{5}[0-9]{4}[A-Z]$/, "not PAN-shaped");
  assert.ok(key.includes(":"), "a PAN contains no colon");
});

check("normalizePan is a no-op on a derived key", () => {
  // Every stored-subject comparison in this repo runs through normalizePan.
  const key = partySubjectKey(NO_PAN);
  assert.equal(normalizePan(key), key, "upper-case hex keeps those comparisons working unchanged");
});

check("the key is stable across formatting differences of the same person", () => {
  const a = partySubjectKey({ name: "Asha Verma", mobile: "9876543210", dateOfBirth: "1988-03-14" });
  const b = partySubjectKey({ name: "  asha   verma ", mobile: "+91 98765 43210", dateOfBirth: "1988-03-14T09:30:00Z" });
  const c = partySubjectKey({ firstName: "ASHA", surname: "VERMA", mobile: "09876543210", dateOfBirth: "1988-03-14" });
  assert.equal(a, b, "case, spacing and +91 differences must not change the key");
  assert.equal(a, c, "split name and firstName/surname fields agree");
});

check("different people get different keys", () => {
  const a = partySubjectKey(NO_PAN);
  const b = partySubjectKey({ ...NO_PAN, mobile: "9000000001" });
  const c = partySubjectKey({ ...NO_PAN, dateOfBirth: "1990-01-01" });
  assert.equal(new Set([a, b, c]).size, 3);
});

check("an unidentifiable party yields no key at all", () => {
  assert.equal(partySubjectKey({ name: "Asha Verma" }), "", "callers must refuse to fetch");
  assert.equal(partySubjectKey({}), "");
});

check("an applicant with no PAN still keys to \"\" — legacy behaviour preserved", () => {
  // partySubjectPan, used by the applicant flow, is deliberately unchanged, so
  // the "unattributed summary belongs to the applicant" rule still holds and a
  // PAN-less applicant cannot collide with a PAN-less co-applicant's K: key.
  const co = partySubjectKey(NO_PAN);
  assert.notEqual(co, "", "the co-applicant is keyed away from the applicant's legacy slot");
});

console.log("\nall four identity fields feed the key");

check("the hashed source is mobile | first | last | dob", () => {
  assert.equal(subjectKeySource(NO_PAN), "9876543210|ASHA|VERMA|1988-03-14");
});

check("two people sharing a household mobile get different keys", () => {
  const a = { name: "Asha Verma", mobile: "9876543210", dateOfBirth: "1988-03-14" };
  const b = { name: "Ravi Verma", mobile: "9876543210", dateOfBirth: "1988-03-14" };
  assert.notEqual(partySubjectKey(a), partySubjectKey(b), "the forename must matter");
});

check("a different surname, mobile or DOB each changes the key", () => {
  const base = { name: "Asha Verma", mobile: "9876543210", dateOfBirth: "1988-03-14" };
  const variants = [
    { ...base, name: "Asha Kumar" },
    { ...base, mobile: "9000000001" },
    { ...base, dateOfBirth: "1990-01-01" },
  ];
  const keys = new Set([partySubjectKey(base), ...variants.map(partySubjectKey)]);
  assert.equal(keys.size, 4, "every field participates in the digest");
});

console.log("\nbackend, admin UI and native app must not diverge");

const COPIES = { "admin UI": ui, "native app": apk };

check("both copies export the same helpers", () => {
  for (const [label, mod] of Object.entries(COPIES)) {
    for (const fn of ["partySubjectKey", "hasRequiredIdentity", "partyIdentity", "subjectKeySource",
                      "normalizeMobile", "normalizeDob", "normalizeName", "subjectDigest"]) {
      assert.equal(typeof mod[fn], "function", `${label} is missing ${fn}`);
    }
  }
});

check("the derived key is byte-identical in all three codebases", () => {
  const parties = [
    NO_PAN,
    { name: "Asha Verma", mobile: "+91 98765 43210", dateOfBirth: "1988-03-14T09:30:00Z" },
    { name: "  asha   verma ", mobile: "09876543210", dateOfBirth: "1988-03-14" },
    { firstName: "Ravi", surname: "Kumar", mobile: "9000000001", dateOfBirth: "1970-12-31" },
    { name: "Asha Devi Verma", mobile: "9000000003", dateOfBirth: "1999-09-09" },
    { applicant: { name: "Nested Person", mobile: "9000000002", dateOfBirth: "2000-06-06" } },
    WITH_PAN,
    { panNo: " abcde1234f ", name: "Asha Verma", mobile: "9876543210", dateOfBirth: "1988-03-14" },
    { name: "Asha Verma" },
    { name: "Asha", mobile: "9876543210", dateOfBirth: "1988-03-14" },
    {},
  ];
  for (const [label, mod] of Object.entries(COPIES)) {
    for (const p of parties) {
      assert.equal(mod.partySubjectKey(p), partySubjectKey(p),
        `${label} key mismatch for ${JSON.stringify(p)} — a report would be stored under one key and read under another`);
      assert.equal(mod.subjectKeySource(p), subjectKeySource(p),
        `${label} canonicalisation mismatch for ${JSON.stringify(p)}`);
      assert.equal(mod.hasRequiredIdentity(p), hasRequiredIdentity(p),
        `${label} eligibility mismatch for ${JSON.stringify(p)}`);
    }
  }
});

check("the digest itself agrees on a range of inputs", () => {
  for (const s of ["", "a", "9876543210|ASHA|VERMA|1988-03-14", "éè", "x".repeat(500)]) {
    for (const [label, mod] of Object.entries(COPIES)) {
      assert.equal(mod.subjectDigest(s), subjectDigest(s),
        `${label} digest mismatch for ${JSON.stringify(s.slice(0, 24))}`);
    }
  }
});

check("normalisation helpers agree field by field", () => {
  const mobiles = ["9876543210", "+91 98765 43210", "09876543210", "", "12345"];
  const dobs = ["1988-03-14T00:00:00.000Z", "1988-03-14", "14/03/1988", ""];
  const names = ["  asha   verma ", "ASHA", "", "Devi  Verma"];
  for (const [label, mod] of Object.entries(COPIES)) {
    for (const m of mobiles) assert.equal(mod.normalizeMobile(m), normalizeMobile(m), `${label} mobile ${m}`);
    for (const d of dobs) assert.equal(mod.normalizeDob(d), normalizeDob(d), `${label} dob ${d}`);
    for (const n of names) assert.equal(mod.normalizeName(n), normalizeName(n), `${label} name ${n}`);
  }
});

console.log("\nthe UI resolves a PAN-less subject to its own report");

check("a PAN-less co-applicant sees their own score, not the applicant's", () => {
  const coParty = NO_PAN;
  const key = partySubjectKey(coParty);
  const app = {
    applicant: { name: "App Licant", panNo: "AAAAA1111A" },
    coApplicant: coParty,
    cibil: { score: 800, subjectPan: "AAAAA1111A" },
    cibilSubjects: [
      { subjectPan: "AAAAA1111A", score: 800 },
      { subjectPan: key, score: 615 },
    ],
  };
  const co = ui.subjectSummary(app, coParty, false);
  assert.equal(co.available, true, "the derived-key entry is found");
  assert.equal(co.summary.score, 615);

  const applicant = ui.subjectSummary(app, app.applicant, true);
  assert.equal(applicant.summary.score, 800, "and the applicant is unaffected");
});

check("a PAN-less co-applicant with no report of their own still shows nothing", () => {
  const app = {
    applicant: { name: "App Licant", panNo: "AAAAA1111A" },
    coApplicant: NO_PAN,
    cibil: { score: 800, subjectPan: "AAAAA1111A" },
    cibilSubjects: [{ subjectPan: "AAAAA1111A", score: 800 }],
  };
  const co = ui.subjectSummary(app, NO_PAN, false);
  assert.equal(co.available, false);
  assert.deepEqual(co.summary, {}, "never the applicant's");
});

check("an unattributed legacy summary still cannot be claimed by a PAN-less co-applicant", () => {
  const app = {
    applicant: { name: "App Licant", panNo: "AAAAA1111A" },
    coApplicant: NO_PAN,
    cibil: { score: 700, requestId: "legacy" },   // no subjectPan
  };
  assert.equal(ui.subjectSummary(app, app.applicant, true).available, true, "the applicant's, as before");
  assert.equal(ui.subjectSummary(app, NO_PAN, false).available, false, "not the co-applicant's");
});

console.log("\nnative app resolves the same four cases");

/**
 * The mobile screen is a React Native component and cannot be imported here,
 * so its resolution function is EXTRACTED FROM THE REAL FILE and evaluated.
 * Nothing is re-typed: if the screen changes, this changes with it.
 */
const screenSrc = readFileSync(
  new URL("../../../native-app/DealerLogin/screens/ViewLoanApplicationScreen.js", import.meta.url),
  "utf8"
).replace(/\r\n/g, "\n");

const summaryForSrc = (() => {
  const a = screenSrc.indexOf("  const summaryFor = (party, isApplicant) => {");
  assert.notEqual(a, -1, "could not locate summaryFor in the real screen");
  const b = screenSrc.indexOf("\n  };", a);
  assert.notEqual(b, -1, "could not locate the end of summaryFor");
  return screenSrc.slice(a, b + 5);
})();

const apkResolve = (application, party, isApplicant) => {
  const cibil = application.cibil || {};
  const cibilSubjects = Array.isArray(application.cibilSubjects) ? application.cibilSubjects : [];
  const legacySubjectPan = apk.normalizePan(cibil.subjectPan);
  const fn = new Function(
    "cibil", "cibilSubjects", "legacySubjectPan", "partySubjectKey", "normalizePan",
    `${summaryForSrc}\n  return summaryFor;`
  )(cibil, cibilSubjects, legacySubjectPan, apk.partySubjectKey, apk.normalizePan);
  return fn(party, isApplicant);
};

const APPLICANT_WITH_PAN = { name: "App Licant", panNo: "AAAAA1111A", mobile: "9000000001", dateOfBirth: "1970-01-01" };
const APPLICANT_NO_PAN = { name: "App Licant", mobile: "9000000001", dateOfBirth: "1970-01-01" };
const CO_WITH_PAN = { name: "Co Applicant", panNo: "BBBBB2222B", mobile: "9000000002", dateOfBirth: "1980-02-02" };
const CO_NO_PAN = { name: "Co Applicant", mobile: "9000000002", dateOfBirth: "1980-02-02" };

/** Both parties hold a report, each under whatever key they resolve to. */
const appWith = (applicant, coApplicant) => ({
  applicant,
  coApplicant,
  cibil: { score: 800, subjectPan: partySubjectKey(applicant) },
  cibilSubjects: [
    { subjectPan: partySubjectKey(applicant), score: 800 },
    { subjectPan: partySubjectKey(coApplicant), score: 615 },
  ],
});

check("APK: applicant WITH PAN, co-applicant WITH PAN", () => {
  const app = appWith(APPLICANT_WITH_PAN, CO_WITH_PAN);
  assert.equal(apkResolve(app, app.applicant, true).score, 800);
  assert.equal(apkResolve(app, app.coApplicant, false).score, 615);
});

check("APK: applicant WITHOUT PAN still shows their own report", () => {
  const app = appWith(APPLICANT_NO_PAN, CO_WITH_PAN);
  assert.equal(apkResolve(app, app.applicant, true).score, 800);
  assert.equal(apkResolve(app, app.coApplicant, false).score, 615);
});

check("APK: co-applicant WITHOUT PAN still shows their own report", () => {
  const app = appWith(APPLICANT_WITH_PAN, CO_NO_PAN);
  assert.equal(apkResolve(app, app.coApplicant, false).score, 615, "matched on the derived key");
  assert.equal(apkResolve(app, app.applicant, true).score, 800);
});

check("APK: neither party has a PAN — both still resolve, and separately", () => {
  const app = appWith(APPLICANT_NO_PAN, CO_NO_PAN);
  assert.notEqual(partySubjectKey(APPLICANT_NO_PAN), partySubjectKey(CO_NO_PAN));
  assert.equal(apkResolve(app, app.applicant, true).score, 800);
  assert.equal(apkResolve(app, app.coApplicant, false).score, 615);
});

console.log("\nsubject isolation — no fallback in either direction");

for (const [label, resolve] of [
  ["APK", apkResolve],
  ["admin UI", (app, party, isApplicant) => ui.subjectSummary(app, party, isApplicant).summary],
]) {
  check(`${label}: a PAN-less co-applicant with no report never shows the applicant's`, () => {
    const app = {
      applicant: APPLICANT_WITH_PAN,
      coApplicant: CO_NO_PAN,
      cibil: { score: 800, subjectPan: "AAAAA1111A" },
      cibilSubjects: [{ subjectPan: "AAAAA1111A", score: 800 }],
    };
    const co = resolve(app, app.coApplicant, false);
    assert.notEqual(co.score, 800, "the applicant's score must not leak into the co-applicant view");
    assert.ok(co.score === undefined || co.score === null);
  });

  check(`${label}: an applicant with no report never shows the co-applicant's`, () => {
    const app = {
      applicant: APPLICANT_NO_PAN,
      coApplicant: CO_WITH_PAN,
      cibil: {},
      cibilSubjects: [{ subjectPan: "BBBBB2222B", score: 615 }],
    };
    const applicant = resolve(app, app.applicant, true);
    assert.notEqual(applicant.score, 615, "no fallback from applicant to co-applicant");
  });

  check(`${label}: an unattributed legacy summary stays the applicant's alone`, () => {
    const app = {
      applicant: APPLICANT_WITH_PAN,
      coApplicant: CO_NO_PAN,
      cibil: { score: 700, requestId: "legacy" },   // no subjectPan
    };
    assert.equal(resolve(app, app.applicant, true).score, 700, "legacy behaviour preserved");
    assert.notEqual(resolve(app, app.coApplicant, false).score, 700, "cannot be claimed");
  });

  check(`${label}: an existing PAN-keyed report still displays unchanged`, () => {
    const app = {
      applicant: APPLICANT_WITH_PAN,
      coApplicant: CO_WITH_PAN,
      cibil: { score: 774, subjectPan: "AAAAA1111A", requestId: "tu_1" },
      cibilSubjects: [{ subjectPan: "AAAAA1111A", score: 774, requestId: "tu_1" }],
    };
    assert.equal(resolve(app, app.applicant, true).score, 774, "backward compatible");
  });
}

console.log("\nno retry, no vendor call");

check("nothing in this module performs a request or schedules a retry", () => {
  const key = readFileSync(new URL("../models/cibilSubjectSchemas.js", import.meta.url), "utf8");
  for (const forbidden of [/\bfetch\s*\(/, /axios/, /setTimeout/, /setInterval/, /retry/i]) {
    assert.doesNotMatch(key, forbidden, `subject keying must not contain ${forbidden}`);
  }
  // buildRequestBody constructs a body; it does not send it.
  const xaler = readFileSync(new URL("../services/xalerCibilService.js", import.meta.url), "utf8");
  const builder = xaler.slice(xaler.indexOf("export function buildRequestBody"));
  assert.doesNotMatch(builder.slice(0, builder.indexOf("\n}")), /fetch\s*\(/, "the builder sends nothing");
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
    (process.exitCode ? "" : ", 0 failures")
);
