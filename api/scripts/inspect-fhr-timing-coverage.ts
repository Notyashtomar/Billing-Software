import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { FhrCollectionService } from '../src/fhr-collection/services/fhr-collection.service';

dotenv.config({ path: join(__dirname, '../.env') });

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI!);
  const coll = mongoose.connection.db!.collection('fhr_collection');
  const date = '15/03/2026';
  const rows = await coll
    .find({ staDates: date })
    .project({
      mainDetails: 1,
      loadControlDetails: 1,
      terminalDetails: 1,
      rampDetails1: 1,
      rampDetails3: 1,
    })
    .toArray();

  let total = rows.length;
  let cancelled = 0;
  let fullTiming = 0;
  let hasAta = 0;
  let hasAtd = 0;

  for (const doc of rows) {
    const d = doc as Record<string, unknown>;
    if (FhrCollectionService.fhrLeanDocIsCancelled(d)) {
      cancelled += 1;
      continue;
    }
    const m = d.mainDetails as Record<string, unknown> | undefined;
    const lc = d.loadControlDetails as Record<string, unknown> | undefined;
    const t = d.terminalDetails as Record<string, unknown> | undefined;
    const r1 = d.rampDetails1 as Record<string, unknown> | undefined;
    const r3 = d.rampDetails3 as Record<string, unknown> | undefined;
    if (m?.ATADate || m?.ataDate || r1?.ataDate || r1?.ATADate) hasAta += 1;
    if (m?.ATDDate || m?.atdDate) hasAtd += 1;
    const timing = FhrCollectionService.performanceTimingMsFromFhrEmbeds(
      m,
      lc,
      t,
      r1,
      r3,
    );
    if (timing) fullTiming += 1;
  }

  console.log(
    JSON.stringify({
      date,
      total,
      cancelled,
      didFly: total - cancelled,
      hasAta,
      hasAtd,
      fullTiming,
    }),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
