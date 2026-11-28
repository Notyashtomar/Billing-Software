#!/usr/bin/env node
/**
 * Chargeable Equipments list — ADS equipment rules of every airline contract,
 * one sheet per station, airlines A to Z. Read-only: nothing is written to the database.
 *
 * Usage (from the api folder):
 *   node scripts/export-ads-chargeable-equipment-list.cjs
 *   node scripts/export-ads-chargeable-equipment-list.cjs --out="C:\path\file.xlsx"
 *   node scripts/export-ads-chargeable-equipment-list.cjs --exclude=DEL,AGR
 *
 * Env (api/.env): MONGO_URI
 */
const fs = require('fs');
const os = require('os');
const path = require('path'); 
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '..');

// Same equipment full names the ADS contract screen shows.
require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  compilerOptions: { module: 'commonjs', moduleResolution: 'node', target: 'es2020', esModuleInterop: true },
});
const { adsCatalogServiceDisplayName, stripCatalogServicePrefix } = require(
  path.join(repoRoot, 'm-platform/client/lib/billing-shared/service-catalog-labels.ts'),
);

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const excluded = new Set(
  (arg('exclude') ?? 'DEL').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
);
const outPath = path.resolve(
  arg('out') ??
    path.join(os.homedir(), 'Downloads', 'Chargeable Equipments list - ADS (all stations except Delhi).xlsx'),
);

function loadEnv() {
  const env = { ...process.env };
  const file = path.join(apiRoot, '.env');
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in env)) env[key] = value;
  }
  return env;
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/* ---------- Unit of measurement, written in full ---------- */

const UOM_FULL_FORMS = new Map(
  Object.entries({
    ea: 'Each',
    min: 'Per Minute',
    hr: 'Per Hour',
    flight: 'Per Flight',
    trip: 'Per Trip',
    uld: 'Per Unit Load Device',
    'per uld': 'Per Unit Load Device',
    'per uld per month': 'Per Unit Load Device Per Month',
    'per uld per day': 'Per Unit Load Device Per Day',
    'per kg': 'Per Kilogram',
    'per 10 kg': 'Per 10 Kilograms',
    'per 30 min': 'Per 30 Minutes',
    'per push/tow': 'Per Push / Tow',
    'per valet/shift': 'Per Valet Per Shift',
    'per personnel/hr': 'Per Personnel Per Hour',
    'per avi': 'Per Live Animal Shipment',
  }),
);

function uomFullForm(raw) {
  const value = clean(raw);
  if (!value) return '';
  const known = UOM_FULL_FORMS.get(value.toLowerCase());
  if (known) return known;
  return value
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ')
    .replace(/-(\w)/g, (_m, ch) => `-${ch.toUpperCase()}`);
}

/* ---------- Price with currency symbol ---------- */

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// INR in whole rupees, USD with two decimals (same rule as the invoices).
const formatInr = (n) =>
  `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(Math.round(n * 100) / 100))}`;
