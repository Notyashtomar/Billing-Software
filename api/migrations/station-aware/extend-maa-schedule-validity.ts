/**
 * Stretch Chennai (MAA) Advance Schedule Setup Valid To without minting FHR.
 *
 * Matches MAA / CHENNAI / unscoped masters (legacy Chennai rows).
 * Never shortens Valid To. Leaves Valid From, weekdays, identity, season as-is.
 *
 * Usage (from BWMS/apps/api):
 *   npx ts-node --project tsconfig.scripts.json migrations/station-aware/extend-maa-schedule-validity.ts --dry-run
 *   npx ts-node --project tsconfig.scripts.json migrations/station-aware/extend-maa-schedule-validity.ts --apply --to=09/09/2027
 *
 * Requires MONGO_URI in .env.
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger } from '@nestjs/common';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const logger = new Logger('ExtendMaaScheduleValidity');

const MAA_READ_FILTER = {
  $or: [
    { stationCode: 'MAA' },
    { stationCode: 'CHENNAI' },
    { stationCode: { $exists: false } },
    { stationCode: null },
    { stationCode: '' },
  ],
};

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function parseDdMmYyyy(input: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(input ?? '').trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

function pickTo(current: unknown, target: string): string | null {
  const cur = String(current ?? '').trim();
  const curDate = parseDdMmYyyy(cur);
  const tgt = parseDdMmYyyy(target);
  if (!tgt) return null;
  if (!curDate) return target;
  if (curDate.getTime() >= tgt.getTime()) return null;
  return target;
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    logger.error('Missing MONGO_URI in environment (.env)');
    process.exit(1);
  }

  const apply = hasFlag('apply');
  const dryRun = !apply;
  const target = arg('to') ?? '09/09/2027';
  if (!parseDdMmYyyy(target)) {
    logger.error(`Invalid --to=${target} (need dd/MM/yyyy)`);
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('No database handle');
    process.exit(1);
  }

  const coll = db.collection('advance_schedule_setup');
  const rawColl = db.collection('raw_flight_data');
  const docs = await coll.find(MAA_READ_FILTER).toArray();

  let updated = 0;
  let skipped = 0;
  let rawUpdated = 0;
  const samples: Array<{ serialNo?: string; from?: string; to: string }> = [];

  for (const doc of docs) {
    const data = (doc.data ?? {}) as Record<string, unknown>;
    const currentTo = data.validTo ?? data['Valid To'];
    const currentFrom = String(data.validFrom ?? data['Valid From'] ?? '').trim();
    const fromDate = parseDdMmYyyy(currentFrom);
    const tgtDate = parseDdMmYyyy(target);
    if (fromDate && tgtDate && fromDate.getTime() > tgtDate.getTime()) {
      skipped += 1;
      continue;
    }
    const next = pickTo(currentTo, target);
    if (!next) {
      skipped += 1;
      continue;
    }
    if (samples.length < 8) {
      samples.push({
        serialNo: doc.serialNo ? String(doc.serialNo) : undefined,
        from: currentTo ? String(currentTo) : undefined,
        to: next,
      });
    }
    if (!dryRun) {
      await coll.updateOne(
        { _id: doc._id },
        { $set: { 'data.validTo': next, 'data.Valid To': next } },
      );
      const serial = String(doc.serialNo ?? '').trim();
      if (serial) {
        const rawRes = await rawColl.updateMany(
          {
            $and: [
              MAA_READ_FILTER,
              {
                $or: [
                  { serialNo: serial },
                  { 'data.serialNo': serial },
                  { 'data.SlNo': serial },
                  { 'data.Serial No': serial },
                ],
              },
            ],
          },
          { $set: { 'data.validTo': next, 'data.Valid To': next } },
        );
        rawUpdated += rawRes.modifiedCount ?? 0;
      }
    }
    updated += 1;
  }

  logger.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        target,
        scanned: docs.length,
        wouldUpdateOrUpdated: updated,
        skipped,
        rawUpdated: dryRun ? 0 : rawUpdated,
        samples,
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
