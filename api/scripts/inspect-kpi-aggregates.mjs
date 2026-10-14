import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('dashboard_daily_aggregates');
const docs = await coll
  .find({
    date: { $gte: '2026-02-28', $lte: '2026-03-31' },
    aggregateType: 'kpiStrip',
    equipmentMode: '',
  })
  .toArray();

let sch = 0;
let addl = 0;
let didFly = 0;
let total = 0;
let cancelled = 0;
for (const d of docs) {
  const data = d.data ?? {};
  sch += Number(data.scheduledFlights ?? 0);
  addl += Number(data.additionalFlights ?? 0);
  didFly += Number(data.didFlyFlights ?? 0);
  total += Number(data.totalFlights ?? 0);
  cancelled += Number(data.cancelledFlights ?? 0);
}
console.log({ days: docs.length, total, cancelled, didFly, sch, addl, gap: didFly - sch - addl });

const aa = await coll
  .find({
    date: { $gte: '2026-02-28', $lte: '2026-03-31' },
    aggregateType: 'aircraftAnalysis',
    equipmentMode: '',
  })
  .toArray();
let schTotal = 0;
let addlTotal = 0;
let schOther = 0;
const buckets = {};
for (const d of aa) {
  const data = d.data ?? {};
  const s = data.scheduled ?? {};
  const a = data.additional ?? {};
  schTotal += Number(s.total ?? 0);
  addlTotal += Number(a.total ?? 0);
  schOther += Number(s.other ?? 0);
  for (const k of [
    'SCH-I-P-NB','SCH-I-P-WB','SCH-D-P-NB','SCH-D-P-WB',
    'SCH-I-F-NB','SCH-I-F-WB','SCH-D-F-NB','SCH-D-F-WB',
  ]) {
    buckets[k] = (buckets[k] ?? 0) + Number(s[k] ?? 0);
  }
}
console.log({ aircraft: { schTotal, addlTotal, schOther, buckets } });

const perf = await coll.find({
  date: { $gte: '2026-02-28', $lte: '2026-03-31' },
  aggregateType: 'performanceReport',
  equipmentMode: '',
}).toArray();
let ghaImprovement = 0;
for (const d of perf) ghaImprovement += Number(d.data?.ghaImprovement ?? 0);
console.log({ ghaImprovement });

await mongoose.disconnect();
