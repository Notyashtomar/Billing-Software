/**
 * DEL ADS equipment rules from the September 2026 ADS tax invoices.
 *
 * Each invoiced equipment gets the Equipment Master name the contract dropdown
 * uses, the invoice unit of measurement and the invoice rate. Rows the contract
 * already has for that equipment are updated in place, so their free allowance
 * is kept. Equipment a contract did not have is added.
 *
 * Rates: scripts/data/del-ads-september-2026-invoice-rates.json
 *
 * Usage (from api/):
 *   node scripts/seed-del-ads-from-september-invoices.mjs              plan only, writes nothing
 *   node scripts/seed-del-ads-from-september-invoices.mjs --apply      back up, then write
 *   node scripts/seed-del-ads-from-september-invoices.mjs --restore="C:\path\backup.json"
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient, BSON } = require('mongodb');

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

// Same name rules the ADS contract screen uses.
require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  compilerOptions: { module: 'commonjs', moduleResolution: 'node', target: 'es2020', esModuleInterop: true },
});
const { stripCatalogServicePrefix } = require(
  path.join(repoRoot, 'm-platform/client/lib/billing-shared/service-catalog-labels.ts'),
);
const { adsEquipmentIdentity } = require(
  path.join(repoRoot, 'm-platform/client/lib/billing-shared/ads-equipment-rules-validity.ts'),
);

const STATION = 'DEL';
const APPLY = process.argv.includes('--apply');
const restoreArg = process.argv.find((a) => a.startsWith('--restore='));
const lines = JSON.parse(
  fs.readFileSync(path.join(here, 'data', 'del-ads-september-2026-invoice-rates.json'), 'utf8'),
);

const WCHR_S = 'Wheel Chair - WCHR/S';
const GENERIC_GPU = [/^GPU$/, /^GROUND POWER UNIT$/];
const GENERIC_ASU = [/^ASU$/, /^AIR START UNIT$/];
const GENERIC_PUSH = [/^PB$/, /^PUSH ?BACK$/, /^ADDITIONAL PB$/, /^PUSHBACK PS$/];
const GENERIC_TOW = [/^IST$/, /^INTER ?STAND TOW$/, /^TOWING$/, /^TOWING INTERSTAND$/, /^TOW$/];
const GENERIC_STEPS = [/^PSL$/, /^STEP LADDER$/, /^PAX STEP LADDER$/, /^PSL FOR REMOTE$/];
const COMBINED_WHEELCHAIR = [/WCHR WCHC WCHS/, /WCHR\/C\/S/];

/**
 * Existing contract rows that mean the same equipment.
 * `specific` rows are the same equipment under a short name.
 * `generic` rows cover the whole family (GPU, Push Back) and become the invoiced one.
 * `donors` only lend their free allowance to a new row.
 */
