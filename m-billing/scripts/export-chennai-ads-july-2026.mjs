#!/usr/bin/env node
/**
 * Chennai (MAA) — ADS custom-billing summary Excel for July 2026 (all airlines).
 *
 * Usage:
 *   node BWMS/modules/m-billing/scripts/export-chennai-ads-july-2026.mjs
 *   node BWMS/modules/m-billing/scripts/export-chennai-ads-july-2026.mjs --out="C:\path\file.xlsx"
 *
 * Env (from BWMS/apps/api/.env): MONGO_URI, SUPERADMIN_USERNAME, SUPERADMIN_PASSWORD
 * API: --api=http://localhost:8080 (default)
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../../../apps/api/package.json'));
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const STATION_CODE = 'MAA';
const FROM = '2026-07-01';
const TO = '2026-07-31';
const GST_MULTIPLIER = 1.18;

const apiArg = process.argv.find((a) => a.startsWith('--api='));
const outArg = process.argv.find((a) => a.startsWith('--out='));
const apiBase = (apiArg?.split('=')[1] || process.env.BILLING_API_URL || 'http://localhost:8080').replace(
  /\/$/,
  '',
);
const defaultOut = join(homedir(), 'Desktop', 'chennai-ads-july-2026-all-airlines.xlsx');
const outPath = resolve(outArg?.split('=').slice(1).join('=') || defaultOut);

function loadEnv() {
  const candidates = [
    resolve(__dirname, '../../../apps/api/.env'),
    resolve(__dirname, '../../../../.env'),
  ];
  const env = { ...process.env };
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const key = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in env)) env[key] = val;
    }
  }
  return env;
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function toWholeUnits(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.max(0, Math.round(v));
}

function adsRowUsedUnits(row) {
  const op = row.operationalData ?? {};
  const rate = row.rateMatch ?? {};
  const used = Number(rate.usedUnits ?? op.adsUsedUnits);
  if (Number.isFinite(used) && used > 0) return toWholeUnits(used);
  const chargeable = Number(op.chargeableUnits);
  if (Number.isFinite(chargeable) && chargeable > 0) return toWholeUnits(chargeable);
  const hours = Number(op.usageHours);
  const qtyRaw = Number(op.qty ?? op.equipment_quantity ?? op.quantity ?? 1);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
  if (Number.isFinite(hours) && hours > 0) return toWholeUnits(qty * hours);
  return toWholeUnits(qty);
}

function adsRowFreeAllowance(row) {
  const op = row.operationalData ?? {};
  const rate = row.rateMatch ?? {};
  const free = Number(rate.freeAllowance ?? op.adsFreeAllowance ?? 0);
  if (!Number.isFinite(free) || free <= 0) return 0;
  if (free >= Number.MAX_SAFE_INTEGER / 4) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.round(free));
}

function adsRowPricingBasis(row) {
  const op = row.operationalData ?? {};
  const rate = row.rateMatch ?? {};
  return String(rate.pricingBasis ?? op.adsPricingBasis ?? '')
    .trim()
    .toLowerCase();
}

function adsRowChargedQuantity(row) {
  const pricingBasis = adsRowPricingBasis(row);
  if (
    pricingBasis === 'ads_excluded' ||
    pricingBasis === 'not_on_contract' ||
    pricingBasis === 'package_inclusive'
  ) {
    return 0;
  }
  const unitPrice = Number(row.rateMatch?.unitPrice ?? 0);
  if (Number.isFinite(unitPrice) && unitPrice <= 0 && pricingBasis) return 0;
  const used = adsRowUsedUnits(row);
  const free = adsRowFreeAllowance(row);
  return Math.max(0, used - free);
}

function billingAdsFlightKey(row) {
  const op = row.operationalData ?? {};
  const serial = String(row.sourceRef?.serialNo ?? op.serialNumber ?? op.SerialNo ?? '').trim();
  if (serial && serial !== '0') return `s:${serial}`;
  const flightNo = String(row.sourceRef?.flightNo ?? op.flightNo ?? op.flightNoEquipmentNo ?? '').trim();
  const date = String(op.billingDateYmd ?? op.dateKey ?? op.date ?? op.from_date ?? op.fromDate ?? '').trim();
  const customer = String(op.customerCode ?? '')
    .trim()
    .toUpperCase();
  if (flightNo && date) return `f:${date}|${flightNo}|${customer}`;
  if (flightNo) return `f:${flightNo}|${customer}`;
  return '';
}

function countUniqueAdsFlights(rows) {
  const keys = new Set();
  for (const row of rows) {
    const key = billingAdsFlightKey(row);
    if (key) keys.add(key);
  }
  return keys.size;
}

function equipmentCodeFromRow(row) {
  const op = row.operationalData ?? {};
  const rate = row.rateMatch ?? {};
  const raw = String(
    rate.serviceCode ??
      op.adsParticular ??
      op.particular ??
      op.equipmentCode ??
      op.equipment_code ??
      op.abbr ??
      op.equipment_name ??
      op.equipmentName ??
      '',
  ).trim();
  return raw || 'UNKNOWN';
}

function equipmentLabel(code, particular) {
  const text = String(particular || code).trim();
  return text || code;
}

function resolveAdsRowFeePercent(row) {
  const contract = row.contractMatch;
  if (!contract?.matched) return 0;
  const rates = contract.concessionRates ?? {};
  const legacyRaw = Number(contract.royaltyAtGross);
  const legacyFallback = Number.isFinite(legacyRaw) && legacyRaw > 0 ? legacyRaw : 0;
  const op = row.operationalData ?? {};
  const categoryRaw = String(op.categoryOfFlight ?? op.flightCategory ?? op.category ?? op.Category ?? '').trim();
  const categoryLower = categoryRaw.toLowerCase();
  const diverted = Boolean(op.diverted ?? op.isDiverted);
  const isDom =
    categoryRaw === 'Dom' || (/domestic/.test(categoryLower) && !/international/.test(categoryLower));
  const isCargo = /cargo/.test(categoryLower);
  const pickFee = (value) => {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
    return legacyFallback;
  };
  if (diverted && isDom) return pickFee(rates.divertedDom);
  if (diverted) return pickFee(rates.divertedInt);
  if (isCargo && isDom) {
    const n = Number(rates.domesticCargo);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  if (isCargo) {
    const n = Number(rates.internationalCargo);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  if (isDom) return pickFee(rates.dom);
  return pickFee(rates.int);
}

function rowUnitPrice(row) {
  const n = Number(row.rateMatch?.unitPrice ?? 0);
  return Number.isFinite(n) && n > 0 ? roundMoney(n) : 0;
}

function rowUom(row) {
  const op = row.operationalData ?? {};
  const rate = row.rateMatch ?? {};
  return String(rate.uom ?? op.adsUom ?? op.uom ?? 'Per Service').trim() || 'Per Service';
}

function rowAmountExclTax(row) {
  const charged = adsRowChargedQuantity(row);
  const unitPrice = rowUnitPrice(row);
  if (!(charged > 0) || !(unitPrice > 0)) return 0;
  return roundMoney(charged * unitPrice);
}

function rowConcessionAmount(row) {
  const lineExcl = rowAmountExclTax(row);
  if (!(lineExcl > 0)) return 0;
  const feePct = resolveAdsRowFeePercent(row);
  return feePct > 0 ? roundMoney(lineExcl * (feePct / 100)) : 0;
}

function rowTotalInclConcessionGst(row) {
  const lineExcl = rowAmountExclTax(row);
  if (!(lineExcl > 0)) return 0;
  const concession = rowConcessionAmount(row);
  const gross = lineExcl + concession;
  return roundMoney(gross * GST_MULTIPLIER);
}

function customerCodeFromRow(row) {
  const op = row.operationalData ?? {};
  return String(op.customerCode ?? op.airlineCode ?? '')
    .trim()
    .toUpperCase();
}

function customerNameFromRow(row, code) {
  const op = row.operationalData ?? {};
  const name = String(op.customerName ?? op.airlineName ?? '').trim();
  return name || code;
}

function buildExportModel(rows) {
  const byAirline = new Map();
  for (const row of rows) {
    const code = customerCodeFromRow(row);
    if (!code) continue;
    const bucket = byAirline.get(code) ?? [];
    bucket.push(row);
    byAirline.set(code, bucket);
  }

  const sections = [];
  let grandTotal = 0;

  for (const customerCode of [...byAirline.keys()].sort((a, b) => a.localeCompare(b))) {
    const airlineRows = byAirline.get(customerCode) ?? [];
    if (!airlineRows.length) continue;
    const customerName = customerNameFromRow(airlineRows[0], customerCode);
    const flightCount = countUniqueAdsFlights(airlineRows);
    const equipmentMap = new Map();

    for (const row of airlineRows) {
      const equipmentCode = equipmentCodeFromRow(row);
      const unitPrice = rowUnitPrice(row);
      const uom = rowUom(row);
      const key = `${equipmentCode.toLowerCase()}|${unitPrice}|${uom.toLowerCase()}`;
      const op = row.operationalData ?? {};
      const particular = String(op.particular ?? op.adsParticular ?? '').trim();
      const bucket = equipmentMap.get(key) ?? {
        equipmentCode,
        equipmentLabel: equipmentLabel(equipmentCode, particular),
        unitPrice,
        uom,
        used: 0,
        charged: 0,
        amountExclTax: 0,
        concessionAmount: 0,
        totalInclConcessionGst: 0,
      };
      bucket.used += adsRowUsedUnits(row);
      bucket.charged += adsRowChargedQuantity(row);
      bucket.amountExclTax = roundMoney(bucket.amountExclTax + rowAmountExclTax(row));
      bucket.concessionAmount = roundMoney(bucket.concessionAmount + rowConcessionAmount(row));
      bucket.totalInclConcessionGst = roundMoney(
        bucket.totalInclConcessionGst + rowTotalInclConcessionGst(row),
      );
      equipmentMap.set(key, bucket);
    }

    const equipmentRows = [...equipmentMap.values()].sort((a, b) => {
      const byLabel = a.equipmentLabel.localeCompare(b.equipmentLabel, undefined, {
        sensitivity: 'base',
      });
      if (byLabel !== 0) return byLabel;
      return a.unitPrice - b.unitPrice;
    });
    const sectionTotal = roundMoney(
      equipmentRows.reduce((sum, r) => sum + r.totalInclConcessionGst, 0),
    );
    grandTotal = roundMoney(grandTotal + sectionTotal);
    sections.push({ customerCode, customerName, flightCount, equipmentRows, sectionTotal });
  }

  return { sections, grandTotal };
}

function buildAoA(model) {
  const lines = [[`Chennai (${STATION_CODE}) — ADS summary — ${FROM} to ${TO}`], []];
  const headers = [
    'Airline',
    'Flights (Jul 2026)',
    'Equipment',
    'Unit',
    'Rate/Unit (INR)',
    'Used',
    'Charged',
    'Amount (excl. tax)',
    'Concession',
    'Total (INR incl. concession & GST)',
  ];

  for (const section of model.sections) {
    const airlineLabel = `${section.customerName} (${section.customerCode})`;
    lines.push([`${airlineLabel} — Flights in July 2026: ${section.flightCount}`]);
    lines.push(headers);
    for (const row of section.equipmentRows) {
      lines.push([
        airlineLabel,
        String(section.flightCount),
        row.equipmentLabel,
        row.uom,
        row.unitPrice > 0 ? row.unitPrice : '',
        String(row.used),
        String(row.charged),
        row.amountExclTax > 0 ? row.amountExclTax : '',
        row.concessionAmount > 0 ? row.concessionAmount : '',
        row.totalInclConcessionGst > 0 ? row.totalInclConcessionGst : '',
      ]);
    }
    lines.push([
      `${section.customerCode} subtotal`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      String(section.sectionTotal),
    ]);
    lines.push([]);
  }
  lines.push(['Grand total (all airlines)', '', '', '', '', '', '', '', '', String(model.grandTotal)]);
  return lines;
}

/** Lines that must appear on CUSTOM invoices — billable ADS only (excludes BHS-package-inclusive). */
function buildBillableCustomLines(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.billingEligibility?.eligible === false) continue;
    const code = customerCodeFromRow(row);
    if (!code) continue;
    const charged = adsRowChargedQuantity(row);
    const price = rowUnitPrice(row);
    if (!(charged > 0) || !(price > 0)) continue;
    const equipmentCode = equipmentCodeFromRow(row);
    const uom = rowUom(row);
    const key = `${code}|${equipmentCode.toLowerCase()}|${price}|${uom.toLowerCase()}`;
    const op = row.operationalData ?? {};
    const particular = String(op.particular ?? op.adsParticular ?? '').trim();
    const bucket = map.get(key) ?? {
      customerCode: code,
      customerName: customerNameFromRow(row, code),
      equipment: equipmentLabel(equipmentCode, particular),
      unit: uom,
      ratePerUnit: price,
      used: 0,
      charged: 0,
      amountExcl: 0,
      concession: 0,
      totalInclGst: 0,
    };
    bucket.used += adsRowUsedUnits(row);
    bucket.charged += charged;
    const excl = roundMoney(charged * price);
    bucket.amountExcl = roundMoney(bucket.amountExcl + excl);
    bucket.concession = roundMoney(bucket.concession + rowConcessionAmount(row));
    bucket.totalInclGst = roundMoney(bucket.totalInclGst + rowTotalInclConcessionGst(row));
    map.set(key, bucket);
  }
  return [...map.values()].sort(
    (a, b) => a.customerCode.localeCompare(b.customerCode) || a.equipment.localeCompare(b.equipment),
  );
}

