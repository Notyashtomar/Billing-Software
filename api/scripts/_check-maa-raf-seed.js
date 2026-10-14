/**
 * One-off: verify MAA RAF seed for IND (Indamer) Mar–Jul 2026.
 * Run from BWMS/apps/api: node scripts/_check-maa-raf-seed.js
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const EXPECTED_IND = {
  'GPU-140KV': 11,
  RC: 1,
  WC: 1,
  'GPU-NB': 4,
};

function toYmd(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGO_URI / MONGODB_URI in env');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  console.log('db=', db.databaseName);

  const creation = db.collection('creation-raf');
  const rafAirline = db.collection('advance-raf-airline');
  const fhr = db.collection('fhr_collection');

  const airlines = await rafAirline
    .find({
      $or: [{ airlineCode: /IND/i }, { airline: /indamer/i }],
    })
    .toArray();
  console.log(
    'advance-raf-airline IND:',
    airlines.map((a) => ({
      code: a.airlineCode,
      name: a.airline,
      station: a.stationCode,
    })),
  );

  const flights = await creation
    .find({
      $or: [{ airlineCode: /IND/i }, { airlines: /indamer/i }],
    })
    .toArray();
  console.log('creation-raf IND total:', flights.length);

  const inWindow = flights.filter((f) => {
    const ymd = toYmd(f.operationDate) || toYmd(f.date) || toYmd(f.date2);
    return ymd && ymd >= '2026-03-01' && ymd <= '2026-07-31';
  });
  console.log('creation-raf IND Mar–Jul:', inWindow.length);
  console.log(
    'sample:',
    inWindow.slice(0, 8).map((f) => ({
      serial: f.serialNo,
      date: f.operationDate || f.date,
      flight: f.flightNo,
    })),
  );

  const serials = inWindow
    .map((f) => Number(f.serialNo))
    .filter((n) => Number.isFinite(n) && n > 0);

  const fhrDocs = await fhr
    .find({
      $or: [
        { 'mainDetails.SerialNo': { $in: serials } },
        { 'mainDetails.flightSerialNumber': { $in: serials } },
        { serialNo: { $in: serials } },
      ],
    })
    .toArray();
  console.log('fhr docs for those serials:', fhrDocs.length);

  const counts = {};
  let totalLines = 0;
  const seededFrom = new Set();
  const bySerial = [];

  for (const doc of fhrDocs) {
    const serial =
      doc.mainDetails?.SerialNo ??
      doc.mainDetails?.flightSerialNumber ??
      doc.serialNo;
    const services = doc.rafAdhocDetails?.services || [];
    if (doc.rafAdhocDetails?.seededFrom) {
      seededFrom.add(doc.rafAdhocDetails.seededFrom);
    }
    const codes = [];
    for (const s of services) {
      const code = String(s.equipmentCode || '').trim().toUpperCase();
      if (!code) continue;
      counts[code] = (counts[code] || 0) + 1;
      totalLines += 1;
      codes.push(code);
    }
    bySerial.push({
      serial,
      opsDate: doc.rafAdhocDetails?.stdDate || doc.mainDetails?.STDDate,
      lines: codes.length,
      codes,
      seededFrom: doc.rafAdhocDetails?.seededFrom || null,
    });
  }

  console.log('IND equipment counts:', counts);
  console.log('total equipment lines:', totalLines);
  console.log('seededFrom tags:', [...seededFrom]);
  console.log('per-flight:', JSON.stringify(bySerial, null, 2));

  const mismatches = [];
  for (const [code, expected] of Object.entries(EXPECTED_IND)) {
    const actual = counts[code] || 0;
    if (actual !== expected) {
      mismatches.push({ code, expected, actual });
    }
  }
  for (const code of Object.keys(counts)) {
    if (!(code in EXPECTED_IND)) {
      mismatches.push({ code, expected: 0, actual: counts[code] });
    }
  }

  const allSeeded = await fhr
    .find({ 'rafAdhocDetails.seededFrom': 'MAA_RAF_MARCH-JULY' })
    .toArray();
  let allLines = 0;
  const allCounts = {};
  for (const doc of allSeeded) {
    for (const s of doc.rafAdhocDetails?.services || []) {
      allLines += 1;
      const code = String(s.equipmentCode || '').trim().toUpperCase();
      if (code) allCounts[code] = (allCounts[code] || 0) + 1;
    }
  }
  console.log('all MAA_RAF_MARCH-JULY fhr docs:', allSeeded.length);
  console.log('all seeded equipment lines:', allLines);
  console.log('all seeded by code:', allCounts);

  if (mismatches.length) {
    console.log('FAIL IND mismatches vs Excel:', mismatches);
    process.exitCode = 1;
  } else {
    console.log(
      'PASS IND matches Excel: GPU-140KV=11, RC=1, WC=1, GPU-NB=4',
    );
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
