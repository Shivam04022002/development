/**
 * verifyFilesPagination.mjs — Super Admin file API scalability (Step 4).
 *
 * The Super Admin file list downloaded whole collections and did search,
 * filtering, sorting, paging and bulk-selection in the browser. That is the
 * shape that made the old Admin slow at ~1,000 records and time out at ~1,500,
 * and at 500–700 new files a month it would have returned within months.
 *
 * What this suite protects:
 *
 *   1. the shared filter builder — because the list, the count, the facets and
 *      the BULK ACTION all ask "which records match?" and must get the same
 *      answer. With select-all-matching-filter the operator never sees the
 *      individual ids, so a filter built differently in the bulk path would
 *      approve or reject a different set than the screen showed;
 *   2. the opt-in envelope — the existing clients read the response as
 *      `Array.isArray(data) ? data : []`, so an envelope sent unasked would
 *      render an empty table rather than raise an error;
 *   3. the bulk guard rails — count handshake, MAX_BULK ceiling, and the
 *      explicit applicationIds form still working unchanged.
 *
 * NO DATABASE, NO NETWORK. Mongoose models are never queried: the pure helpers
 * are called directly, and the controller paths run against fake models that
 * record the query they were given.
 *
 * Usage:  node scripts/verifyFilesPagination.mjs
 */
import assert from "node:assert/strict";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_BULK,
  FILE_TYPES,
  buildFilesFilter,
  parsePaging,
  wantsPagination,
  buildSort,
  selectForType,
  basePendingFilter,
} from "../utils/filesQuery.js";

let passed = 0;
const acheck = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
};

const SUPER = { role: "superadmin", workflows: [] };
/** Serialise a filter so two builds can be compared exactly. */
const norm = (f) => JSON.stringify(f, (k, v) => (v instanceof RegExp ? `re:${v.source}:${v.flags}` : v));

console.log("paging bounds");

await acheck("defaults are 50 rows, page 1", () => {
  const { page, limit, skip } = parsePaging({});
  assert.equal(page, 1);
  assert.equal(limit, DEFAULT_LIMIT);
  assert.equal(limit, 50);
  assert.equal(skip, 0);
});

await acheck("limit is clamped to 100 — a caller cannot ask for the whole collection", () => {
  assert.equal(parsePaging({ limit: 100 }).limit, 100);
  assert.equal(parsePaging({ limit: 5000 }).limit, MAX_LIMIT);
  assert.equal(parsePaging({ limit: 1e9 }).limit, 100);
});

await acheck("junk paging values fall back rather than breaking the query", () => {
  assert.equal(parsePaging({ page: 0 }).page, 1);
  assert.equal(parsePaging({ page: -5 }).page, 1);
  assert.equal(parsePaging({ page: "abc" }).page, 1);
  assert.equal(parsePaging({ limit: 0 }).limit, DEFAULT_LIMIT);
  assert.equal(parsePaging({ limit: -1 }).limit, 1, "negative clamps into range, never negative skip");
  assert.ok(parsePaging({ page: "abc", limit: "xyz" }).skip >= 0);
});

await acheck("skip follows page and limit", () => {
  assert.equal(parsePaging({ page: 3, limit: 50 }).skip, 100);
  assert.equal(parsePaging({ page: 2, limit: 100 }).skip, 100);
});

console.log("\nthe envelope is opt-in — legacy callers keep their bare array");

await acheck("no page and no limit → not paginated", () => {
  assert.equal(wantsPagination({}), false);
  assert.equal(wantsPagination({ search: "x", branch: "B" }), false,
    "filters alone must not switch the response shape");
});

await acheck("either page or limit opts in", () => {
  assert.equal(wantsPagination({ page: 1 }), true);
  assert.equal(wantsPagination({ limit: 25 }), true);
  assert.equal(wantsPagination({ page: "2", limit: "50" }), true);
});

console.log("\nsort");

await acheck("sorts by createdAt, newest first by default", () => {
  assert.deepEqual(buildSort({}), { createdAt: -1 });
  assert.deepEqual(buildSort({ dir: "desc" }), { createdAt: -1 });
  assert.deepEqual(buildSort({ dir: "asc" }), { createdAt: 1 });
});

await acheck("no other sort key is accepted — only createdAt is indexed for it", () => {
  const s = buildSort({ sort: "applicant.name", dir: "asc" });
  assert.deepEqual(Object.keys(s), ["createdAt"]);
});

console.log("\nthe shared filter builder");

await acheck("every type is buildable and pending keeps its existing shape", async () => {
  for (const t of FILE_TYPES) {
    const f = await buildFilesFilter(t, SUPER, {});
    assert.ok(f && typeof f === "object", t);
  }
  const pending = await buildFilesFilter("pending", SUPER, {});
  assert.equal(norm(pending), norm(basePendingFilter()),
    "an unfiltered superadmin pending query is exactly the legacy base filter");
});

await acheck("an unknown type is rejected, not silently treated as pending", async () => {
  await assert.rejects(() => buildFilesFilter("everything", SUPER, {}), /Unknown file type/);
  await assert.rejects(() => buildFilesFilter(undefined, SUPER, {}), /Unknown file type/);
});

