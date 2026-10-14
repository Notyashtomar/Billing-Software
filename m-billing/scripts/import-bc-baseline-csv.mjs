#!/usr/bin/env node
/**
 * Import BC posted invoice totals from CSV into billing_bc_baselines.
 * CSV columns: customerCode,invoiceNumber,totalInclTax
 * Usage: node BWMS/modules/m-billing/scripts/import-bc-baseline-csv.mjs --station=HYD --from=2026-02-01 --to=2026-03-31 --file=bc-totals.csv
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
const fileArg = process.argv.find((a) => a.startsWith('--file='));
const stationCode = stationArg?.split('=')[1]?.toUpperCase() || 'HYD';
const fromYmd = fromArg?.split('=')[1];
const toYmd = toArg?.split('=')[1];
const filePath = fileArg?.split('=')[1];

if (!fromYmd || !toYmd || !filePath) {
  console.error('Required: --from= --to= --file=');
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
  const csv = readFileSync(resolve(filePath), 'utf8');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(',');
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = cols[i]?.trim();
    });
    return {
      customerCode: obj.customercode || obj.customer,
      invoiceNumber: obj.invoicenumber || obj.invoice,
      totalInclTax: Number(obj.totalincltax || obj.total || 0),
    };
  });

  await mongoose.connect(loadMongoUri());
  const col = mongoose.connection.collection('billing_bc_baselines');
  const periodStart = new Date(fromYmd);
  const periodEnd = new Date(toYmd);

  await col.deleteMany({ stationCode, billingPeriodStart: periodStart, billingPeriodEnd: periodEnd });

  const docs = rows.map((r) => ({
    stationCode,
    billingPeriodStart: periodStart,
    billingPeriodEnd: periodEnd,
    customerCode: r.customerCode?.toUpperCase(),
    invoiceNumber: r.invoiceNumber,
    totalInclTax: r.totalInclTax,
    source: 'csv_import',
    importedBy: 'script',
    importedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await col.insertMany(docs);
  console.log(`Imported ${docs.length} BC baseline rows for ${stationCode}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
