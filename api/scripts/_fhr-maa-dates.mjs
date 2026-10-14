import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
const db = mongoose.connection.db;

const fhr = db.collection('fhr_collection');
const sampleMaa = await fhr.findOne(
  { stationCode: 'MAA' },
  {
    projection: {
      stationCode: 1,
      'terminalDetails.STADate': 1,
      'terminalDetails.STDDate': 1,
      'mainDetails.ATDDate': 1,
      'mainDetails.ATADate': 1,
      'mainDetails.ArrivalFltNo': 1,
      SerialNo: 1,
    },
  },
);

// sample date field shapes
const dateSamples = await fhr
  .aggregate([
    { $match: { stationCode: 'MAA' } },
    {
      $project: {
        sta: '$terminalDetails.STADate',
        std: '$terminalDetails.STDDate',
        atd: '$mainDetails.ATDDate',
      },
    },
    { $limit: 5 },
  ])
  .toArray();

// try common FRIS date formats for Apr 2026
const formats = [
  { name: 'dd/MM/yyyy', q: { stationCode: 'MAA', 'terminalDetails.STADate': { $regex: '/04/2026$' } } },
  { name: 'dd-MM-yyyy', q: { stationCode: 'MAA', 'terminalDetails.STADate': { $regex: '-04-2026$' } } },
  { name: 'yyyy-MM', q: { stationCode: 'MAA', 'terminalDetails.STADate': { $regex: '2026-04' } } },
  { name: '04/2026 anywhere STA', q: { stationCode: 'MAA', 'terminalDetails.STADate': /04\/2026/ } },
  { name: '04/2026 anywhere ATD', q: { stationCode: 'MAA', 'mainDetails.ATDDate': /04\/2026/ } },
  { name: 'Apr 2025 STA', q: { stationCode: 'MAA', 'terminalDetails.STADate': /04\/2025/ } },
  { name: 'any 2026 STA', q: { stationCode: 'MAA', 'terminalDetails.STADate': /2026/ } },
  { name: 'any 2025 STA', q: { stationCode: 'MAA', 'terminalDetails.STADate': /2025/ } },
];

const counts = {};
for (const f of formats) {
  counts[f.name] = await fhr.countDocuments(f.q);
}

// month histogram from STADate last 6 chars / year
const months = await fhr
  .aggregate([
    { $match: { stationCode: 'MAA', 'terminalDetails.STADate': { $type: 'string' } } },
    {
      $group: {
        _id: '$terminalDetails.STADate',
        n: { $sum: 1 },
      },
    },
    { $sort: { n: -1 } },
    { $limit: 15 },
  ])
  .toArray();

// Also check equipmentManpower on MAA FHR (ops equipment ≠ ADS collection)
const eqMaa = await fhr.countDocuments({
  stationCode: 'MAA',
  equipmentManpower: { $exists: true, $ne: [] },
});

const raw = db.collection('raw_flight_data');
const rawSample = await raw.findOne(
  { stationCode: 'MAA' },
  { projection: { stationCode: 1, staDates: 1, 'data.STA Date': 1, 'data.STD Date': 1 } },
);
const rawMonths = await raw
  .aggregate([
    { $match: { stationCode: 'MAA' } },
    { $unwind: { path: '$staDates', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $substr: [{ $toString: '$staDates' }, 0, 7] },
        n: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ])
  .toArray();

console.log(
  JSON.stringify(
    {
      sampleMaa,
      dateSamples,
      counts,
      topStaDates: months,
      eqMaaWithEquipmentManpower: eqMaa,
      rawSample,
      rawMonths,
    },
    null,
    2,
  ),
);
await mongoose.disconnect();
