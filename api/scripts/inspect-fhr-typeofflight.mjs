import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const docs = await coll
  .find({ staDates: { $gte: '28/02/2026', $lte: '31/03/2026' } })
  .project({ rampDetails1: 1, rampDetails3: 1, mainDetails: 1 })
  .toArray();

let turnaround = 0;
for (const d of docs) {
  const t = String(d.rampDetails1?.Typeofflight ?? d.rampDetails3?.Typeofflight ?? '').trim();
  if (/turnaround/i.test(t)) turnaround += 1;
}
console.log(JSON.stringify({ docs: docs.length, turnaround }));
await mongoose.disconnect();
