/**
 * List mainDetails rows whose SerialNo is not present in fhr_collection.
 *
 * Usage (from server/):
 *   npx ts-node --project tsconfig.scripts.json scripts/find-maindetails-without-fhr.ts
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger } from '@nestjs/common';

dotenv.config({ path: path.join(__dirname, '../.env') });

const logger = new Logger('FindMainDetailsWithoutFhr');

async function main(): Promise<void> {
  const uri =
    process.env.MONGO_URI?.trim() ||
    process.env.MONGODB_URI?.trim() ||
    'mongodb://127.0.0.1:27017/fris';

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('No database handle');
    process.exit(1);
  }

  const mainColl = db.collection('mainDetails');
  const fhrColl = db.collection('fhr_collection');

  const [mainCount, fhrCount] = await Promise.all([
    mainColl.countDocuments(),
    fhrColl.countDocuments(),
  ]);

  const fhrSerials = await fhrColl.distinct('SerialNo');
  const fhrFlightSerials = await fhrColl.distinct('flightSerialNumber');

  const fhrSet = new Set<string>();
  for (const v of [...fhrSerials, ...fhrFlightSerials]) {
    if (v != null && v !== '') fhrSet.add(String(v).trim());
  }

  const mains = await mainColl
    .find(
      {},
      {
        projection: {
          SerialNo: 1,
          flightSerialNumber: 1,
          Airline: 1,
          Arline_Code: 1,
          ArrivalFltNo: 1,
          DepartureFltNo: 1,
          ATADate: 1,
          ATDDate: 1,
          flightCancelled: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    )
    .toArray();

  const unmatched = mains.filter((m) => {
    const sn = String(m.SerialNo ?? '').trim();
    const fsn = String(m.flightSerialNumber ?? '').trim();
    const keys = [sn, fsn].filter(Boolean);
    return keys.length === 0 || keys.every((k) => !fhrSet.has(k));
  });

  logger.log(`mainDetails count: ${mainCount}`);
  logger.log(`fhr_collection count: ${fhrCount}`);
  logger.log(`fhr distinct serial keys: ${fhrSet.size}`);
  logger.log(`mainDetails without fhr match: ${unmatched.length}`);

  if (unmatched.length === 0) {
    logger.log('No orphans by SerialNo / flightSerialNumber.');
  } else {
    for (const row of unmatched) {
      logger.log(JSON.stringify(row, null, 2));
    }
  }

  // Duplicate SerialNo in mainDetails (explains count > fhr when all serials exist in FHR)
  const dupes = await mainColl
    .aggregate<{ _id: unknown; n: number; ids: unknown[] }>([
      { $group: { _id: '$SerialNo', n: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { n: { $gt: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();

  logger.log(`Duplicate SerialNo groups in mainDetails: ${dupes.length}`);
  for (const g of dupes) {
    if (g._id == null) {
      logger.log(
        `SerialNo null/missing: ${g.n} documents (likely matched via flightSerialNumber only)`,
      );
      continue;
    }
    const rows = await mainColl
      .find({ SerialNo: g._id })
      .project({
        SerialNo: 1,
        flightSerialNumber: 1,
        Airline: 1,
        ArrivalFltNo: 1,
        DepartureFltNo: 1,
        ATADate: 1,
        flightCancelled: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .toArray();
    logger.log(`SerialNo ${g._id} (${g.n} docs):`);
    logger.log(JSON.stringify(rows, null, 2));
  }

  const withSerial = await mainColl
    .find({ SerialNo: { $ne: null, $exists: true } })
    .project({
      SerialNo: 1,
      flightSerialNumber: 1,
      Airline: 1,
      ArrivalFltNo: 1,
      DepartureFltNo: 1,
      ATADate: 1,
      flightCancelled: 1,
    })
    .toArray();
  logger.log(`mainDetails with non-null SerialNo: ${withSerial.length}`);
  for (const row of withSerial) {
    const sn = String(row.SerialNo);
    const inFhr = fhrSet.has(sn);
    logger.log(
      `${inFhr ? '[in FHR]' : '[NOT in FHR]'} SerialNo=${sn} flightSerialNumber=${row.flightSerialNumber} Airline=${row.Airline} Arr=${row.ArrivalFltNo} Dep=${row.DepartureFltNo}`,
    );
  }

  const nullSerialNotInFhr = await mainColl
    .find({
      $or: [{ SerialNo: null }, { SerialNo: { $exists: false } }],
    })
    .project({ _id: 1, flightSerialNumber: 1, Airline: 1 })
    .toArray();
  const orphanNull = nullSerialNotInFhr.filter((m) => {
    const fsn = String(m.flightSerialNumber ?? '').trim();
    return !fsn || !fhrSet.has(fsn);
  });
  if (orphanNull.length) {
    logger.log(
      `mainDetails with null SerialNo and flightSerialNumber not in FHR: ${orphanNull.length}`,
    );
    logger.log(JSON.stringify(orphanNull.slice(0, 20), null, 2));
  }

  const mainDistinct = await mainColl.distinct('SerialNo');
  const fhrDistinct = await fhrColl.distinct('SerialNo');
  const onlyInMain = mainDistinct.filter(
    (s) => !fhrDistinct.some((f) => String(f) === String(s)),
  );
  logger.log(
    `Distinct SerialNo — mainDetails: ${mainDistinct.length}, fhr: ${fhrDistinct.length}`,
  );
  if (onlyInMain.length) {
    logger.log(`SerialNo in mainDetails but not fhr_collection.SerialNo:`);
    logger.log(JSON.stringify(onlyInMain));
    for (const sn of onlyInMain) {
      const row = await mainColl.findOne({ SerialNo: sn });
      logger.log(JSON.stringify(row, null, 2));
    }
  }

  // Reverse: FHR without mainDetails (informational)
  const mainSet = new Set<string>();
  for (const m of mains) {
    const sn = String(m.SerialNo ?? '').trim();
    const fsn = String(m.flightSerialNumber ?? '').trim();
    if (sn) mainSet.add(sn);
    if (fsn) mainSet.add(fsn);
  }

  const fhrOnly = await fhrColl
    .find(
      {},
      { projection: { SerialNo: 1, flightSerialNumber: 1, 'mainDetails.Airline': 1 } },
    )
    .toArray();

  const fhrWithoutMain = fhrOnly.filter((f) => {
    const sn = String(f.SerialNo ?? '').trim();
    const fsn = String(f.flightSerialNumber ?? '').trim();
    const keys = [sn, fsn].filter(Boolean);
    return keys.length === 0 || keys.every((k) => !mainSet.has(k));
  });

  if (fhrWithoutMain.length > 0) {
    logger.log(`--- fhr_collection without mainDetails (${fhrWithoutMain.length}) ---`);
    for (const row of fhrWithoutMain) {
      logger.log(
        JSON.stringify({
          SerialNo: row.SerialNo,
          flightSerialNumber: row.flightSerialNumber,
          Airline: (row as { mainDetails?: { Airline?: string } }).mainDetails?.Airline,
        }),
      );
    }
  }

  // Extra mainDetails doc: same flightSerialNumber twice, or FSN not in FHR
  const fsnDupes = await mainColl
    .aggregate<{ _id: unknown; n: number }>([
      {
        $group: {
          _id: '$flightSerialNumber',
          n: { $sum: 1 },
        },
      },
      { $match: { n: { $gt: 1 }, _id: { $ne: null } } },
      { $sort: { n: -1 } },
    ])
    .toArray();
  logger.log(`Duplicate flightSerialNumber groups: ${fsnDupes.length}`);
  for (const g of fsnDupes) {
    const rows = await mainColl
      .find({ flightSerialNumber: g._id })
      .project({
        _id: 1,
        SerialNo: 1,
        flightSerialNumber: 1,
        Airline: 1,
        ArrivalFltNo: 1,
        DepartureFltNo: 1,
        createdAt: 1,
      })
      .toArray();
    logger.log(`flightSerialNumber ${g._id} (${g.n} docs):`);
    logger.log(JSON.stringify(rows, null, 2));
  }

  // Map: how many mainDetails per FHR serial
  const mainByFsn = new Map<string, number>();
  for (const m of mains) {
    const fsn = String(m.flightSerialNumber ?? m.SerialNo ?? '').trim();
    if (!fsn) continue;
    mainByFsn.set(fsn, (mainByFsn.get(fsn) ?? 0) + 1);
  }
  const multi = [...mainByFsn.entries()].filter(([, n]) => n > 1);
  logger.log(`FHR-key flightSerialNumber with >1 mainDetails row: ${multi.length}`);
  for (const [fsn, n] of multi) {
    logger.log(`  ${fsn} => ${n} rows`);
    const rows = await mainColl
      .find({
        $or: [{ flightSerialNumber: Number(fsn) }, { SerialNo: Number(fsn) }],
      })
      .project({
        _id: 1,
        SerialNo: 1,
        flightSerialNumber: 1,
        Airline: 1,
        ArrivalFltNo: 1,
        DepartureFltNo: 1,
      })
      .toArray();
    logger.log(JSON.stringify(rows, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
