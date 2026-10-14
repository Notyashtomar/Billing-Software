/**
 * Feed Akasa (QP) Delhi comprehensive volume rates onto the active contract.
 *
 * Row 5 of the SGHA workbook (01 Jun 2026–31 May 2027), nearest rupee.
 * Does not write ramp or equipment prices.
 *
 * From BWMS/apps/api:
 *   node scripts/apply-akasa-del-bhs-volume.mjs
 *   node scripts/apply-akasa-del-bhs-volume.mjs --dry-run
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const NOTE =
  'SGHA paragraph 1.1, price row effective 01 Jun 2026–31 May 2027 (4.5% escalation), rounded to the nearest rupee. Stepwise: each flight takes the band of its position in the month.';
const WINDOW = { effectiveFrom: '2026-06-01', effectiveTo: '2027-05-31', note: NOTE };

const SCHEDULES = [
  {
    chargeKind: 'comprehensive',
    flightScope: 'domestic_t1',
    carrierKind: 'any',
    allocation: 'marginal',
    overridesSavedRate: true,
    label: 'Domestic T1 comprehensive',
    ...WINDOW,
    bands: [
      { fromCount: 1, toCount: 500, unitPriceINR: 25603 },
      { fromCount: 501, toCount: 600, unitPriceINR: 24834 },
      { fromCount: 601, toCount: null, unitPriceINR: 24322 },
    ],
  },
  {
    chargeKind: 'comprehensive',
    flightScope: 'domestic_t2',
    carrierKind: 'any',
    allocation: 'marginal',
    overridesSavedRate: true,
    label: 'Domestic T2 comprehensive',
    ...WINDOW,
    bands: [
      { fromCount: 1, toCount: 400, unitPriceINR: 20545 },
      { fromCount: 401, toCount: 500, unitPriceINR: 18455 },
      { fromCount: 501, toCount: null, unitPriceINR: 16365 },
    ],
  },
  {
    chargeKind: 'comprehensive',
    flightScope: 'international',
    carrierKind: 'any',
    allocation: 'marginal',
    overridesSavedRate: true,
    label: 'International comprehensive',
    ...WINDOW,
    bands: [
      { fromCount: 1, toCount: 150, unitPriceINR: 24140 },
      { fromCount: 151, toCount: 250, unitPriceINR: 23415 },
      { fromCount: 251, toCount: null, unitPriceINR: 22933 },
    ],
  },
  {
    chargeKind: 'comprehensive',
    flightScope: 'charter_domestic',
    carrierKind: 'any',
    allocation: 'flat',
    overridesSavedRate: true,
    label: 'Charter domestic comprehensive',
    ...WINDOW,
    bands: [{ fromCount: 1, toCount: null, unitPriceINR: 27693 }],
  },
  {
    chargeKind: 'comprehensive',
    flightScope: 'charter_international',
    carrierKind: 'any',
    allocation: 'flat',
    overridesSavedRate: true,
    label: 'Charter international comprehensive',
    ...WINDOW,
    bands: [{ fromCount: 1, toCount: null, unitPriceINR: 40639 }],
  },
];

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGO_URI missing');
  process.exit(1);
}

await mongoose.connect(uri);
const col = mongoose.connection.collection('billing');
const docs = await col
  .find({ docType: 'contract', customerCode: 'QP' })
  .project({ contractNumber: 1, stationCode: 1, status: 1, customerCode: 1 })
  .toArray();

console.log(
  'QP contracts:',
  docs.map((doc) => ({
    id: String(doc._id),
    contractNumber: doc.contractNumber,
    stationCode: doc.stationCode,
    status: doc.status,
  })),
);

const targets = docs.filter((doc) => {
  const station = String(doc.stationCode ?? '').trim().toUpperCase();
  return station === 'DEL' || station === 'DELHI' || station.startsWith('DEL');
});

if (targets.length === 0) {
  console.error('No QP contract on a Delhi station code. Nothing written.');
  await mongoose.disconnect();
  process.exit(1);
}

for (const doc of targets) {
  console.log(
    `${DRY_RUN ? 'dry-run' : 'update'} ${doc.contractNumber} station=${doc.stationCode} status=${doc.status}`,
  );
  if (DRY_RUN) continue;
  await col.updateOne(
    { _id: doc._id },
    {
      $set: {
        bhsVolumeSchedules: SCHEDULES,
        'conditionalCharges.ronAdditionalPercent': 15,
        'conditionalCharges.splitIntArrivalDomDeparturePercent': 20,
        'conditionalCharges.splitDomArrivalIntDeparturePercent': 25,
      },
    },
  );
}

await mongoose.disconnect();
console.log(DRY_RUN ? 'Dry run only.' : `Updated ${targets.length} contract(s).`);
