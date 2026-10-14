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

const rows = await mongoose.connection.db
  .collection('fhr_collection')
  .find({ staDates: { $in: dates } })
  .toArray();

const { mapLeanFhrRowsToPerformanceLegs, aggregatePerformanceReportSnapshotFromLegs } =
  require('../dist/dashboard-summary/utils/dashboard-performance-from-fhr.util.js');

const legs = mapLeanFhrRowsToPerformanceLegs(rows);
const snap = aggregatePerformanceReportSnapshotFromLegs(legs);
console.log('live compute', JSON.stringify(snap, null, 2));
console.log('expected image: onTime=35 offSkd=855 a=423 b=240 c=191 gha=1 cancel=119 total=1009');
await mongoose.disconnect();
