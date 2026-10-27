/**
 * Delhi fhr_collection, every stored month:
 *   Baggage Cart / BC  → Blue Collar
 *   Unit Handling / UH → Utility Hand
 *
 * Other stations are not changed. BC at other stations remains Baggage Cart.
 *
 * Usage (from api/): node scripts/fix-del-bc-uh-equipment-names.mjs
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error('missing mongo uri');
  process.exit(1);
}

function correctedName(raw) {
  const compact = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  if (compact === 'baggagecart' || compact === 'bc') return 'Blue Collar';
  if (compact === 'unithandling' || compact === 'uh') return 'Utility Hand';
  return null;
}

await mongoose.connect(uri);
const fhr = mongoose.connection.db.collection('fhr_collection');

const cursor = fhr.find(
  { stationCode: 'DEL', 'equipmentDetails.0': { $exists: true } },
  { projection: { equipmentDetails: 1 } },
);

let flights = 0;
let lines = 0;
const ops = [];
for await (const doc of cursor) {
  let changed = false;
  const equipmentDetails = (doc.equipmentDetails ?? []).map((line) => {
    const next = correctedName(line?.equipment_name);
    if (!next || next === line.equipment_name) return line;
    changed = true;
    lines += 1;
    return { ...line, equipment_name: next };
  });
  if (!changed) continue;
  flights += 1;
  ops.push({
    updateOne: {
      filter: { _id: doc._id, stationCode: 'DEL' },
      update: { $set: { equipmentDetails } },
    },
  });
  if (ops.length >= 200) {
    await fhr.bulkWrite(ops, { ordered: false });
    ops.length = 0;
  }
}
if (ops.length > 0) await fhr.bulkWrite(ops, { ordered: false });

const after = await fhr
  .aggregate([
    { $match: { stationCode: 'DEL', 'equipmentDetails.0': { $exists: true } } },
    { $unwind: '$equipmentDetails' },
    {
      $project: {
        name: { $trim: { input: { $ifNull: ['$equipmentDetails.equipment_name', ''] } } },
      },
    },
    {
      $match: {
        name: {
          $in: ['Baggage Cart', 'Unit Handling', 'Blue Collar', 'Utility Hand', 'BC', 'UH'],
        },
      },
    },
    { $group: { _id: '$name', n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ])
  .toArray();

console.log(JSON.stringify({ flightsUpdated: flights, linesRenamed: lines, remaining: after }));
await mongoose.disconnect();
