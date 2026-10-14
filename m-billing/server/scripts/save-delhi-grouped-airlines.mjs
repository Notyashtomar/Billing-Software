/**
 * Upsert Delhi price cards + contracts for AY, VJ, XJ, VS, C6 (CEN), AF (AFKL).
 * SL has no sheet in Price_card_Delhi_V2.xlsx — skipped.
 *
 * Preserves active invoice package rates (Aug 2026 drafts):
 *   AY 254565 | VJ 1608 | XJ 1925 | VS 151541 | C6 1361 + 2150 | AF 160425
 *
 * Usage (repo root):
 *   node BWMS/modules/m-billing/server/scripts/save-delhi-grouped-airlines.mjs
 *   node BWMS/modules/m-billing/server/scripts/save-delhi-grouped-airlines.mjs --dry-run
 *   node .../save-delhi-grouped-airlines.mjs --only AY,VJ,AF
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
const { stripBhsAircraftCondition } = await import('./lib/bhs-aircraft-row.mjs');

const dryRun = process.argv.includes('--dry-run');
const onlyArg = process.argv.find((a, i) => process.argv[i - 1] === '--only');
const ONLY = onlyArg
  ? new Set(
      onlyArg
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    )
  : null;

const file = resolve(apiRoot, 'data/Price_card_Delhi_V2.xlsx');
const asOf = new Date('2026-08-15T00:00:00');

/** Sheet name → customer code (CEN → C6, AFKL → AF). */
const AIRLINES = [
  { sheet: 'AY', code: 'AY' },
  { sheet: 'VJ', code: 'VJ' },
  { sheet: 'XJ', code: 'XJ' },
  { sheet: 'VS', code: 'VS' },
  { sheet: 'CEN', code: 'C6' },
  { sheet: 'AFKL', code: 'AF' },
];

/** Prefer these package prices when collapsing volume duplicates (match Aug drafts). */
const PREFERRED_PACKAGE_PRICE = {
  VJ: { A320: 1608, A330: 3282 },
  C6: { 'A320/B737-800': 1361, A330: 2150 },
  AF: {
    'A330/A350/B777-200/B787': 160425,
    'B777-300/B747/B74C': 160425,
  },
};

