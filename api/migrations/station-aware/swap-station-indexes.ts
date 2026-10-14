/**
 * Reversible migration: swap legacy global-unique indexes for station-scoped
 * compound indexes on `live` station-owned collections.
 *
 * IMPORTANT: run `backfill-station-code.ts --apply` FIRST. Building a unique
 * compound index that includes `stationCode` will fail if any document still
 * has a null `stationCode`.
 *
 * Usage (from the `server` directory):
 *   # Preview:
 *   npx ts-node --project tsconfig.scripts.json migrations/station-aware/swap-station-indexes.ts --dry-run
 *
 *   # Apply (drop legacy unique index, build compound unique index):
 *   ... swap-station-indexes.ts --apply
 *
 *   # Reverse (drop compound, restore legacy single-field unique index):
 *   ... swap-station-indexes.ts --rollback
 *
 * Requires `MONGO_URI` in `.env`.
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { STATION_COLLECTIONS } from './station-collections.config';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const logger = new Logger('SwapStationIndexes');

const hasFlag = (name: string) => process.argv.includes(`--${name}`);
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
}

/** Best-effort: derive the single legacy key from a `field_1` index name. */
function legacyKeysFromName(name: string): Record<string, 1 | -1> {
  const base = name.replace(/_1$/, '').replace(/_-1$/, '');
  return { [base]: 1 };
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    logger.error('Missing MONGO_URI in environment (.env)');
    process.exit(1);
  }

  const apply = hasFlag('apply');
  const rollback = hasFlag('rollback');
  const dryRun = hasFlag('dry-run') || (!apply && !rollback);
  const only = arg('collection');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('No database handle');
    process.exit(1);
  }

  const targets = STATION_COLLECTIONS.filter(
    (c) =>
      c.status === 'live' &&
      (c.indexSwaps?.length ?? 0) > 0 &&
      (!only || c.collection === only),
  );

  const summary: Record<string, unknown>[] = [];

  for (const cfg of targets) {
    const coll = db.collection(cfg.collection);
    const existing = await coll.indexes();
    const indexNames = new Set(existing.map((i) => i.name));

    for (const swap of cfg.indexSwaps ?? []) {
      const compoundName = Object.entries(swap.createKeys)
        .map(([k, v]) => `${k}_${v}`)
        .join('_');

      if (rollback) {
        const actions: string[] = [];
        if (indexNames.has(compoundName)) {
          if (!dryRun) await coll.dropIndex(compoundName);
          actions.push(`dropped ${compoundName}`);
        }
        if (!indexNames.has(swap.drop)) {
          if (!dryRun) {
            await coll.createIndex(legacyKeysFromName(swap.drop), {
              name: swap.drop,
              unique: swap.unique ?? true,
            });
          }
          actions.push(`restored ${swap.drop}`);
        }
        summary.push({
          collection: cfg.collection,
          action: dryRun ? 'rollback (dry-run)' : 'rollback',
          details: actions,
        });
        continue;
      }

      // Forward
      const actions: string[] = [];
      if (indexNames.has(swap.drop)) {
        if (!dryRun) await coll.dropIndex(swap.drop);
        actions.push(`dropped ${swap.drop}`);
      }
      if (!indexNames.has(compoundName)) {
        if (!dryRun) {
          await coll.createIndex(swap.createKeys, {
            name: compoundName,
            unique: swap.unique ?? false,
          });
        }
        actions.push(
          `created ${compoundName}${swap.unique ? ' (unique)' : ''}`,
        );
      }
      summary.push({
        collection: cfg.collection,
        action: dryRun ? 'apply (dry-run)' : 'apply',
        details: actions,
      });
    }
  }

  logger.log(JSON.stringify({ ok: true, dryRun, rollback, summary }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
