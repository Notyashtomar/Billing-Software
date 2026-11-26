/**
 * DEL Air France (AF) and KLM (KL) share one additional-charges annex.
 * Both customers bill in INR. Dots in the annex are thousands separators.
 * Existing equipment-master names are reused.
 *
 * Usage (from api/): node scripts/seed-del-af-kl-ads-equipment.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'DEL';
const CUSTOMERS = ['AF', 'KL'];

const rows = [
  {
    serviceCodes: ['Wheel Chair-WCHC'],
    masterDescription: 'Wheel Chair-WCHC',
    price: 579,
    uom: 'Per Push',
    abbreviation: 'pp',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Ground Power Unit'],
    masterDescription: 'Ground Power Unit',
    price: 9056,
    uom: 'Per hour (or part thereof)',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Beyond the free of charge period.',
  },
  {
    serviceCodes: ['Air Conditioner Unit'],
    masterDescription: 'Air Conditioner Unit',
    price: 7399,
    uom: 'Per hour',
    abbreviation: 'PH',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Air Start Unit'],
    masterDescription: 'Air Start Unit',
    price: 8998,
    uom: 'Per start',
    abbreviation: 'PSU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Head Set'],
    masterDescription: 'Head Set',
    price: 3894,
    uom: 'Per flight',
    abbreviation: 'PF',
    foc: 0,
    remarks: 'Provide headset and perform ramp to flight-deck communication.',
  },
  {
    serviceCodes: ['Passenger Coach'],
    masterDescription: 'Passenger Coach',
    price: 4384,
    uom: 'Per trip (one way)',
    abbreviation: 'PT',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Crew Coach'],
    masterDescription: 'Crew Coach',
    price: 2287,
    uom: 'Per trip (one way)',
    abbreviation: 'PT',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    masterDescriptions: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    price: 8577,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 1,
    remarks: 'Additional pushback.',
  },
  {
    serviceCodes: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    masterDescriptions: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    price: 8615,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Toilet service'],
    masterDescription: 'Toilet service',
    price: 5711,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: 'Additional toilet service.',
  },
  {
    serviceCodes: ['Water service'],
    masterDescription: 'Water service',
    price: 4514,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: 'Additional water service.',
  },
  {
    serviceCodes: ['Utility Hand'],
    masterDescription: 'Utility Hand',
    price: 555,
    uom: 'Per person for 4 hours',
    abbreviation: 'P4H',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['White collar'],
    masterDescription: 'White collar',
    price: 1332,
    uom: 'Per person for 4 hours',
    abbreviation: 'P4H',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Wheel Brake Cooling'],
    masterDescription: 'Wheel Brake Cooling',
    price: 3400,
    uom: 'Per unit per hour',
    abbreviation: 'PUH',
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
    unitPriceINR: row.price,
    unitPriceUSD: null,
  };
}

const client = new MongoClient(loadMongoUri());
await client.connect();
const billing = client.db().collection('billing');
const now = new Date();

const customers = await billing
  .find(
    { docType: 'customer', stationCode: STATION, customerCode: { $in: CUSTOMERS } },
    { projection: { customerCode: 1, name: 1, currencyCode: 1 } },
  )
  .toArray();
const found = new Set(customers.map((customer) => customer.customerCode));
for (const code of CUSTOMERS) {
  if (!found.has(code)) throw new Error(`DEL customer ${code} was not found`);
}
for (const customer of customers) {
  if (customer.currencyCode !== 'INR') {
    throw new Error(`${customer.customerCode} bills in ${customer.currencyCode}, expected INR`);
  }
}

const createdMaster = [];
const uomAdded = [];
for (const row of rows) {
  const descriptions = row.masterDescriptions ?? [row.masterDescription];
  for (const description of descriptions) {
    const existing = await billing
      .find({ docType: 'equipment_master', description })
      .project({ _id: 1, itemNo: 1, description: 1, uoms: 1 })
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
      uomAdded.push(`${item.itemNo || item.description}: ${row.uom} (${row.abbreviation})`);
    }
  }
}

const contracts = await billing
  .find({
    docType: 'contract',
    stationCode: STATION,
    customerCode: { $in: CUSTOMERS },
  })
  .toArray();
if (contracts.length !== CUSTOMERS.length) {
  throw new Error(`Expected ${CUSTOMERS.length} contracts, found ${contracts.length}`);
}

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
    customerCode: contract.customerCode,
    status: contract.status,
    updated,
    added,
    rules: rules.length,
  });
}

console.log(JSON.stringify({
  customers: customers.map((customer) => ({
    code: customer.customerCode,
    name: customer.name,
    currencyCode: customer.currencyCode,
  })),
  createdMaster,
  uomAdded,
  contracts: contractLog,
}, null, 2));

await client.close();
