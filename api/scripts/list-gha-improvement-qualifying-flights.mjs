/**
 * List flights qualifying for performance report row d (Improvement for GHA)
 * using current legMatchesPerformanceReportGhaImprovementRow rules.
 *
 * Usage:
 *   node scripts/list-gha-improvement-qualifying-flights.mjs
 *   node scripts/list-gha-improvement-qualifying-flights.mjs --from 2026-02-28 --to 2026-03-31
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });
const require = createRequire(import.meta.url);

const FROM = process.argv.includes('--from')
  ? process.argv[process.argv.indexOf('--from') + 1]
  : '2026-02-28';
const TO = process.argv.includes('--to')
  ? process.argv[process.argv.indexOf('--to') + 1]
  : '2026-03-31';

function ymdRangeToDdMmYyyyList(fromYmd, toYmd) {
  const out = [];
  const cur = new Date(`${fromYmd}T00:00:00Z`);
  const end = new Date(`${toYmd}T00:00:00Z`);
  while (cur <= end) {
    const d = String(cur.getUTCDate()).padStart(2, '0');
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    out.push(`${d}/${m}/${cur.getUTCFullYear()}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

await mongoose.connect(process.env.MONGO_URI);
const dates = ymdRangeToDdMmYyyyList(FROM, TO);
const rows = await mongoose.connection.db
  .collection('fhr_collection')
  .find({ staDates: { $in: dates } })
  .toArray();

const {
  aggregatePerformanceReportSnapshotFromLegs,
  buildPerformanceDrilldownFromLeanRows,
  mapLeanFhrRowsToPerformanceLegs,
} = require('../dist/dashboard-summary/utils/dashboard-performance-from-fhr.util.js');

const legs = mapLeanFhrRowsToPerformanceLegs(rows);
const snap = aggregatePerformanceReportSnapshotFromLegs(legs);
const drill = buildPerformanceDrilldownFromLeanRows(rows);

const qualifying = drill.flights
  .filter((f) => f.inPerformanceReportGhaImprovementRow === true)
  .map((f) => {
    const staMs = Date.parse(f.sta);
    const ataMs = Date.parse(f.ata);
    const stdMs = Date.parse(f.std);
    const atdMs = Date.parse(f.atd);
    let path = 'unknown';
    if (Number.isFinite(staMs) && Number.isFinite(ataMs) && ataMs > staMs) {
      path = 'path1-after-sta';
    } else if (
      Number.isFinite(staMs) &&
      Number.isFinite(ataMs) &&
      Number.isFinite(stdMs) &&
      Number.isFinite(atdMs) &&
      ataMs < staMs &&
      atdMs > stdMs
    ) {
      path = 'path2-before-sta-late-dep';
    }
    return {
      serialNo: f.serialNo,
      flightNo: f.flightNo,
      path,
      sta: f.sta,
      ata: f.ata,
      std: f.std,
      atd: f.atd,
      agtMinutes: f.agtMinutes,
      sgtMinutes: f.sgtMinutes,
      hasStationGhaDelayCode: f.hasStationGhaDelayCode,
    };
  });

qualifying.sort((a, b) => (a.serialNo ?? 0) - (b.serialNo ?? 0));

console.log(
  JSON.stringify(
    {
      range: { from: FROM, to: TO },
      ghaImprovementCountFromAggregate: snap.ghaImprovement,
      qualifyingFlightCount: qualifying.length,
      serialNumbers: qualifying.map((q) => q.serialNo).filter((s) => s != null),
      flights: qualifying,
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
