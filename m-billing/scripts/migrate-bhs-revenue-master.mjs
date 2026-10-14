#!/usr/bin/env node
/**
 * Migrate bhs_revenue_master → billing_contracts + billing_rate_cards.
 * Usage: node BWMS/modules/m-billing/scripts/migrate-bhs-revenue-master.mjs [--station=HYD] [--dry-run]
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
  const uri = loadMongoUri();
  await mongoose.connect(uri);

  const source = mongoose.connection.collection('bhs_revenue_master');
  const contracts = mongoose.connection.collection('billing_contracts');
  const rateCards = mongoose.connection.collection('billing_rate_cards');

  const rows = await source.find({}).toArray();
  console.log(`Found ${rows.length} bhs_revenue_master rows for station ${stationCode}`);

  let contractsCreated = 0;
  let ratesCreated = 0;

  for (const row of rows) {
    const customerCode = String(
      row.airlineKey ?? row.airline ?? row.code ?? '',
    )
      .trim()
      .toUpperCase()
      .slice(0, 10);
    if (!customerCode) continue;

    const contractNumber = `BHS-${customerCode}-${stationCode}`;
    const priceValidFrom = row.priceValidityPeriod?.from
      ? new Date(row.priceValidityPeriod.from)
      : new Date('2025-01-01');
    const priceValidTo = row.priceValidityPeriod?.to
      ? new Date(row.priceValidityPeriod.to)
      : new Date('2099-12-31');

    let contract = await contracts.findOne({ stationCode, contractNumber });
    if (!contract) {
      const contractDoc = {
        contractNumber,
        customerCode,
        stationCode,
        category: String(row.currency ?? 'INR').toUpperCase() === 'USD' ? 'Int' : 'Dom',
        aircraftTypes: row.aircraftTypeKey ? [String(row.aircraftTypeKey)] : [],
        priceValidFrom,
        priceValidTo,
        royaltyAtGross: row.royaltyType ? Number(row.royaltyType) : undefined,
        flightsPerSchedule: row.flightsPerSchedule,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (!dryRun) {
        const res = await contracts.insertOne(contractDoc);
        contract = { ...contractDoc, _id: res.insertedId };
      } else {
        contract = { _id: new mongoose.Types.ObjectId(), ...contractDoc };
      }
      contractsCreated += 1;
    }

    const currency = String(row.currency ?? 'INR').toUpperCase() === 'USD' ? 'USD' : 'INR';
    const serviceCode = 'Scheduled Flight';
    const rateDoc = {
      contractId: contract._id,
      customerCode,
      serviceCode,
      unitPriceINR: row.basicRateINR != null ? Number(row.basicRateINR) : undefined,
      unitPriceUSD: row.basicRateUSD != null ? Number(row.basicRateUSD) : undefined,
      currency,
      uom: 'FLIGHT',
      discountPercent: row.discount != null ? Number(row.discount) : undefined,
      discountDelayPercent: row.discountDelay != null ? Number(row.discountDelay) : undefined,
      validFrom: priceValidFrom,
      validTo: priceValidTo,
      stationCode,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existsRate = await rateCards.findOne({
      stationCode,
      customerCode,
      serviceCode,
      validFrom: priceValidFrom,
    });
    if (!existsRate) {
      if (!dryRun) await rateCards.insertOne(rateDoc);
      ratesCreated += 1;
    }
  }

  console.log(
    `Migration complete. contracts=${contractsCreated} rateCards=${ratesCreated}${dryRun ? ' (dry run)' : ''}`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
