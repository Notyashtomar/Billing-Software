/**
 * Parse Delhi AFKL (Air France) sheet and upsert BHS/ADS + contract for DEL.
 * Strips "(Flight less than 35)" off aircraft type into remarks; keeps 2026 base
 * rates so existing invoice drafts at 160425 stay stable.
 *
 * Usage (repo root):
 *   node BWMS/modules/m-billing/server/scripts/save-delhi-af-price-card.mjs
 *   node BWMS/modules/m-billing/server/scripts/save-delhi-af-price-card.mjs --dry-run
 */
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, '../../../../apps/api');
const require = createRequire(resolve(apiRoot, 'package.json'));
config({ path: resolve(apiRoot, '.env') });
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');

const { parsePriceCardSheet } = await import('./lib/price-card-maa-parser.mjs');
const { savePriceCardContractsToStation } = await import('./lib/save-price-card-to-station.mjs');

const dryRun = process.argv.includes('--dry-run');
const file = resolve(apiRoot, 'data/Price_card_Delhi_V2.xlsx');
const asOf = new Date('2026-08-15T00:00:00');

const AF_VOLUME_CLAUSES = [
  {
    clauseType: 'custom',
    label: '1.1-vol-A',
    body: 'A330/A350/B777-200/B787 — when monthly handled flights are less than 35, the discounted BHS package from the price-card volume column applies (historical INR 137,800). SGHA rate row from 01 Jan 2026 lists the standard package INR 160,425 when that volume column is blank.',
    appliesTo: ['scheduled'],
  },
  {
    clauseType: 'custom',
    label: '1.1-vol-B',
    body: 'B777-300/B747/B74C — when monthly handled flights are greater than 35, the discounted BHS package from the price-card volume column applies (historical INR 132,500). SGHA rate row from 01 Jan 2026 lists the standard package INR 160,425 when that volume column is blank.',
    appliesTo: ['scheduled'],
  },
];