const ALIASES = {
  [WCHR_S]: { generic: [/^WHEEL CHAIR$/], donors: COMBINED_WHEELCHAIR },
  'Wheel Chair-WCHC': { specific: [/^WCHC$/], donors: COMBINED_WHEELCHAIR },
  'Ground Power Unit-140 KV': { specific: [/^GPU 140 ?KVA?\b/], generic: GENERIC_GPU },
  'Ground Power Unit-180KV': { specific: [/^GPU 180 ?KVA?$/], generic: GENERIC_GPU },
  'Air Conditioner Unit': { specific: [/^ACU$/] },
  'Air Start Unit-Narrow Body': { specific: [/^ASU NB$/], generic: GENERIC_ASU },
  'Air Start Unit-Wide Body': { specific: [/^ASU WB$/], generic: GENERIC_ASU },
  Ambulift: { specific: [/^AMB$/, /^PS AMB$/] },
  'Head Set': { specific: [/^HS$/, /^HEADSET$/, /^HS FLIGHT DECK COMMUNICATION$/] },
  'Crew Coach': { specific: [/^CREW TRANSPORT$/] },
  'Passenger Coach': { specific: [/^PAX COACH$/, /^PASSENGER TRANSPORT$/], generic: [/^COACH$/] },
  'Push Back-Narrow Body': { specific: [/^PB ?NB$/], generic: GENERIC_PUSH },
  'Push Back-Wide Body': { specific: [/^PB ?WB$/], generic: GENERIC_PUSH },
  'Tow Inter Stand - Narrow Body': { specific: [/^IST ?NB$/], generic: GENERIC_TOW },
  'Tow Inter Stand - Wide Body': { specific: [/^IST ?WB$/], generic: GENERIC_TOW },
  'Towing (Long Tow to a different Apron)': { specific: [/^LONG TOW$/] },
  'Pax Step Ladder (remote bay) Motorized - Narrow Body': { specific: [/^PSL NB$/], generic: GENERIC_STEPS },
  'Pax Step Ladder (remote bay) Motorized - Wide Body': { specific: [/^PSL WB$/], generic: GENERIC_STEPS },
  Marshaller: { specific: [/^M$/, /^MRSH$/] },
  'Diesel Tractor': { specific: [/^DT$/] },
  'Scheduled - Equipment - EBT': { specific: [/^ELECTRIC BAGGAGE (TROLLY|TROLLEY|TRACTOR)$/] },
  'Baggage Freight Loader': { specific: [/^BFL$/] },
  'Ramp Car': { specific: [/^RC$/] },
  'Blue collar': { specific: [/^BC$/, /^BC IF ADDITIONAL$/] },
  'Additional Utility Hand': { specific: [/^UH$/] },
  'Wheel Brake Cooling': { specific: [/^WBC$/, /^BRAKE COOLING$/, /^BREAK COOLING FAN$/] },
  'Potable Water': { specific: [/^PW$/] },
  'Toilet service': { specific: [/^TS$/] },
  'Water service': { specific: [/^WS$/] },
  'Baggage Tag Rolls': {},
  'Extended Cleaning': {},
  'Deep Cleaning - Narrow Body': { specific: [/^DC NB$/], generic: [/^DEEP CLEANING$/] },
};

/** IndiGo is billed two tow rates; the standard row carries the short tow. */
const REMARKS = {
  '6E|Tow Inter Stand - Wide Body': 'Short tow. Long tow is billed at its own rate.',
  '6E|Towing (Long Tow to a different Apron)': 'Long tow.',
};

const sameText = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const equipmentKey = (code) => adsEquipmentIdentity(stripCatalogServicePrefix(String(code ?? '')) || String(code ?? ''));
const priceField = (currency) => (currency === 'USD' ? 'unitPriceUSD' : 'unitPriceINR');
const otherPriceField = (currency) => (currency === 'USD' ? 'unitPriceINR' : 'unitPriceUSD');
const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const hasPrice = (rule) => positive(rule.unitPriceINR) != null || positive(rule.unitPriceUSD) != null;

function ruleSector(rule) {
  const category = String(rule.category ?? '').trim().toLowerCase();
  if (category.startsWith('dom')) return 'Dom';
  if (category.startsWith('int')) return 'Int';
  return '';
}

function matchesAny(patterns, rule) {
  if (!patterns?.length) return false;
  const key = equipmentKey(rule.serviceCode);
  const raw = String(rule.serviceCode ?? '').toUpperCase();
  return patterns.some((pattern) => pattern.test(key) || pattern.test(raw));
}

function describe(rule) {
  const price = [
    positive(rule.unitPriceINR) != null ? `INR ${rule.unitPriceINR}` : '',
    positive(rule.unitPriceUSD) != null ? `USD ${rule.unitPriceUSD}` : '',
  ].filter(Boolean).join(' / ') || 'no price';
  return `"${rule.serviceCode}" | ${rule.uom || 'no UOM'} | ${price} | FOC ${rule.freePerFlight ?? 0}`;
}

