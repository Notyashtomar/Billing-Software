import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const fhr = mongoose.connection.db.collection('fhr_collection');
const main = mongoose.connection.db.collection('mainDetails');

const dates = [];
const cur = new Date('2026-02-28T00:00:00Z');
const end = new Date('2026-03-31T00:00:00Z');
while (cur <= end) {
  const d = String(cur.getUTCDate()).padStart(2, '0');
  const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
  dates.push(`${d}/${m}/${cur.getUTCFullYear()}`);
  cur.setUTCDate(cur.getUTCDate() + 1);
}

const windowFilter = { staDates: { $in: dates } };
const total = await fhr.countDocuments(windowFilter);
const operatedFilter = {
  ...windowFilter,
  'mainDetails.flightCancelled': { $ne: true },
  flightNo: { $not: /CANC/i },
};
const operated = await fhr.countDocuments(operatedFilter);

const blankHandling = await fhr.countDocuments({
  ...operatedFilter,
  $or: [
    { 'mainDetails.TypeofHandling': { $in: ['', null] } },
    { 'mainDetails.TypeofHandling': { $exists: false } },
  ],
});
const hasHandling = await fhr.countDocuments({
  ...operatedFilter,
  'mainDetails.TypeofHandling': { $nin: ['', null] },
});

console.log({ total, operated, blankHandling, hasHandling });

const reasonsBlank = await fhr.aggregate([
  {
    $match: {
      ...operatedFilter,
      $or: [
        { 'mainDetails.TypeofHandling': { $in: ['', null] } },
        { 'mainDetails.TypeofHandling': { $exists: false } },
      ],
    },
  },
  { $group: { _id: '$lastSnapshotReason', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
console.log('\nlastSnapshotReason (operated blank handling):');
console.table(reasonsBlank);

const reasonsHas = await fhr.aggregate([
  {
    $match: {
      ...operatedFilter,
      'mainDetails.TypeofHandling': { $nin: ['', null] },
    },
  },
  { $group: { _id: '$lastSnapshotReason', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
console.log('\nlastSnapshotReason (operated has handling):');
console.table(reasonsHas);

// Compare fhr embed vs mainDetails collection for operated blank
const sample = await fhr.findOne(
  {
    ...operatedFilter,
    'mainDetails.TypeofHandling': { $in: ['', null] },
    SerialNo: { $gte: 16000 },
  },
  { projection: { SerialNo: 1, mainDetails: 1, lastSnapshotReason: 1, lastSnapshotAt: 1, rampDetails1: 1 } },
);
if (sample) {
  const src = await main.findOne({ SerialNo: sample.SerialNo });
  console.log('\nSample instance serial', sample.SerialNo);
  console.log('  lastReason:', sample.lastSnapshotReason, sample.lastSnapshotAt);
  console.log('  fhr main keys with values:', Object.entries(sample.mainDetails || {}).filter(([, v]) => String(v ?? '').trim()).slice(0, 12));
  console.log('  src main TypeofHandling:', src?.TypeofHandling, 'Cate:', src?.Cate_of_Flight);
  console.log('  ramp Route:', sample.rampDetails1?.Route, 'Typeofflight:', sample.rampDetails1?.Typeofflight);
}

// Master serials (6-digit) with handling in window
const masters = await fhr.countDocuments({
  ...windowFilter,
  SerialNo: { $gte: 100000, $lte: 999999 },
  'mainDetails.TypeofHandling': { $nin: ['', null] },
});
console.log('\n6-digit masters with TypeofHandling in window:', masters);

await mongoose.disconnect();