function billableLinesAoA(lines) {
  const headers = [
    'Customer',
    'Equipment',
    'Unit',
    'Rate/Unit (INR)',
    'Used',
    'Charged',
    'Amount (excl.)',
    'Concession',
    'Total (incl. concession & GST)',
  ];
  const out = [
    ['Billable ADS lines for CUSTOM invoices — Chennai July 2026'],
  [],
    headers,
  ];
  for (const row of lines) {
    out.push([
      `${row.customerName} (${row.customerCode})`,
      row.equipment,
      row.unit,
      row.ratePerUnit,
      row.used,
      row.charged,
      row.amountExcl,
      row.concession,
      row.totalInclGst,
    ]);
  }
  const total = roundMoney(lines.reduce((s, r) => s + r.totalInclGst, 0));
  out.push(['Grand total (billable ADS)', '', '', '', '', '', '', '', total]);
  return out;
}

async function findMaaStationId(mongoUri) {
  await mongoose.connect(mongoUri);
  const col = mongoose.connection.collection('admin-stations');
  const station =
    (await col.findOne({ stationCode: STATION_CODE })) ||
    (await col.findOne({ code: new RegExp(`^${STATION_CODE}`, 'i') }));
  if (!station?._id) {
    throw new Error(`Admin station ${STATION_CODE} not found in MongoDB`);
  }
  return String(station._id);
}

