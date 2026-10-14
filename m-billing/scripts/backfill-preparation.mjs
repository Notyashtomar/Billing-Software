#!/usr/bin/env node
/**
 * Backfill billing_preparation_records from raw_flight_data rows with exportedNAV=Yes.
 * Usage: node BWMS/modules/m-billing/scripts/backfill-preparation.mjs --station=HYD --from=2026-02-01 --to=2026-03-31 [--dry-run]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../../../apps/api/package.json'));
const mongoose = require('mongoose');

const dryRun = process.argv.includes('--dry-run');
const stationArg = process.argv.find((a) => a.startsWith('--station='));
const fromArg = process.argv.find((a) => a.startsWith('--from='));
const toArg = process.argv.find((a) => a.startsWith('--to='));
const stationCode = stationArg?.split('=')[1]?.toUpperCase() || 'HYD';
const fromYmd = fromArg?.split('=')[1] || '2026-02-01';
const toYmd = toArg?.split('=')[1] || '2026-03-31';

function loadMongoUri() {
  const envCandidates = [
    resolve(__dirname, '../../../apps/api/.env'),
    resolve(__dirname, '../../../../.env'),
  ];
  let envPath = '';
  for (const p of envCandidates) {
    if (existsSync(p)) { envPath = p; break; }
  }
  if (!envPath) envPath = envCandidates[0];
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, 'utf8').match(/^MONGODB_URI=(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
}

function isExportedNav(value) {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  return s === 'exported' || s === 'y' || s === 'yes';
}

async function main() {
  await mongoose.connect(loadMongoUri());
  const fhrCol = mongoose.connection.collection('fhr_collection');
  const rawCol = mongoose.connection.collection('raw_flight_data');
  const prepCol = mongoose.connection.collection('billing_preparation_records');

  const periodStart = new Date(fromYmd);
  const periodEnd = new Date(toYmd);

  const fhrs = await fhrCol
    .find({
      stationCode,
      staDates: { $elemMatch: { $gte: fromYmd, $lte: toYmd } },
    })
    .limit(10000)
    .toArray();

  let created = 0;
  let skipped = 0;

  for (const fhr of fhrs) {
    const serial = String(fhr.SerialNo ?? '');
    if (!serial) continue;

    const raw = await rawCol.findOne({
      $or: [
        { 'data.SlNo': serial },
        { 'data.serialNo': serial },
        { 'data.Serial No': serial },
      ],
    });
    const daily = raw?.data ?? {};
    if (!isExportedNav(daily.exportedNAV ?? daily['Exported NAV'] ?? daily.ExportedNAV)) {
      continue;
    }

    const exists = await prepCol.findOne({
      stationCode,
      sourceType: 'scheduled_flight',
      billingPeriodStart: periodStart,
      'sourceRef.serialNo': serial,
    });
    if (exists) {
      skipped += 1;
      continue;
    }

    const customerCode = String(
      fhr.mainDetails?.Arline_Code ??
        fhr.mainDetails?.airlineCode ??
        daily.customerCode ??
        '',
    )
      .trim()
      .toUpperCase();

    const doc = {
      sourceType: 'scheduled_flight',
      sourceRef: { serialNo: serial },
      customerCode,
      customerName: String(fhr.mainDetails?.Airline ?? daily.airline ?? ''),
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      status: 'eligible',
      validationResults: [{ rule: 'backfill_exported_nav', passed: true }],
      operationalSnapshot: { exportedNav: 'Yes', serialNumber: serial },
      stationCode,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!dryRun) await prepCol.insertOne(doc);
    created += 1;
  }

  console.log(
    JSON.stringify(
      { stationCode, fromYmd, toYmd, dryRun, created, skipped, scannedFhrs: fhrs.length },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
