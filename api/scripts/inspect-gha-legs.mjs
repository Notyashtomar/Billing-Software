import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const GHA = new Set([11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52]);

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const docs = await coll.find({ staDates: { $gte: '28/02/2026', $lte: '31/03/2026' } }).toArray();

let withGhaCode = 0;
let withDelayStatus = 0;
let withBoth = 0;
for (const d of docs) {
  const m = d.mainDetails ?? {};
  const ds = String(m.departureStatus ?? m.DepartureStatus ?? '').toLowerCase();
  if (ds.includes('delay')) withDelayStatus++;
  let hasGha = false;
  for (const key of ['arrivalDelays', 'departureDelays']) {
    const arr = m[key];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      const reason = String(e?.reason ?? e?.Reason ?? e?.delayReason ?? '');
      const m2 = /^(\d{2})/.exec(reason.trim());
      if (m2 && GHA.has(Number(m2[1]))) hasGha = true;
    }
  }
  if (hasGha) withGhaCode++;
  if (hasGha && ds.includes('delay')) withBoth++;
}
console.log({ docs: docs.length, withGhaCode, withDelayStatus, withBoth });
await mongoose.disconnect();
