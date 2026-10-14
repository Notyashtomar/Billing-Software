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

const counts = { main: 0, r1: 0, r3: 0, term: 0 };
for (const d of docs) {
  if (d.mainDetails?.ATDDate || d.mainDetails?.ATDTime) counts.main += 1;
  if (d.rampDetails1?.ATDDate || d.rampDetails1?.ATDTime) counts.r1 += 1;
  if (d.rampDetails3?.ATDDate || d.rampDetails3?.ATDTime) counts.r3 += 1;
  if (d.terminalDetails?.ATDDate || d.terminalDetails?.ATDTime) counts.term += 1;
}
console.log(JSON.stringify(counts));
await mongoose.disconnect();
