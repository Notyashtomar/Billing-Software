import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { FhrCollectionService } from '../src/fhr-collection/services/fhr-collection.service';

dotenv.config({ path: join(__dirname, '../.env') });

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI!);
  const coll = mongoose.connection.db!.collection('fhr_collection');
  const rows = await coll
    .find({ staDates: { $gte: '01/03/2026', $lte: '31/03/2026' } })
    .project({ mainDetails: 1 })
    .toArray();

  let total = 0;
  let sch = 0;
  let addl = 0;
  let blank = 0;
  const samples = new Map<string, number>();

  for (const doc of rows) {
    if (FhrCollectionService.fhrLeanDocIsCancelled(doc as Record<string, unknown>)) {
      continue;
    }
    total += 1;
    const m = (doc as Record<string, unknown>).mainDetails as
      | Record<string, unknown>
      | undefined;
    const h = FhrCollectionService.resolveMainDetailsHandlingText(m);
    if (!h) {
      blank += 1;
      continue;
    }
    samples.set(h, (samples.get(h) ?? 0) + 1);
    const u = h.toUpperCase();
    if (/(^|[^A-Z])(ADDL|ADDITIONAL)([^A-Z]|$)/.test(u)) addl += 1;
    else if (/(^|[^A-Z])(SCH|SCHEDULED|TURNAROUND)([^A-Z]|$)/.test(u)) {
      sch += 1;
    }
  }

  console.log(
    JSON.stringify({
      operated: total,
      sch,
      addl,
      blank,
      topLabels: [...samples.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([label, count]) => ({ label, count })),
    }),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
