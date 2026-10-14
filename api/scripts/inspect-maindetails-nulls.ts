/**
 * Read-only inspection of `mainDetails` documents that block the station-scoped
 * unique index `{ stationCode, SerialNo }` (i.e. SerialNo null/missing, or
 * duplicate (stationCode, SerialNo) pairs). No writes.
 *
 *   npx ts-node --project tsconfig.scripts.json scripts/inspect-maindetails-nulls.ts
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger } from '@nestjs/common';

dotenv.config({ path: path.join(__dirname, '../.env') });
const logger = new Logger('InspectMainDetails');

async function main(): Promise<void> {
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

  const total = await coll.countDocuments({});
  const nullSerial = await coll.countDocuments({
    $or: [{ SerialNo: null }, { SerialNo: { $exists: false } }],
  });

  const samples = await coll
    .find({ $or: [{ SerialNo: null }, { SerialNo: { $exists: false } }] })
    .project({
      _id: 1,
      SerialNo: 1,
      flightSerialNumber: 1,
      stationCode: 1,
      Airline: 1,
      Arline_Code: 1,
      ArrivalFltNo: 1,
      DepartureFltNo: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .limit(10)
    .toArray();

  // Duplicate (stationCode, SerialNo) groups among non-null SerialNo docs.
  const dups = await coll
    .aggregate([
      { $match: { SerialNo: { $ne: null } } },
      {
        $group: {
          _id: { stationCode: '$stationCode', SerialNo: '$SerialNo' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ])
    .toArray();

  const nullFlightSerial = await coll.countDocuments({
    $or: [{ flightSerialNumber: null }, { flightSerialNumber: { $exists: false } }],
  });

  // Docs where SerialNo is null/missing but flightSerialNumber IS present
  // (candidates to reconcile SerialNo := flightSerialNumber).
  const reconcilable = await coll.countDocuments({
    $and: [
      { $or: [{ SerialNo: null }, { SerialNo: { $exists: false } }] },
      { flightSerialNumber: { $ne: null, $exists: true } },
    ],
  });

  // Duplicate (stationCode, flightSerialNumber) groups — would block a compound
  // on flightSerialNumber or a SerialNo backfilled from it.
  const dupFlightSerial = await coll
    .aggregate([
      { $match: { flightSerialNumber: { $ne: null } } },
      {
        $group: {
          _id: { stationCode: '$stationCode', flightSerialNumber: '$flightSerialNumber' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ])
    .toArray();

  const stationBreakdown = await coll
    .aggregate([
      { $group: { _id: '$stationCode', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();

  logger.log(
    JSON.stringify(
      {
        total,
        nullOrMissingSerialNo: nullSerial,
        nullOrMissingFlightSerialNumber: nullFlightSerial,
        reconcilableSerialFromFlightSerial: reconcilable,
        duplicateNonNullSerialPairs: dups,
        duplicateFlightSerialPairs: dupFlightSerial,
        stationBreakdown,
        nullSamples: samples,
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
