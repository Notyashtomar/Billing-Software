#!/usr/bin/env node
/**
 * Print decommission readiness summary for a station (offline).
 * Usage: node BWMS/modules/m-billing/scripts/verify-decommission-readiness.mjs --station=HYD
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../../../apps/api/package.json'));
const mongoose = require('mongoose');

const stationArg = process.argv.find((a) => a.startsWith('--station='));
const stationCode = stationArg?.split('=')[1]?.toUpperCase() || 'HYD';

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
  const settings = mongoose.connection.collection('billing_settings');
  const invoices = mongoose.connection.collection('billing_invoice_headers');
  const snapshots = mongoose.connection.collection('billing_parallel_run_snapshots');
  const sequences = mongoose.connection.collection('billing_sequences');

  const s = await settings.findOne({ stationCode });
  const phase = s?.cutoverPhase ?? 'parallel';
  const [postedCount, signedSnapshots, sequenceCount] = await Promise.all([
    invoices.countDocuments({ stationCode, status: 'posted' }),
    snapshots.countDocuments({ stationCode, signedOffAt: { $exists: true } }),
    sequences.countDocuments({ stationCode }),
  ]);

  const lastSignOff = s?.cutoverNotes?.lastSignOff;
  const checklist = [
    { id: 'native_enabled', passed: Boolean(s?.nativeBillingEnabled), required: true },
    { id: 'bc_readonly', passed: phase === 'bc_readonly' || phase === 'decommissioned', required: true },
    {
      id: 'fris_primary_complete',
      passed: Boolean(s?.bcReadOnlyDate) || phase === 'bc_readonly',
      required: true,
    },
    {
      id: 'finance_signoff',
      passed: Boolean(lastSignOff) || signedSnapshots >= 1,
      required: true,
    },
    { id: 'posted_invoices', passed: postedCount > 0, required: true },
    { id: 'sequences', passed: sequenceCount > 0, required: true },
    { id: 'two_month_close', passed: signedSnapshots >= 2, required: false },
  ];

  const ready = checklist.filter((c) => c.required).every((c) => c.passed);

  console.log(
    JSON.stringify(
      {
        stationCode,
        cutoverPhase: phase,
        decommissioned: phase === 'decommissioned',
        legacyNavExportEnabled: s?.legacyNavExportEnabled !== false && phase !== 'decommissioned',
        ready,
        checklist,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
  process.exit(ready || phase === 'decommissioned' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
