import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });
const require = createRequire(import.meta.url);

await mongoose.connect(process.env.MONGO_URI);
const dates = [];
const cur = new Date('2026-02-28T00:00:00Z');
const end = new Date('2026-03-31T00:00:00Z');
while (cur <= end) {
  const d = String(cur.getUTCDate()).padStart(2, '0');
  const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
  dates.push(`${d}/${m}/${cur.getUTCFullYear()}`);
  cur.setUTCDate(cur.getUTCDate() + 1);
}
const rows = await mongoose.connection.db.collection('fhr_collection').find({ staDates: { $in: dates } }).toArray();
const { mapLeanFhrRowsToPerformanceLegs } = require('../dist/dashboard-summary/utils/dashboard-performance-from-fhr.util.js');
const legs = mapLeanFhrRowsToPerformanceLegs(rows);

let withTimings = 0, noLc = 0, delayStatus = 0;
const depStatuses = new Map();
for (const doc of rows) {
  if (!doc.loadControlDetails) noLc++;
}
for (const leg of legs) {
  if (leg.ataMs != null && leg.staMs != null && leg.atdMs != null && leg.stdMs != null) withTimings++;
  const ds = String(leg.departureStatus || '(blank)').trim();
  depStatuses.set(ds, (depStatuses.get(ds) || 0) + 1);
  if (/delay/i.test(ds)) delayStatus++;
}
console.log({ legs: legs.length, withTimings, noLc, delayStatus });
console.log('departureStatus top', [...depStatuses.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10));
await mongoose.disconnect();
