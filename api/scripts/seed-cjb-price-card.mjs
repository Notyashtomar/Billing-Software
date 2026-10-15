/**
 * Seed the Coimbatore price card workbook into billing for station CJB.
 *
 *   node api/scripts/seed-cjb-price-card.mjs
 *   node api/scripts/seed-cjb-price-card.mjs --dry-run
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, '..');
const require = createRequire(resolve(apiRoot, 'package.json'));
const ExcelJS = require('exceljs');

const parserUrl = pathToFileURL(
  resolve(apiRoot, '../m-billing/server/scripts/lib/price-card-maa-parser.mjs'),
).href;
const saveUrl = pathToFileURL(
  resolve(apiRoot, '../m-billing/server/scripts/lib/save-price-card-to-station.mjs'),
).href;

const { parsePriceCardWorkbook } = await import(parserUrl);
const { savePriceCardContractsToStation } = await import(saveUrl);

const dryRun = process.argv.includes('--dry-run');
const file = resolve(apiRoot, 'data/Price Card Coimbatore.xlsx');
const asOf = new Date('2026-10-15T00:00:00');
const stationCode = 'CJB';

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const parsed = parsePriceCardWorkbook(wb, {
  asOf,
  stationCode,
  includeExtraAds: true,
  collectBhsPackages: true,
});

console.log(`Parsed ${parsed.length} airline sheet(s) for ${stationCode}`);
for (const row of parsed) {
  console.log(
    [
      row.sheetName,
      row.customerCode,
      row.contractNumber,
      row.contractCategory,
      `${row.priceValidFrom}..${row.priceValidTo}`,
      `bhs=${row.bhsPackages?.length ?? 0}`,
      `ads=${row.adsEquipmentRules?.length ?? 0}`,
      row.currency || 'INR',
    ].join(' | '),
  );
}

const saved = await savePriceCardContractsToStation(parsed, {
  stationCode,
  dryRun,
  asOf,
});
console.log(
  `Mongo ${saved.dryRun ? '(dry run) ' : ''}station=${saved.stationCode} customers+${saved.customersCreated} existing=${saved.customersExisting} contracts+${saved.contractsCreated}/upd ${saved.contractsUpdated} bhs=${saved.bhsRows} adsTwins=${saved.adsTwins}`,
);
if (saved.skipped?.length) {
  console.log('Skipped:');
  for (const row of saved.skipped) console.log(`  ${row.sheet}: ${row.reason}`);
}
