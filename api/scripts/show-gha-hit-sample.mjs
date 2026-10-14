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
  if (Array.isArray(val)) val.forEach((v, i) => walk(v, `${path}[${i}]`, hits));
  else if (typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) walk(v, path ? `${path}.${k}` : k, hits);
  }
}

await mongoose.connect(process.env.MONGO_URI);
const d = await mongoose.connection.db.collection('fhr_collection').findOne({ SerialNo: 16616 });
const hits = [];
walk(d, '', hits);
console.log(hits.slice(0, 10));
await mongoose.disconnect();
