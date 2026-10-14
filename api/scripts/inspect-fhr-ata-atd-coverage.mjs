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
  .project({ mainDetails: 1, rampDetails1: 1, rampDetails3: 1, terminalDetails: 1 })
  .toArray();

let mainAta = 0;
let mainAtd = 0;
let rampAta = 0;
let rampAtd = 0;
let termAta = 0;

for (const d of docs) {
  const m = d.mainDetails ?? {};
  const r1 = d.rampDetails1 ?? {};
  const r3 = d.rampDetails3 ?? {};
  const t = d.terminalDetails ?? {};
  if (m.ATADate || m.ataDate || m.ATATime || m.ataTime) mainAta += 1;
  if (m.ATDDate || m.atdDate || m.ATDTime || m.atdTime) mainAtd += 1;
  if (r1.ataDate || r1.ATADate || r1.ata || r3.ataDate || r3.ata) rampAta += 1;
  if (r1.atdDate || r1.ATDDate || r1.atd || r3.atdDate || r3.atd) rampAtd += 1;
  if (t.ataDate || t.ATADate || t.ata) termAta += 1;
}

console.log(JSON.stringify({ docs: docs.length, mainAta, mainAtd, rampAta, rampAtd, termAta }));
await mongoose.disconnect();
