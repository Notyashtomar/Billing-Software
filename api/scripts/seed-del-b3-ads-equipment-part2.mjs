/**
 * DEL Bhutan Air (B3) additional services, rows 10-14.
 * Customer currency is INR, so the annex amounts go in unitPriceINR.
 * Wing walker is included in the turnaround and has no rate.
 *
 * Usage (from api/): node scripts/seed-del-b3-ads-equipment-part2.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'DEL';
const CUSTOMER = 'B3';

const rows = [
  {
    serviceCodes: ['Wing Walker'],
    masterDescription: 'Wing Walker',
    inr: null,
    uom: 'Included in turnaround rates',
    abbreviation: 'INC',
    foc: 0,
    alwaysChargeable: false,
    remarks: 'Included in turnaround rates.',
  },
  {
    serviceCodes: ['Utility Hand', 'Additional Utility Hand'],
    masterDescriptions: ['Utility Hand', 'Additional Utility Hand'],
    inr: 17,
    uom: 'Per staff per hour',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Additional porter or utility hand.',
  },
  {
    serviceCodes: ['Water service'],
    masterDescription: 'Water service',
    inr: 50,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Toilet service'],
    masterDescription: 'Toilet service',
    inr: 50,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: 'Toilet water.',
  },
  {
    serviceCodes: ['Cargo Supervision and Administration'],
    masterDescription: 'Cargo Supervision and Administration',
    inr: 327,
    uom: 'Per flight',
    abbreviation: 'PF',
    foc: 0,
    remarks: 'Under Section 5. Cargo Supervision.',
  },
];

function sameText(left, right) {
  return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
}

function rulePatch(serviceCode, row) {
  const foc = row.foc ?? 0;
  return {
    serviceCode,
    includedForAds: true,
    alwaysChargeable: row.alwaysChargeable ?? !(foc > 0),
    freePerFlight: foc,
    cumulativeMonthlyBasis: false,
    uom: row.uom,
    remarks: row.remarks ?? '',
    unitPriceINR: row.inr,
    unitPriceUSD: null,
  };
}

const client = new MongoClient(loadMongoUri());
await client.connect();
const billing = client.db().collection('billing');
const now = new Date();

const customer = await billing.findOne(
  { docType: 'customer', stationCode: STATION, customerCode: CUSTOMER },
  { projection: { customerCode: 1, name: 1, currencyCode: 1 } },
);
if (!customer) throw new Error('DEL customer B3 was not found');
if (customer.currencyCode !== 'INR') {
  throw new Error(`Expected INR billing currency, found ${customer.currencyCode}`);
}

const uomAdded = [];
for (const row of rows) {
  const descriptions = row.masterDescriptions ?? [row.masterDescription];
  for (const description of descriptions) {
    const existing = await billing
      .find({ docType: 'equipment_master', description })
      .project({ _id: 1, itemNo: 1, uoms: 1 })
      .toArray();
    if (existing.length === 0) throw new Error(`Equipment master is missing ${description}`);
    for (const item of existing) {
      const uoms = Array.isArray(item.uoms) ? item.uoms : [];
      if (uoms.some((pair) => sameText(pair.uom, row.uom))) continue;
      await billing.updateOne(
        { _id: item._id },
        {
          $push: { uoms: { uom: row.uom, abbreviation: row.abbreviation } },
          $set: { updatedAt: now },
        },
      );
      uomAdded.push(`${item.itemNo || description}: ${row.uom} (${row.abbreviation})`);
    }
  }
}

const contract = await billing.findOne({
  docType: 'contract',
  stationCode: STATION,
  contractNumber: 'B3-DEL-SGHA',
});
if (!contract) throw new Error('B3-DEL-SGHA was not found');

const rules = Array.isArray(contract.adsEquipmentRules) ? contract.adsEquipmentRules : [];
let updated = 0;
let added = 0;
for (const row of rows) {
  for (const serviceCode of row.serviceCodes) {
    const patch = rulePatch(serviceCode, row);
    const hits = rules.filter((rule) => rule.serviceCode === serviceCode);
    if (hits.length === 0) {
      rules.push({ ...patch, aircraftTypes: [] });
      added += 1;
      continue;
    }
    for (const rule of hits) {
      Object.assign(rule, patch);
      updated += 1;
    }
  }
}

let cpiUpdated = false;
const clauses = Array.isArray(contract.clauses) ? contract.clauses : [];
for (const clause of clauses) {
  const body = String(clause.body ?? '');
  if (String(clause.clauseType ?? '') !== 'cpi') continue;
  if (!/5%/.test(body) || !/01 Sep 2026/i.test(body)) continue;
  clause.percent = 5;
  clause.validFrom = '2026-09-01';
  cpiUpdated = true;
}

await billing.updateOne(
  { _id: contract._id },
  {
    $set: {
      adsEquipmentRules: rules,
      clauses,
      adsBillingEnabled: true,
      updatedAt: now,
    },
  },
);

console.log(JSON.stringify({
  customer: { code: customer.customerCode, name: customer.name, currencyCode: customer.currencyCode },
  uomAdded,
  updated,
  added,
  rules: rules.length,
  cpiUpdated,
}, null, 2));

await client.close();
