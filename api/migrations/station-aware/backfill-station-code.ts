/**
 * Reversible migration: backfill `stationCode` on legacy station-owned documents.
 *
 * All data created before the multi-station rollout belongs to the original
 * operating station (`MAA`). This script stamps that code onto every `live`
 * collection's documents that do not yet have one. It is idempotent and never
 * runs automatically.
 *
 * Usage (from the `server` directory): 
 *   # Preview only (no writes):
 *   npx ts-node --project tsconfig.scripts.json migrations/station-aware/backfill-station-code.ts --dry-run
 *
 *   # Apply (default code = MAA):
 *   npx ts-node --project tsconfig.scripts.json migrations/station-aware/backfill-station-code.ts --apply
 *
 *   # Apply with a different legacy code, or a single collection:
 *   ... backfill-station-code.ts --apply --code=MAA --collection=manifest
 *
 *   # Reverse (remove the field again — only those still equal to the code):
 *   ... backfill-station-code.ts --rollback --code=MAA
 *
 * Requires `MONGO_URI` in `.env`.
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { LEGACY_STATION_CODE } from '../../src/common/station/station.constants';
import { STATION_COLLECTIONS } from './station-collections.config';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const logger = new Logger('BackfillStationCode');

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    logger.error('Missing MONGO_URI in environment (.env)');
    process.exit(1);
  }

  const apply = hasFlag('apply');
  const rollback = hasFlag('rollback');
  const dryRun = hasFlag('dry-run') || (!apply && !rollback);
  const code = (arg('code') ?? LEGACY_STATION_CODE).toUpperCase();
  const only = arg('collection');

  if (apply && rollback) {
    logger.error('Pass either --apply or --rollback, not both.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('No database handle');
    process.exit(1);
  }

  const targets = STATION_COLLECTIONS.filter(
    (c) => c.status === 'live' && (!only || c.collection === only),
  );

  if (targets.length === 0) {
    logger.warn(
      `No live collections to process${only ? ` (filter: ${only})` : ''}.`,
    );
    await mongoose.disconnect();
    return;
  }

  const summary: Record<string, unknown>[] = [];

  for (const cfg of targets) {
    const field = cfg.field ?? 'stationCode';
    const coll = db.collection(cfg.collection);

    if (rollback) {
      // Only unset where it still equals the code we set, to stay reversible.
      const filter = { [field]: code } as Record<string, unknown>;
      const matched = await coll.countDocuments(filter);
      if (!dryRun) {
        await coll.updateMany(filter, { $unset: { [field]: '' } });
      }
      summary.push({
        collection: cfg.collection,
        field,
        action: dryRun ? 'rollback (dry-run)' : 'rollback',
        documents: matched,
      });
      continue;
    }

    // Forward: set code where the field is missing/empty/null.
    const filter = {
      $or: [
        { [field]: { $exists: false } },
        { [field]: null },
        { [field]: '' },
      ],
    } as Record<string, unknown>;
    const matched = await coll.countDocuments(filter);
    if (!dryRun) {
      await coll.updateMany(filter, { $set: { [field]: code } });
    }
    summary.push({
      collection: cfg.collection,
      field,
      action: dryRun ? 'backfill (dry-run)' : 'backfill',
      code,
      documents: matched,
    });
  }

  logger.log(JSON.stringify({ ok: true, dryRun, rollback, summary }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
