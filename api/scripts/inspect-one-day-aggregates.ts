import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '../.env') });

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI!);
  const coll = mongoose.connection.db!.collection('dashboard_daily_aggregates');
  const date = '2026-03-15';
  for (const t of ['kpiStrip', 'performanceReport', 'aircraftAnalysis', 'onTimePerformance']) {
    const d = await coll.findOne({ date, aggregateType: t, equipmentMode: '' });
    console.log(`\n=== ${t} ${date} ===`);
    console.log(JSON.stringify(d?.data ?? null, null, 2)?.slice(0, 800));
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
