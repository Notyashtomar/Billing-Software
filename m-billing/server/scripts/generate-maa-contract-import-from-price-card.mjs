/**
 * Generate billing contract import workbook(s) from Chennai MAA ADS price card.
 *
 * Reads `price_card_chennai_maa-july.xlsx` (or --input path) and emits:
 *   - MAA-all-airlines-contract-import-<asOf>.xlsx  (single import for all airlines)
 *   - optional per-airline files under contracts/generated/
 *
 * Usage (from repo root or BWMS/apps/api):
 *   node BWMS/modules/m-billing/server/scripts/generate-maa-contract-import-from-price-card.mjs
 *   node .../generate-maa-contract-import-from-price-card.mjs --input "C:/path/price_card.xlsx"
 *   node .../generate-maa-contract-import-from-price-card.mjs --as-of 2026-08-15
 *   node .../generate-maa-contract-import-from-price-card.mjs --per-airline
 */
import ExcelJS from 'exceljs';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePriceCardWorkbook, collectCatalogItemsFromWorkbook } from './lib/price-card-maa-parser.mjs';
import { seedCatalogFromPriceCardItems } from './lib/seed-catalog-from-price-card.mjs';
import { savePriceCardContractsToStation } from './lib/save-price-card-to-station.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets', 'contracts');
const GENERATED_DIR = join(ASSETS_DIR, 'generated');

const DEFAULT_INPUT = resolve(
  process.env.USERPROFILE ?? process.env.HOME ?? '',
  'Desktop/Billing/ADS/price_card_chennai_maa-july.xlsx',
);

const CONTRACT_HEADERS = [
  'Contract Number',
  'Customer Code',
  'Category',
  'Aircraft Types',
  'Price Valid From',
  'Price Valid To',
  'Cancellation Within Hours',
  'Diverted Dom %',
  'Diverted Int %',
  'Return To Ramp %',
  'Cancel Window %',
  'Technical Handling %',
  'Standby %',
  'Status',
  'ADS Billing Enabled',
];

const ADS_HEADERS = [
  'Contract Number',
  'Service Code',
  'Included For ADS',
  'Free Per Flight',
  'Free Per Flight NB',
  'Free Per Flight WB',
  'Always Chargeable',
  'UOM',
  'Unit Price INR',
  'Unit Price USD',
  'Aircraft Types',
  'Effective Month',
  'Category',
  'Remarks',
];

const CLAUSE_HEADERS = ['Contract Number', 'Clause Type', 'Label', 'Body', 'Applies To'];

/** File name hint so a Cochin workbook cannot be saved onto Delhi or Chennai. */
function stationHintFromWorkbookPath(filePath) {
  const base = basename(String(filePath ?? '')).toLowerCase();
  const rules = [
    [/cochin|\bcok\b/, 'COK'],
    [/delhi|\bdel\b/, 'DEL'],
    [/chennai|\bmaa\b/, 'MAA'],
    [/hyderabad|\bhyd\b/, 'HYD'],
    [/chandigarh|\bixc\b/, 'IXC'],
  ];
  const hits = rules.filter(([pattern]) => pattern.test(base)).map(([, code]) => code);
  return hits.length === 1 ? hits[0] : null;
}

function assertSaveStationMatchesWorkbook(filePath, stationCode) {
  const hint = stationHintFromWorkbookPath(filePath);
  const station = String(stationCode ?? '').trim().toUpperCase();
  if (!station || station === '*') {
    throw new Error('Refusing to save: pass one station with --station (not *).');
  }
  if (hint && hint !== station) {
    throw new Error(
      `Refusing to save ${basename(filePath)} onto ${station}. Workbook name is ${hint}. Pass --station ${hint}.`,
    );
  }
}

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    asOf: '2026-08-15',
    perAirline: false,
    outDir: ASSETS_DIR,
    exclude: [],
    seedCatalog: false,
    catalogOnly: false,
    dryRun: false,
    station: 'MAA',
    save: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' && argv[i + 1]) args.input = resolve(argv[++i]);
    else if (a === '--as-of' && argv[i + 1]) args.asOf = argv[++i];
    else if (a === '--per-airline') args.perAirline = true;
    else if (a === '--out-dir' && argv[i + 1]) args.outDir = resolve(argv[++i]);
    else if (a === '--exclude' && argv[i + 1]) {
      args.exclude.push(String(argv[++i]).trim().toUpperCase());
    } else if (a === '--station' && argv[i + 1]) args.station = String(argv[++i]).trim().toUpperCase();
    else if (a === '--save') args.save = true;
    else if (a === '--seed-catalog') args.seedCatalog = true;
    else if (a === '--catalog-only') {
      args.catalogOnly = true;
      args.seedCatalog = true;
    } else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help') args.help = true;
  }
  return args;
}

function yesNo(v) {
  return v ? 'yes' : 'no';
}

