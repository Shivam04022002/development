/**
 * backfillApprovedAt.mjs
 *
 * One-time backfill: populate the new, dedicated `approvedAt` field on existing
 * ApprovedApplication records that predate it.
 *
 * Source of truth for the backfill is the record's current `updatedAt`, which —
 * for approved docs — was stamped as the approval time at creation
 * (save({ timestamps: false }) with updatedAt = new Date()). No code path
 * re-saves approved docs today, so updatedAt still equals the approval time.
 *
 * The update is issued through the NATIVE driver (ApprovedApplication.collection)
 * with an aggregation pipeline, so Mongoose timestamp bookkeeping is bypassed and
 * `updatedAt` is NOT modified. Only `approvedAt` is written, and only where it is
 * missing — the script is idempotent and safe to run multiple times.
 *
 * Usage:
 *   node scripts/backfillApprovedAt.mjs            # apply
 *   node scripts/backfillApprovedAt.mjs --dry-run  # report only, no writes
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

import ApprovedApplication from "../models/ApprovedApplication.js";

dotenv.config();

const DRY_RUN = process.argv.slice(2).includes("--dry-run");

const startedAt = Date.now();

/** scanned / updated / skipped / elapsed, printed identically in both modes. */
function summary({ scanned, updated, skipped }) {
  console.log("\n--- Summary ---");
  console.log(`Documents scanned:   ${scanned}`);
  console.log(`Documents updated:   ${updated}`);
  console.log(`Documents skipped:   ${skipped}`);
  console.log(`Execution time:      ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY"}\n`);

  const coll = ApprovedApplication.collection;

  const total = await coll.countDocuments({});
  const missing = await coll.countDocuments({ approvedAt: { $exists: false } });
  const missingUpdatedAt = await coll.countDocuments({
    approvedAt: { $exists: false },
    updatedAt: { $exists: false },
  });

  console.log(`Approved records total:              ${total}`);
  console.log(`Missing approvedAt:                  ${missing}`);
  console.log(`  ...of which also lack updatedAt:   ${missingUpdatedAt} (cannot backfill; left as-is)`);

  if (DRY_RUN) {
    console.log("\nDry run — no changes written.");
    await mongoose.disconnect();
    return;
  }

  if (missing === 0) {
    console.log("\nNothing to backfill.");
    await mongoose.disconnect();
    return;
  }

  // Native pipeline update: approvedAt <- updatedAt, only where approvedAt is
  // absent AND updatedAt exists. Bypasses Mongoose so updatedAt is untouched.
  const res = await coll.updateMany(
    { approvedAt: { $exists: false }, updatedAt: { $exists: true } },
    [{ $set: { approvedAt: "$updatedAt" } }]
  );

  console.log(`\nBackfilled approvedAt on ${res.modifiedCount} record(s).`);

  const remaining = await coll.countDocuments({ approvedAt: { $exists: false } });
  console.log(`Remaining without approvedAt: ${remaining}`);

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("backfillApprovedAt error:", err);
  process.exit(1);
});
