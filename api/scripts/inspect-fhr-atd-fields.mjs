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
  .project({ mainDetails: 1, rampDetails1: 1, rampDetails3: 1, terminalDetails: 1, loadControlDetails: 1 })
  .limit(20)
  .toArray();

const keys = new Set();
for (const d of docs) {
  for (const embed of [d.mainDetails, d.rampDetails1, d.rampDetails3, d.terminalDetails, d.loadControlDetails]) {
    if (!embed) continue;
    for (const k of Object.keys(embed)) {
      if (/atd|etd|dep/i.test(k)) keys.add(`${k}`);
    }
  }
}
console.log([...keys].sort());
await mongoose.disconnect();
