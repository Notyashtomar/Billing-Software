/**
 * Re-stamp Gateway Staff (`advance-staff`) that leaked across stations.
 *
 * Usage (from BWMS/apps/api, requires MONGO_URI):
 *
 *   npx ts-node --project tsconfig.scripts.json ../../modules/m-fris/server/advance-staff/reassign-staff-station.cli.ts --dry-run --to=MAA
 *   ... --apply --to=MAA
 *   ... --apply --from=MAA --to=IXC --force-all
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { normalizeStationCode } from '../common/station/station.constants';

dotenv.config({ path: path.join(__dirname, '../../../../apps/api/.env') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const logger = new Logger('ReassignStaffStation');

function argEquals(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1]?.trim() : undefined;
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    logger.error('Missing MONGO_URI');
    process.exit(1);
  }

  const apply = hasFlag('apply');
  const dryRun = hasFlag('dry-run') || !apply;
  const forceAll = hasFlag('force-all');
  const to = normalizeStationCode(argEquals('to'));
  const from = normalizeStationCode(argEquals('from'));

  if (!to) {
    logger.error('Required: --to=<STATION_CODE> (e.g. --to=IXC)');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('No database handle');
    process.exit(1);
  }

  const col = db.collection('advance-staff');
  let filter: Record<string, unknown>;

  if (from && forceAll) {
    filter = { stationCode: from };
  } else if (!from) {
    filter = {
      $or: [
        { stationCode: { $exists: false } },
        { stationCode: null },
        { stationCode: '' },
      ],
    };
  } else {
    logger.error('With --from you must pass --force-all');
    process.exit(1);
  }

  const count = await col.countDocuments(filter);
  logger.log(
    `advance-staff: ${count} row(s) match → stationCode=${to}` +
      (dryRun ? ' [dry-run]' : ''),
  );

  if (!dryRun && count > 0) {
    const res = await col.updateMany(filter, { $set: { stationCode: to } });
    logger.log(`advance-staff: modified ${res.modifiedCount}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
