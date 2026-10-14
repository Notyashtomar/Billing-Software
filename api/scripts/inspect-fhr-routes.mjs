import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const rows = await coll
  .find({ staDates: { $gte: '28/02/2026', $lte: '31/03/2026' } })
  .project({ rampDetails1: 1, mainDetails: 1 })
  .toArray();

const routes = new Map();
for (const d of rows) {
  const r = String(d.rampDetails1?.Route ?? d.mainDetails?.Route ?? '').trim();
  if (r) routes.set(r, (routes.get(r) ?? 0) + 1);
}
console.log([...routes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15));
await mongoose.disconnect();
