import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const GHA = new Set([11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52]);

function walk(val, path, hits) {
  if (val == null) return;
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return;
    const m = /^(\d{2})/.exec(s);
    if (m && GHA.has(Number(m[1]))) hits.push({ path, value: s.slice(0, 80) });
    const u = s.toUpperCase();
    if (u.includes('GHA') || u.includes('GROUND HANDLING')) hits.push({ path, value: s.slice(0, 80) });
    return;
  }
  if (Array.isArray(val)) {
    val.forEach((v, i) => walk(v, `${path}[${i}]`, hits));
    return;
  }
  if (typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) walk(v, path ? `${path}.${k}` : k, hits);
  }
}

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const docs = await coll.find({}).toArray();
let docsWithHits = 0;
const samples = [];
for (const d of docs) {
  const inRange = (d.staDates ?? []).some((x) => {
    const p = String(x).split('/');
    if (p.length !== 3) return false;
    const iso = `${p[2]}-${p[1]}-${p[0]}`;
    return iso >= '2026-02-28' && iso <= '2026-03-31';
  });
  if (!inRange) continue;
  const hits = [];
  walk(d, '', hits);
  if (hits.length) {
    docsWithHits++;
    if (samples.length < 3) samples.push({ serial: d.SerialNo, hits: hits.slice(0, 5) });
  }
}
console.log({ inRangeDocs: docs.length, docsWithHits, samples });
await mongoose.disconnect();
