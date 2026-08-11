// config/db.js
import mongoose from 'mongoose';

/**
 * Automatic index / collection creation — OFF by default.
 *
 * Mongoose builds every index declared on a registered schema as soon as the
 * connection opens, and will create a missing collection the first time a model
 * touches it. Both are implicit schema changes performed by an application
 * restart, which is not acceptable on this deployment: a Phase 2A dry run
 * created `applicationId_1_subjectPan_1` on the live `cibilreports` collection
 * purely by connecting, and it had to be dropped by hand.
 *
 * With these off, a deploy can no longer alter the database's index set. Index
 * changes become an explicit, separately-gated operation — for CIBIL that is
 * scripts/backfillCibilSubjects.mjs --with-index.
 *
 * What this does NOT do:
 *   • It does not remove or alter any existing index. Everything currently
 *     built stays exactly as it is. The app has been running with autoIndex on,
 *     so every index the schemas declare today is already present in the
 *     database; turning it off changes nothing about the current index set.
 *   • It does not block writes to a collection that does not exist yet —
 *     MongoDB still creates one implicitly on first insert. `autoCreate` only
 *     governs whether Mongoose issues an explicit createCollection, which
 *     matters for capped collections and collation.
 *
 * The consequence to be aware of: an index added to a schema in future will NOT
 * appear in the database on deploy. Creating it becomes a deliberate ops step.
 *
 * Both are env-overridable in the same style as the pool settings below, so a
 * fresh or local database can be brought up with `MONGO_AUTO_INDEX=true`
 * without editing code. Anything other than the exact string "true" is off.
 */
const AUTO_INDEX = process.env.MONGO_AUTO_INDEX === 'true';
const AUTO_CREATE = process.env.MONGO_AUTO_CREATE === 'true';

// Set globally as well as per-connection: the global covers models registered
// on the default mongoose instance regardless of how they were imported, and
// the connection options make the guarantee independent of global state.
mongoose.set('autoIndex', AUTO_INDEX);
mongoose.set('autoCreate', AUTO_CREATE);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Production-tuned connection pool + timeouts (override via env).
      maxPoolSize: Number(process.env.MONGO_MAX_POOL || 20),
      minPoolSize: Number(process.env.MONGO_MIN_POOL || 2),
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT || 10000),
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT || 45000),
      autoIndex: AUTO_INDEX,
      autoCreate: AUTO_CREATE,
    });
    // The index/collection policy is logged next to the host so the running
    // configuration is visible in the PM2 logs without inspecting the code.
    console.log(
      `MongoDB Connected: ${conn.connection.host}` +
      ` (autoIndex=${AUTO_INDEX}, autoCreate=${AUTO_CREATE})`
    );
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