/** Document-only volume rows (do not override saved package — keeps Aug 2026 AF draft totals). */
function airFranceDelhiVolumeSchedules() {
  const window = {
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-12-31',
    note: 'From AFKL price-card column headers. overridesSavedRate=false so invoice keeps the standard 160,425 package on the 2026 SGHA row until volume columns are re-priced.',
  };
  return [
    {
      chargeKind: 'comprehensive',
      flightScope: 'international',
      carrierKind: 'passenger',
      allocation: 'flat',
      overridesSavedRate: false,
      label: 'A330/A350/B777-200/B787 — flights less than 35',
      ...window,
      bands: [{ fromCount: 1, toCount: 34, unitPriceINR: 137800 }],
    },
    {
      chargeKind: 'comprehensive',
      flightScope: 'international',
      carrierKind: 'passenger',
      allocation: 'flat',
      overridesSavedRate: false,
      label: 'A330/A350/B777-200/B787 — standard (35+)',
      ...window,
      bands: [{ fromCount: 35, toCount: null, unitPriceINR: 160425 }],
    },
    {
      chargeKind: 'comprehensive',
      flightScope: 'international',
      carrierKind: 'passenger',
      allocation: 'flat',
      overridesSavedRate: false,
      label: 'B777-300/B747/B74C — standard (≤35)',
      ...window,
      bands: [{ fromCount: 1, toCount: 35, unitPriceINR: 160425 }],
    },
    {
      chargeKind: 'comprehensive',
      flightScope: 'international',
      carrierKind: 'passenger',
      allocation: 'flat',
      overridesSavedRate: false,
      label: 'B777-300/B747/B74C — flights greater than 35',
      ...window,
      bands: [{ fromCount: 36, toCount: null, unitPriceINR: 132500 }],
    },
  ];
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const sheet =
  wb.getWorksheet('AFKL') ||
  wb.worksheets.find((s) => /Air\s*France|^AFKL$/i.test(s.name));
if (!sheet) {
  console.error('AFKL sheet not found in', file);
  process.exit(1);
}

const parsed = parsePriceCardSheet(sheet, {
  asOf,
  stationCode: 'DEL',
  includeExtraAds: true,
  collectBhsPackages: true,
});

// AF prep flights are International; sheet omits Dom/Int — keep both sectors at same package.
parsed.bhsPackages = (parsed.bhsPackages ?? []).map((pkg) => ({
  ...pkg,
  appliesToBoth: true,
  category: pkg.category === 'Int' ? 'Int' : 'Dom',
}));
parsed.flightCategories = ['Dom', 'Int'];
parsed.contractCategory = 'Both';

// Prefer sheet XXLN / RTR / technical on conditionalCharges.
parsed.conditionalCharges = {
  ...(parsed.conditionalCharges ?? {}),
  returnToRamp: parsed.conditionalCharges?.returnToRamp ?? 25,
  technicalHandlingChargesPercent:
    parsed.conditionalCharges?.technicalHandlingChargesPercent ??
    parsed.conditionalCharges?.technicalHandling ??
    25,
  technicalHandling:
    parsed.conditionalCharges?.technicalHandling ??
    parsed.conditionalCharges?.technicalHandlingChargesPercent ??
    25,
  cancellationWithinHoursPercent:
    parsed.conditionalCharges?.cancellationWithinHoursPercent ?? 25,
};
if (parsed.cancellationWithinHours == null) parsed.cancellationWithinHours = 6;

const existingLabels = new Set((parsed.clauses ?? []).map((c) => String(c.label ?? '')));
for (const clause of AF_VOLUME_CLAUSES) {
  if (!existingLabels.has(clause.label)) parsed.clauses.push(clause);
}

console.log(
  JSON.stringify(
    {
      customerCode: parsed.customerCode,
      contractNumber: parsed.contractNumber,
      category: parsed.contractCategory,
      valid: `${parsed.priceValidFrom}..${parsed.priceValidTo}`,
      bhs: parsed.bhsPackages,
      conditionalCharges: parsed.conditionalCharges,
      cancellationWithinHours: parsed.cancellationWithinHours,
      ads: (parsed.adsEquipmentRules ?? []).length,
      clauses: (parsed.clauses ?? []).length,
    },
    null,
    2,
  ),
);

const saved = await savePriceCardContractsToStation([parsed], {
  stationCode: 'DEL',
  dryRun,
  asOf,
});

console.log(
  `Mongo ${saved.dryRun ? '(dry run) ' : ''}station=${saved.stationCode} customers+${saved.customersCreated}/exist ${saved.customersExisting} contracts+${saved.contractsCreated}/upd ${saved.contractsUpdated} bhs=${saved.bhsRows} adsTwins=${saved.adsTwins} staleOff=${saved.stalePriceCardsDeactivated ?? 0}`,
);

if (!dryRun) {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const billing = mongoose.connection.collection('billing');
    const now = new Date();
    const volume = airFranceDelhiVolumeSchedules();
    const aircraftTypes = [
      ...new Set(
        (parsed.bhsPackages ?? [])
          .map((p) => String(p.aircraftType ?? '').trim())
          .filter((name) => name && !/\(/.test(name)),
      ),
    ];
    await billing.updateOne(
      { docType: 'contract', stationCode: 'DEL', contractNumber: parsed.contractNumber },
      {
        $set: {
          category: 'Both',
          aircraftTypes,
          bhsVolumeSchedules: volume,
          cancellationWithinHours: parsed.cancellationWithinHours,
          conditionalCharges: parsed.conditionalCharges,
          updatedAt: now,
        },
      },
    );
    // Ensure any leftover conditioned aircraftType rows are inactive.
    const stale = await billing.updateMany(
      {
        docType: 'price_card_airline',
        stationCode: 'DEL',
        customerCode: 'AF',
        handlingType: { $in: ['BHS', 'ADS'] },
        active: true,
        aircraftType: { $regex: /flight\s*(s)?\s*(less|greater|more)\s*than/i },
      },
      { $set: { active: false, updatedAt: now } },
    );
    console.log(
      `Contract volume schedules=${volume.length} aircraftTypes=${aircraftTypes.join('|')} staleConditionRowsOff=${stale.modifiedCount ?? 0}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}