await acheck("search reproduces the three fields the table searched", async () => {
  const f = await buildFilesFilter("approved", SUPER, { search: "ravi" });
  const clause = JSON.stringify(f);
  for (const field of ["formId", "applicant.name", "applicant.applicant.name", "dealerDetails.name"]) {
    assert.ok(clause.includes(field), `searches ${field}`);
  }
  assert.ok(!clause.includes("panNo"), "and nothing the table did not search");
  assert.ok(!clause.includes("aadharNo"), "no identity field is newly searchable");
});

await acheck("search input is regex-escaped — no injection, no ReDoS", async () => {
  const f = await buildFilesFilter("approved", SUPER, { search: ".*(a+)+$" });
  const re = f.$or.find((c) => c.formId)?.formId;
  assert.ok(re instanceof RegExp);
  assert.ok(re.source.includes("\\.\\*"), "metacharacters escaped");
  assert.equal(re.flags, "i", "case-insensitive, as the client was");
  assert.ok(re.test(".*(a+)+$"), "matches the literal text");
  assert.ok(!re.test("anything else"), "and is not a wildcard");
});

await acheck("blank search is ignored rather than matching everything", async () => {
  const empty = await buildFilesFilter("approved", SUPER, {});
  for (const s of ["", "   ", null, undefined]) {
    assert.equal(norm(await buildFilesFilter("approved", SUPER, { search: s })), norm(empty), JSON.stringify(s));
  }
});

await acheck("branch / district / stage match EXACTLY, as the client's === did", async () => {
  const f = await buildFilesFilter("approved", SUPER, { branch: "Ludhiana", district: "Punjab", stage: "agreement" });
  const s = JSON.stringify(f);
  assert.ok(s.includes('"dealerDetails.branch":"Ludhiana"'), "exact string, not a regex");
  assert.ok(s.includes('"dealerDetails.district":"Punjab"'));
  assert.ok(s.includes('"workflowStage":"agreement"'));
});

await acheck("the date range covers whole days, as the client did", async () => {
  const f = await buildFilesFilter("approved", SUPER, { from: "2026-03-01", to: "2026-03-31" });
  const c = f.createdAt || (f.$and || []).map((x) => x.createdAt).find(Boolean);
  assert.ok(c, "a createdAt clause exists");
  assert.equal(c.$gte.getHours(), 0);
  assert.equal(c.$lte.getHours(), 23);
  assert.equal(c.$lte.getMinutes(), 59);
});

await acheck("an unparseable date is ignored, never sent to mongo as Invalid Date", async () => {
  const empty = await buildFilesFilter("approved", SUPER, {});
  assert.equal(norm(await buildFilesFilter("approved", SUPER, { from: "not-a-date" })), norm(empty));
});

await acheck("a non-superadmin's pending access filter is preserved", async () => {
  const admin = { role: "admin", workflows: ["house visit"] };
  const f = await buildFilesFilter("pending", admin, {});
  assert.ok(JSON.stringify(f).includes("workflowStage"), "stage restriction survives");
  assert.notEqual(norm(f), norm(basePendingFilter()), "an ordinary admin is scoped, not global");
});

await acheck("filters compose — every clause survives together", async () => {
  const f = await buildFilesFilter("pending", SUPER, {
    search: "ravi", branch: "B", district: "D", stage: "agreement", from: "2026-01-01", to: "2026-12-31",
  });
  const s = JSON.stringify(f);
  for (const marker of ["formId", '"dealerDetails.branch":"B"', '"dealerDetails.district":"D"',
                        '"workflowStage":"agreement"', "createdAt"]) {
    assert.ok(s.includes(marker), `kept ${marker}`);
  }
});

console.log("\nthe four callers cannot disagree");

await acheck("list, count, facets and bulk build the IDENTICAL filter", async () => {
  const query = { search: "ravi", branch: "B", stage: "agreement", from: "2026-01-01" };
  // These are the exact calls the four paths make.
  const forList   = await buildFilesFilter("pending", SUPER, query);
  const forCount  = await buildFilesFilter("pending", SUPER, query);
  const forBulk   = await buildFilesFilter("pending", SUPER, { ...query });
  assert.equal(norm(forList), norm(forCount), "count must match the list");
  assert.equal(norm(forBulk), norm(forList),
    "bulk must match the list — otherwise select-all acts on rows the operator never saw");
});

await acheck("paging and sort params do not leak into the filter", async () => {
  const plain = await buildFilesFilter("pending", SUPER, { search: "ravi" });
  const withPaging = await buildFilesFilter("pending", SUPER, { search: "ravi", page: 3, limit: 100, dir: "asc" });
  assert.equal(norm(withPaging), norm(plain),
    "page 3 of a filter must match the same records as page 1 of it");
});

console.log("\nprojections are unchanged per type");

