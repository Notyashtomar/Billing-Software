import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '../.env') });

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) throw new Error('Missing MONGO_URI');
  await mongoose.connect(uri);
  const coll = mongoose.connection.db!.collection('dashboard_daily_aggregates');
  const types = ['kpiStrip', 'performanceReport', 'aircraftAnalysis', 'onTimePerformance'];
  for (const t of types) {
    const docs = await coll
      .find({
        date: { $gte: '2026-02-28', $lte: '2026-03-31' },
        aggregateType: t,
        equipmentMode: '',
      })
      .toArray();
    let totalFlights = 0;
    let onTime = 0;
    let cancelled = 0;
    let schTotal = 0;
    for (const d of docs) {
      const data = (d.data ?? {}) as Record<string, unknown>;
      totalFlights += Number(data.totalFlights ?? 0);
      onTime += Number(data.onTimeCount ?? 0);
      cancelled += Number(data.cancelledCount ?? data.cancelledFlights ?? 0);
      if (t === 'aircraftAnalysis') {
        schTotal += Number((data.scheduled as Record<string, number>)?.total ?? 0);
      }
    }
    console.log(
      JSON.stringify({ type: t, days: docs.length, totalFlights, onTime, cancelled, schTotal }),
    );
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
