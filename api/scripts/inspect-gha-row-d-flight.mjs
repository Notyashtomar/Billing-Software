/**
 * Inspect a single flight against performance report row d (Improvement for GHA).
 * Usage: node scripts/inspect-gha-row-d-flight.mjs 17548
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });
const require = createRequire(import.meta.url);

const serialArg = process.argv[2] ?? '17548';
const serial = Number(serialArg);
if (!Number.isFinite(serial)) {
  console.error('Usage: node scripts/inspect-gha-row-d-flight.mjs <serialNo>');
  process.exit(1);
}

const GHA_CODES = new Set([
  11, 12, 13, 15, 17, 18, 19, 21, 22, 23, 28, 29, 31, 32, 33, 34, 35, 37, 38, 39, 52,
]);

function pickReason(o) {
  for (const k of [
    'reasonOfDelay',
    'ReasonofDelay',
    'ReasonOfDelay',
    'reason',
    'Reason',
    'Reason of Delay',
  ]) {
    const s = String(o?.[k] ?? '').trim();
    if (s) return s;
  }
  return '';
}

function extractGhaCodes(container) {
  const codes = [];
  for (const key of ['arrivalDelays', 'ArrivalDelays', 'departureDelays', 'DepartureDelays']) {
    const arr = container?.[key];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      if (!e || typeof e !== 'object') continue;
      const reason = pickReason(e);
      const pair = reason.slice(0, 2);
      if (/^\d{2}$/.test(pair) && GHA_CODES.has(Number(pair))) {
        codes.push({ code: Number(pair), reason, source: key });
      }
    }
  }
  return codes;
}

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;

const doc = await db.collection('fhr_collection').findOne({
  $or: [{ SerialNo: serial }, { flightSerialNumber: serial }, { 'mainDetails.flightSerialNumber': serial }],
});

if (!doc) {
  console.log(JSON.stringify({ serial, found: false }, null, 2));
  await mongoose.disconnect();
  process.exit(0);
}

const { FhrCollectionService } = require('../dist/fhr-collection/services/fhr-collection.service.js');
const {
  mapLeanFhrRowsToPerformanceLegs,
  buildPerformanceDrilldownFromLeanRows,
  aggregatePerformanceReportSnapshotFromLegs,
} = require('../dist/dashboard-summary/utils/dashboard-performance-from-fhr.util.js');

const m = doc.mainDetails ?? {};
const lc = doc.loadControlDetails ?? {};
const td = doc.terminalDetails;
const r1 = doc.rampDetails1;
const r3 = doc.rampDetails3;

const timings = FhrCollectionService.performanceTimingMsFromFhrEmbeds(m, lc);
const staYmd = FhrCollectionService.fhrDocumentStaYmd(m, td, r1, r3);
const cancelled = FhrCollectionService.fhrLeanDocIsCancelled(doc);
const depStatus = String(m.departureStatus ?? m.DepartureStatus ?? doc.departureStatus ?? '').trim();

const ghaFromMain = extractGhaCodes(m);
const ghaFromLeg = extractGhaCodes({
  arrivalDelays: m.arrivalDelays ?? doc.arrivalDelays,
  departureDelays: m.departureDelays ?? doc.departureDelays,
});
const allGha = [...ghaFromMain, ...ghaFromLeg];

const legs = mapLeanFhrRowsToPerformanceLegs([doc]);
const leg = legs[0] ?? null;
const drill = buildPerformanceDrilldownFromLeanRows([doc]);
const drillRow = drill.flights.find((f) => f.serialNo === serial) ?? drill.flights[0] ?? null;

let path1 = false;
let path2 = false;
let agtGtSgt = false;
let ataGtSta = false;
let ataLtSta = false;
let atdGtStd = false;
let agt = null;
let sgt = null;

if (timings) {
  const { ataMs, staMs, atdMs, stdMs } = timings;
  agt = (atdMs - ataMs) / 60000;
  sgt = (stdMs - staMs) / 60000;
  agtGtSgt = agt > sgt;
  ataGtSta = ataMs > staMs;
  ataLtSta = ataMs < staMs;
  atdGtStd = atdMs > stdMs;
  const isDelay = ['delay', 'delayed'].includes(depStatus.toLowerCase().replace(/\s+/g, ' '));
  const hasGha = allGha.length > 0 && isDelay;
  if (hasGha && ataGtSta && agtGtSgt) path1 = true;
  if (hasGha && ataLtSta && atdGtStd && agtGtSgt) path2 = true;
}

const inRangeFebMar =
  staYmd && staYmd >= '2026-02-28' && staYmd <= '2026-03-31';

const report = {
  serial,
  found: true,
  flightNo: drillRow?.flightNo ?? null,
  staYmd,
  inDefaultDashboardRange: inRangeFebMar,
  staDates: doc.staDates ?? [],
  cancelled,
  departureStatus: depStatus,
  isDepartureDelayStatus: ['delay', 'delayed'].includes(
    depStatus.toLowerCase().replace(/\s+/g, ' '),
  ),
  timings: timings
    ? {
        sta: new Date(timings.staMs).toISOString(),
        ata: new Date(timings.ataMs).toISOString(),
        std: new Date(timings.stdMs).toISOString(),
        atd: new Date(timings.atdMs).toISOString(),
        agtMinutes: agt,
        sgtMinutes: sgt,
      }
    : null,
  ghaDelayCodes: allGha,
  pathChecks: {
    allFourTimingsPresent: Boolean(timings),
    notCancelled: !cancelled,
    departureStatusDelay: ['delay', 'delayed'].includes(
      depStatus.toLowerCase().replace(/\s+/g, ' '),
    ),
    hasStationGhaCode: allGha.length > 0,
    agtGreaterThanSgt: agtGtSgt,
    path1_afterSta: {
      ataGreaterThanSta: ataGtSta,
      agtGreaterThanSgt: agtGtSgt,
      qualifies: path1,
    },
    path2_beforeStaLateDep: {
      ataLessThanSta: ataLtSta,
      atdGreaterThanStd: atdGtStd,
      agtGreaterThanSgt: agtGtSgt,
      qualifies: path2,
    },
  },
  rowDQualifies: path1 || path2,
  drillRowFlags: drillRow
    ? {
        inPerformanceReportGhaImprovementRow: drillRow.inPerformanceReportGhaImprovementRow,
        hasStationGhaDelayCode: drillRow.hasStationGhaDelayCode,
        ghaCategory: drillRow.ghaCategory,
        isOnTime: drillRow.isOnTime,
        isCancelled: drillRow.isCancelled,
      }
    : null,
  legHasGhaFromServer: leg
    ? 'see drill flags (legHasGhaDelayCode internal)'
    : null,
};

console.log(JSON.stringify(report, null, 2));
await mongoose.disconnect();
