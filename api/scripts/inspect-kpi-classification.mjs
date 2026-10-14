import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

function nonEmpty(...v) {
  for (const x of v) {
    const s = String(x ?? '').trim();
    if (s) return s;
  }
  return '';
}

function classify(h) {
  const u = h.toUpperCase();
  if (/(^|[^A-Z])(ADDL|ADDITIONAL)([^A-Z]|$)/.test(u)) return 'addl';
  if (/(^|[^A-Z])(SCH|SCHEDULED|TURNAROUND)([^A-Z]|$)/.test(u)) return 'sch';
  return 'none';
}

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const rows = await coll
  .find({ staDates: { $gte: '28/02/2026', $lte: '31/03/2026' } })
  .project({ mainDetails: 1, rampDetails1: 1, rampDetails3: 1 })
  .toArray();

let sch = 0, addl = 0, none = 0, cancelled = 0;
for (const d of rows) {
  if (d.mainDetails?.flightCancelled) { cancelled++; continue; }
  const m = { ...(d.mainDetails ?? {}) };
  for (const src of [d.rampDetails1, d.rampDetails3]) {
    if (!src) continue;
    for (const k of ['TypeofHandling', 'typeOfHandling', 'Typeofflight', 'ops']) {
      if (!nonEmpty(m[k]) && nonEmpty(src[k])) m[k] = src[k];
    }
  }
  const h = nonEmpty(m.TypeofHandling, m.typeOfHandling, m.Typeofflight, m.ops);
  const c = classify(h);
  if (c === 'sch') sch++;
  else if (c === 'addl') addl++;
  else none++;
}
console.log({ total: rows.length, cancelled, operated: rows.length - cancelled, sch, addl, none, sum: sch + addl });
await mongoose.disconnect();
