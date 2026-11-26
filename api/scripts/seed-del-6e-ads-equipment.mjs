/**
 * DEL Indigo (6E) adhoc handling equipment from the SGHA annex.
 * Customer currency is INR, so amounts go in unitPriceINR.
 * Existing equipment-master names are reused. Missing names are added.
 *
 * Usage (from api/): node scripts/seed-del-6e-ads-equipment.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'DEL';
const CUSTOMER = '6E';

const rows = [
  {
    serviceCode: 'Wheel Chair -WCHR',
    masterDescription: 'Wheel Chair -WCHR',
    price: 534,
    uom: 'Per WCHR / WCHS service',
    abbreviation: 'PS',
    foc: 10,
    remarks: '10 wheelchairs (WCHR / WCHS) included in basic handling.',
  },
  {
    serviceCode: 'Wheel Chair-WCHC',
    masterDescription: 'Wheel Chair-WCHC',
    price: 618,
    uom: 'Per WCHC service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'Deportees',
    masterDescription: 'Deportees',
    price: 708,
    uom: 'Per Service Per Pax',
    abbreviation: 'PSP',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'Ground Power Unit (WB)',
    masterDescription: 'Ground Power Unit (WB)',
    price: 7556,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Widebody. On remote bay or when BME provisions are unserviceable.',
  },
  {
    serviceCode: 'Air Conditioner Unit',
    masterDescription: 'Air Conditioner Unit',
    price: 8792,
    uom: 'Per hour or part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'On remote bay or when BME provisions are unserviceable.',
  },
  {
    serviceCode: 'Air Start Unit',
    masterDescription: 'Air Start Unit',
    price: 6433,
    uom: 'Per start',
    abbreviation: 'PSU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'Passenger Coach',
    masterDescription: 'Passenger Coach',
    price: 8567,
    uom: 'Per turnaround',
    abbreviation: 'PTA',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'Crew Coach',
    masterDescription: 'Crew Coach',
    price: 1011,
    uom: 'Per coach per one-way trip',
    abbreviation: 'PCT',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'Push Back without Towbar',
    masterDescription: 'Push Back without Towbar',
    price: 6966,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 1,
    remarks: 'One pushback included in basic handling.',
  },
  {
    serviceCode: 'Push Back-Narrow Body',
    masterDescription: 'Push Back-Narrow Body',
    price: 6966,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 1,
    remarks: 'One pushback included in basic handling.',
  },
  {
    serviceCode: 'Push Back-Wide Body',
    masterDescription: 'Push Back-Wide Body',
    price: 6966,
    uom: 'Per service',
    abbreviation: 'PS',
    foc: 1,
    remarks: 'One pushback included in basic handling.',
  },
  {
    serviceCode: 'Towing (Short Tow within the same apron)',
    create: {
      itemNo: 'TOW-SHORT',
      description: 'Towing (Short Tow within the same apron)',
      unitType: 'Equipment Used',
    },
    price: 14000,
    uom: 'per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'Towing (Long Tow to a different Apron)',
    create: {
      itemNo: 'TOW-LONG',
      description: 'Towing (Long Tow to a different Apron)',
      unitType: 'Equipment Used',
    },
    price: 27000,
    uom: 'per service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'Towbar',
    masterDescription: 'Towbar',
    price: null,
    uom: 'Included in pushback',
    abbreviation: 'INC',
    foc: 0,
    remarks: 'Included in pushback.',
    alwaysChargeable: false,
  },
  {
    serviceCode: 'Toilet service',
    masterDescription: 'Toilet service',
    price: 3034,
    uom: 'Per flight',
    abbreviation: 'PF',
    foc: 1,
    remarks: 'One toilet service included in basic handling.',
  },
  {
    serviceCode: 'Water service',
    masterDescription: 'Water service',
    price: 3034,
    uom: 'Per flight',
    abbreviation: 'PF',
    foc: 1,
    remarks: 'One water service included in basic handling.',
  },
  {
    serviceCode: 'Ambulift',
    masterDescription: 'Ambulift',
    price: 6348,
    uom: 'Per Service',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'ULD Storage',
    masterDescription: 'ULD Storage',
    price: 596,
    uom: 'Per ULD per day',
    abbreviation: 'PUD',
    foc: 15,
    remarks: 'Up to 15 LD3s for daily scheduled operations are free of charge.',
  },
  {
    serviceCode: 'Ancilliary Services',
    masterDescription: 'Ancilliary Services',
    price: 8090,
    uom: 'Ancillary Services Per flight',
    abbreviation: 'PF',
    foc: 0,
    remarks: 'Document check at check-in counters and boarding gate. Trained 4 to 6 personnel.',
  },
];

function sameText(left, right) {
  return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
}

function rulePatch(row) {
  const foc = row.foc ?? 0;
  const alwaysChargeable = row.alwaysChargeable ?? !(foc > 0);
  const patch = {
    serviceCode: row.serviceCode,
    includedForAds: true,
    alwaysChargeable,
    freePerFlight: foc,
    cumulativeMonthlyBasis: false,
    uom: row.uom,
    remarks: row.remarks ?? '',
    unitPriceUSD: null,
  };
  if (row.price == null) patch.unitPriceINR = null;
  else patch.unitPriceINR = row.price;
  return patch;
}

const client = new MongoClient(loadMongoUri());
await client.connect();
const billing = client.db().collection('billing');
const now = new Date();

const customer = await billing.findOne(
  { docType: 'customer', stationCode: STATION, customerCode: CUSTOMER },
  { projection: { customerCode: 1, name: 1, currencyCode: 1 } },
);
if (!customer) throw new Error('DEL customer 6E was not found');
if (customer.currencyCode !== 'INR') {
  throw new Error(`Expected INR billing currency, found ${customer.currencyCode}`);
}

const createdMaster = [];
const uomAdded = [];
let sortCursor = null;

for (const row of rows) {
  const description = row.create?.description ?? row.masterDescription;
  const existing = await billing
    .find({ docType: 'equipment_master', description })
    .project({ _id: 1, itemNo: 1, description: 1, uoms: 1 })
    .toArray();

  if (existing.length === 0) {
    if (!row.create) throw new Error(`Equipment master is missing ${description}`);
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
    createdMaster.push(row.create.description);
    continue;
  }

  for (const item of existing) {
    const uoms = Array.isArray(item.uoms) ? item.uoms : [];
    const has = uoms.some((pair) => sameText(pair.uom, row.uom));
    if (has) continue;
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

const contracts = await billing
  .find({
    docType: 'contract',
    stationCode: STATION,
    $or: [{ customerCode: CUSTOMER }, { additionalCustomerCodes: CUSTOMER }],
  })
  .toArray();
if (contracts.length === 0) throw new Error('No DEL contract for 6E');

const contractLog = [];
for (const contract of contracts) {
  const rules = Array.isArray(contract.adsEquipmentRules) ? contract.adsEquipmentRules : [];
  let updated = 0;
  let added = 0;
  for (const row of rows) {
    const patch = rulePatch(row);
    const hits = rules.filter((rule) => rule.serviceCode === row.serviceCode);
    if (hits.length === 0) {
      rules.push({
        ...patch,
        aircraftTypes: [],
      });
      added += 1;
      continue;
    }
    for (const rule of hits) {
      Object.assign(rule, patch);
      updated += 1;
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
  customer: {
    code: customer.customerCode,
    name: customer.name,
    currencyCode: customer.currencyCode,
  },
  createdMaster,
  uomAdded,
  contracts: contractLog,
}, null, 2));

await client.close();
