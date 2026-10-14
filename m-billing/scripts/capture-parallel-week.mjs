#!/usr/bin/env node
/**
 * Capture a parallel-run reconciliation snapshot via Mongo (offline weekly job).
 * Usage: node BWMS/modules/m-billing/scripts/capture-parallel-week.mjs --station=HYD --from=2026-02-01 --to=2026-03-31
 *
 * Prefer POST /billing/cutover/snapshots when the billing API is integrated.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../../../apps/api/package.json'));
const mongoose = require('mongoose');

const stationArg = process.argv.find((a) => a.startsWith('--station='));
const fromArg = process.argv.find((a) => a.startsWith('--from='));
const toArg = process.argv.find((a) => a.startsWith('--to='));
const stationCode = stationArg?.split('=')[1]?.toUpperCase() || 'HYD';
const fromYmd = fromArg?.split('=')[1];
const toYmd = toArg?.split('=')[1];

if (!fromYmd || !toYmd) {
  console.error('Required: --from=YYYY-MM-DD --to=YYYY-MM-DD');
  process.exit(1);
}

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

async function main() {
  await mongoose.connect(loadMongoUri());
  const prep = mongoose.connection.collection('billing_preparation_records');
  const invoices = mongoose.connection.collection('billing_invoice_headers');
  const baselines = mongoose.connection.collection('billing_bc_baselines');
  const snapshots = mongoose.connection.collection('billing_parallel_run_snapshots');
  const settings = mongoose.connection.collection('billing_settings');

  const periodStart = new Date(fromYmd);
  const periodEnd = new Date(toYmd);

  const [prepCount, postedAgg, bcAgg] = await Promise.all([
    prep.countDocuments({
      stationCode,
      sourceType: 'scheduled_flight',
      billingPeriodStart: { $gte: periodStart },
      billingPeriodEnd: { $lte: periodEnd },
    }),
    invoices
      .aggregate([
        {
          $match: {
            stationCode,
            status: 'posted',
            billingPeriodStart: { $gte: periodStart },
            billingPeriodEnd: { $lte: periodEnd },
          },
        },
        { $group: { _id: null, count: { $sum: 1 }, totalInclTax: { $sum: '$totalInclTax' } } },
      ])
      .toArray(),
    baselines
      .aggregate([
        {
          $match: {
            stationCode,
            billingPeriodStart: { $gte: periodStart },
            billingPeriodEnd: { $lte: periodEnd },
          },
        },
        { $group: { _id: null, count: { $sum: 1 }, totalInclTax: { $sum: '$totalInclTax' } } },
      ])
      .toArray(),
  ]);

  const frisPosted = postedAgg[0] ?? { count: 0, totalInclTax: 0 };
  const bcImported = bcAgg[0] ?? { count: 0, totalInclTax: 0 };
  const varianceTotal = (frisPosted.totalInclTax ?? 0) - (bcImported.totalInclTax ?? 0);
  const readyForSignoff =
    bcImported.count > 0 && Math.abs(varianceTotal) < 1;

  const stationSettings = await settings.findOne({ stationCode });
  const parallelStart = stationSettings?.parallelRunStartDate;
  const weekNumber = parallelStart
    ? Math.max(1, Math.floor((Date.now() - new Date(parallelStart).getTime()) / (7 * 86400000)) + 1)
    : 1;

  const metrics = {
    period: { from: fromYmd, to: toYmd },
    preparationCount: prepCount,
    frisPostedCount: frisPosted.count,
    frisPostedTotal: frisPosted.totalInclTax ?? 0,
    bcImportedCount: bcImported.count,
    bcImportedTotal: bcImported.totalInclTax ?? 0,
    varianceTotal,
    missingCount: 0,
    readyForSignoff,
  };

  const doc = {
    stationCode,
    billingPeriodStart: periodStart,
    billingPeriodEnd: periodEnd,
    weekNumber,
    weekLabel: `Week ${weekNumber}`,
    metrics,
    readyForSignoff,
    capturedBy: 'capture-parallel-week.mjs',
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const inserted = await snapshots.insertOne(doc);
  console.log(JSON.stringify({ insertedId: inserted.insertedId, metrics }, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
