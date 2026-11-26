/**
 * DEL Biman Bangladesh (BG) additional services. Customer currency is USD.
 * Five WCHR are free. WCHS and WCHC are USD 25 with no free allowance.
 *
 * Usage (from api/): node scripts/seed-del-bg-ads-equipment.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'DEL';
const CUSTOMER = 'BG';

const rows = [
  {
    serviceCodes: ['Unaccompanied minor handling'],
    masterDescription: 'Unaccompanied minor handling',
    usd: 25,
    uom: 'Per minor',
    abbreviation: 'PM',
    foc: 1,
    remarks: 'One unaccompanied minor is handled free per flight.',
  },
  {
    serviceCodes: ['Wheel Chair -WCHR'],
    masterDescription: 'Wheel Chair -WCHR',
    usd: 21,
    uom: 'Per WCHR',
    abbreviation: 'PS',
    foc: 5,
    remarks: 'Five WCHR are included.',
  },
  {
    serviceCodes: ['Wheel Chair -WCHS'],
    masterDescription: 'Wheel Chair -WCHS',
    usd: 25,
    uom: 'Per WCHS/C',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Wheel Chair-WCHC'],
    masterDescription: 'Wheel Chair-WCHC',
    usd: 25,
    uom: 'Per WCHS/C',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Ambulift'],
    masterDescription: 'Ambulift',
    usd: 151,
    uom: 'Per usage',
    abbreviation: 'PU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Ground Power Unit', 'Ground Power Unit (NB)', 'Ground Power Unit (WB)'],
    masterDescriptions: ['Ground Power Unit', 'Ground Power Unit (NB)', 'Ground Power Unit (WB)'],
    usd: 149,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Remote parking only.',
  },
  {
    serviceCodes: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)', 'Air Conditioner Unit (WB)'],
    masterDescriptions: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)', 'Air Conditioner Unit (WB)'],
    usd: 173,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Remote parking only.',
  },
  {
    serviceCodes: ['Passenger Coach'],
    masterDescription: 'Passenger Coach',
    usd: 173,
    uom: 'Per Turnaround',
    abbreviation: 'PTA',
    foc: 0,
    remarks: 'On request only.',
  },
  {
    serviceCodes: ['Crew Coach'],
    masterDescription: 'Crew Coach',
    usd: 173,
    uom: 'Per Turnaround',
    abbreviation: 'PTA',
    foc: 0,
    remarks: 'On request only.',
  },
  {
    serviceCodes: ['Air Start Unit', 'Air Start Unit-Narrow Body', 'Air Start Unit-Wide Body'],
    masterDescriptions: ['Air Start Unit', 'Air Start Unit-Narrow Body', 'Air Start Unit-Wide Body'],
    usd: 179,
    uom: 'Per start-up',
    abbreviation: 'PSU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    masterDescriptions: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    usd: 311,
    uom: 'Per push',
    abbreviation: 'pp',
    foc: 1,
    remarks: 'Additional pushback.',
  },
  {
    serviceCodes: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    masterDescriptions: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    usd: 191,
    uom: 'Per tow',
    abbreviation: 'PT',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Utility Hand', 'Additional Utility Hand'],
    masterDescriptions: ['Utility Hand', 'Additional Utility Hand'],
    usd: 17,
    uom: 'Per staff per hour',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Additional porter or utility hand.',
  },
  {
    serviceCodes: ['Cargo Supervision and Administration'],
    masterDescription: 'Cargo Supervision and Administration',
    usd: 239,
    uom: 'Per Flight',
    abbreviation: 'PF',
    foc: 0,
    remarks: 'Section 5 cargo administration, supervision and documentation. DO charges are retained by the handling company.',
  },
  {
    serviceCodes: ['Line Maintenance'],
    masterDescription: 'Line Maintenance',
    usd: 90,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Line maintenance assistant.',
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
    alwaysChargeable: !(foc > 0),
    freePerFlight: foc,
    cumulativeMonthlyBasis: false,
    uom: row.uom,
    remarks: row.remarks ?? '',
    unitPriceUSD: row.usd,
    unitPriceINR: null,
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
if (!customer) throw new Error('DEL customer BG was not found');
if (customer.currencyCode !== 'USD') {
  throw new Error(`Expected USD billing currency, found ${customer.currencyCode}`);
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
  contractNumber: 'BG-DEL-SGHA',
});
if (!contract) throw new Error('BG-DEL-SGHA was not found');

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

let cleared = 0;
for (const rule of rules) {
  if (rule.serviceCode !== 'Wheel Chair - WCHR/S') continue;
  rule.unitPriceINR = null;
  rule.unitPriceUSD = null;
  rule.freePerFlight = 0;
  rule.alwaysChargeable = false;
  rule.remarks = 'Replaced by separate WCHR USD 21 and WCHS/C USD 25 rates.';
  cleared += 1;
}

await billing.updateOne(
  { _id: contract._id },
  { $set: { adsEquipmentRules: rules, adsBillingEnabled: true, updatedAt: now } },
);

console.log(JSON.stringify({
  customer: { code: customer.customerCode, name: customer.name, currencyCode: customer.currencyCode },
  uomAdded,
  updated,
  added,
  cleared,
  rules: rules.length,
}, null, 2));

await client.close();
