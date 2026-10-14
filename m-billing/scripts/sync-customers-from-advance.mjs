#!/usr/bin/env node
/**
 * Sync billing_customers from advance-airline for a station.
 * Usage: node BWMS/modules/m-billing/scripts/sync-customers-from-advance.mjs --station=HYD
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
  const airlines = mongoose.connection.collection('advance-airline');
  const customers = mongoose.connection.collection('billing_customers');

  const filter = { $or: [{ stationCode }, { stationCode: { $exists: false } }] };
  const rows = await airlines.find(filter).toArray();

  let created = 0;
  let updated = 0;

  for (const airline of rows) {
    const customerCode = String(airline.code ?? '').trim().toUpperCase();
    if (!customerCode) continue;

    const existing = await customers.findOne({ stationCode, customerCode });
    if (existing) {
      await customers.updateOne(
        { _id: existing._id },
        { $set: { name: airline.name, advanceAirlineId: airline._id, active: true } },
      );
      updated += 1;
    } else {
      await customers.insertOne({
        customerCode,
        name: airline.name,
        currencyCode: 'INR',
        blocked: false,
        active: true,
        stationCode,
        advanceAirlineId: airline._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      created += 1;
    }
  }

  console.log(JSON.stringify({ stationCode, airlines: rows.length, created, updated }, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
