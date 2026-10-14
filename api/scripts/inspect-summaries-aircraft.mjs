import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('dashboard_summaries');
const docs = await coll.find({ summaryDate: { $gte: '2026-02-28', $lte: '2026-03-31' } }).toArray();
let s = {}, a = {};
for (const d of docs) {
  const ac = d.cards?.aircraftAnalysis ?? {};
  const sch = ac.scheduled ?? {};
  const add = ac.additional ?? {};
  for (const k of ['SCH-I-P-NB','SCH-I-P-WB','SCH-D-P-NB','SCH-D-P-WB','total','other']) {
    s[k] = (s[k] ?? 0) + Number(sch[k] ?? 0);
    a[k] = (a[k] ?? 0) + Number(add[k] ?? 0);
  }
}
console.log({ summaries: { scheduled: s, additional: a } });
await mongoose.disconnect();
