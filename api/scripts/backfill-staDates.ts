/**
 * One-time backfill: populate `staDates` on every `fhr_collection` document from embedded
 * terminalDetails / rampDetails1 / rampDetails3 STADate fields (normalized dd/MM/yyyy).
 *
 * Usage (from server directory):
 *   npm run backfill:staDates
 *   # or: npx ts-node --project tsconfig.scripts.json scripts/backfill-staDates.ts
 *
 * Requires `MONGO_URI` in `.env` (same as Nest).
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import {
  computeStaDatesFromEmbeds,
  staDatesArraysEqual,
} from '../src/fhr-collection/utils/sta-dates.util';

dotenv.config({ path: path.join(__dirname, '../.env') });

const logger = new Logger('BackfillStaDates');

const BATCH_SIZE = 800;

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    logger.error('Missing MONGO_URI in environment (.env)');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('No database handle');
    process.exit(1);
  }

  const coll = db.collection('fhr_collection');

  /**
   * Pull only embeds needed to derive STA dates plus existing staDates for skip-if-equal.
   */
  const cursor = coll.find(
    {},
    {
      projection: {
        _id: 1,
        staDates: 1,
        terminalDetails: 1,
        rampDetails1: 1,
        rampDetails3: 1,
      },
      batchSize: BATCH_SIZE,
    },
  );

  /** Batch of `updateOne` ops for `bulkWrite` (narrowed by hand, cast at `bulkWrite`). */
  const ops: Array<{
    updateOne: {
      filter: { _id: unknown };
      update: { $set: { staDates: string[] } };
    };
  }> = [];
  let examined = 0;
  let skipped = 0;
  let queued = 0;

  const flush = async (): Promise<void> => {
    if (ops.length === 0) return;
    // Driver generic is strict on filter shapes; ops are validated at runtime.
    await coll.bulkWrite(ops as never, { ordered: false });
    queued += ops.length;
    ops.length = 0;
  };

  for await (const doc of cursor) {
    examined += 1;
    const terminalDetails = doc.terminalDetails as Record<string, unknown> | null | undefined;
    const rampDetails1 = doc.rampDetails1 as Record<string, unknown> | null | undefined;
    const rampDetails3 = doc.rampDetails3 as Record<string, unknown> | null | undefined;

    const computed = computeStaDatesFromEmbeds(
      terminalDetails ?? null,
      rampDetails1 ?? null,
      rampDetails3 ?? null,
    );

    const existing = doc.staDates as string[] | undefined;

    // Skip updates when persisted staDates already matches computed set (sorted equality).
    if (staDatesArraysEqual(existing, computed)) {
      skipped += 1;
      continue;
    }

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { staDates: computed } },
      },
    });

    if (ops.length >= BATCH_SIZE) {
      await flush();
      logger.log(`Progress: examined=${examined} updatesQueued=${queued} skipped=${skipped}`);
    }
  }

  await flush();

  logger.log(
    JSON.stringify(
      {
        ok: true,
        examined,
        bulkUpdatesIssued: queued,
        skippedAlreadyCorrect: skipped,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  logger.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