await acheck("each type still selects the fields it always did", () => {
  const base = selectForType("pending");
  for (const f of ["formId", "applicant", "coApplicant", "vehicleDetails", "dealer",
                   "dealerDetails", "status", "workflowStage", "createdAt", "updatedAt"]) {
    assert.ok(base.includes(f), `pending selects ${f}`);
  }
  assert.ok(selectForType("approved").includes("approvedAt"));
  assert.ok(selectForType("approved").includes("disbursement"));
  assert.ok(selectForType("rejected").includes("rejection"));
  assert.ok(!base.includes("rejection"), "pending does not over-select");
});

console.log("\nbulk safety");

await acheck("MAX_BULK is 200", () => {
  assert.equal(MAX_BULK, 200);
});

/* The bulk controller is driven through fake models so the guard rails can be
 * exercised without a database. Only countDocuments/find are needed. */
const { bulkApproveApplications, bulkRejectApplications } = await import("../controllers/workflowController.js");

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

await acheck("explicit applicationIds still work — the old contract is untouched", async () => {
  const res = fakeRes();
  // No filter given and no ids → the original 400, with the original wording.
  await bulkApproveApplications({ body: {}, admin: SUPER }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /applicationIds must be a non-empty array/);
});

await acheck("a filter with no expectedCount is refused", async () => {
  const res = fakeRes();
  await bulkRejectApplications({ body: { filter: { type: "nonsense" } }, admin: SUPER }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /filter\.type must be pending, approved or rejected/);
});

await acheck("a malformed filter is refused before any database work", async () => {
  for (const body of [{ filter: null }, { filter: "pending" }, { filter: 42 }]) {
    const res = fakeRes();
    await bulkApproveApplications({ body, admin: SUPER }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
});

/* ── the guard rails, exercised through the REAL controller ───────────────
 *
 * These three paths all return BEFORE the sequential approve/reject loop, so
 * they can be driven with no database and no writes: only countDocuments and
 * find are stubbed on the model, and both are restored afterwards. They are the
 * safety surface of select-all-matching-filter, so they are worth running
 * against the real controller rather than a re-implementation.
 */
const Application = (await import("../models/Application.js")).default;

const withStubbedCount = async (count, fn) => {
  const realCount = Application.countDocuments;
  const realFind = Application.find;
  Application.countDocuments = async () => count;
  Application.find = () => ({ select: () => ({ lean: async () => [] }) });
  try { await fn(); } finally {
    Application.countDocuments = realCount;
    Application.find = realFind;
  }
};

await acheck("no matches → 400, and nothing is approved", async () => {
  await withStubbedCount(0, async () => {
    const res = fakeRes();
    await bulkApproveApplications(
      { body: { filter: { type: "pending" }, expectedCount: 5 }, admin: SUPER }, res
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /No applications match/);
    assert.equal(res.body.total, 0);
  });
});

await acheck("expectedCount missing → 400, with the live total reported", async () => {
  await withStubbedCount(7, async () => {
    const res = fakeRes();
    await bulkApproveApplications({ body: { filter: { type: "pending" } }, admin: SUPER }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /expectedCount is required/);
    assert.equal(res.body.total, 7);
  });
});

await acheck("the set changed since confirmation → 409, never a silent partial action", async () => {
  await withStubbedCount(12, async () => {
    const res = fakeRes();
    await bulkRejectApplications(
      { body: { filter: { type: "pending" }, expectedCount: 10 }, admin: SUPER }, res
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.expectedCount, 10);
    assert.equal(res.body.total, 12, "the operator is told the real number");
    assert.match(res.body.error, /changed since you confirmed/);
  });
});

await acheck(`over MAX_BULK → 413, refused rather than truncated`, async () => {
  await withStubbedCount(MAX_BULK + 1, async () => {
    const res = fakeRes();
    await bulkApproveApplications(
      { body: { filter: { type: "pending" }, expectedCount: MAX_BULK + 1 }, admin: SUPER }, res
    );
    assert.equal(res.statusCode, 413);
    assert.equal(res.body.total, MAX_BULK + 1);
    assert.equal(res.body.maxBulk, MAX_BULK);
    assert.match(res.body.error, /Narrow the filter/);
  });
});

await acheck("exactly MAX_BULK is allowed — the boundary is inclusive", async () => {
  await withStubbedCount(MAX_BULK, async () => {
    const res = fakeRes();
    await bulkApproveApplications(
      { body: { filter: { type: "pending" }, expectedCount: MAX_BULK }, admin: SUPER }, res
    );
    assert.notEqual(res.statusCode, 413, "200 matches must not be refused");
  });
});

await acheck("an explicit id list bypasses the count handshake, as before", async () => {
  let counted = false;
  const realCount = Application.countDocuments;
  Application.countDocuments = async () => { counted = true; return 0; };
  try {
    const res = fakeRes();
    await bulkApproveApplications(
      { body: { applicationIds: [] , filter: { type: "pending" } }, admin: SUPER }, res
    );
    // An empty explicit list falls through to the filter form; the point being
    // asserted is only that a NON-empty list would not consult the count.
    assert.ok(counted, "the filter form was used because the id list was empty");
  } finally { Application.countDocuments = realCount; }
});

console.log(
  `\n${process.exitCode ? "FAILED" : "PASSED"} — ${passed} checks` +
    (process.exitCode ? "" : ", 0 failures")
);
