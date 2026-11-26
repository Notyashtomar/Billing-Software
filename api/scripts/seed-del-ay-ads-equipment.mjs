/**
 * DEL Finnair (AY) additional charges. Customer currency is INR.
 * Six WCHR/WCHS per flight are free and do not accumulate.
 * The x-bag line is a 5% commission, so it is not stored as rupees.
 *
 * Usage (from api/): node scripts/seed-del-ay-ads-equipment.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'DEL';
const CUSTOMER = 'AY';

const rows = [
  {
    serviceCodes: ['Wheel Chair -WCHR'],
    masterDescription: 'Wheel Chair -WCHR',
    inr: 490,
    uom: 'Per WCHR or WCHS',
    abbreviation: 'PS',
    foc: 6,
    remarks: 'Six non-accumulative WCHR/WCHS per flight are included in basic handling.',
  },
  {
    serviceCodes: ['Wheel Chair-WCHC'],
    masterDescription: 'Wheel Chair-WCHC',
    inr: 725,
    uom: 'Per WCHC',
    abbreviation: 'PS',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Ambulift'],
    masterDescription: 'Ambulift',
    inr: 8400,
    uom: 'Per usage',
    abbreviation: 'PU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Commission on x-bag Admin'],
    create: {
      itemNo: 'XBAG',
      description: 'Commission on x-bag Admin',
      unitType: 'Service Wise',
    },
    inr: null,
    uom: '5%',
    abbreviation: 'PCT',
    foc: 0,
    alwaysChargeable: false,
    remarks: '5% commission on x-bag admin.',
  },
  {
    serviceCodes: ['Ground Power Unit', 'Ground Power Unit (NB)', 'Ground Power Unit (WB)'],
    masterDescriptions: ['Ground Power Unit', 'Ground Power Unit (NB)', 'Ground Power Unit (WB)'],
    inr: 4500,
    uom: 'Per 30 min',
    abbreviation: 'P30',
    foc: 0,
    remarks: 'BME policies apply.',
  },
  {
    serviceCodes: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)', 'Air Conditioner Unit (WB)'],
    masterDescriptions: ['Air Conditioner Unit', 'Air Conditioner Unit (NB)', 'Air Conditioner Unit (WB)'],
    inr: 5100,
    uom: 'Per 30 min',
    abbreviation: 'P30',
    foc: 0,
    remarks: 'Cooling unit. BME policies apply.',
  },
  {
    serviceCodes: ['Air Start Unit', 'Air Start Unit-Narrow Body', 'Air Start Unit-Wide Body'],
    masterDescriptions: ['Air Start Unit', 'Air Start Unit-Narrow Body', 'Air Start Unit-Wide Body'],
    inr: 11000,
    uom: 'Per start',
    abbreviation: 'PSU',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    masterDescriptions: ['Push Back without Towbar', 'Push Back-Narrow Body', 'Push Back-Wide Body'],
    inr: 12000,
    uom: 'Per push',
    abbreviation: 'pp',
    foc: 1,
    remarks: 'Additional pushback.',
  },
  {
    serviceCodes: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    masterDescriptions: ['Tow Inter Stand - Narrow Body', 'Tow Inter Stand - Wide Body'],
    inr: 18600,
    uom: 'Per tow',
    abbreviation: 'PT',
    foc: 0,
    remarks: '',
  },
  {
    serviceCodes: ['Utility Hand', 'Additional Utility Hand'],
    masterDescriptions: ['Utility Hand', 'Additional Utility Hand'],
    inr: 1650,
    uom: 'Per hour',
    abbreviation: 'PH',
    foc: 0,
    remarks: 'Additional porters or utility hands.',
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
if (!customer) throw new Error('DEL customer AY was not found');
if (customer.currencyCode !== 'INR') {
  throw new Error(`Expected INR billing currency, found ${customer.currencyCode}`);
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
if (contracts.length === 0) throw new Error('No DEL contract for AY');

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
