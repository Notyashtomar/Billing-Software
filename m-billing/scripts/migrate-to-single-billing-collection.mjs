/**
 * One-time migration: copy legacy billing_* collections into single `billing` collection.
 *
 * Usage (from BWMS/apps/api/):
 *   node ../BWMS/modules/m-billing/scripts/migrate-to-single-billing-collection.mjs --dry-run
 *   node ../BWMS/modules/m-billing/scripts/migrate-to-single-billing-collection.mjs
 */
import mongoose from 'mongoose';

const LEGACY = [
  ['billing_customers', 'customer'],
  ['billing_service_catalog', 'service_catalog'],
  ['billing_contracts', 'contract'],
  ['billing_rate_cards', 'rate_card'],
  ['billing_tax_rules', 'tax_rule'],
  ['billing_exchange_rates', 'exchange_rate'],
  ['billing_sequences', 'sequence'],
  ['billing_settings', 'settings'],
  ['billing_preparation_records', 'preparation_record'],
  ['billing_invoice_headers', 'invoice_header'],
  ['billing_invoice_lines', 'invoice_line'],
  ['billing_backing_sheets', 'backing_sheet'],
  ['billing_credit_memos', 'credit_memo'],
  ['billing_reports', 'report'],
  ['billing_exports', 'export'],
  ['billing_audit_logs', 'audit_log'],
  ['billing_bc_baselines', 'bc_baseline'],
  ['billing_parallel_run_snapshots', 'parallel_run_snapshot'],
  ['billing_bc_decommission_records', 'bc_decommission_record'],
];

const dryRun = process.argv.includes('--dry-run');
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!uri) {
  console.error('Set MONGO_URI or MONGODB_URI');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;
const target = db.collection('billing');

let inserted = 0;
let skipped = 0;

for (const [legacyName, docType] of LEGACY) {
  const source = db.collection(legacyName);
  const count = await source.countDocuments();
  if (count === 0) {
    console.log(`skip ${legacyName} (empty)`);
    continue;
  }
  const cursor = source.find({});
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) continue;
    const exists = await target.findOne({ _id: doc._id, docType });
    if (exists) {
      skipped += 1;
      continue;
    }
    const payload = { ...doc, docType };
    if (!dryRun) {
      await target.insertOne(payload);
    }
    inserted += 1;
  }
  console.log(`${legacyName} → billing (${docType}): processed ${count}`);
}

console.log(
  dryRun
    ? `[dry-run] would insert ${inserted}, skip ${skipped} duplicates`
    : `done: inserted ${inserted}, skipped ${skipped} duplicates`,
);
await mongoose.disconnect();
