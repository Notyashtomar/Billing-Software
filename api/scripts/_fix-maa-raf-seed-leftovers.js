/**
 * Find leftover MAA RAF seed docs (pre date-fix wrong dates), delete them, re-seed, verify.
 * From BWMS/apps/api: node scripts/_fix-maa-raf-seed-leftovers.js
 */
require('dotenv').config();
const XLSX = require('xlsx');
const { MongoClient } = require('mongodb');
const { parseMaaRafWorkbook } = require('../dist/excel-import/maa-raf-excel.util.js');

function scheduleKey(airlineName, flightNo, operationDate) {
  const airline = String(airlineName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const fn = String(flightNo || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return `${airline}|${fn}|${String(operationDate || '').trim()}`;
}

function mergeFlights(flights) {
  const byKey = new Map();
  for (const f of flights) {
    const key = scheduleKey(
      f.customerName || f.customerCode,
      f.flightNo,
      f.operationDate,
    );
    if (!byKey.has(key)) byKey.set(key, { ...f, services: [...f.services] });
    else byKey.get(key).services.push(...f.services);
  }
  return byKey;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('No MONGO_URI');

  const wb = XLSX.readFile('data/MAA_RAF_MARCH-JULY.xlsx', {
    cellDates: false,
    raw: true,
  });
  const parsed = parseMaaRafWorkbook(wb, {
    fromYmd: '2026-03-01',
    toYmd: '2026-07-31',
  });
  const expectedByKey = mergeFlights(parsed.flights);
  const expectedKeys = new Set(expectedByKey.keys());

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const fhr = db.collection('fhr_collection');
  const creation = db.collection('creation-raf');

  const seeded = await fhr
    .find({ 'rafAdhocDetails.seededFrom': 'MAA_RAF_MARCH-JULY' })
    .toArray();

  const extraFhr = [];
  const matchFhr = [];
  for (const d of seeded) {
    const key = scheduleKey(
      d.rafAdhocDetails?.airline || d.mainDetails?.Airline,
      d.rafAdhocDetails?.flightNo || d.mainDetails?.FlightNo,
      d.rafAdhocDetails?.stdDate ||
        d.mainDetails?.STDDate ||
        d.mainDetails?.STADate,
    );
    const serial = Number(
      d.mainDetails?.SerialNo ?? d.mainDetails?.flightSerialNumber ?? d.serialNo,
    );
    const row = {
      _id: d._id,
      serial,
      key,
      lines: (d.rafAdhocDetails?.services || []).length,
      code: d.rafAdhocDetails?.airlineCode,
    };
    if (expectedKeys.has(key)) matchFhr.push(row);
    else extraFhr.push(row);
  }

  const seedCreation = await creation
    .find({
      stationCode: 'MAA',
      $or: [{ createdBy: 'seed:maa-raf' }, { modifiedBy: 'seed:maa-raf' }],
    })
    .toArray();

  const extraCreation = [];
  for (const f of seedCreation) {
    const key = scheduleKey(f.airlines, f.flightNo, f.operationDate || f.date);
    if (!expectedKeys.has(key)) {
      extraCreation.push({
        _id: f._id,
        serial: f.serialNo,
        key,
        code: f.airlineCode,
      });
    }
  }

  console.log({
    expectedFlights: expectedKeys.size,
    mongoSeededFhr: seeded.length,
    matchingFhr: matchFhr.length,
    extraFhr: extraFhr.length,
    seedCreation: seedCreation.length,
    extraCreation: extraCreation.length,
    dryRun,
  });
  console.log('\nExtra FHR (leftovers):');
  console.table(extraFhr.map(({ serial, key, lines, code }) => ({ serial, key, lines, code })));
  console.log('\nExtra creation-raf:');
  console.table(extraCreation.map(({ serial, key, code }) => ({ serial, key, code })));

  if (dryRun) {
    await client.close();
    return;
  }

  const extraSerials = [
    ...new Set(
      [...extraFhr, ...extraCreation]
        .map((r) => Number(r.serial))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];

  if (extraFhr.length) {
    const delFhr = await fhr.deleteMany({
      _id: { $in: extraFhr.map((r) => r._id) },
    });
    console.log('Deleted extra FHR:', delFhr.deletedCount);
  }

  if (extraCreation.length) {
    const delCr = await creation.deleteMany({
      _id: { $in: extraCreation.map((r) => r._id) },
    });
    console.log('Deleted extra creation-raf:', delCr.deletedCount);
  }

  // Also purge any leftover FHR keyed by those serials still tagged seed
  if (extraSerials.length) {
    const delBySerial = await fhr.deleteMany({
      'rafAdhocDetails.seededFrom': 'MAA_RAF_MARCH-JULY',
      $or: [
        { 'mainDetails.SerialNo': { $in: extraSerials } },
        { 'mainDetails.flightSerialNumber': { $in: extraSerials } },
        { serialNo: { $in: extraSerials } },
      ],
    });
    console.log('Deleted leftover FHR by serial:', delBySerial.deletedCount);
  }

  await client.close();
  console.log('Cleanup done. Re-run: npm run seed:maa-raf && node scripts/_check-maa-raf-seed-all.js');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
