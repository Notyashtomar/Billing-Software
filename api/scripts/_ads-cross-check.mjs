import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
await mongoose.connect(uri);
const db = mongoose.connection.db;

async function stationSummary(name, stationFieldHints = ['station', 'stationCode']) {
  const col = db.collection(name);
  const total = await col.estimatedDocumentCount();
  const sample = await col.findOne({});
  const stations = await col
    .aggregate([
      {
        $group: {
          _id: {
            station: '$station',
            stationCode: '$stationCode',
            state: '$state',
          },
          n: { $sum: 1 },
        },
      },
      { $sort: { n: -1 } },
      { $limit: 30 },
    ])
    .toArray();
  return {
    name,
    total,
    stations,
    sampleSnippet: sample
      ? {
          station: sample.station,
          stationCode: sample.stationCode,
          state: sample.state,
          dateKey: sample.dateKey || sample.stdDateKey,
          source: sample.source,
          sourceFileName: sample.sourceFileName,
        }
      : null,
    hintsPresent: Object.fromEntries(
      stationFieldHints.map((f) => [f, sample ? f in sample : false]),
    ),
  };
}

const adsMeta = await stationSummary('ads_metadata_rows');
const raf = await stationSummary('raf_usage_data');

const ads = db.collection('ads_usage_data');
const adsSample = await ads.findOne({});
const adsStates = await ads.aggregate([{ $group: { _id: '$state', n: { $sum: 1 } } }]).toArray();
const adsSources = await ads.aggregate([{ $group: { _id: '$source', n: { $sum: 1 } } }]).toArray();
const adsFiles = await ads
  .aggregate([
    { $group: { _id: '$sourceFileName', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 8 },
  ])
  .toArray();
const adsCategories = await ads
  .aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }, { $sort: { n: -1 } }])
  .toArray();

const fhr = db.collection('fhr_collection');
const fhrStations = await fhr
  .aggregate([{ $group: { _id: '$stationCode', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 15 }])
  .toArray();

// Apr 2026 MAA — try several date shapes used in FHR
const fhrMaaAprCounts = {
  terminalSTA_ymd: await fhr.countDocuments({
    stationCode: 'MAA',
    'terminalDetails.STADate': { $regex: '^2026-04' },
  }),
  terminalSTD_ymd: await fhr.countDocuments({
    stationCode: 'MAA',
    'terminalDetails.STDDate': { $regex: '^2026-04' },
  }),
  mainATD_ymd: await fhr.countDocuments({
    stationCode: 'MAA',
    'mainDetails.ATDDate': { $regex: '^2026-04' },
  }),
  anyMaa: await fhr.countDocuments({ stationCode: 'MAA' }),
};

const raw = db.collection('raw_flight_data');
const rawStations = await raw
  .aggregate([{ $group: { _id: '$stationCode', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 15 }])
  .toArray();
const rawMaaApr = {
  staDates: await raw.countDocuments({
    stationCode: 'MAA',
    staDates: { $elemMatch: { $gte: '2026-04-01', $lte: '2026-04-30' } },
  }),
  anyMaa: await raw.countDocuments({ stationCode: 'MAA' }),
};

const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();
const adsLike = collections.filter((n) => /ads|usage|raf|equipment/i.test(n));

// admin stations: find DLH / DEL / MAA
let adminHits = [];
for (const n of collections.filter((c) => /admin.?station/i.test(c))) {
  const col = db.collection(n);
  for (const code of ['DLH', 'DEL', 'MAA']) {
    const hit = await col.findOne({
      $or: [{ stationCode: code }, { code: new RegExp(`^${code}`, 'i') }],
    });
    if (hit) {
      adminHits.push({
        col: n,
        matched: code,
        stationCode: hit.stationCode,
        code: hit.code,
        city: hit.city,
        airport: hit.airport,
      });
    }
  }
}

console.log(
  JSON.stringify(
    {
      db: mongoose.connection.name,
      adsLikeCollections: adsLike,
      adsStates,
      adsSources,
      adsFiles,
      adsCategories,
      adsSample: adsSample
        ? {
            station: adsSample.station,
            state: adsSample.state,
            dateKey: adsSample.dateKey,
            date: adsSample.date,
            flightNo: adsSample.flightNo,
            source: adsSample.source,
            sourceFileName: adsSample.sourceFileName,
            customerName: adsSample.customerName,
            serviceCode: adsSample.serviceCode,
            category: adsSample.category,
            batchId: adsSample.batchId,
          }
        : null,
      adsMeta,
      raf,
      fhrStations,
      fhrMaaAprCounts,
      rawStations,
      rawMaaApr,
      adminHits,
    },
    null,
    2,
  ),
);
await mongoose.disconnect();
