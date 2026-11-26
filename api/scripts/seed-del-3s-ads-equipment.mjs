/**
 * DEL Aerologic (3S) additional services from Paragraph 2 of the annex.
 * Customer currency is INR, so amounts go in unitPriceINR.
 * Existing equipment-master names are reused. Disinfection Services is added.
 *
 * Usage (from api/): node scripts/seed-del-3s-ads-equipment.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'DEL';
const CUSTOMER = '3S';

const rows = [
  {
    serviceCode: 'Ground Power Unit',
    masterDescription: 'Ground Power Unit',
    price: 8300,
    uom: 'Per hour and part thereof',
    abbreviation: 'PH',
    foc: 2,
    remarks: 'Charged beyond 120 minutes.',
  },
  {
    serviceCode: 'Air Conditioner Unit',
    masterDescription: 'Air Conditioner Unit',
    price: 9300,
    uom: 'Per hour and part thereof',
    abbreviation: 'PH',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'Air Start Unit',
    masterDescription: 'Air Start Unit',
    price: 12300,
    uom: 'Per start',
    abbreviation: 'PSU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'Push Back without Towbar',
    masterDescription: 'Push Back without Towbar',
    price: 9200,
    uom: 'Per push',
    abbreviation: 'pp',
    foc: 1,
    remarks: 'One pushback included. Charged beyond one.',
  },
  {
    serviceCode: 'Push Back-Narrow Body',
    masterDescription: 'Push Back-Narrow Body',
    price: 9200,
    uom: 'Per push',
    abbreviation: 'pp',
    foc: 1,
    remarks: 'One pushback included. Charged beyond one.',
  },
  {
    serviceCode: 'Push Back-Wide Body',
    masterDescription: 'Push Back-Wide Body',
    price: 9200,
    uom: 'Per push',
    abbreviation: 'pp',
    foc: 1,
    remarks: 'One pushback included. Charged beyond one.',
  },
  {
    serviceCode: 'Cleaning Services',
    masterDescription: 'Cleaning Services',
    price: 4900,
    uom: 'Per turnaround',
    abbreviation: 'PTA',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'Disinfection Services',
    create: {
      itemNo: 'DISINF',
      description: 'Disinfection Services',
      unitType: 'Equipment Used',
    },
    price: 2100,
    uom: 'Per service per cargo compartment',
    abbreviation: 'PSC',
    foc: 0,
    remarks: '',
  },
  {
    serviceCode: 'Disinfection Services',
    masterDescription: 'Disinfection Services',
    price: 720,
    uom: 'Per service per ULD',
    abbreviation: 'PSULD',
    foc: 0,
    remarks: '',
  },
];

function sameText(left, right) {
  return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
}

function rulePatch(row) {
  const foc = row.foc ?? 0;
  return {
    serviceCode: row.serviceCode,
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

const customer = await billing.findOne(
  { docType: 'customer', stationCode: STATION, customerCode: CUSTOMER },
  { projection: { customerCode: 1, name: 1, currencyCode: 1 } },
);
if (!customer) throw new Error('DEL customer 3S was not found');
if (customer.currencyCode !== 'INR') {
  throw new Error(`Expected INR billing currency, found ${customer.currencyCode}`);
}

const createdMaster = [];
const uomAdded = [];
let sortCursor = null;
const masterReady = new Set();

for (const row of rows) {
  const description = row.create?.description ?? row.masterDescription;
  if (masterReady.has(`${description}::${row.uom.toLowerCase()}`)) continue;
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
    const uoms = rows
      .filter((item) => (item.create?.description ?? item.masterDescription) === description)
      .map((item) => ({ uom: item.uom, abbreviation: item.abbreviation }));
    const seen = new Set();
    const uniqueUoms = uoms.filter((pair) => {
      const key = pair.uom.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await billing.insertOne({
      docType: 'equipment_master',
      stationCode: 'GLOBAL',
      sortIndex: sortCursor,
      itemNo: row.create.itemNo,
      description: row.create.description,
      unitType: row.create.unitType,
      uoms: uniqueUoms,
      createdAt: now,
      updatedAt: now,
    });
    createdMaster.push(row.create.description);
    for (const pair of uniqueUoms) masterReady.add(`${description}::${pair.uom.toLowerCase()}`);
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
    uomAdded.push(`${item.itemNo || item.description}: ${row.uom} (${row.abbreviation})`);
  }
  masterReady.add(`${description}::${row.uom.toLowerCase()}`);
}

const contracts = await billing
  .find({
    docType: 'contract',
    stationCode: STATION,
    $or: [{ customerCode: CUSTOMER }, { additionalCustomerCodes: CUSTOMER }],
  })
  .toArray();
if (contracts.length === 0) throw new Error('No DEL contract for 3S');

const contractLog = [];
for (const contract of contracts) {
  const rules = Array.isArray(contract.adsEquipmentRules) ? contract.adsEquipmentRules : [];
  let updated = 0;
  let added = 0;
  for (const row of rows) {
    const patch = rulePatch(row);
    const hits = rules.filter(
      (rule) => rule.serviceCode === row.serviceCode && sameText(rule.uom, row.uom),
    );
    if (hits.length === 0) {
      const sameName = rules.filter((rule) => rule.serviceCode === row.serviceCode);
      const blankUom = sameName.find((rule) => !String(rule.uom ?? '').trim());
      const onlyOne = sameName.length === 1 ? sameName[0] : null;
      const target = blankUom ?? (onlyOne && !rows.some((other) => other !== row && other.serviceCode === row.serviceCode) ? onlyOne : null);
      if (target && !sameText(target.uom, row.uom) && rows.filter((item) => item.serviceCode === row.serviceCode).length === 1) {
        Object.assign(target, patch);
        updated += 1;
        continue;
      }
      if (sameName.length === 1 && rows.filter((item) => item.serviceCode === row.serviceCode).length === 1) {
        Object.assign(sameName[0], patch);
        updated += 1;
        continue;
      }
      rules.push({ ...patch, aircraftTypes: [] });
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
  customer: { code: customer.customerCode, name: customer.name, currencyCode: customer.currencyCode },
  createdMaster,
  uomAdded,
  contracts: contractLog,
}, null, 2));

await client.close();
