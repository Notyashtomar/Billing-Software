import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const GHA = new Set([11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52]);

function nonEmpty(...v) {
  for (const x of v) {
    const s = String(x ?? '').trim();
    if (s) return s;
  }
  return '';
}

function hasGhaText(s) {
  const u = String(s ?? '').toUpperCase();
  return u.includes('GHA') || u.includes('GROUND HANDLING') || u.includes('GROUND');
}

function hasGhaCode(container) {
  const codes = new Set();
  for (const key of ['arrivalDelays','departureDelays','ArrivalDelays','DepartureDelays']) {
    const arr = container?.[key];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      const reason = nonEmpty(e?.reason, e?.Reason, e?.ReasonofDelay, e?.reasonOfDelay);
      const m = /^(\d{2})/.exec(reason);
      if (m && GHA.has(Number(m[1]))) codes.add(Number(m[1]));
    }
  }
  for (const k of ['ActualDelay','departureDelay','arrivalDelay','departureStatus']) {
    const reason = nonEmpty(container?.[k]);
    const m = /^(\d{2})/.exec(reason);
    if (m && GHA.has(Number(m[1]))) codes.add(Number(m[1]));
    if (hasGhaText(reason)) codes.add(-1);
  }
  return codes.size > 0;
}

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const docs = await coll.find({}).toArray();

let rowD = 0;
const hits = [];
for (const d of docs) {
  const inRange = (d.staDates ?? []).some((x) => {
    const p = String(x).split('/');
    if (p.length !== 3) return false;
    const iso = `${p[2]}-${p[1]}-${p[0]}`;
    return iso >= '2026-02-28' && iso <= '2026-03-31';
  });
  if (!inRange) continue;
  if (d.mainDetails?.flightCancelled) continue;

  const m = { ...(d.mainDetails ?? {}) };
  for (const src of [d.rampDetails1, d.rampDetails3, d.terminalDetails]) {
    if (!src) continue;
    for (const k of Object.keys(src)) {
      if (!nonEmpty(m[k]) && nonEmpty(src[k])) m[k] = src[k];
    }
  }

  const gha = hasGhaCode(m) || hasGhaCode(d);
  if (!gha) continue;

  // crude timing check skipped - just count gha attributed
  rowD++;
  if (hits.length < 5) hits.push({ serial: d.SerialNo, ds: m.departureStatus, gha: true });
}
console.log({ rowD, hits });
await mongoose.disconnect();
