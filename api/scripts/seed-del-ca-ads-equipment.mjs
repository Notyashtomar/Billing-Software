/**
 * DEL Air China (CA) additional services. Customer currency is USD.
 * Free allowances are the counts printed in the annex. Non-accumulative
 * wheelchair and ULD allowances stay per turnaround, not monthly.
 *
 * Usage (from api/): node scripts/seed-del-ca-ads-equipment.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'DEL';
const CUSTOMER = 'CA';

const rows = [
  {
    serviceCodes: ['Wheel Chair -WCHR', 'Scheduled - Equipment - WCHR'],
    masterDescription: 'Wheel Chair -WCHR',
    usd: 12,
    uom: 'Per WCHR or WCHS',
    abbreviation: 'PS',
    foc: 10,
    remarks: '10 non-accumulative WCHR/WCHS per turnaround included in basic handling.',
  },
  {
    serviceCodes: ['Wheel Chair-WCHC', 'Scheduled - Equipment - WCHC'],
    masterDescription: 'Wheel Chair-WCHC',
    usd: 16,
    uom: 'Per WCHC',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Ambulift', 'Scheduled - Equipment - AMB'],
    masterDescription: 'Ambulift',
    usd: 140,
    uom: 'Per usage',
    abbreviation: 'PU',
    foc: 0,
    remarks: 'Can accommodate 1-4 wheelchairs or 1 stretcher.',
  },
  {
    serviceCodes: ['Ground Power Unit', 'Ground Power Unit (NB)', 'Scheduled - Equipment - GPU-NB'],
    masterDescriptions: ['Ground Power Unit', 'Ground Power Unit (NB)'],
    usd: 140,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    hourlyOnly: true,
    remarks: '',
  },
  {
    serviceCodes: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)', 'Scheduled - Equipment - ACU-NB'],
    masterDescriptions: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)'],
    usd: 165,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    hourlyOnly: true,
    remarks: 'At remote bay only.',
  },
  {
    serviceCodes: ['Air Start Unit', 'Air Start Unit-Narrow Body', 'Scheduled - Equipment - ASU-NB'],
    masterDescriptions: ['Air Start Unit', 'Air Start Unit-Narrow Body'],
    usd: 165,
    uom: 'Per start-up',
    abbreviation: 'PSU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Head Set', 'Scheduled - Equipment - HS'],
    masterDescription: 'Head Set',
    usd: 40,
    uom: 'Per flight',
    abbreviation: 'PF',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Passenger Coach', 'Scheduled - Equipment - PAX Coach'],
    masterDescription: 'Passenger Coach',
    usd: 45,
    uom: 'Per trip',
    abbreviation: 'PT',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Crew Coach', 'Scheduled - Equipment - Crew-Coach'],
    masterDescription: 'Crew Coach',
    usd: 45,
    uom: 'Per trip',
    abbreviation: 'PT',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: [
      'Push Back without Towbar',
      'Push Back-Narrow Body',
      'Push Back-Wide Body',
      'Scheduled - Equipment - PBNB',
    ],
    masterDescriptions: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    usd: 160,
    uom: 'Per push',
    abbreviation: 'pp',
    foc: 1,
    remarks: 'One pushback included in basic handling.',
  },
  {
    serviceCodes: [
      'Tow Inter Stand - Narrow Body',
      'Tow Inter Stand - Wide Body',
      'Scheduled - Equipment - PTOW',
    ],
    masterDescriptions: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    usd: 290,
    uom: 'Per tow',
    abbreviation: 'PT',
    foc: 0,
    remarks: 'Short tow.',
  },
  {
    serviceCodes: ['Utility Hand', 'Scheduled - Equipment - Additional-Porter-Utility-Hand'],
    masterDescription: 'Utility Hand',
    usd: 24,
    uom: 'Per personnel per scheduled turnaround',
    abbreviation: 'PPT',
    foc: 0,
    remarks: 'Additional porter or utility hand.',
  },
  {
    serviceCodes: ['LD3', 'ULD Storage', 'Scheduled - Equipment - ULD3'],
    masterDescriptions: ['LD3', 'ULD Storage'],
    usd: 5,
    uom: 'Per ULD',
    abbreviation: 'PU',
    foc: 20,
    remarks: 'Storage for 20 LD3s per flight on operational days is included in basic handling.',
  },
  {
    serviceCodes: ['LD11', 'Scheduled - Equipment - ULD11'],
    masterDescription: 'LD11',
    usd: 8,
    uom: 'Per ULD',
    abbreviation: 'PU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Pallet-PAJ', 'Scheduled - Equipment - Pallet-PAJ'],
    masterDescription: 'PAJ',
    usd: 5,
    uom: 'Per ULD',
    abbreviation: 'PU',
    foc: 0,
    remarks: 'Maximum stacking 5.',
  },
  {
    serviceCodes: ['Pallet-PMA', 'Scheduled - Equipment - Pallet-PMA'],
    masterDescription: 'PMA',
    usd: 9,
    uom: 'Per ULD',
    abbreviation: 'PU',
    foc: 0,
    remarks: 'Maximum stacking 5.',
  },
];

function sameText(left, right) {
  return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
}

function isHourlyUom(uom) {
  const raw = String(uom ?? '');
  if (/15|30/.test(raw)) return false;
  return /hour/i.test(raw);
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
if (!customer) throw new Error('DEL customer CA was not found');
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

const contracts = await billing
  .find({ docType: 'contract', stationCode: STATION, customerCode: CUSTOMER })
  .toArray();
if (contracts.length === 0) throw new Error('No DEL contract for CA');

const contractLog = [];
for (const contract of contracts) {
  const rules = Array.isArray(contract.adsEquipmentRules) ? contract.adsEquipmentRules : [];
  let updated = 0;
  let added = 0;
  for (const row of rows) {
    for (const serviceCode of row.serviceCodes) {
      const patch = rulePatch(serviceCode, row);
      let hits = rules.filter((rule) => rule.serviceCode === serviceCode);
      if (row.hourlyOnly) {
        const hourly = hits.filter((rule) => isHourlyUom(rule.uom));
        if (hourly.length > 0) hits = hourly;
        else if (hits.length > 0) hits = [];
      }
      if (hits.length === 0) {
        const already = rules.some(
          (rule) => rule.serviceCode === serviceCode && sameText(rule.uom, row.uom),
        );
        if (already) continue;
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
