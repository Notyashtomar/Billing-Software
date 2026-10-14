#!/usr/bin/env node
console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * Seed billing_service_catalog from EXPORT_LOG_TYPE_LABELS.
 * Usage: node BWMS/modules/m-billing/scripts/seed-service-catalog.mjs [--dry-run]
 *
 * Requires MONGODB_URI (or reads from repo root .env).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../../../apps/api/package.json'));
const mongoose = require('mongoose');
const dryRun = process.argv.includes('--dry-run');

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

function inferCatalogMeta(label) {
  const lower = label.toLowerCase();
  if (lower.startsWith('cancel scheduled')) return { category: 'xxld', uom: 'FLIGHT' };
  if (lower.startsWith('raf - manpower') || lower.includes('manpower'))
    return { category: 'manpower', uom: 'HR' };
  if (lower.startsWith('raf -')) return { category: 'raf', uom: 'MIN' };
  if (lower.includes('cabin cleaning')) return { category: 'cleaning', uom: 'FLIGHT' };
  if (lower.startsWith('non scheduled flight'))
    return { category: 'non_scheduled', uom: 'FLIGHT' };
  if (lower.startsWith('non scheduled - equipment'))
    return { category: 'equipment', uom: 'MIN' };
  if (lower.startsWith('scheduled - equipment')) return { category: 'equipment', uom: 'MIN' };
  if (lower.startsWith('scheduled - manpower')) return { category: 'manpower', uom: 'HR' };
  if (lower.startsWith('scheduled flight')) return { category: 'scheduled', uom: 'FLIGHT' };
  if (label === 'Manpower') return { category: 'manpower', uom: 'HR' };
  return { category: 'equipment', uom: 'MIN' };
}

const tsSource = readFileSync(
  resolve(__dirname, '../domain/src/service-catalog-labels.ts'),
  'utf8',
);
const block = tsSource.match(/SERVICE_CATALOG_LABELS[^=]*=\s*\[([\s\S]*?)\]\s*as const/)?.[1] ?? '';
const labels = [...block.matchAll(/'((?:\\'|[^'])*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
if (labels.length === 0) {
  console.error('No labels parsed from service-catalog-labels.ts');
  process.exit(1);
}

async function main() {
  const uri = loadMongoUri();
  console.log(`Connecting to MongoDB…${dryRun ? ' (dry run)' : ''}`);
  await mongoose.connect(uri);

  const col = mongoose.connection.collection('billing_service_catalog');
  let inserted = 0;
  let skipped = 0;

  for (const label of labels) {
    const exists = await col.findOne({ serviceCode: label });
    if (exists) {
      skipped += 1;
      continue;
    }
    const meta = inferCatalogMeta(label);
    const doc = {
      serviceCode: label,
      description: label,
      lineType: 'service',
      category: meta.category,
      uom: meta.uom,
      royaltyApplicable: false,
      active: true,
      exportLogType: label,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (!dryRun) await col.insertOne(doc);
    inserted += 1;
  }

  console.log(`Done. inserted=${inserted} skipped=${skipped} total=${labels.length}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
