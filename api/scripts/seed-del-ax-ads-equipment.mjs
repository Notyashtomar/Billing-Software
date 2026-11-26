/**
 * DEL Air Asia X (AX) additional services. Customer currency is USD.
 * Five WCHR/WCHS per flight are free. Stretcher and wheelchair ambulift
 * rates stay separate.
 *
 * Usage (from api/): node scripts/seed-del-ax-ads-equipment.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'DEL';
const CUSTOMER = 'AX';

const rows = [
  {
    serviceCodes: ['Wheel Chair -WCHR'],
    masterDescription: 'Wheel Chair -WCHR',
    usd: 15,
    uom: 'Per Unit',
    abbreviation: 'PU',
    foc: 5,
    remarks: 'Five WCHR/WCHS per flight are included in the turnaround rate.',
  },
  {
    serviceCodes: ['Wheel Chair-WCHC'],
    masterDescription: 'Wheel Chair-WCHC',
    usd: 25,
    uom: 'Per Unit',
    abbreviation: 'PU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Ambulift with Stretcher'],
    masterDescription: 'Ambulift with Stretcher',
    usd: 155,
    uom: 'Per unit per use',
    abbreviation: 'PUU',
    foc: 0,
    remarks: 'Stretcher case.',
  },
  {
    serviceCodes: ['Ambulift with Wheel Chair'],
    masterDescription: 'Ambulift with Wheel Chair',
    usd: 21,
    uom: 'Per unit per use',
    abbreviation: 'PUU',
    foc: 0,
    remarks: 'Wheelchair lift.',
  },
  {
    serviceCodes: ['Ground Power Unit', 'Ground Power Unit (NB)', 'Ground Power Unit (WB)'],
    masterDescriptions: ['Ground Power Unit', 'Ground Power Unit (NB)', 'Ground Power Unit (WB)'],
    usd: 75,
    uom: 'Per 60 minutes or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Only during BME failure or at a remote bay.',
  },
  {
    serviceCodes: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)', 'Air Conditioner Unit (WB)'],
    masterDescriptions: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)', 'Air Conditioner Unit (WB)'],
    usd: 75,
    uom: 'Per 60 minutes or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Only during BME failure or at a remote bay.',
  },
  {
    serviceCodes: ['Air Start Unit', 'Air Start Unit-Narrow Body', 'Air Start Unit-Wide Body'],
    masterDescriptions: ['Air Start Unit', 'Air Start Unit-Narrow Body', 'Air Start Unit-Wide Body'],
    usd: 110,
    uom: 'Per start',
    abbreviation: 'PSU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    masterDescriptions: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    usd: 110,
    uom: 'Per tow',
    abbreviation: 'PT',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    masterDescriptions: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    usd: 90,
    uom: 'Per push',
    abbreviation: 'pp',
    foc: 1,
    remarks: 'Additional push.',
  },
  {
    serviceCodes: ['Pax & Crew Transportation'],
    masterDescription: 'Pax & Crew Transportation',
    usd: 120,
    uom: 'Per flight',
    abbreviation: 'PF',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Waste Disposal'],
    masterDescription: 'Waste Disposal',
    usd: 20,
    uom: 'Per Service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: [
      'Pax Step Ladder (remote bay) Motorized - Narrow Body',
      'Pax Step Ladder (remote bay) Motorized - Wide Body',
      'Pax Step Ladder (remote bay) Towable',
    ],
    masterDescriptions: [
      'Pax Step Ladder (remote bay) Motorized - Narrow Body',
      'Pax Step Ladder (remote bay) Motorized - Wide Body',
      'Pax Step Ladder (remote bay) Towable',
    ],
    usd: 89,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Charged when used beyond scheduled ground time.',
  },
  {
    serviceCodes: ['Ballast Bags Refill'],
    masterDescription: 'Ballast Bags Refill',
    usd: 21,
    uom: 'Per refill per bag',
    abbreviation: 'PRB',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['CARGO COMPARTMENT CLEANING'],
    masterDescription: 'CARGO COMPARTMENT CLEANING',
    usd: 59,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Utility Hand', 'Additional Utility Hand'],
    masterDescriptions: ['Utility Hand', 'Additional Utility Hand'],
    usd: 11,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Utility support staff.',
  },
  {
    serviceCodes: ['Additional Passenger Service Agent'],
    masterDescription: 'Additional Passenger Service Agent',
    usd: 17,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Aircraft Disinfection service (Chemical AMS 1452 (CALLA))'],
    create: {
      itemNo: 'CALLA',
      description: 'Aircraft Disinfection service (Chemical AMS 1452 (CALLA))',
      unitType: 'Equipment Used',
    },
    usd: 110,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
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
if (!customer) throw new Error('DEL customer AX was not found');
if (customer.currencyCode !== 'USD') {
  throw new Error(`Expected USD billing currency, found ${customer.currencyCode}`);
}

const createdMaster = [];
const uomAdded = [];
let sortCursor = null;

for (const row of rows) {
  const descriptions = row.masterDescriptions ?? [row.create?.description ?? row.masterDescription];
  for (const description of descriptions) {
    const existing = await billing
      .find({ docType: 'equipment_master', description })
      .project({ _id: 1, itemNo: 1, uoms: 1 })
      .toArray();
    if (existing.length === 0) {
      if (!row.create || row.create.description !== description) {
        throw new Error(`Equipment master is missing ${description}`);
      }
      if (sortCursor == null) {
        const earliest = await billing
          .find({ docType: 'equipment_master' })
          .sort({ sortIndex: 1 })
          .limit(1)
          .project({ sortIndex: 1 })
          .toArray();
        sortCursor = Number(earliest[0]?.sortIndex ?? 0);
      }
      sortCursor -= 1;
      await billing.insertOne({
        docType: 'equipment_master',
        stationCode: 'GLOBAL',
        sortIndex: sortCursor,
        itemNo: row.create.itemNo,
        description: row.create.description,
        unitType: row.create.unitType,
        uoms: [{ uom: row.uom, abbreviation: row.abbreviation }],
        createdAt: now,
        updatedAt: now,
      });
      createdMaster.push(description);
      continue;
    }
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

const contracts = await billing
  .find({ docType: 'contract', stationCode: STATION, customerCode: CUSTOMER })
  .toArray();
if (contracts.length === 0) throw new Error('No DEL contract for AX');

const contractLog = [];
for (const contract of contracts) {
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
  await billing.updateOne(
    { _id: contract._id },
    { $set: { adsEquipmentRules: rules, adsBillingEnabled: true, updatedAt: now } },
  );
  contractLog.push({
    contractNumber: contract.contractNumber,
    status: contract.status,
    updated,
    added,
    rules: rules.length,
  });
}

console.log(JSON.stringify({
  customer: { code: customer.customerCode, name: customer.name, currencyCode: customer.currencyCode },
  createdMaster,
  uomAdded,
  contracts: contractLog,
}, null, 2));

await client.close();
