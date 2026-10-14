/**
 * Parse Delhi price-card sheet 3S (Aerologic) and upsert contract + BHS/ADS cards for DEL only.
 *
 * Usage (repo root):
 *   node BWMS/modules/m-billing/server/scripts/save-delhi-3s-price-card.mjs
 *   node BWMS/modules/m-billing/server/scripts/save-delhi-3s-price-card.mjs --dry-run
 */
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, '../../../../apps/api');
const require = createRequire(resolve(apiRoot, 'package.json'));
const ExcelJS = require('exceljs');

const { parsePriceCardSheet } = await import('./lib/price-card-maa-parser.mjs');
const { savePriceCardContractsToStation } = await import('./lib/save-price-card-to-station.mjs');

const dryRun = process.argv.includes('--dry-run');
const file = resolve(apiRoot, 'data/Price_card_Delhi_V2.xlsx');
const asOf = new Date('2026-08-15T00:00:00');

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const sheet = wb.getWorksheet('3S');
if (!sheet) {
  console.error('Sheet 3S not found in', file);
  process.exit(1);
}

const parsed = parsePriceCardSheet(sheet, {
  asOf,
  stationCode: 'DEL',
  includeExtraAds: true,
  collectBhsPackages: true,
});

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
if (saved.skipped.length) {
  for (const row of saved.skipped) console.log('skipped', row);
}