async function login(api, env, stationId) {
  const userid = env.SUPERADMIN_USERNAME || env.BILLING_EXPORT_USERID;
  const password = env.SUPERADMIN_PASSWORD || env.BILLING_EXPORT_PASSWORD;
  if (!userid || !password) {
    throw new Error('Set SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD in BWMS/apps/api/.env');
  }

  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-client': 'safety-incident',
    },
    body: JSON.stringify({ userid, password, stationId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || !data.access_token) {
    throw new Error(data.message || `Login failed (${res.status})`);
  }
  return data.access_token;
}

async function fetchAdsRows(api, token) {
  const qs = new URLSearchParams({ from: FROM, to: TO, dateBasis: 'schedule-date' });
  const res = await fetch(`${api}/billing/sources/ads?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `ADS fetch failed (${res.status})`);
  }
  return data.data?.rows ?? data.rows ?? [];
}

async function main() {
  const env = loadEnv();
  const mongoUri = env.MONGO_URI || env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI not set in BWMS/apps/api/.env');

  console.log(`API: ${apiBase}`);
  console.log(`Station: ${STATION_CODE} | Period: ${FROM} → ${TO}`);

  const stationId = await findMaaStationId(mongoUri);
  console.log(`Station id: ${stationId}`);

  const token = await login(apiBase, env, stationId);
  console.log('Logged in.');

  const rows = await fetchAdsRows(apiBase, token);
  console.log(`Fetched ${rows.length} ADS source row(s).`);

  const model = buildExportModel(rows);
  const billable = buildBillableCustomLines(rows);
  console.log(`Airlines: ${model.sections.length} | Grand total INR: ${model.grandTotal}`);
  console.log(`Billable custom lines: ${billable.length} | Billable grand total INR: ${billable.reduce((s, r) => s + r.totalInclGst, 0)}`);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildAoA(model)), 'All ADS summary');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(billableLinesAoA(billable)),
    'Billable for custom invoice',
  );
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
  console.log(`Wrote: ${outPath}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  void mongoose.disconnect();
  process.exit(1);
});
