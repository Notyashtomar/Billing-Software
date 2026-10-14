/**
 * Verify full MAA RAF Mar–Jul seed: Excel parse vs Mongo.
 * From BWMS/apps/api: node scripts/_check-maa-raf-seed-all.js
 */
require('dotenv').config();
const XLSX = require('xlsx');
const { MongoClient } = require('mongodb');
const { parseMaaRafWorkbook } = require('../dist/excel-import/maa-raf-excel.util.js');

function mergeFlightsByScheduleKey(flights) {
  const byKey = new Map();
  for (const flight of flights) {
    const airline = String(flight.customerName || flight.customerCode)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const flightNo = String(flight.flightNo)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const key = `${airline}|${flightNo}|${flight.operationDate}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...flight, services: [...flight.services] });
      continue;
    }
    existing.services.push(...flight.services);
  }
  return [...byKey.values()];
}

function countFromFlights(flights) {
  const byCode = {};
  const byAirlineCode = {};
  let lines = 0;
  for (const f of flights) {
    const airline = String(f.customerCode || '').trim().toUpperCase() || '?';
    if (!byAirlineCode[airline]) byAirlineCode[airline] = { flights: 0, lines: 0, codes: {} };
    byAirlineCode[airline].flights += 1;
    for (const s of f.services) {
      const code = String(s.equipmentCode || '').trim().toUpperCase();
      if (!code) continue;
      lines += 1;
      byCode[code] = (byCode[code] || 0) + 1;
      byAirlineCode[airline].lines += 1;
      byAirlineCode[airline].codes[code] = (byAirlineCode[airline].codes[code] || 0) + 1;
    }
  }
  return { flights: flights.length, lines, byCode, byAirlineCode };
}

function toYmd(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

async function countFromMongo(db) {
  const creation = db.collection('creation-raf');
  const fhr = db.collection('fhr_collection');

  // Prefer seeded FHR docs; also join creation-raf for identity.
  const seeded = await fhr
    .find({ 'rafAdhocDetails.seededFrom': 'MAA_RAF_MARCH-JULY' })
    .toArray();

  const byCode = {};
  const byAirlineCode = {};
  let lines = 0;
  const serials = [];

  for (const doc of seeded) {
    const airline = String(
      doc.rafAdhocDetails?.airlineCode ||
        doc.mainDetails?.Arline_Code ||
        '',
    )
      .trim()
      .toUpperCase() || '?';
    if (!byAirlineCode[airline]) byAirlineCode[airline] = { flights: 0, lines: 0, codes: {} };
    byAirlineCode[airline].flights += 1;
    const serial =
      doc.mainDetails?.SerialNo ??
      doc.mainDetails?.flightSerialNumber ??
      doc.serialNo;
    if (serial != null) serials.push(Number(serial));

    for (const s of doc.rafAdhocDetails?.services || []) {
      const code = String(s.equipmentCode || '').trim().toUpperCase();
      if (!code) continue;
      lines += 1;
      byCode[code] = (byCode[code] || 0) + 1;
      byAirlineCode[airline].lines += 1;
      byAirlineCode[airline].codes[code] = (byAirlineCode[airline].codes[code] || 0) + 1;
    }
  }

  // creation-raf flights tagged via FHR serials in Mar–Jul (sanity)
  const allCreation = await creation
    .find({ stationCode: 'MAA', isRafFlight: true })
    .project({ serialNo: 1, airlineCode: 1, airlines: 1, operationDate: 1, date: 1, date2: 1, flightNo: 1 })
    .toArray();
  const creationInWindow = allCreation.filter((f) => {
    const ymd = toYmd(f.operationDate) || toYmd(f.date) || toYmd(f.date2);
    return ymd && ymd >= '2026-03-01' && ymd <= '2026-07-31';
  });

  return {
    flights: seeded.length,
    lines,
    byCode,
    byAirlineCode,
    creationRafTotal: allCreation.length,
    creationRafInWindow: creationInWindow.length,
  };
}

function diffMaps(expected, actual) {
  const keys = new Set([...Object.keys(expected || {}), ...Object.keys(actual || {})]);
  const diffs = [];
  for (const k of [...keys].sort()) {
    const e = expected?.[k] || 0;
    const a = actual?.[k] || 0;
    if (e !== a) diffs.push({ key: k, excel: e, mongo: a, delta: a - e });
  }
  return diffs;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGO_URI');
    process.exit(1);
  }

  const wb = XLSX.readFile('data/MAA_RAF_MARCH-JULY.xlsx', {
    cellDates: false,
    raw: true,
  });
  const parsed = parseMaaRafWorkbook(wb, {
    fromYmd: '2026-03-01',
    toYmd: '2026-07-31',
  });
  const merged = mergeFlightsByScheduleKey(parsed.flights);
  const excel = countFromFlights(merged);

  console.log('=== Excel (parse + schedule merge, Mar–Jul) ===');
  console.log({
    sheet: parsed.sheetName,
    excelSerialGroups: parsed.flights.length,
    uniqueFlights: excel.flights,
    equipmentLines: excel.lines,
    skippedOutsideWindow: parsed.skippedOutsideWindow,
    skippedRows: parsed.skippedRows,
    byCode: excel.byCode,
  });

  const client = new MongoClient(uri);
  await client.connect();
  const mongo = await countFromMongo(client.db());
  await client.close();

  console.log('\n=== Mongo (rafAdhocDetails.seededFrom=MAA_RAF_MARCH-JULY) ===');
  console.log({
    seededFlights: mongo.flights,
    equipmentLines: mongo.lines,
    creationRafMaaTotal: mongo.creationRafTotal,
    creationRafInWindow: mongo.creationRafInWindow,
    byCode: mongo.byCode,
  });

  const codeDiffs = diffMaps(excel.byCode, mongo.byCode);
  console.log('\n=== Equipment code totals: Excel vs Mongo ===');
  if (codeDiffs.length === 0) {
    console.log('PASS — all equipment code totals match');
  } else {
    console.log('MISMATCHES:');
    console.table(codeDiffs);
  }

  console.log('\n=== Per-airline equipment lines ===');
  const airlines = new Set([
    ...Object.keys(excel.byAirlineCode),
    ...Object.keys(mongo.byAirlineCode),
  ]);
  const airlineRows = [];
  const airlineFail = [];
  for (const a of [...airlines].sort()) {
    const e = excel.byAirlineCode[a] || { flights: 0, lines: 0, codes: {} };
    const m = mongo.byAirlineCode[a] || { flights: 0, lines: 0, codes: {} };
    const codeDiff = diffMaps(e.codes, m.codes);
    const ok = e.flights === m.flights && e.lines === m.lines && codeDiff.length === 0;
    airlineRows.push({
      airline: a,
      excelFlights: e.flights,
      mongoFlights: m.flights,
      excelLines: e.lines,
      mongoLines: m.lines,
      ok: ok ? 'PASS' : 'FAIL',
    });
    if (!ok) {
      airlineFail.push({ airline: a, codeDiff, excelCodes: e.codes, mongoCodes: m.codes });
    }
  }
  console.table(airlineRows);

  if (airlineFail.length) {
    console.log('\n=== Airline detail failures ===');
    for (const f of airlineFail) {
      console.log(f.airline, {
        excelCodes: f.excelCodes,
        mongoCodes: f.mongoCodes,
        codeDiff: f.codeDiff,
      });
    }
  }

  const flightOk = excel.flights === mongo.flights;
  const lineOk = excel.lines === mongo.lines;
  const codesOk = codeDiffs.length === 0;
  const airlinesOk = airlineFail.length === 0;

  console.log('\n=== SUMMARY ===');
  console.log({
    flights: flightOk ? `PASS ${excel.flights}` : `FAIL excel=${excel.flights} mongo=${mongo.flights}`,
    lines: lineOk ? `PASS ${excel.lines}` : `FAIL excel=${excel.lines} mongo=${mongo.lines}`,
    equipmentCodes: codesOk ? 'PASS' : `FAIL (${codeDiffs.length})`,
    airlines: airlinesOk ? 'PASS' : `FAIL (${airlineFail.length})`,
  });

  if (!(flightOk && lineOk && codesOk && airlinesOk)) {
    process.exitCode = 1;
  } else {
    console.log('PASS — full workbook seed matches Mongo for all flights');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
