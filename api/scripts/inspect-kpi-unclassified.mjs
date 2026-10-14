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

function handling(doc) {
  const m = { ...(doc.mainDetails ?? {}) };
  for (const src of [doc.rampDetails1, doc.rampDetails3, doc.terminalDetails]) {
    if (!src) continue;
    for (const k of ['TypeofHandling','typeOfHandling','Typeofflight','typeofflight','ops']) {
      if (!nonEmpty(m[k]) && nonEmpty(src[k])) m[k] = src[k];
    }
  }
  return nonEmpty(
    m.TypeofHandling, m.typeOfHandling, m.Typeofflight, m.typeofflight, m.ops,
    doc.typeOfHandling,
  ).toUpperCase();
}

function classify(h) {
  if (/(^|[^A-Z])(ADDL|ADDITIONAL)([^A-Z]|$)/.test(h)) return 'addl';
  if (/(^|[^A-Z])(SCH|SCHEDULED|TURNAROUND)([^A-Z]|$)/.test(h)) return 'sch';
  return 'none';
}

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const rows = await coll.find({}).project({
  mainDetails: 1, rampDetails1: 1, rampDetails3: 1, terminalDetails: 1,
  typeOfHandling: 1, staDates: 1, SerialNo: 1,
}).toArray();

const counts = { sch: 0, addl: 0, none: 0, cancelled: 0 };
const noneSamples = [];
for (const d of rows) {
  const sta = d.staDates?.find((x) => {
    const p = String(x).split('/');
    if (p.length !== 3) return false;
    const iso = `${p[2]}-${p[1]}-${p[0]}`;
    return iso >= '2026-02-28' && iso <= '2026-03-31';
  });
  if (!sta) continue;
  if (d.mainDetails?.flightCancelled) { counts.cancelled++; continue; }
  const h = handling(d);
  const c = classify(h);
  counts[c]++;
  if (c === 'none' && noneSamples.length < 8) {
    noneSamples.push({ serial: d.SerialNo, h, reason: d.mainDetails?.lastSnapshotReason });
  }
}
console.log(counts, noneSamples);
await mongoose.disconnect();
