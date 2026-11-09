/**
 * Load the verified AERA tariff orders into the billing collection
 * (docType "aera_tariff", one document per station + order number).
 *
 * Source: api/data/Aera Rates/extracted/aera-tariffs.verified.json
 * Idempotent: re-running replaces the same station + orderNumber document.
 *
 * Usage (from api/):
 *   node scripts/seed-aera-tariffs.mjs --dry-run
 *   node scripts/seed-aera-tariffs.mjs            # all stations
 *   node scripts/seed-aera-tariffs.mjs MAA CJB    # selected stations
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const wanted = new Set(args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase()));

const source = new URL('../data/Aera Rates/extracted/aera-tariffs.verified.json', import.meta.url);
const file = JSON.parse(readFileSync(source, 'utf8'));

function toDoc(row) {
  const now = new Date();
  return {
    docType: 'aera_tariff',
    stationCode: row.station.toUpperCase(),
    orderNumber: row.orderNumber,
    orderDate: row.orderDate ? new Date(row.orderDate) : undefined,
    isp: row.isp,
    airport: row.airport,
    airportOperator: row.airportOperator,
    controlPeriodLabel: row.controlPeriod?.label,
    controlPeriodFrom: new Date(row.controlPeriod.from),
    controlPeriodTo: new Date(row.controlPeriod.to),
    effectiveFrom: new Date(row.effectiveFrom),
    currency: row.currency ?? 'INR',
    financialYears: row.financialYears,
    cargoRateColumn: row.cargoRateColumn === 'full' ? 'full' : 'ramp',
    scheduled: row.scheduled,
    internationalNonScheduled: row.internationalNonScheduled,
    // Item-wise tables are still draft; the JSON keeps a status block, not rows.
    itemWise: Array.isArray(row.itemWise) ? row.itemWise : [],
    rules: row.rules ?? [],
    anomalies: row.anomalies ?? [],
    verification: row.verification,
    sourcePages: row.sourcePages,
    sourceFile: `Aera Rates/${row.station}_AERA_Order.pdf`,
    active: true,
    updatedAt: now,
  };
}

async function main() {
  const client = new MongoClient(loadMongoUri());
  await client.connect();
  const col = client.db('test').collection('billing');
  let saved = 0;
  for (const row of file.stations) {
    const station = row.station.toUpperCase();
    if (wanted.size > 0 && !wanted.has(station)) continue;
    const doc = toDoc(row);
    console.log(
      `${station} ${row.orderNumber}: FYs ${row.financialYears.join(', ')} | ${row.scheduled.length} scheduled rows | ${row.internationalNonScheduled.length} MTOW bands`,
    );
    if (DRY) continue;
    await col.updateOne(
      { docType: 'aera_tariff', stationCode: station, orderNumber: row.orderNumber },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    saved += 1;
  }
  console.log(DRY ? 'DRY RUN' : `APPLIED ${saved} order(s)`);
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
