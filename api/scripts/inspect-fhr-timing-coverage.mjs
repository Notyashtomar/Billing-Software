import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

function nonEmpty(...values) {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function parseDdMmYyyy(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseTimeToMs(timeRaw, dateYmd) {
  const t = String(timeRaw ?? '').trim();
  if (!t || !dateYmd) return null;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!hm) return null;
  const d = new Date(`${dateYmd}T${hm[1].padStart(2, '0')}:${hm[2]}:00`);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

function datetimeMs(dateRaw, timeRaw, fallbacks = []) {
  const dates = [dateRaw, ...fallbacks].map((d) => {
    const s = String(d ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return parseDdMmYyyy(s);
  });
  for (const d of dates) {
    if (!d) continue;
    const ms = parseTimeToMs(timeRaw, d);
    if (ms != null) return ms;
  }
  return null;
}

function performanceTiming(main, lc, terminal, ramp1, ramp3) {
  if (!main) return null;
  const staDate = nonEmpty(lc?.STADate, lc?.staDate, terminal?.STADate, terminal?.staDate, ramp1?.STADate, ramp1?.staDate, ramp3?.STADate, ramp3?.staDate);
  const stdDate = nonEmpty(lc?.STDDate, lc?.stdDate, terminal?.STDDate, terminal?.stdDate, ramp1?.STDDate, ramp1?.stdDate, ramp3?.STDDate, ramp3?.stdDate, staDate);
  const staTime = nonEmpty(lc?.STATime, lc?.staTime, lc?.sta, terminal?.STATime, terminal?.staTime, terminal?.sta, ramp1?.STATime, ramp1?.sta, ramp3?.STATime, ramp3?.sta);
  const stdTime = nonEmpty(lc?.STDTime, lc?.stdTime, lc?.std, terminal?.STDTime, terminal?.stdTime, terminal?.std, ramp1?.STDTime, ramp1?.std, ramp3?.STDTime, ramp3?.std);
  const ataDate = nonEmpty(main.ATADate, main.ataDate, ramp1?.ATADate, ramp1?.ataDate, ramp3?.ATADate, ramp3?.ataDate, staDate);
  const ataTime = nonEmpty(main.ATATime, main.ataTime, ramp1?.ATATime, ramp1?.ata, ramp3?.ATATime, ramp3?.ata);
  const atdDate = nonEmpty(main.ATDDate, main.atdDate, ataDate, staDate);
  const atdTime = nonEmpty(main.ATDTime, main.atdTime);
  const ataMs = datetimeMs(ataDate, ataTime, [staDate]);
  const staMs = datetimeMs(staDate, staTime, [stdDate]);
  const stdMs = datetimeMs(stdDate, stdTime, [staDate]);
  const atdMs = datetimeMs(atdDate, atdTime, [ataDate, staDate]);
  if (ataMs == null || staMs == null || atdMs == null || stdMs == null) return null;
  return { ataMs, staMs, atdMs, stdMs };
}

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const rows = await coll
  .find({ staDates: { $gte: '28/02/2026', $lte: '31/03/2026' } })
  .project({ mainDetails: 1, loadControlDetails: 1, terminalDetails: 1, rampDetails1: 1, rampDetails3: 1 })
  .toArray();

let total = 0;
let cancelled = 0;
let fullTiming = 0;
let onTime = 0;
for (const doc of rows) {
  total += 1;
  const m = doc.mainDetails;
  if (m?.flightCancelled === true) {
    cancelled += 1;
    continue;
  }
  const t = performanceTiming(m, doc.loadControlDetails, doc.terminalDetails, doc.rampDetails1, doc.rampDetails3);
  if (t) {
    fullTiming += 1;
    if (t.ataMs === t.staMs && t.atdMs === t.stdMs) onTime += 1;
  }
}

console.log(JSON.stringify({ total, cancelled, didFly: total - cancelled, fullTiming, onTime }));
await mongoose.disconnect();
