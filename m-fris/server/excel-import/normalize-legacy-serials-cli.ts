import * as mongoose from 'mongoose';
import { Logger } from '@nestjs/common';

type CollectionConfig = {
  collection: string;
  field: string;
};

const COLLECTIONS: CollectionConfig[] = [
  { collection: 'mainDetails', field: 'SerialNo' },
  { collection: 'terminalDetails', field: 'serialNo' },
  { collection: 'rampDetails1', field: 'serialNo' },
  { collection: 'loadControlDetails', field: 'serialNo' },
  { collection: 'remarks', field: 'serialNo' },
];

const cliLogger = new Logger('NormalizeLegacySerials');

function parseSerial(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const withoutPrefix = raw.replace(/^FL-/i, '').trim();
  const normalized = withoutPrefix.replace(/,/g, '');
  if (!/^\d+(\.0+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri =
    process.env.MONGODB_URI ??
    process.env.MONGO_URI ??
    process.env.DATABASE_URL ??
    'mongodb://127.0.0.1:27017/fris';

  cliLogger.log(
    `[normalize-legacy-serials] mode=${apply ? 'APPLY' : 'DRY-RUN'} uri=${uri}`,
  );
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Mongo database connection is not available.');
  }

  let totalScanned = 0;
  let totalWouldUpdate = 0;

  for (const cfg of COLLECTIONS) {
    const col = db.collection(cfg.collection);
    const cursor = col.find(
      {
        [cfg.field]: { $exists: true, $ne: null },
      },
      { projection: { _id: 1, [cfg.field]: 1 } },
    );

    let scanned = 0;
    let wouldUpdate = 0;
    const bulkOps: any[] = [];

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (!doc) continue;
      scanned += 1;
      const current = (doc as Record<string, unknown>)[cfg.field];
      const normalized = parseSerial(current);
      if (normalized == null) continue;
      if (current === normalized) continue;
      wouldUpdate += 1;
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { [cfg.field]: normalized } },
        },
      });
    }

    if (apply && bulkOps.length > 0) {
      await col.bulkWrite(bulkOps, { ordered: false });
    }

    totalScanned += scanned;
    totalWouldUpdate += wouldUpdate;
    cliLogger.log(
      `[normalize-legacy-serials] ${cfg.collection}.${cfg.field}: scanned=${scanned}, ${
        apply ? 'updated' : 'wouldUpdate'
      }=${wouldUpdate}`,
    );
  }

  cliLogger.log(
    `[normalize-legacy-serials] done scanned=${totalScanned}, ${
      apply ? 'updated' : 'wouldUpdate'
    }=${totalWouldUpdate}`,
  );

  await mongoose.disconnect();
}

run().catch(async (err) => {
  cliLogger.error(
    '[normalize-legacy-serials] failed:',
    err instanceof Error ? err.stack : String(err),
  );
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exitCode = 1;
});
