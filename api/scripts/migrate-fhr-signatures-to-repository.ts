/**
 * One-time migration: backfill the centralized `representative_signatures`
 * repository from legacy embedded FHR signatures, and map each FHR to the
 * created/matched repository record via `signatures.ghSignatureId` /
 * `signatures.airlineSignatureId`.
 *
 * Existing FHR records keep their embedded `ghSignatureUrl`/`airlineSignatureUrl`
 * (used as a fallback during rendering), so reports continue working unchanged.
 *
 * Usage (from server directory):
 *   npx ts-node --project tsconfig.scripts.json scripts/migrate-fhr-signatures-to-repository.ts
 *
 * Requires `MONGO_URI` in `.env` (same as Nest).
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger } from '@nestjs/common';

dotenv.config({ path: path.join(__dirname, '../.env') });

const logger = new Logger('MigrateFhrSignatures');
const BATCH_SIZE = 500;

type RepoType = 'GH_REPRESENTATIVE' | 'AIRLINE_REPRESENTATIVE';

function nameKey(name: string): string {
  return String(name ?? '').trim().toLowerCase();
}

function stationFromMainDetails(md: Record<string, unknown> | null | undefined): string {
  if (!md) return '';
  return String(md.Terminal ?? md.station ?? '').trim();
}

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

  const fhrColl = db.collection('fhr_collection');
  const repoColl = db.collection('representative_signatures');

  // In-memory cache of (type|nameKey) -> repository _id created/found this run.
  const repoCache = new Map<string, mongoose.Types.ObjectId>();

  const ensureRepoEntry = async (
    representativeName: string,
    type: RepoType,
    signatureUrl: string,
    station: string,
  ): Promise<mongoose.Types.ObjectId | null> => {
    const key = `${type}|${nameKey(representativeName)}`;
    if (!nameKey(representativeName) || !signatureUrl) return null;
    if (repoCache.has(key)) return repoCache.get(key) as mongoose.Types.ObjectId;

    const existing = await repoColl.findOne({
      representativeType: type,
      nameKey: nameKey(representativeName),
      active: true,
    });
    if (existing?._id) {
      repoCache.set(key, existing._id as mongoose.Types.ObjectId);
      return existing._id as mongoose.Types.ObjectId;
    }

    const now = new Date();
    const insert = await repoColl.insertOne({
      representativeName: representativeName.trim(),
      nameKey: nameKey(representativeName),
      representativeType: type,
      signatureUrl,
      createdBy: 'migration',
      station,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    repoCache.set(key, insert.insertedId as mongoose.Types.ObjectId);
    return insert.insertedId as mongoose.Types.ObjectId;
  };

  const cursor = fhrColl.find(
    {
      $or: [
        { 'signatures.ghSignatureUrl': { $nin: ['', null] } },
        { 'signatures.airlineSignatureUrl': { $nin: ['', null] } },
      ],
    },
    {
      projection: { _id: 1, signatures: 1, mainDetails: 1 },
      batchSize: BATCH_SIZE,
    },
  );

  let examined = 0;
  let ghCreatedOrLinked = 0;
  let airlineCreatedOrLinked = 0;
  let updatedFhrs = 0;

  for await (const doc of cursor) {
    examined += 1;
    const sig = (doc.signatures ?? {}) as Record<string, unknown>;
    const station = stationFromMainDetails(
      doc.mainDetails as Record<string, unknown> | null | undefined,
    );

    const set: Record<string, unknown> = {};

    const ghUrl = String(sig.ghSignatureUrl ?? '').trim();
    const ghName = String(sig.ghRepresentativeName ?? '').trim();
    const ghId = String(sig.ghSignatureId ?? '').trim();
    if (ghUrl && ghName && !ghId) {
      const id = await ensureRepoEntry(ghName, 'GH_REPRESENTATIVE', ghUrl, station);
      if (id) {
        set['signatures.ghSignatureId'] = String(id);
        ghCreatedOrLinked += 1;
      }
    }

    const airUrl = String(sig.airlineSignatureUrl ?? '').trim();
    const airName = String(sig.airlineRepresentativeName ?? '').trim();
    const airId = String(sig.airlineSignatureId ?? '').trim();
    if (airUrl && airName && !airId) {
      const id = await ensureRepoEntry(
        airName,
        'AIRLINE_REPRESENTATIVE',
        airUrl,
        station,
      );
      if (id) {
        set['signatures.airlineSignatureId'] = String(id);
        airlineCreatedOrLinked += 1;
      }
    }

    if (Object.keys(set).length > 0) {
      await fhrColl.updateOne({ _id: doc._id }, { $set: set });
      updatedFhrs += 1;
    }
  }

  logger.log(
    JSON.stringify(
      {
        ok: true,
        examined,
        ghCreatedOrLinked,
        airlineCreatedOrLinked,
        updatedFhrs,
        uniqueRepositoryEntries: repoCache.size,
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
