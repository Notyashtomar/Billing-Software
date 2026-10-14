import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '../.env') });

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI!);
  const coll = mongoose.connection.db!.collection('fhr_collection');
  const rows = await coll
    .find({ staDates: { $in: ['28/02/2026', '15/03/2026', '31/03/2026'] } })
    .project({
      mainDetails: 1,
      loadControlDetails: 1,
      terminalDetails: 1,
      rampDetails1: 1,
    })
    .limit(500)
    .toArray();

  let total = 0;
  let hasToh = 0;
  let hasOps = 0;
  let hasLc = 0;
  let hasLcStaTime = 0;
  let hasTermSta = 0;
  for (const doc of rows) {
    total += 1;
    const m = (doc as Record<string, unknown>).mainDetails as Record<string, unknown> | undefined;
    const lc = (doc as Record<string, unknown>).loadControlDetails as Record<string, unknown> | undefined;
    const t = (doc as Record<string, unknown>).terminalDetails as Record<string, unknown> | undefined;
    if (m?.TypeofHandling || m?.typeOfHandling) hasToh += 1;
    if (m?.ops || m?.operations) hasOps += 1;
    if (lc) hasLc += 1;
    if (lc?.STATime || lc?.staTime || lc?.sta) hasLcStaTime += 1;
    if (t?.STATime || t?.sta || t?.staTime) hasTermSta += 1;
  }
  console.log(JSON.stringify({ total, hasToh, hasOps, hasLc, hasLcStaTime, hasTermSta }));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