const formatUsd = (n) =>
  `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

function priceText(rule) {
  const inr = positive(rule.unitPriceINR);
  const usd = positive(rule.unitPriceUSD);
  const parts = [];
  if (inr != null) parts.push(formatInr(inr));
  if (usd != null) parts.push(formatUsd(usd));
  if (parts.length) return parts.join(' / ');
  return rule.includedForAds === false ? 'Not charged' : 'Rate not set';
}

/* ---------- FOC ---------- */

function focValue(rule) {
  if (rule.includedForAds === false) return 'Included in handling (not charged)';
  if (rule.alwaysChargeable) return 0;
  const base = Number(rule.freePerFlight ?? 0) || 0;
  const nb = rule.freePerFlightNb == null ? null : Number(rule.freePerFlightNb);
  const wb = rule.freePerFlightWb == null ? null : Number(rule.freePerFlightWb);
  const suffix = rule.cumulativeMonthlyBasis ? ' per flight (cumulative monthly)' : '';
  if (nb != null && wb != null && nb !== wb) return `Narrow Body ${nb} / Wide Body ${wb}${suffix}`;
  return suffix ? `${base}${suffix}` : base;
}

/* ---------- Where a rate applies ---------- */

const SECTOR_LABEL = { dom: 'Domestic', int: 'International' };
const AIRCRAFT_PATTERN = /^(A|B|ATR|Q|E|ERJ|CRJ|MD|IL|AN|DHC|C|F|L|G)\s?-?\d/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ym;
}

function applicability(rules) {
  const sectors = new Set();
  const aircraft = new Set();
  const months = new Set();
  for (const rule of rules) {
    const sector = clean(rule.category).toLowerCase();
    if (sector === 'both') {
      sectors.add('Domestic');
      sectors.add('International');
    } else if (SECTOR_LABEL[sector]) sectors.add(SECTOR_LABEL[sector]);
    for (const type of [rule.aircraftType, ...(Array.isArray(rule.aircraftTypes) ? rule.aircraftTypes : [])]) {
      const value = clean(type).toUpperCase();
      if (value && AIRCRAFT_PATTERN.test(value)) aircraft.add(value);
    }
    const month = clean(rule.effectiveMonth);
    if (/^\d{4}-\d{2}$/.test(month)) months.add(month);
  }
  const parts = [];
  if (sectors.size) parts.push([...sectors].sort().join(' & '));
  if (aircraft.size) parts.push([...aircraft].sort(collator.compare).join(', '));
  if (months.size) {
    const sorted = [...months].sort();
    parts.push(
      sorted.length === 1
        ? `Effective ${monthLabel(sorted[0])}`
        : `Effective ${monthLabel(sorted[0])} to ${monthLabel(sorted[sorted.length - 1])}`,
    );
  }
  return parts.join(' | ');
}

/* ---------- Main ---------- */

async function main() {
  const env = loadEnv();
  if (!env.MONGO_URI) throw new Error('MONGO_URI is missing in api/.env');
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  const db = mongoose.connection.db;
  const billing = db.collection('billing');

  const [contracts, customers, priceCardAirlines, advanceAirlines, stations, equipmentMaster] = await Promise.all([
    billing
      .find(
        { docType: 'contract' },
        { projection: { contractNumber: 1, customerCode: 1, stationCode: 1, status: 1, adsEquipmentRules: 1 } },
      )
      .toArray(),
    billing
      .find({ docType: 'customer' }, { projection: { stationCode: 1, customerCode: 1, name: 1 } })
      .toArray(),
    billing
      .aggregate([
        { $match: { docType: 'price_card_airline', airlineName: { $nin: [null, ''] } } },
        { $group: { _id: { station: '$stationCode', code: '$customerCode' }, name: { $first: '$airlineName' } } },
      ])
      .toArray(),
    db.collection('advance-airline').find({}, { projection: { code: 1, name: 1, stationCode: 1 } }).toArray(),
    db.collection('admin-stations').find({}, { projection: { stationCode: 1, code: 1, city: 1, name: 1 } }).toArray(),
    billing.find({ docType: 'equipment_master' }, { projection: { itemNo: 1, description: 1 } }).toArray(),
  ]);

  // Airline name: this station's customer first, then the same code elsewhere.
  const nameAtStation = new Map();
  const nameAnywhere = new Map();
  const remember = (station, code, name) => {
    const c = clean(code).toUpperCase();
    const n = clean(name);
    if (!c || !n) return;
    const key = `${clean(station).toUpperCase()}|${c}`;
    if (!nameAtStation.has(key)) nameAtStation.set(key, n);
    if (!nameAnywhere.has(c)) nameAnywhere.set(c, n);
  };
  for (const row of customers) remember(row.stationCode, row.customerCode, row.name);
  for (const row of priceCardAirlines) remember(row._id.station, row._id.code, row.name);
  for (const row of advanceAirlines) remember(row.stationCode, row.code, row.name);
  const unnamed = new Set();
  const airlineName = (station, code) => {
    const name = nameAtStation.get(`${station}|${code}`) ?? nameAnywhere.get(code);
    if (!name) unnamed.add(`${station}/${code}`);
    return name ? `${name} (${code})` : code;
  };

  const cityByStation = new Map();
  for (const row of stations) {
    const code = clean(row.stationCode || String(row.code ?? '').split('-')[0]).toUpperCase();
    if (code && clean(row.city)) cityByStation.set(code, clean(row.city));
  }

  const equipmentDescription = new Map();
  for (const row of equipmentMaster) {
    const key = clean(row.itemNo).toLowerCase();
    if (key && clean(row.description) && !equipmentDescription.has(key)) {
      equipmentDescription.set(key, clean(row.description));
    }
  }
  // Every rule gets a name: screen full name, then Equipment Master, then the stored code.
  const serviceName = (serviceCode) => {
    const raw = clean(serviceCode);
    const stripped = clean(stripCatalogServicePrefix(raw));
    const display = clean(adsCatalogServiceDisplayName(raw));
    if (display && display.toLowerCase() !== stripped.toLowerCase()) return display;
    return equipmentDescription.get(stripped.toLowerCase()) || display || stripped || raw;
  };

  const included = contracts.filter((c) => !excluded.has(clean(c.stationCode).toUpperCase()));
  const byStation = new Map();
  const audit = [];
  const contractsWithoutRules = [];
  let inrWithPaise = 0;

  for (const contract of included) {
    const station = clean(contract.stationCode).toUpperCase();
    const code = clean(contract.customerCode).toUpperCase();
    const rules = (contract.adsEquipmentRules ?? []).filter((rule) => clean(rule.serviceCode));
    if (rules.length === 0) {
      contractsWithoutRules.push(`${station} ${code} (${contract.contractNumber})`);
      continue;
    }
    const location = cityByStation.has(station) ? `${cityByStation.get(station)} (${station})` : station;
    const airline = airlineName(station, code);
    const merged = new Map();
    for (const rule of rules) {
      const inr = positive(rule.unitPriceINR);
      if (inr != null && Math.abs(inr - Math.round(inr)) > 0.004) inrWithPaise += 1;
      const row = {
        airline,
        source: clean(contract.contractNumber),
        service: serviceName(rule.serviceCode),
        foc: focValue(rule),
        location,
        uom: uomFullForm(rule.uom),
        price: priceText(rule),
      };
      // Rules that print the same line (other sector, aircraft or month) share one row.
      const key = [row.source, row.service.toLowerCase(), row.foc, row.uom.toLowerCase(), row.price].join('|');
      const hit = merged.get(key);
      if (hit) hit.rules.push(rule);
      else merged.set(key, { row, rules: [rule] });
    }
    const rows = [...merged.values()].map(({ row, rules: grouped }) => ({
      ...row,
      appliesTo: applicability(grouped),
      ruleCount: grouped.length,
      rawCodes: new Set(grouped.map((rule) => clean(rule.serviceCode))),
    }));
    if (!byStation.has(station)) byStation.set(station, []);
    byStation.get(station).push(...rows);
    audit.push({
      station,
      contract: clean(contract.contractNumber),
      rules: rules.length,
      rawCodes: new Set(rules.map((rule) => clean(rule.serviceCode))),
      rows,
    });
  }

  /* ---------- Workbook, laid out like the supplied format ---------- */

  const headers = [
    'Name of Airlines',
    'Source',
    'Chargeable Services',
    'FOC',
    'Location',
    'Unit of Measurement (UoM)',
    'Price',
    'Applicable To (Sector / Aircraft / Effective Month)',
  ];
  const widths = [44, 26, 44, 24, 22, 30, 20, 56];
  const leftAligned = new Set([1, 3, 8]);
  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FRIS Billing';
  workbook.created = new Date();

  const stationCodes = [...byStation.keys()].sort(collator.compare);
  for (const station of stationCodes) {
    const rows = byStation.get(station).sort(
      (a, b) =>
        collator.compare(a.airline, b.airline) ||
        collator.compare(a.source, b.source) ||
        collator.compare(a.service, b.service) ||
        collator.compare(a.appliesTo, b.appliesTo) ||
        collator.compare(a.price, b.price),
    );
    const city = cityByStation.get(station);
    const sheet = workbook.addWorksheet((city ? `${station} - ${city}` : station).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 2 }],
    });
    sheet.columns = widths.map((width) => ({ width }));
    // Row 1 stays blank, header sits on row 2, exactly as in the format file.
    const headerRow = sheet.getRow(2);
    headerRow.height = 39;
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.alignment = { horizontal: index === 2 ? 'left' : 'center', vertical: 'middle', wrapText: true };
      cell.border = border;
    });
    rows.forEach((row, index) => {
      const excelRow = sheet.getRow(index + 3);
      [row.airline, row.source, row.service, row.foc, row.location, row.uom, row.price, row.appliesTo].forEach(
        (value, col) => {
          const cell = excelRow.getCell(col + 1);
          cell.value = value;
          cell.font = { name: 'Calibri', size: 11 };
          cell.alignment = {
            horizontal: leftAligned.has(col + 1) ? 'left' : 'center',
            vertical: 'middle',
            wrapText: true,
          };
          cell.border = border;
        },
      );
    });
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: headers.length } };
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await workbook.xlsx.writeFile(outPath);

  /* ---------- Reconciliation: nothing may be left out ---------- */

  let problems = 0;
  const totals = new Map();
  for (const entry of audit) {
    const exportedRules = entry.rows.reduce((sum, row) => sum + row.ruleCount, 0);
    const exportedCodes = new Set(entry.rows.flatMap((row) => [...row.rawCodes]));
    const missing = [...entry.rawCodes].filter((codeValue) => !exportedCodes.has(codeValue));
    if (exportedRules !== entry.rules || missing.length) {
      problems += 1;
      console.error(`MISMATCH ${entry.station} ${entry.contract}: rules ${entry.rules}, exported ${exportedRules}, missing ${missing.join(', ')}`);
    }
    const t = totals.get(entry.station) ?? { contracts: 0, rules: 0, rows: 0, equipment: 0 };
    t.contracts += 1;
    t.rules += entry.rules;
    t.rows += entry.rows.length;
    t.equipment += entry.rawCodes.size;
    totals.set(entry.station, t);
  }

  // Read the file back and count what is really in it.
  const check = new ExcelJS.Workbook();
  await check.xlsx.readFile(outPath);
  console.log('Station | airline contracts | rules in system | equipment entries | rows in sheet | rows read back');
  let grandRules = 0;
  let grandRows = 0;
  for (const station of stationCodes) {
    const t = totals.get(station);
    const sheet = check.worksheets.find((ws) => ws.name.startsWith(station));
    let readBack = 0;
    let blanks = 0;
    sheet.eachRow((row, n) => {
      if (n <= 2) return;
      readBack += 1;
      for (let col = 1; col <= 7; col += 1) {
        const value = row.getCell(col).value;
        if (value === null || value === undefined || value === '') blanks += 1;
      }
    });
    if (readBack !== t.rows || blanks) {
      problems += 1;
      console.error(`MISMATCH sheet ${station}: expected ${t.rows} rows, read ${readBack}, blank cells ${blanks}`);
    }
    grandRules += t.rules;
    grandRows += t.rows;
    console.log(`${station} | ${t.contracts} | ${t.rules} | ${t.equipment} | ${t.rows} | ${readBack}`);
  }
  console.log(`TOTAL | ${audit.length} | ${grandRules} | - | ${grandRows}`);
  console.log(`Sheets: ${check.worksheets.map((ws) => ws.name).join(', ')}`);
  console.log(`Excluded stations: ${[...excluded].join(', ')}`);
  console.log(`Contracts with no ADS equipment rules: ${contractsWithoutRules.join('; ') || 'none'}`);
  console.log(`Airlines without a saved name (code shown instead): ${[...unnamed].join(', ') || 'none'}`);
  console.log(`INR rates stored with paise (shown in whole rupees): ${inrWithPaise}`);
  const uoms = new Set(audit.flatMap((entry) => entry.rows.map((row) => row.uom)));
  console.log(`Units written: ${[...uoms].sort(collator.compare).join(' ; ')}`);
  console.log(`Saved: ${outPath}`);

  await mongoose.disconnect();
  if (problems) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
