import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const GHA = new Set([11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52]);

function scanText(s) {
  const hits = [];
  const t = String(s ?? '').trim();
  if (!t) return hits;
  const m = /^(\d{2})/.exec(t);
  if (m && GHA.has(Number(m[1]))) hits.push(Number(m[1]));
  return hits;
}

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const docs = await coll.find({ staDates: { $gte: '28/02/2026', $lte: '31/03/2026' } }).toArray();

let ghaHits = 0;
const samples = [];
for (const d of docs) {
  const m = d.mainDetails ?? {};
  const texts = [
    m.ActualDelay,
    m.departureDelay,
    m.arrivalDelay,
    m.departureStatus,
    m.DepartureStatus,
    d.departureStatus,
  ];
  for (const key of ['arrivalDelays', 'departureDelays', 'ArrivalDelays', 'DepartureDelays']) {
    const arr = m[key];
    if (Array.isArray(arr)) {
      for (const e of arr) {
        texts.push(e?.reason, e?.Reason, e?.ReasonofDelay, e?.reasonOfDelay);
      }
    }
  }
  for (const embed of [d.rampDetails1, d.rampDetails3, d.terminalDetails]) {
    if (!embed) continue;
    texts.push(embed.departureDelay, embed.arrivalDelay, embed.ActualDelay);
  }
  const codes = new Set();
  for (const t of texts) for (const c of scanText(t)) codes.add(c);
  if (codes.size) {
    ghaHits++;
    if (samples.length < 5) {
      samples.push({ serial: d.SerialNo, codes: [...codes], ds: m.departureStatus });
    }
  }
}
console.log({ docs: docs.length, ghaHits, samples });
await mongoose.disconnect();
