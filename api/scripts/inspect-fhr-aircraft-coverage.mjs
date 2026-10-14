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
  .project({ mainDetails: 1, terminalDetails: 1, rampDetails1: 1 })
  .toArray();

let operated = 0;
let hasCategory = 0;
let hasCraft = 0;
let hasBody = 0;
const cats = new Map();

for (const doc of rows) {
  const m = doc.mainDetails ?? {};
  if (m.flightCancelled === true) continue;
  operated += 1;
  const cat = String(m.Cate_of_Flight ?? m.flightCategory ?? '').trim();
  if (cat) {
    hasCategory += 1;
    cats.set(cat, (cats.get(cat) ?? 0) + 1);
  }
  if (m.TypeCraft || m.typeCraft) hasCraft += 1;
  if (m.aircraftBody || m.AircraftBody) hasBody += 1;
}

console.log(JSON.stringify({ operated, hasCategory, hasCraft, hasBody, topCats: [...cats.entries()].slice(0, 10) }));
await mongoose.disconnect();
