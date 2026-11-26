/**
 * DEL Bhutan Air (B3) additional services.
 * The annex prints USD, and the customer bills in INR, so the amounts
 * are stored in unitPriceINR. Four WCHR/WCHS per flight are free.
 *
 * Usage (from api/): node scripts/seed-del-b3-ads-equipment.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'DEL';
const CUSTOMER = 'B3';

const rows = [
  {
    serviceCodes: ['Wheel Chair -WCHR'],
    masterDescription: 'Wheel Chair -WCHR',
    inr: 36,
    uom: 'Per WCHR or WCHS',
    abbreviation: 'PS',
    foc: 4,
    remarks: 'Four WCHR/WCHS are included in the basic handling rate. Service starts at check-in and ends at arrival curbside.',
  },
  {
    serviceCodes: ['Ambulift'],
    masterDescription: 'Ambulift',
    inr: 327,
    uom: 'Per usage',
    abbreviation: 'PU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Passenger Coach'],
    masterDescription: 'Passenger Coach',
    inr: 60,
    uom: 'Per turnaround',
    abbreviation: 'PTA',
    foc: 0,
    remarks: 'Passenger bus. For remote bay operation.',
  },
  {
    serviceCodes: ['Crew Coach'],
    masterDescription: 'Crew Coach',
    inr: 60,
    uom: 'Per turnaround',
    abbreviation: 'PTA',
    foc: 0,
    remarks: 'Crew transport. For remote bay operation.',
  },
  {
    serviceCodes: ['Ground Power Unit', 'Ground Power Unit (NB)', 'Ground Power Unit (WB)'],
    masterDescriptions: ['Ground Power Unit', 'Ground Power Unit (NB)', 'Ground Power Unit (WB)'],
    inr: 245,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)', 'Air Conditioner Unit (WB)'],
    masterDescriptions: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)', 'Air Conditioner Unit (WB)'],
    inr: 407,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Air Start Unit', 'Air Start Unit-Narrow Body', 'Air Start Unit-Wide Body'],
    masterDescriptions: ['Air Start Unit', 'Air Start Unit-Narrow Body', 'Air Start Unit-Wide Body'],
    inr: 229,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Head Set', 'Ramp to Flight Deck Communication'],
    masterDescriptions: ['Head Set', 'Ramp to Flight Deck Communication'],
    inr: 82,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    masterDescriptions: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    inr: 261,
    uom: 'Per push',
    abbreviation: 'pp',
    foc: 1,
    remarks: 'Additional pushback.',
  },
  {
    serviceCodes: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    masterDescriptions: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    inr: 425,
    uom: 'Per tow',
    abbreviation: 'PT',
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

const contracts = await billing
  .find({ docType: 'contract', stationCode: STATION, customerCode: CUSTOMER })
  .toArray();
if (contracts.length === 0) throw new Error('No DEL contract for B3');

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
  uomAdded,
  contracts: contractLog,
}, null, 2));

await client.close();
