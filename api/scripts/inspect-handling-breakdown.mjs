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

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const rows = await coll
  .find({ staDates: { $gte: '28/02/2026', $lte: '31/03/2026' } })
  .project({ mainDetails: 1, rampDetails1: 1 })
  .toArray();

let operated = 0;
let schExplicit = 0;
let addlExplicit = 0;
let turnaroundOnly = 0;
let blank = 0;
const labels = new Map();

for (const d of rows) {
  const m = d.mainDetails ?? {};
  if (m.flightCancelled === true) continue;
  operated += 1;
  const toh = nonEmpty(m.TypeofHandling, m.typeOfHandling);
  const tof = nonEmpty(m.Typeofflight, d.rampDetails1?.Typeofflight);
  const label = toh || `(tof:${tof})` || '(blank)';
  labels.set(label, (labels.get(label) ?? 0) + 1);
  const u = toh.toUpperCase();
  if (/(ADDL|ADDITIONAL)/.test(u)) addlExplicit += 1;
  else if (/(^|[^A-Z])(SCH|SCHEDULED)([^A-Z]|$)/.test(u)) schExplicit += 1;
  else if (!toh && /turnaround/i.test(tof)) turnaroundOnly += 1;
  else if (!toh) blank += 1;
}

console.log(JSON.stringify({ operated, schExplicit, addlExplicit, turnaroundOnly, blank, top: [...labels.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12) }));
await mongoose.disconnect();
