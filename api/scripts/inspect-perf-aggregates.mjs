import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const agg = await db
  .collection('dashboard_daily_aggregates')
  .find({
    aggregateType: 'performanceReport',
    date: { $gte: '2026-02-28', $lte: '2026-03-31' },
  })
  .toArray();
const t = {
  onTime: 0,
  offSkd: 0,
  a: 0,
  b: 0,
  c: 0,
  gha: 0,
  cancel: 0,
  total: 0,
};
for (const d of agg) {
  const x = d.data || {};
  t.onTime += x.onTimeCount || 0;
  t.offSkd += x.offSkdCount || 0;
  t.a += x.aCount || 0;
  t.b += x.bCount || 0;
  t.c += x.cCount || 0;
  t.gha += x.ghaImprovement || 0;
  t.cancel += x.cancelledCount || 0;
  t.total += x.totalFlights || 0;
}
console.log('current aggregates', JSON.stringify(t, null, 2));

const summaries = await db
  .collection('dashboard_summaries')
  .find({ date: { $gte: '2026-02-28', $lte: '2026-03-31' } })
  .toArray();
let s = { onTime: 0, offSkd: 0, a: 0, b: 0, c: 0, gha: 0, cancel: 0, total: 0 };
for (const d of summaries) {
  const p = d.cards?.performanceReport || d.performanceReport || {};
  s.onTime += p.onTimeCount || 0;
  s.offSkd += p.offSkdCount || 0;
  s.a += p.aCount || 0;
  s.b += p.bCount || 0;
  s.c += p.cCount || 0;
  s.gha += p.ghaImprovement || 0;
  s.cancel += p.cancelledCount || 0;
  s.total += p.totalFlights || 0;
}
console.log('dashboard_summaries', JSON.stringify(s, null, 2));
await mongoose.disconnect();