function contractRow(parsed) {
  const cc = parsed.conditionalCharges ?? {};
  return [
    parsed.contractNumber,
    parsed.customerCode,
    parsed.contractCategory ?? 'Both',
    (parsed.aircraftTypes ?? []).join(', '),
    parsed.priceValidFrom,
    parsed.priceValidTo,
    parsed.cancellationWithinHours ?? '',
    cc.divertedDom ?? '',
    cc.divertedInt ?? '',
    cc.returnToRamp ?? '',
    cc.cancellationWithinHoursPercent ?? '',
    cc.technicalHandlingChargesPercent ?? cc.technicalHandling ?? '',
    cc.standby ?? '',
    'active',
    yesNo(parsed.adsBillingEnabled),
  ];
}

function adsRow(contractNumber, rule) {
  return [
    contractNumber,
    rule.serviceCode,
    yesNo(rule.includedForAds !== false),
    rule.freePerFlight ?? 0,
    rule.freePerFlightNb ?? '',
    rule.freePerFlightWb ?? '',
    yesNo(rule.alwaysChargeable),
    rule.uom ?? 'Per service',
    rule.unitPriceINR ?? '',
    rule.unitPriceUSD ?? '',
    (rule.aircraftTypes ?? []).join(', '),
    '',
    rule.category ?? '',
    rule.remarks ?? '',
  ];
}

function clauseRow(contractNumber, clause) {
  return [
    contractNumber,
    clause.clauseType,
    clause.label ?? '',
    clause.body,
    clause.appliesTo ?? 'all',
  ];
}

function applySheetLayout(workbook) {
  const contractsSheet = workbook.getWorksheet('Contracts');
  const adsSheet = workbook.getWorksheet('ADS Rules');
  const clausesSheet = workbook.getWorksheet('Clauses');
  if (contractsSheet) {
    contractsSheet.columns = [
      { width: 22 },
      { width: 14 },
      { width: 10 },
      { width: 32 },
      { width: 16 },
      { width: 16 },
      { width: 18 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 18 },
      { width: 12 },
      { width: 12 },
      { width: 10 },
      { width: 16 },
    ];
  }
  if (adsSheet) {
    adsSheet.columns = [
      { width: 22 },
      { width: 16 },
      { width: 16 },
      { width: 14 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 28 },
      { width: 14 },
      { width: 12 },
      { width: 48 },
    ];
  }
  if (clausesSheet) {
    clausesSheet.columns = [
      { width: 22 },
      { width: 18 },
      { width: 24 },
      { width: 56 },
      { width: 20 },
    ];
  }
}

function buildImportWorkbook(parsedAirlines) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FRIS Billing';
  workbook.created = new Date();

  const contractsSheet = workbook.addWorksheet('Contracts');
  contractsSheet.addRow(CONTRACT_HEADERS);
  contractsSheet.getRow(1).font = { bold: true };

  const adsSheet = workbook.addWorksheet('ADS Rules');
  adsSheet.addRow(ADS_HEADERS);
  adsSheet.getRow(1).font = { bold: true };

  const clausesSheet = workbook.addWorksheet('Clauses');
  clausesSheet.addRow(CLAUSE_HEADERS);
  clausesSheet.getRow(1).font = { bold: true };

  for (const parsed of parsedAirlines) {
    contractsSheet.addRow(contractRow(parsed));
    for (const rule of parsed.adsEquipmentRules ?? []) {
      adsSheet.addRow(adsRow(parsed.contractNumber, rule));
    }
    for (const clause of parsed.clauses ?? []) {
      clausesSheet.addRow(clauseRow(parsed.contractNumber, clause));
    }
  }

  applySheetLayout(workbook);
  return workbook;
}

async function writeWorkbook(workbook, filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  await workbook.xlsx.writeFile(filePath);
}

