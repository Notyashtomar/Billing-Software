import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '../.env') });

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) throw new Error('Missing MONGO_URI');
  await mongoose.connect(uri);
  const coll = mongoose.connection.db!.collection('dashboard_summaries');
  const docs = await coll
    .find({ summaryDate: { $gte: '2026-02-28', $lte: '2026-03-31' } })
    .toArray();
  let kpiT = 0;
  let kpiSch = 0;
  let kpiAddl = 0;
  let onTime = 0;
  let cancelled = 0;
  let acSched = 0;
  for (const d of docs) {
    const cards = (d.cards ?? {}) as Record<string, Record<string, unknown>>;
    const kpi = cards.kpiStrip ?? {};
    const pr = cards.performanceReport ?? {};
    const ac = cards.aircraftAnalysis ?? {};
    kpiT += Number(kpi.totalFlights ?? 0);
    kpiSch += Number(kpi.scheduledFlights ?? 0);
    kpiAddl += Number(kpi.additionalFlights ?? 0);
    onTime += Number(pr.onTimeCount ?? 0);
    cancelled += Number(pr.cancelledCount ?? 0);
    acSched += Number((ac.scheduled as Record<string, number>)?.total ?? 0);
  }
  console.log(
    JSON.stringify({
      summaryDocs: docs.length,
      kpiTotal: kpiT,
      kpiSch,
      kpiAddl,
      onTime,
      cancelled,
      aircraftSched: acSched,
    }),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
