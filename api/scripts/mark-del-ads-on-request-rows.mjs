/**
 * DEL ADS rows whose rate came from a one-off charge on the September 2026
 * invoices (engineering use, a single ad hoc flight). The equipment is part of
 * normal handling, so routine use must not be billed. The rate stays on the
 * contract and the row is marked "Charged on request only".
 *
 * Usage (from api/):
 *   node scripts/mark-del-ads-on-request-rows.mjs            plan only, writes nothing
 *   node scripts/mark-del-ads-on-request-rows.mjs --apply    back up, then write
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient, BSON } = require('mongodb');

const STATION = 'DEL';
const REMARK = 'Charged on request only';
const APPLY = process.argv.includes('--apply');

const STEP_LADDER_NB = 'Pax Step Ladder (remote bay) Motorized - Narrow Body';
const STEP_LADDER_WB = 'Pax Step Ladder (remote bay) Motorized - Wide Body';
const ROWS = {
  AF: ['Marshaller', 'Diesel Tractor'],
  G9: [STEP_LADDER_NB, 'Baggage Freight Loader', 'Ramp Car'],
  KB: ['Ramp Car', STEP_LADDER_NB, 'Head Set', 'Baggage Freight Loader'],
  LX: ['Head Set', 'Marshaller', STEP_LADDER_WB, 'Ramp Car'],
  QP: ['Scheduled - Equipment - EBT'],
};

const client = new MongoClient(loadMongoUri());
await client.connect();
const billing = client.db().collection('billing');
const now = new Date();

const contracts = await billing
  .find({ docType: 'contract', stationCode: STATION, customerCode: { $in: Object.keys(ROWS) } })
  .project({ contractNumber: 1, customerCode: 1, adsEquipmentRules: 1 })
  .sort({ customerCode: 1 })
  .toArray();

console.log(APPLY ? '=== APPLYING ===' : '=== PLAN ONLY (nothing is written; add --apply to write) ===');
const problems = [];
const plans = [];
for (const contract of contracts) {
  const rules = (contract.adsEquipmentRules ?? []).map((rule) => ({ ...rule }));
  let changed = 0;
  for (const serviceCode of ROWS[contract.customerCode]) {
    const hits = rules.filter((rule) => rule.serviceCode === serviceCode);
    if (hits.length !== 1) {
      problems.push(`${contract.contractNumber}: ${serviceCode} matched ${hits.length} rows`);
      continue;
    }
    const rule = hits[0];
    const remark = String(rule.remarks ?? '').trim();
    const price = rule.unitPriceINR ?? rule.unitPriceUSD;
    if (remark === REMARK) {
      console.log(`  OK      ${contract.contractNumber} | ${serviceCode} | ${rule.uom} | ${price}`);
      continue;
    }
    if (remark) {
      problems.push(`${contract.contractNumber}: ${serviceCode} already has the remark "${remark}"`);
      continue;
    }
    rule.remarks = REMARK;
    changed += 1;
    console.log(`  MARK    ${contract.contractNumber} | ${serviceCode} | ${rule.uom} | ${price}`);
  }
  plans.push({ contract, rules, changed });
}
for (const code of Object.keys(ROWS)) {
  if (!contracts.some((contract) => contract.customerCode === code)) problems.push(`No ${STATION} contract for ${code}`);
}
if (problems.length) {
  console.error(`\nNothing written:\n  ${problems.join('\n  ')}`);
  await client.close();
  process.exit(1);
}
console.log(`Rows to mark: ${plans.reduce((sum, plan) => sum + plan.changed, 0)}`);

if (!APPLY) {
  await client.close();
  process.exit(0);
}

const backupFile = path.join(
  os.homedir(),
  'Downloads',
  `del-ads-on-request-backup-${now.toISOString().replace(/[:.]/g, '-')}.json`,
);
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
      equipmentMaster: [],
    },
    null,
    1,
    { relaxed: false },
  ),
);
console.log(`Backup written: ${backupFile}`);

for (const plan of plans) {
  if (!plan.changed) continue;
  await billing.updateOne(
    { _id: plan.contract._id, docType: 'contract' },
    { $set: { adsEquipmentRules: plan.rules, updatedAt: now } },
  );
}
const stored = await billing
  .find({ _id: { $in: contracts.map((contract) => contract._id) } })
  .project({ contractNumber: 1, customerCode: 1, adsEquipmentRules: 1 })
  .toArray();
const missing = stored.flatMap((contract) =>
  ROWS[contract.customerCode]
    .filter(
      (serviceCode) =>
        !(contract.adsEquipmentRules ?? []).some(
          (rule) => rule.serviceCode === serviceCode && rule.remarks === REMARK,
        ),
    )
    .map((serviceCode) => `${contract.contractNumber}: ${serviceCode}`),
);
if (missing.length) {
  console.error(`Read-back check failed:\n  ${missing.join('\n  ')}`);
  await client.close();
  process.exit(1);
}
console.log('Read-back check: every row carries the remark.');
await client.close();
