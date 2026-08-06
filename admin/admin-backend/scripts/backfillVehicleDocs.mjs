/**
 * backfillVehicleDocs.mjs
 *
 * One-time backfill for the RC & Number Plate module: initialise
 * `rcDetails.status` and `numberPlateDetails.status` to "Pending" on
 * ApprovedApplication records that were approved before the module existed.
 *
 * Is it required? Strictly, no — every read path in the module treats a MISSING
 * section as Pending, so existing approved applications are already visible to
 * dealers and admins without this script. Run it anyway if you want the stored
 * data to be uniform (e.g. for reporting straight off the collection, or for
 * index selectivity on rcDetails.status).
 *
 * Safety:
 *   - Only records where the section is ABSENT are touched. A section that has
 *     already been uploaded is never rewritten ($exists: false guard).
 *   - The update is issued through the NATIVE driver with $set, bypassing
 *     Mongoose timestamp bookkeeping, so `updatedAt` is NOT modified. That
 *     matters: on approved records `updatedAt` is the approval-time proxy the
 *     Processing Days export falls back to for records predating `approvedAt`.
 *   - Idempotent — safe to run repeatedly.
 *
 * Usage:
 *   node scripts/backfillVehicleDocs.mjs            # apply
 *   node scripts/backfillVehicleDocs.mjs --dry-run  # report only, no writes
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
  const missingRc = await coll.countDocuments({ "rcDetails.status": { $exists: false } });
  const missingPlate = await coll.countDocuments({
    "numberPlateDetails.status": { $exists: false },
  });
  const missingEither = await coll.countDocuments({
    $or: [
      { "rcDetails.status": { $exists: false } },
      { "numberPlateDetails.status": { $exists: false } },
    ],
  });
  // Reported for completeness. spdcDetails carries no defaulted field — it is
  // admin-entered and legitimately absent until an admin fills it in — so it is
  // never written by this script. An absent spdcDetails is a valid state that
  // every read path already treats as empty.
  const withSpdc = await coll.countDocuments({ spdcDetails: { $exists: true } });

  console.log(`Approved records total:                 ${total}`);
  console.log(`Missing rcDetails.status:               ${missingRc}`);
  console.log(`Missing numberPlateDetails.status:      ${missingPlate}`);
  console.log(`Records needing at least one update:    ${missingEither}`);
  console.log(`Records already carrying spdcDetails:   ${withSpdc}  (informational — not backfilled)`);

  if (DRY_RUN) {
    console.log(`\nWould initialise ${missingEither} record(s) to "Pending".`);
    console.log("Dry run — no changes written.");
    summary({ scanned: total, updated: 0, skipped: total });
    await mongoose.disconnect();
    return;
  }

  if (missingEither === 0) {
    console.log("\nNothing to backfill.");
    summary({ scanned: total, updated: 0, skipped: total });
    await mongoose.disconnect();
    return;
  }

  // Two targeted passes rather than one combined $set: a record may be missing
  // only one of the two sections, and an unconditional $set would flatten an
  // existing "Uploaded" value on the other.
  const rcRes = await coll.updateMany(
    { "rcDetails.status": { $exists: false } },
    { $set: { "rcDetails.status": "Pending" } }
  );
  const plateRes = await coll.updateMany(
    { "numberPlateDetails.status": { $exists: false } },
    { $set: { "numberPlateDetails.status": "Pending" } }
  );

  console.log(`\nInitialised rcDetails.status on          ${rcRes.modifiedCount} record(s).`);
  console.log(`Initialised numberPlateDetails.status on ${plateRes.modifiedCount} record(s).`);

  const remaining = await coll.countDocuments({
    $or: [
      { "rcDetails.status": { $exists: false } },
      { "numberPlateDetails.status": { $exists: false } },
    ],
  });
  console.log(`Remaining without a status:              ${remaining}`);

  summary({
    scanned: total,
    updated: missingEither - remaining,
    skipped: total - (missingEither - remaining),
  });

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("backfillVehicleDocs error:", err);
  process.exit(1);
});
