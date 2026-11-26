/**
 * DEL Centrum Air (C6) additional services. Customer currency is USD.
 * Five WCHR/WCHS are included. Stretcher and wheelchair-lift ambulift
 * rates stay separate.
 *
 * Usage (from api/): node scripts/seed-del-c6-ads-equipment.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'DEL';
const CUSTOMER = 'C6';

const rows = [
  {
    serviceCodes: ['Wheel Chair -WCHR', 'Wheel Chair - WCHR/S'],
    masterDescriptions: ['Wheel Chair -WCHR'],
    usd: 14,
    uom: 'Per Unit',
    abbreviation: 'PU',
    foc: 5,
    remarks: 'Five WCHR/WCHS are included.',
  },
  {
    serviceCodes: ['Wheel Chair-WCHC'],
    masterDescription: 'Wheel Chair-WCHC',
    usd: 19,
    uom: 'Per Unit',
    abbreviation: 'PU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Ambulift with Stretcher'],
    masterDescription: 'Ambulift with Stretcher',
    usd: 154,
    uom: 'Per unit per use',
    abbreviation: 'PUU',
    foc: 0,
    remarks: 'Stretcher case.',
  },
  {
    serviceCodes: ['Ambulift with Wheel Chair'],
    masterDescription: 'Ambulift with Wheel Chair',
    usd: 22,
    uom: 'Per unit per use',
    abbreviation: 'PUU',
    foc: 0,
    remarks: 'Wheelchair lift.',
  },
  {
    serviceCodes: ['Ground Power Unit', 'Ground Power Unit (NB)', 'Ground Power Unit (WB)'],
    masterDescriptions: ['Ground Power Unit', 'Ground Power Unit (NB)', 'Ground Power Unit (WB)'],
    usd: 126,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)', 'Air Conditioner Unit (WB)'],
    masterDescriptions: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)', 'Air Conditioner Unit (WB)'],
    usd: 217,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Air conditioning or heating.',
  },
  {
    serviceCodes: ['Air Start Unit', 'Air Start Unit-Narrow Body', 'Air Start Unit-Wide Body'],
    masterDescriptions: ['Air Start Unit', 'Air Start Unit-Narrow Body', 'Air Start Unit-Wide Body'],
    usd: 246,
    uom: 'Per start',
    abbreviation: 'PSU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    masterDescriptions: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    usd: 179,
    uom: 'Per tow',
    abbreviation: 'PT',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    masterDescriptions: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    usd: 136,
    uom: 'Per push',
    abbreviation: 'pp',
    foc: 1,
    remarks: 'Additional push.',
  },
  {
    serviceCodes: [
      'Pax Step Ladder (remote bay) Towable',
      'Pax Step Ladder (remote bay) Motorized - Narrow Body',
      'Pax Step Ladder (remote bay) Motorized - Wide Body',
    ],
    masterDescriptions: [
      'Pax Step Ladder (remote bay) Towable',
      'Pax Step Ladder (remote bay) Motorized - Narrow Body',
      'Pax Step Ladder (remote bay) Motorized - Wide Body',
    ],
    usd: 92,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Step ladder for remote passenger aircraft operations.',
  },
  {
    serviceCodes: ['Passenger Coach'],
    masterDescription: 'Passenger Coach',
    usd: 70,
    uom: 'Per trip one way',
    abbreviation: 'PT',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Crew Coach', 'Crew Coach-Medium', 'Crew Coach-Small'],
    masterDescriptions: ['Crew Coach', 'Crew Coach-Medium', 'Crew Coach-Small'],
    usd: 23,
    uom: 'Per trip one way',
    abbreviation: 'PT',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Waste Disposal'],
    masterDescription: 'Waste Disposal',
    usd: 17,
    uom: 'Per Service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Water service'],
    masterDescription: 'Water service',
    usd: 74,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: 'Additional water service.',
  },
  {
    serviceCodes: ['Toilet service'],
    masterDescription: 'Toilet service',
    usd: 63,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: 'Additional toilet service.',
  },
  {
    serviceCodes: ['Blue collar'],
    masterDescription: 'Blue collar',
    usd: 14,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['White collar'],
    masterDescription: 'White collar',
    usd: 25,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Head Set'],
    masterDescription: 'Head Set',
    usd: 108,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Cargo Supervision and Administration'],
    masterDescription: 'Cargo Supervision and Administration',
    usd: 131,
    uom: 'Per turnaround',
    abbreviation: 'PTA',
    foc: 0,
    remarks: 'Section 5 cargo supervision. DO collection is retained by the handling company.',
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
if (!customer) throw new Error('DEL customer C6 was not found');
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
  contractNumber: 'C6-DEL-SGHA',
});
if (!contract) throw new Error('C6-DEL-SGHA was not found');

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

for (const rule of rules) {
  if (rule.serviceCode !== 'Wheel Chair-WCHR/WCHC/WCHS') continue;
  rule.unitPriceINR = null;
  rule.unitPriceUSD = null;
  rule.freePerFlight = 0;
  rule.alwaysChargeable = false;
  rule.remarks = '';
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
  rules: rules.length,
}, null, 2));

await client.close();
