/**
 * Reconcile `mainDetails.SerialNo` from its documented alias
 * `flightSerialNumber` for legacy docs where `SerialNo` is null/missing.
 *
 * Background: the standalone `mainDetails` collection is meant to have a
 * station-scoped unique index `{ stationCode, SerialNo }`, but most legacy MAA
 * rows only populated `flightSerialNumber` (the alias) and left `SerialNo` null,
 * so the unique index can't be built. `SerialNo` and `flightSerialNumber` are
 * defined to be equal, so this fills the gap non-destructively. Idempotent.
 *
 *   # Preview (no writes):
 *   npx ts-node --project tsconfig.scripts.json scripts/reconcile-maindetails-serial.ts
 *   # Apply:
 *   npx ts-node --project tsconfig.scripts.json scripts/reconcile-maindetails-serial.ts --apply
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger } from '@nestjs/common';

dotenv.config({ path: path.join(__dirname, '../.env') });
const logger = new Logger('ReconcileMainDetailsSerial');

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    logger.error('Missing MONGO_URI');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('No db handle');
    process.exit(1);
  }
  const coll = db.collection('mainDetails');

  const filter = {
    $and: [
      { $or: [{ SerialNo: null }, { SerialNo: { $exists: false } }] },
      { flightSerialNumber: { $ne: null, $exists: true } },
    ],
  };

  const candidates = await coll.countDocuments(filter);
  const stillNullAfter = await coll.countDocuments({
    $and: [
      { $or: [{ SerialNo: null }, { SerialNo: { $exists: false } }] },
      { $or: [{ flightSerialNumber: null }, { flightSerialNumber: { $exists: false } }] },
    ],
  });

  let modified = 0;
  if (apply && candidates > 0) {
    const res = await coll.updateMany(filter, [
      { $set: { SerialNo: '$flightSerialNumber' } },
    ]);
    modified = res.modifiedCount ?? 0;
  }

  logger.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: !apply,
        candidates,
        modified,
        remainingUnreconcilable: stillNullAfter,
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
