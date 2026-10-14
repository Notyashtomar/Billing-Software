import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

function nonEmpty(...values) {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function resolveHandling(m) {
  if (!m) return '';
  return nonEmpty(
    m.TypeofHandling,
    m.typeOfHandling,
    m.typeofHandling,
    m.Type_of_Handling,
    m['Type of Handling'],
    m.ops,
    m.operations,
    m.opsType,
    m.Typeofflight,
    m.typeofflight,
  );
}

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const rows = await coll
  .find({ staDates: { $gte: '28/02/2026', $lte: '31/03/2026' } })
  .project({ mainDetails: 1, flightCancelled: 1 })
  .toArray();

let operated = 0;
let sch = 0;
let addl = 0;
let blank = 0;
const labels = new Map();

for (const doc of rows) {
  const m = doc.mainDetails;
  const cancelled =
    m?.flightCancelled === true ||
    String(m?.departureStatus ?? '').toUpperCase().includes('CANC');
  if (cancelled) continue;
  operated += 1;
  const h = resolveHandling(m);
  if (!h) {
    blank += 1;
    continue;
  }
  labels.set(h, (labels.get(h) ?? 0) + 1);
  const u = h.toUpperCase();
  if (/(^|[^A-Z])(ADDL|ADDITIONAL)([^A-Z]|$)/.test(u)) addl += 1;
  else if (/(^|[^A-Z])(SCH|SCHEDULED|TURNAROUND)([^A-Z]|$)/.test(u)) sch += 1;
}

console.log(
  JSON.stringify({
    operated,
    sch,
    addl,
    blank,
    top: [...labels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
  }),
);
await mongoose.disconnect();