function slugify(name) {
  return String(name ?? 'airline')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node generate-maa-contract-import-from-price-card.mjs [options]

Options:
  --input <path>     Price card workbook (default: Desktop/Billing/ADS/price_card_chennai_maa-july.xlsx)
  --as-of <YYYY-MM-DD>  Pick rate band valid on this date (default: 2026-08-15)
  --per-airline      Also write one import file per airline under generated/
  --out-dir <path>   Output directory (default: assets/contracts)
  --exclude <code>   Skip airline sheet/customer code (repeatable, e.g. --exclude IX)
  --station <IATA>   Station for contract numbers / --save (default: MAA)
  --save             Upsert contracts + BHS price-card rows for --station only
  --seed-catalog     Insert missing equipment/manpower/services into service catalog (--station only when set)
  --catalog-only     Seed catalog only (skip writing contract import workbook)
  --dry-run          With --seed-catalog or --save, print planned writes without Mongo
`);
    process.exit(0);
  }

  if (!existsSync(args.input)) {
    console.error(`Input not found: ${args.input}`);
    process.exit(1);
  }

  const asOf = new Date(`${args.asOf}T00:00:00`);
  if (Number.isNaN(asOf.getTime())) {
    console.error(`Invalid --as-of date: ${args.asOf}`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(args.input);

  if (args.seedCatalog || args.save) {
    assertSaveStationMatchesWorkbook(args.input, args.station);
  }

  if (args.seedCatalog) {
    const catalogItems = collectCatalogItemsFromWorkbook(wb);
    console.log(`Catalog collect: ${catalogItems.length} unique extra items from ${wb.worksheets.length} sheets`);
    const result = await seedCatalogFromPriceCardItems(catalogItems, {
      dryRun: args.dryRun,
      sourceWorkbook: args.input,
      stationCodes: args.station ? [args.station] : undefined,
    });
    console.log(
      `Catalog seed${result.dryRun ? ' (dry run)' : ''}: new=${result.newItems} stations=${result.stations} catalogWrites=${result.catalogWrites ?? result.catalogInserted} rafWrites=${result.rafWrites ?? result.rafInserted}`,
    );
    for (const row of result.preview) {
      console.log(
        `  [${row.kind}] ${row.code.padEnd(22)} uom=${String(row.uom).padEnd(16)} ${row.description.slice(0, 48)}`,
      );
    }
    if (args.catalogOnly) {
      process.exit(0);
    }
    console.log('');
  }

  const parsedAll = parsePriceCardWorkbook(wb, {
    asOf,
    stationCode: args.station,
    includeExtraAds: args.save || args.station !== 'MAA',
    collectBhsPackages: args.save || args.station !== 'MAA',
  });
  const exclude = new Set(args.exclude.map((c) => c.toUpperCase()));
  const parsed = parsedAll.filter(
    (p) =>
      !exclude.has(p.customerCode.toUpperCase()) &&
      !exclude.has(p.sheetName.toUpperCase()) &&
      !exclude.has(p.contractNumber.toUpperCase()),
  );

  if (parsed.length === 0) {
    console.error('No airline sheets parsed (after --exclude filter).');
    process.exit(1);
  }

  if (exclude.size > 0) {
    console.log(`Excluded: ${[...exclude].join(', ')} (${parsedAll.length - parsed.length} skipped)`);
  }

  mkdirSync(args.outDir, { recursive: true });
  mkdirSync(GENERATED_DIR, { recursive: true });

  const stamp = args.asOf.replace(/-/g, '');
  const combinedPath = join(
    args.outDir,
    `${args.station}-all-airlines-contract-import-${stamp}.xlsx`,
  );
  const combinedWb = buildImportWorkbook(parsed);
  await writeWorkbook(combinedWb, combinedPath);

  console.log(`Wrote ${combinedPath}`);
  console.log(`  Station: ${args.station}`);
  console.log(`  Airlines: ${parsed.length}`);
  console.log(
    `  Contracts: ${parsed.length} | ADS rules: ${parsed.reduce((n, p) => n + p.adsEquipmentRules.length, 0)} | BHS packages: ${parsed.reduce((n, p) => n + (p.bhsPackages?.length ?? 0), 0)} | Clauses: ${parsed.reduce((n, p) => n + p.clauses.length, 0)}`,
  );
  console.log(`  Rate as-of: ${args.asOf}`);
  console.log('');

  for (const p of parsed.sort((a, b) => a.contractNumber.localeCompare(b.contractNumber))) {
    const cats = (p.flightCategories ?? []).join('+') || p.contractCategory;
    const name = String(p.airlineName || p.customerCode || '').slice(0, 24);
    console.log(
      `  ${p.contractNumber.padEnd(18)} ${name.padEnd(24)} cat=${String(p.contractCategory).padEnd(5)} rules=${String(p.adsEquipmentRules.length).padStart(3)} bhs=${String(p.bhsPackages?.length ?? 0).padStart(2)} valid=${p.priceValidFrom}..${p.priceValidTo} [${cats}]`,
    );
  }

  if (args.perAirline) {
    console.log('\nPer-airline files:');
    for (const p of parsed) {
      const file = join(
        GENERATED_DIR,
        `${p.contractNumber}-${slugify(p.airlineName || p.customerCode)}-import-${stamp}.xlsx`,
      );
      await writeWorkbook(buildImportWorkbook([p]), file);
      console.log(`  ${file}`);
    }
  }

  if (args.save) {
    const saved = await savePriceCardContractsToStation(parsed, {
      stationCode: args.station,
      dryRun: args.dryRun,
      asOf,
    });
    console.log('');
    console.log(
      `Mongo ${saved.dryRun ? '(dry run) ' : ''}station=${saved.stationCode} customers+${saved.customersCreated} contracts+${saved.contractsCreated}/upd ${saved.contractsUpdated} bhs=${saved.bhsRows} adsTwins=${saved.adsTwins} staleOff=${saved.stalePriceCardsDeactivated ?? 0}`,
    );
    if (saved.skipped.length) {
      console.log('Skipped sheets:');
      for (const row of saved.skipped) console.log(`  ${row.sheet}: ${row.reason}`);
    }
  } else {
    console.log('\nImport: Billing → Contracts → Import Excel → upload combined workbook.');
    console.log('Or re-run with --save --station HYD to write contracts for that station only.');
  }
  console.log('Note: BHS turnaround prices are stored on Price Card airline rows for --save.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