function baseAircraftKey(aircraftType) {
  const stripped = stripBhsAircraftCondition(aircraftType).label;
  return String(stripped || aircraftType)
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function cleanAircraftType(aircraftType) {
  const stripped = stripBhsAircraftCondition(aircraftType);
  return (stripped.label || aircraftType).replace(/\s+/g, ' ').trim();
}

/**
 * When several packages share one base airframe (weekly/volume bands), keep one
 * card price that matches the live invoice and document the rest on contract.
 */
function collapseVolumeDuplicates(packages, customerCode) {
  const preferred = PREFERRED_PACKAGE_PRICE[customerCode] ?? {};
  const groups = new Map();
  for (const pkg of packages ?? []) {
    const key = baseAircraftKey(pkg.aircraftType);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(pkg);
    groups.set(key, list);
  }
  const out = [];
  const volumeNotes = [];
  for (const [key, list] of groups) {
    if (list.length > 1) {
      for (const pkg of list) {
        volumeNotes.push({
          aircraftType: cleanAircraftType(pkg.aircraftType),
          price: pkg.price,
          remarks: pkg.remarks || pkg.aircraftType,
        });
      }
    }
    let chosen =
      preferred[key] != null
        ? list.find((p) => Math.abs(Number(p.price) - preferred[key]) < 0.02)
        : null;
    if (!chosen) chosen = list[0];
    const cleanType = cleanAircraftType(chosen.aircraftType);
    const remarkBits = list
      .map((p) => String(p.remarks || p.aircraftType || '').trim())
      .filter(Boolean);
    out.push({
      ...chosen,
      aircraftType: cleanType,
      remarks: [...new Set(remarkBits)].join(' | ').slice(0, 240),
    });
  }
  return { packages: out, volumeNotes };
}

function volumeSchedulesFromNotes(notes, validFrom, validTo, customerCode) {
  if (!notes.length) return [];
  const window = {
    effectiveFrom: String(validFrom ?? '').slice(0, 10),
    effectiveTo: String(validTo ?? '').slice(0, 10),
    note: `${customerCode}: volume/weekly bands from price-card columns. overridesSavedRate=false — invoice keeps the saved package rate.`,
  };
  // One flat document schedule per distinct price+label (not applied).
  return notes.map((n, index) => ({
    chargeKind: 'comprehensive',
    flightScope: 'international',
    carrierKind: 'passenger',
    allocation: 'flat',
    overridesSavedRate: false,
    label: `${n.aircraftType} — ${String(n.remarks ?? '').slice(0, 80)}`,
    ...window,
    bands: [{ fromCount: index + 1, toCount: index + 1, unitPriceINR: Number(n.price) }],
  }));
}

function prepareParsed(parsed) {
  // International ops common for these DEL carriers; sheet often omits Dom/Int.
  parsed.bhsPackages = (parsed.bhsPackages ?? []).map((pkg) => ({
    ...pkg,
    appliesToBoth: true,
  }));
  parsed.flightCategories = ['Dom', 'Int'];
  parsed.contractCategory = 'Both';

  const collapsed = collapseVolumeDuplicates(parsed.bhsPackages, parsed.customerCode);
  parsed.bhsPackages = collapsed.packages;
  parsed._volumeNotes = collapsed.volumeNotes;

  // Normalize conditional charge keys used by invoice engine.
  const cc = { ...(parsed.conditionalCharges ?? {}) };
  if (cc.technicalHandling != null && cc.technicalHandlingChargesPercent == null) {
    cc.technicalHandlingChargesPercent = cc.technicalHandling;
  }
  parsed.conditionalCharges = cc;
  return parsed;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);

const toSave = [];
const skipped = [];

for (const row of AIRLINES) {
  if (ONLY && !ONLY.has(row.code) && !ONLY.has(row.sheet)) continue;
  const sheet = wb.getWorksheet(row.sheet);
  if (!sheet) {
    skipped.push({ code: row.code, reason: `sheet ${row.sheet} missing` });
    continue;
  }
  const parsed = parsePriceCardSheet(sheet, {
    asOf,
    stationCode: 'DEL',
    includeExtraAds: true,
    collectBhsPackages: true,
  });
  if (!parsed) {
    skipped.push({ code: row.code, reason: 'parse returned null' });
    continue;
  }
  prepareParsed(parsed);
  if (!(parsed.bhsPackages ?? []).length) {
    skipped.push({ code: row.code, reason: 'no BHS packages for as-of date' });
    continue;
  }
  toSave.push(parsed);
  console.log(
    `\n${parsed.customerCode} ${parsed.contractNumber} ${parsed.priceValidFrom}..${parsed.priceValidTo} currency=${parsed.currency}`,
  );
  for (const pkg of parsed.bhsPackages) {
    console.log(`  BHS ${pkg.category}${pkg.appliesToBoth ? '+both' : ''} ${pkg.aircraftType} = ${pkg.price}`);
  }
}

if (!ONLY || ONLY.has('SL')) {
  skipped.push({
    code: 'SL',
    reason: 'no SL sheet in Price_card_Delhi_V2.xlsx (not in workbook)',
  });
}

if (toSave.length === 0) {
  console.error('Nothing to save.');
  for (const s of skipped) console.error(' skip', s.code, s.reason);
  process.exit(1);
}

const saved = await savePriceCardContractsToStation(toSave, {
  stationCode: 'DEL',
  dryRun,
  asOf,
});
console.log(
  `\nMongo ${saved.dryRun ? '(dry run) ' : ''}bhs=${saved.bhsRows} staleOff=${saved.stalePriceCardsDeactivated ?? 0} contracts upd=${saved.contractsUpdated}`,
);

if (!dryRun) {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const billing = mongoose.connection.collection('billing');
    const now = new Date();
    for (const parsed of toSave) {
      const aircraftTypes = [
        ...new Set(
          (parsed.bhsPackages ?? [])
            .map((p) => String(p.aircraftType ?? '').trim())
            .filter(Boolean),
        ),
      ];
      const volume = volumeSchedulesFromNotes(
        parsed._volumeNotes ?? [],
        parsed.priceValidFrom,
        parsed.priceValidTo,
        parsed.customerCode,
      );
      await billing.updateOne(
        { docType: 'contract', stationCode: 'DEL', contractNumber: parsed.contractNumber },
        {
          $set: {
            category: 'Both',
            aircraftTypes,
            ...(volume.length ? { bhsVolumeSchedules: volume } : {}),
            cancellationWithinHours: parsed.cancellationWithinHours,
            conditionalCharges: parsed.conditionalCharges ?? {},
            updatedAt: now,
          },
        },
      );
      // Deactivate conditioned / load-control leftovers for this customer.
      await billing.updateMany(
        {
          docType: 'price_card_airline',
          stationCode: 'DEL',
          customerCode: parsed.customerCode,
          handlingType: { $in: ['BHS', 'ADS'] },
          active: true,
          $or: [
            { aircraftType: { $regex: /flight\s*(s)?\s*(less|greater|more)\s*than|\[\s*\d+\s*[-–]|load\s*control/i } },
            { remarks: { $regex: /^load\s*control$/i } },
          ],
        },
        { $set: { active: false, updatedAt: now } },
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (skipped.length) {
  console.log('\nSkipped:');
  for (const s of skipped) console.log(`  ${s.code}: ${s.reason}`);
}
