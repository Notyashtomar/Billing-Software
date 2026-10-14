import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const fhr = db.collection('fhr_collection');

const total = await fhr.countDocuments();
const withEmbed = await fhr.countDocuments({ mainDetails: { $exists: true, $ne: null } });
const blankHandling = await fhr.countDocuments({
  $or: [
    { 'mainDetails.TypeofHandling': { $in: ['', null] } },
    { 'mainDetails.TypeofHandling': { $exists: false } },
  ],
});
const hasHandling = await fhr.countDocuments({ 'mainDetails.TypeofHandling': { $nin: ['', null] } });
const blankCat = await fhr.countDocuments({
  $or: [
    { 'mainDetails.Cate_of_Flight': { $in: ['', null] } },
    { 'mainDetails.Cate_of_Flight': { $exists: false } },
  ],
});
const hasCat = await fhr.countDocuments({ 'mainDetails.Cate_of_Flight': { $nin: ['', null] } });

// Operated (non CANC flightNo) in Feb-Mar window
const operated = await fhr.countDocuments({
  flightNo: { $not: /CANC/i },
  staDates: { $elemMatch: { $gte: '2026-02-28', $lte: '2026-03-31' } },
});
const operatedBlankHandling = await fhr.countDocuments({
  flightNo: { $not: /CANC/i },
  staDates: { $elemMatch: { $gte: '2026-02-28', $lte: '2026-03-31' } },
  $or: [
    { 'mainDetails.TypeofHandling': { $in: ['', null] } },
    { 'mainDetails.TypeofHandling': { $exists: false } },
  ],
});
const operatedHasHandling = await fhr.countDocuments({
  flightNo: { $not: /CANC/i },
  staDates: { $elemMatch: { $gte: '2026-02-28', $lte: '2026-03-31' } },
  'mainDetails.TypeofHandling': { $nin: ['', null] },
});

console.log({
  total,
  withEmbed,
  blankHandling,
  hasHandling,
  blankCat,
  hasCat,
  operated,
  operatedBlankHandling,
  operatedHasHandling,
});

// lastSnapshotReason for docs with blank vs populated handling
const reasonsBlank = await fhr.aggregate([
  {
    $match: {
      flightNo: { $not: /CANC/i },
      staDates: { $elemMatch: { $gte: '2026-02-28', $lte: '2026-03-31' } },
      $or: [
        { 'mainDetails.TypeofHandling': { $in: ['', null] } },
        { 'mainDetails.TypeofHandling': { $exists: false } },
      ],
    },
  },
  { $group: { _id: '$lastSnapshotReason', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
  { $limit: 15 },
]).toArray();

const reasonsHas = await fhr.aggregate([
  {
    $match: {
      flightNo: { $not: /CANC/i },
      staDates: { $elemMatch: { $gte: '2026-02-28', $lte: '2026-03-31' } },
      'mainDetails.TypeofHandling': { $nin: ['', null] },
    },
  },
  { $group: { _id: '$lastSnapshotReason', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
  { $limit: 15 },
]).toArray();

console.log('\nlastSnapshotReason (operated, blank TypeofHandling):');
console.table(reasonsBlank);
console.log('\nlastSnapshotReason (operated, has TypeofHandling):');
console.table(reasonsHas);

// Sample operated with blank mainDetails keys but embed exists
const sampleBlank = await fhr.findOne(
  {
    flightNo: { $not: /CANC/i },
    staDates: { $elemMatch: { $gte: '2026-02-28', $lte: '2026-03-31' } },
    'mainDetails.TypeofHandling': { $in: ['', null] },
    mainDetails: { $exists: true },
  },
  { projection: { SerialNo: 1, flightNo: 1, mainDetails: 1, lastSnapshotReason: 1, updatedAt: 1 } },
);
console.log('\nsample blank operated:', JSON.stringify(sampleBlank, null, 2));

await mongoose.disconnect();
