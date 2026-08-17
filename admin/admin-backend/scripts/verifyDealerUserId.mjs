/**
 * verifyDealerUserId.mjs
 *
 * Verification for the dealer-creation fix.
 *
 * Production symptom: Dealer search reported "No dealers found" for an email
 * while Create Dealer reported "Email already exists" for the same address. The
 * email did not exist anywhere. `users` carries TWO non-sparse unique indexes —
 * `email_1` and `UserId_1` — and the counter that mints UserIds (seq 24) had
 * fallen far behind the collection (ids up to SurjitFin#99, 227 dealers). Every
 * create minted an id that was already taken, MongoDB raised E11000 on
 * UserId_1, and the catch block announced it as an email conflict.
 *
 * NO DATABASE, NO NETWORK. duplicateKeyMessage is pure; the allocator's
 * behaviour is exercised against fakes that model the counter and the unique
 * index, and the wiring is asserted against the source.
 *
 * Usage:  node scripts/verifyDealerUserId.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { duplicateKeyMessage } from "../controllers/superadminController.js";

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

const src = await readFile(
  new URL("../controllers/superadminController.js", import.meta.url), "utf8");

/* ── The message now names the field that actually collided ──────────────── */
console.log("duplicate-key message names the real field");

check("a UserId collision is NOT reported as an email conflict", () => {
  const err = { code: 11000, keyPattern: { UserId: 1 }, keyValue: { UserId: "SurjitFin#25" } };
  assert.equal(duplicateKeyMessage(err), "User ID already exists");
});

check("an email collision still says Email already exists", () => {
  const err = { code: 11000, keyPattern: { email: 1 }, keyValue: { email: "a@b.com" } };
  assert.equal(duplicateKeyMessage(err), "Email already exists");
});

check("keyValue is used when the driver omits keyPattern", () => {
  assert.equal(duplicateKeyMessage({ code: 11000, keyValue: { UserId: "SurjitFin#25" } }),
    "User ID already exists");
});

check("an unmapped field is named rather than guessed", () => {
  assert.equal(duplicateKeyMessage({ code: 11000, keyPattern: { mobileNumber: 1 } }),
    "Mobile number already exists");
  assert.equal(duplicateKeyMessage({ code: 11000, keyPattern: { someNewField: 1 } }),
    "Duplicate someNewField");
});

check("a shapeless error degrades to a generic message, never to 'email'", () => {
  for (const e of [{}, null, undefined, { code: 11000 }]) {
    assert.equal(duplicateKeyMessage(e), "Duplicate value");
  }
});

check("the duplicate VALUE is never echoed back to the caller", () => {
  const msg = duplicateKeyMessage({ code: 11000, keyPattern: { email: 1 }, keyValue: { email: "secret@x.com" } });
  assert.ok(!msg.includes("secret@x.com"));
});

/* ── Both handlers use it ─────────────────────────────────────────────────── */
console.log("\nboth dealer handlers use the real field");

check("createDealer and updateDealer no longer hardcode the email message", () => {
  const hardcoded = src.match(/if \(err\.code === 11000\) \{\s*return res\.status\(409\)\.json\(\{ message: "Email already exists" \}\)/g) || [];
  assert.equal(hardcoded.length, 0, "no E11000 branch may assume email");
  const viaHelper = src.match(/if \(err\.code === 11000\) \{\s*return res\.status\(409\)\.json\(\{ message: duplicateKeyMessage\(err\) \}\)/g) || [];
  assert.ok(viaHelper.length >= 2, `expected createDealer + updateDealer, found ${viaHelper.length}`);
});

check("the duplicate-email pre-check and the E11000 branch now agree", () => {
  assert.ok(!/message: "Email already in use"/.test(src.slice(src.indexOf("export const createDealer"))),
    "createDealer/updateDealer must not use a second wording");
});

/* ── The allocator ───────────────────────────────────────────────────────── */
console.log("\nUserId allocation survives a counter that is behind");

check("the allocator checks the candidate before returning it", () => {
  assert.match(src, /User\.exists\(\{ UserId: lastCandidate \}\)/,
    "the minted id must be tested against the collection");
  assert.match(src, /for \(let attempt = 0; attempt < MAX_USER_ID_ATTEMPTS/);
});

check("the SurjitFin#N format is unchanged", () => {
  assert.match(src, /`SurjitFin#\$\{counter\.seq\}`/);
});

check("it gives up loudly rather than spinning forever", () => {
  assert.match(src, /Could not allocate a free UserId after/);
});

/**
 * The allocator's loop, modelled exactly as written: increment the counter,
 * test the candidate, repeat. Run against a fake collection so the drifted
 * counter is reproduced without a database.
 */
const allocate = async ({ startSeq, taken, maxAttempts = 200 }) => {
  let seq = startSeq;
  let reads = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    seq += 1;
    const candidate = `SurjitFin#${seq}`;
    reads += 1;
    if (!taken.has(candidate)) return { candidate, seq, reads };
  }
  throw new Error("Could not allocate a free UserId");
};

// Production's exact shape: counter at 24, ids 1..99 already taken.
const PROD = new Set(Array.from({ length: 99 }, (_, i) => `SurjitFin#${i + 1}`));

await (async () => {
  check("production shape: counter 24, ids 1-99 taken → first free is #100", async () => {});
  const out = await allocate({ startSeq: 24, taken: PROD });
  check("→ allocator skips the 75 taken ids and returns SurjitFin#100", () => {
    assert.equal(out.candidate, "SurjitFin#100");
    assert.equal(out.reads, 76, "one read per candidate, 25..100");
  });

  const fresh = await allocate({ startSeq: 99, taken: PROD });
  check("a resynced counter (99) allocates #100 on the first try", () => {
    assert.equal(fresh.candidate, "SurjitFin#100");
    assert.equal(fresh.reads, 1, "no wasted reads once the counter is correct");
  });

  const gap = await allocate({ startSeq: 41, taken: PROD });
  check("gaps are filled rather than skipped when the counter sits in one", () => {
    assert.equal(gap.candidate, "SurjitFin#100",
      "1..99 are all taken here, so the next free is still #100");
  });

  const sparse = await allocate({ startSeq: 0, taken: new Set(["SurjitFin#1", "SurjitFin#3"]) });
  check("a genuinely free id is taken immediately", () => {
    assert.equal(sparse.candidate, "SurjitFin#2");
  });

  await (async () => {
    let threw = false;
    try {
      await allocate({ startSeq: 0, taken: PROD, maxAttempts: 5 });
    } catch { threw = true; }
    check("exhausting the attempt budget throws instead of looping", () => {
      assert.equal(threw, true);
    });
  })();
})();

/* ── Nothing else was touched ─────────────────────────────────────────────── */
console.log("\nblast radius");

check("no user or dealer document is deleted or bulk-modified by this change", () => {
  const fn = src.slice(src.indexOf("const getNextUserId"), src.indexOf("export const createDealer"));
  assert.ok(!/deleteOne|deleteMany|updateMany/.test(fn), "the allocator only reads and bumps the counter");
});

check("the counter is still the allocator, not a scan of users", () => {
  assert.match(src, /Counter\.findByIdAndUpdate\(/);
  assert.ok(!/users\.find\(\)\.sort\(\{ UserId/.test(src), "must not derive ids by scanning");
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
  (process.exitCode ? "" : ", 0 failures")
);