/* ---------- Restore ---------- */

async function restore(billing, file) {
  const backup = BSON.EJSON.parse(fs.readFileSync(file, 'utf8'));
  for (const contract of backup.contracts) {
    await billing.updateOne(
      { _id: contract._id, docType: 'contract' },
      { $set: { adsEquipmentRules: contract.adsEquipmentRules, updatedAt: new Date() } },
    );
  }
  for (const item of backup.equipmentMaster) {
    await billing.updateOne(
      { _id: item._id, docType: 'equipment_master' },
      { $set: { uoms: item.uoms, updatedAt: new Date() } },
    );
  }
  console.log(`Restored ${backup.contracts.length} contracts and ${backup.equipmentMaster.length} equipment master rows from ${file}`);
}

/* ---------- Unit of measurement, as the dropdown spells it ---------- */

function planUoms(master) {
  const abbreviationVotes = new Map();
  for (const item of master) {
    for (const pair of item.uoms ?? []) {
      const abbreviation = String(pair.abbreviation ?? '').trim();
      if (!abbreviation) continue;
      const key = String(pair.uom ?? '').trim().toLowerCase();
      const votes = abbreviationVotes.get(key) ?? new Map();
      votes.set(abbreviation, (votes.get(abbreviation) ?? 0) + 1);
      abbreviationVotes.set(key, votes);
    }
  }
  const abbreviationFor = (uom) => {
    const votes = abbreviationVotes.get(uom.toLowerCase());
    if (!votes) return '';
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const masterRowsFor = (serviceCode) => {
    const names = serviceCode === WCHR_S ? ['Wheel Chair -WCHR', 'Wheel Chair -WCHS'] : [serviceCode];
    return master.filter((item) => names.some((name) => sameText(item.description, name)));
  };

  const additions = new Map();
  const noMasterRow = new Set();
  const resolved = new Map();
  for (const line of lines) {
    const rows = masterRowsFor(line.serviceCode);
    if (rows.length === 0) {
      noMasterRow.add(line.serviceCode);
      resolved.set(line, line.uom);
      continue;
    }
    const spellings = rows.flatMap((item) => (item.uoms ?? []).map((pair) => String(pair.uom ?? '').trim()));
    const uom = spellings.find((value) => value === line.uom) ?? spellings.find((value) => sameText(value, line.uom)) ?? line.uom;
    resolved.set(line, uom);
    for (const item of rows) {
      if ((item.uoms ?? []).some((pair) => sameText(pair.uom, uom))) continue;
      const key = String(item._id);
      const entry = additions.get(key) ?? { item, pairs: [] };
      if (!entry.pairs.some((pair) => sameText(pair.uom, uom))) {
        entry.pairs.push({ uom, abbreviation: abbreviationFor(uom) });
      }
      additions.set(key, entry);
    }
  }
  return { resolved, additions: [...additions.values()], noMasterRow: [...noMasterRow] };
}

/* ---------- One contract ---------- */

function planContract(contract, contractLines, uomFor) {
  const rules = (Array.isArray(contract.adsEquipmentRules) ? contract.adsEquipmentRules : []).map((rule) => ({ ...rule }));
  const original = rules.map((rule) => ({ ...rule }));
  const used = new Set();
  const removed = new Set();
  const log = [];

  for (const line of contractLines) {
    const aliases = ALIASES[line.serviceCode];
    if (!aliases) throw new Error(`No alias entry for ${line.serviceCode}`);
    const targetKey = equipmentKey(line.serviceCode);
    const uom = uomFor.get(line);
    const field = priceField(line.currency);
    const other = otherPriceField(line.currency);
    const inScope = (rule, index) =>
      !used.has(index) && !removed.has(index) && (ruleSector(rule) === '' || ruleSector(rule) === line.sector);
    const tier = (test) => rules.map((rule, index) => ({ rule, index })).filter(({ rule, index }) => inScope(rule, index) && test(rule));

    const exact = tier((rule) => equipmentKey(rule.serviceCode) === targetKey);
    const specific = exact.length ? [] : tier((rule) => matchesAny(aliases.specific, rule));
    const generic = exact.length || specific.length ? [] : tier((rule) => matchesAny(aliases.generic, rule));
    const pool = exact.length ? exact : specific.length ? specific : generic;
    const remark = REMARKS[`${contract.customerCode}|${line.serviceCode}`];
    // Invoices raised in USD at a fixed rupee rate also carry the rupee price.
    const otherPrice =
      line.currency === 'USD' && positive(line.fixedInrRate) != null
        ? Math.round(line.price * line.fixedInrRate * 100) / 100
        : null;

    // A row limited to the other sector that already holds this unit and rate stays as it is.
    const otherSector = rules.find(
      (rule, index) =>
        pool.length === 0 &&
        !used.has(index) &&
        !removed.has(index) &&
        equipmentKey(rule.serviceCode) === targetKey &&
        positive(rule[field]) === line.price &&
        sameText(rule.uom, uom),
    );
    if (otherSector) {
      used.add(rules.indexOf(otherSector));
      log.push(`OK      ${describe(otherSector)}  (row is marked ${ruleSector(otherSector)})`);
      continue;
    }

    if (pool.length === 0) {
      const donor = original.find((rule) => matchesAny(aliases.donors, rule));
      const foc = Number(donor?.freePerFlight ?? 0) || 0;
      const added = {
        serviceCode: line.serviceCode,
        includedForAds: donor ? donor.includedForAds !== false : true,
        alwaysChargeable: donor ? Boolean(donor.alwaysChargeable) : true,
        freePerFlight: foc,
        cumulativeMonthlyBasis: donor ? Boolean(donor.cumulativeMonthlyBasis) : false,
        uom,
        remarks: remark ?? '',
        [field]: line.price,
        [other]: otherPrice,
        aircraftTypes: donor && Array.isArray(donor.aircraftTypes) ? [...donor.aircraftTypes] : [],
      };
      if (donor?.freePerFlightNb != null) added.freePerFlightNb = donor.freePerFlightNb;
      if (donor?.freePerFlightWb != null) added.freePerFlightWb = donor.freePerFlightWb;
      if (donor?.category) added.category = donor.category;
      rules.push(added);
      used.add(rules.length - 1);
      log.push(`ADD     ${describe(added)}${donor ? `  (free allowance from "${donor.serviceCode}")` : ''}`);
      continue;
    }

    const settled = exact.find(({ rule }) => positive(rule[field]) === line.price && sameText(rule.uom, uom));
    if (settled) {
      used.add(settled.index);
      log.push(`OK      ${describe(settled.rule)}`);
      continue;
    }

    const chosen =
      pool.find(({ rule }) => ruleSector(rule) === line.sector && hasPrice(rule)) ??
      pool.find(({ rule }) => ruleSector(rule) === line.sector) ??
      pool.find(({ rule }) => hasPrice(rule)) ??
      pool[0];
    const before = describe(chosen.rule);
    const priceChanged = positive(chosen.rule[field]) !== line.price;
    chosen.rule.serviceCode = line.serviceCode;
    chosen.rule.uom = uom;
    chosen.rule[field] = line.price;
    if (priceChanged || otherPrice != null) chosen.rule[other] = otherPrice;
    if (remark) chosen.rule.remarks = remark;
    used.add(chosen.index);
    log.push(`UPDATE  ${before}  ->  ${describe(chosen.rule)}`);

    // WCHR and WCHS are one dropdown item. Blank twins would show as a second, unpriced row.
    if (line.serviceCode === WCHR_S) {
      rules.forEach((rule, index) => {
        if (index === chosen.index || used.has(index) || removed.has(index)) return;
        if (equipmentKey(rule.serviceCode) !== targetKey || hasPrice(rule)) return;
        if (ruleSector(rule) !== ruleSector(chosen.rule)) return;
        removed.add(index);
        const sameFoc =
          (rule.freePerFlight ?? 0) === (chosen.rule.freePerFlight ?? 0) &&
          (rule.freePerFlightNb ?? null) === (chosen.rule.freePerFlightNb ?? null) &&
          (rule.freePerFlightWb ?? null) === (chosen.rule.freePerFlightWb ?? null);
        log.push(`MERGE   ${describe(rule)}  into the row above${sameFoc ? '' : '  (ITS FREE ALLOWANCE DIFFERED)'}`);
      });
    }
  }

  const next = rules.filter((_rule, index) => !removed.has(index));
  const changed = JSON.stringify(next) !== JSON.stringify(original);
  return { next, log, changed };
}

/** Every invoice line must resolve to one priced row with the invoice UOM. */
function verifyContract(contract, contractLines, uomFor) {
  const problems = [];
  const rules = contract.adsEquipmentRules ?? [];
  for (const line of contractLines) {
    const targetKey = equipmentKey(line.serviceCode);
    const priced = rules.filter(
      (rule) =>
        equipmentKey(rule.serviceCode) === targetKey &&
        positive(rule[priceField(line.currency)]) === line.price &&
        sameText(rule.uom, uomFor.get(line)),
    );
    const inSector = priced.filter((rule) => ruleSector(rule) === '' || ruleSector(rule) === line.sector);
    const hits = inSector.length ? inSector : priced;
    if (hits.length !== 1) {
      problems.push(`${contract.contractNumber}: ${line.serviceCode} ${line.currency} ${line.price} ${line.uom} matched ${hits.length} rows`);
    }
  }
  return problems;
}

/* ---------- Main ---------- */

const client = new MongoClient(loadMongoUri());
await client.connect();
const billing = client.db().collection('billing');

if (restoreArg) {
  await restore(billing, restoreArg.slice('--restore='.length).replace(/^"|"$/g, ''));
  await client.close();
  process.exit(0);
}

const now = new Date();
const customerCodes = [...new Set(lines.map((line) => line.customerCode))];
const [customers, contracts, master] = await Promise.all([
  billing
    .find({ docType: 'customer', stationCode: STATION, customerCode: { $in: customerCodes } })
    .project({ customerCode: 1, name: 1, currencyCode: 1 })
    .toArray(),
  billing
    .find({ docType: 'contract', stationCode: STATION, customerCode: { $in: customerCodes } })
    .project({ contractNumber: 1, customerCode: 1, status: 1, adsEquipmentRules: 1 })
    .sort({ customerCode: 1, contractNumber: 1 })
    .toArray(),
  billing.find({ docType: 'equipment_master' }).project({ itemNo: 1, description: 1, uoms: 1 }).toArray(),
]);

const customerByCode = new Map(customers.map((customer) => [customer.customerCode, customer]));
for (const code of customerCodes) {
  if (!customerByCode.has(code)) throw new Error(`${STATION} customer ${code} was not found`);
  if (!contracts.some((contract) => contract.customerCode === code)) throw new Error(`No ${STATION} contract for ${code}`);
}

const uoms = planUoms(master);
const plans = contracts.map((contract) => {
  const contractLines = lines.filter((line) => line.customerCode === contract.customerCode);
  return { contract, contractLines, ...planContract(contract, contractLines, uoms.resolved) };
});

console.log(APPLY ? '=== APPLYING ===' : '=== PLAN ONLY (nothing is written; add --apply to write) ===');
const tally = { OK: 0, UPDATE: 0, ADD: 0, MERGE: 0 };
for (const plan of plans) {
  const customer = customerByCode.get(plan.contract.customerCode);
  const invoiceCurrencies = [...new Set(plan.contractLines.map((line) => line.currency))];
  const currencyNote = invoiceCurrencies.every((currency) => currency === customer.currencyCode)
    ? ''
    : `  [customer bills in ${customer.currencyCode}, invoice is in ${invoiceCurrencies.join('/')}]`;
  console.log(`\n${plan.contract.customerCode} ${customer.name} | ${plan.contract.contractNumber} (${plan.contract.status})${currencyNote}`);
  for (const entry of plan.log) {
    console.log(`  ${entry}`);
    tally[entry.split(' ')[0]] += 1;
  }
}
console.log('\nUnits added to the Equipment Master dropdown:');
for (const { item, pairs } of uoms.additions) {
  console.log(`  ${item.itemNo || '-'} "${item.description}": ${pairs.map((pair) => `${pair.uom} (${pair.abbreviation || 'no abbreviation'})`).join(', ')}`);
}
if (uoms.additions.length === 0) console.log('  none');
console.log(`No Equipment Master row (unit kept as on the invoice): ${uoms.noMasterRow.join(', ') || 'none'}`);
console.log(`\nInvoice lines ${lines.length} | contracts ${plans.length} | already right ${tally.OK} | updated ${tally.UPDATE} | added ${tally.ADD} | blank wheelchair twins merged ${tally.MERGE}`);

// The planned result must satisfy every invoice line before anything is written.
const planProblems = plans.flatMap((plan) =>
  verifyContract({ ...plan.contract, adsEquipmentRules: plan.next }, plan.contractLines, uoms.resolved),
);
if (planProblems.length) {
  console.error(`\nPlan check failed:\n  ${planProblems.join('\n  ')}`);
  await client.close();
  process.exit(1);
}
console.log('Plan check: every invoice line resolves to exactly one priced row.');

if (!APPLY) {
  await client.close();
  process.exit(0);
}

const stamp = now.toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(os.homedir(), 'Downloads', `del-ads-rules-backup-${stamp}.json`);
fs.writeFileSync(
  backupFile,
  BSON.EJSON.stringify(
    {
      takenAt: now,
      contracts: contracts.map(({ _id, contractNumber, customerCode, adsEquipmentRules }) => ({
        _id,
        contractNumber,
        customerCode,
        adsEquipmentRules: adsEquipmentRules ?? [],
      })),
      equipmentMaster: uoms.additions.map(({ item }) => ({ _id: item._id, description: item.description, uoms: item.uoms ?? [] })),
    },
    null,
    1,
    { relaxed: false },
  ),
);
console.log(`\nBackup written: ${backupFile}`);

for (const { item, pairs } of uoms.additions) {
  await billing.updateOne(
    { _id: item._id, docType: 'equipment_master' },
    { $push: { uoms: { $each: pairs } }, $set: { updatedAt: now } },
  );
}
let written = 0;
for (const plan of plans) {
  if (!plan.changed) continue;
  await billing.updateOne(
    { _id: plan.contract._id, docType: 'contract' },
    { $set: { adsEquipmentRules: plan.next, adsBillingEnabled: true, updatedAt: now } },
  );
  written += 1;
}

// Read back and check what is really stored.
const stored = await billing
  .find({ _id: { $in: contracts.map((contract) => contract._id) } })
  .project({ contractNumber: 1, customerCode: 1, adsEquipmentRules: 1 })
  .toArray();
const storedProblems = stored.flatMap((contract) =>
  verifyContract(contract, lines.filter((line) => line.customerCode === contract.customerCode), uoms.resolved),
);
console.log(`Contracts written: ${written}. Equipment Master rows given a unit: ${uoms.additions.length}.`);
if (storedProblems.length) {
  console.error(`Read-back check failed:\n  ${storedProblems.join('\n  ')}`);
  await client.close();
  process.exit(1);
}
console.log('Read-back check: every invoice line is stored with the invoice unit and rate.');
await client.close();
