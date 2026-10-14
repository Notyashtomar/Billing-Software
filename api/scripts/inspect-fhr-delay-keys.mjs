import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const DELAY_KEYS = /delay|reason|gha|actual/i;

function scan(obj, path = '') {
  const hits = [];
  if (!obj || typeof obj !== 'object') return hits;
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (DELAY_KEYS.test(k) && v != null && v !== '' && !(Array.isArray(v) && v.length === 0)) {
      hits.push({ path: p, value: Array.isArray(v) ? JSON.stringify(v).slice(0, 120) : String(v).slice(0, 120) });
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && path.split('.').length < 3) {
      hits.push(...scan(v, p));
    }
  }
  return hits;
}

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const docs = await coll.find({ staDates: { $gte: '28/02/2026', $lte: '31/03/2026' } }).limit(5).toArray();
for (const d of docs) {
  const hits = [
    ...scan(d.mainDetails, 'mainDetails'),
    ...scan(d.rampDetails1, 'rampDetails1'),
    ...scan(d.rampDetails3, 'rampDetails3'),
    ...scan(d.terminalDetails, 'terminalDetails'),
    ...scan(d.loadControlDetails, 'loadControlDetails'),
  ];
  if (hits.length) console.log(d.SerialNo, hits);
}
console.log('done');
await mongoose.disconnect();
