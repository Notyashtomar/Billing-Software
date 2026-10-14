import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('dashboard_daily_aggregates');
const docs = await coll.find({
  date: { $gte: '2026-02-28', $lte: '2026-03-31' },
  aggregateType: 'aircraftAnalysis',
  equipmentMode: '',
}).toArray();
const buckets = {};
let schTotal = 0, addlTotal = 0, schOther = 0;
for (const d of docs) {
  const s = d.data?.scheduled ?? {};
  const a = d.data?.additional ?? {};
  schTotal += Number(s.total ?? 0);
  addlTotal += Number(a.total ?? 0);
  schOther += Number(s.other ?? 0);
  for (const k of ['SCH-I-P-NB','SCH-I-P-WB','SCH-D-P-NB','SCH-D-P-WB']) {
    buckets[k] = (buckets[k] ?? 0) + Number(s[k] ?? 0);
  }
}
const addBuckets = {};
for (const d of docs) {
  const a = d.data?.additional ?? {};
  for (const k of ['SCH-I-P-NB','SCH-I-P-WB','SCH-D-P-NB','SCH-D-P-WB']) {
    addBuckets[k] = (addBuckets[k] ?? 0) + Number(a[k] ?? 0);
  }
}
console.log({ schTotal, addlTotal, schOther, scheduled: buckets, additional: addBuckets });
await mongoose.disconnect();
