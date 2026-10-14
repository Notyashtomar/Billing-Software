#!/usr/bin/env node
/**
 * Chennai (MAA) July 2026 — compare ADS billable sources vs CUSTOM invoice drafts/lines.
 * Flags airlines/equipment/totals that would be left off custom invoices.
 *
 * Usage:
 *   node BWMS/modules/m-billing/scripts/analyze-chennai-custom-invoices-july-2026.mjs
 *   node BWMS/modules/m-billing/scripts/analyze-chennai-custom-invoices-july-2026.mjs --out="C:\path\gaps.xlsx"
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

const STATION = 'MAA';
const FROM = '2026-07-01';
const TO = '2026-07-31';
const GST = 1.18;

const apiArg = process.argv.find((a) => a.startsWith('--api='));
const outArg = process.argv.find((a) => a.startsWith('--out='));
const apiBase = (apiArg?.split('=')[1] || 'http://localhost:8080').replace(/\/$/, '');
const defaultOut = join(homedir(), 'Desktop', 'chennai-custom-invoice-gaps-july-2026.xlsx');
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

function round2(n) {
  return Math.round(n * 100) / 100;
}

function ymd(d) {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

function periodOverlapsJuly(start, end) {
  const s = ymd(start);
  const e = ymd(end);
  if (!s || !e) return false;
  return s <= TO && e >= FROM;
}

// --- ADS row helpers (same as export script) ---
function toWhole(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.max(0, Math.round(v)) : 0;
}

function adsUsed(row) {
  const op = row.operationalData ?? {};
  const rate = row.rateMatch ?? {};
  const u = Number(rate.usedUnits ?? op.adsUsedUnits);
  if (u > 0) return toWhole(u);
  const c = Number(op.chargeableUnits);
  if (c > 0) return toWhole(c);
  return toWhole(op.qty ?? op.equipment_quantity ?? op.quantity ?? 1);
}

function adsFree(row) {
  const op = row.operationalData ?? {};
  const rate = row.rateMatch ?? {};
  const f = Number(rate.freeAllowance ?? op.adsFreeAllowance ?? 0);
  if (!Number.isFinite(f) || f <= 0) return 0;
  if (f >= Number.MAX_SAFE_INTEGER / 4) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.round(f));
}

function pricingBasis(row) {
  const op = row.operationalData ?? {};
  const rate = row.rateMatch ?? {};
  return String(rate.pricingBasis ?? op.adsPricingBasis ?? '').trim().toLowerCase();
}

function adsCharged(row) {
  const basis = pricingBasis(row);
  if (basis === 'ads_excluded' || basis === 'not_on_contract' || basis === 'package_inclusive') return 0;
  const price = Number(row.rateMatch?.unitPrice ?? 0);
  if (price <= 0 && basis) return 0;
  return Math.max(0, adsUsed(row) - adsFree(row));
}

function unitPrice(row) {
  const n = Number(row.rateMatch?.unitPrice ?? 0);
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
}

function equipmentCode(row) {
  const op = row.operationalData ?? {};
  const rate = row.rateMatch ?? {};
  return String(
    rate.serviceCode ?? op.adsParticular ?? op.particular ?? op.equipmentCode ?? op.abbr ?? '',
  ).trim() || 'UNKNOWN';
}

function customerCode(row) {
  return String(row.operationalData?.customerCode ?? row.operationalData?.airlineCode ?? '')
    .trim()
    .toUpperCase();
}

function amountExcl(row) {
  const c = adsCharged(row);
  const p = unitPrice(row);
  return c > 0 && p > 0 ? round2(c * p) : 0;
}

function gapReason(row) {
  const used = adsUsed(row);
  const charged = adsCharged(row);
  const price = unitPrice(row);
  const basis = pricingBasis(row);
  const eligible = row.billingEligibility?.eligible !== false;
  const rateOk = row.rateMatch?.matched === true;
  const contractOk = row.contractMatch?.matched === true;

  if (!customerCode(row)) return 'missing_customer_code';
  if (!eligible) return `ineligible:${row.billingEligibility?.reason ?? 'unknown'}`;
  if (basis === 'package_inclusive') return 'package_inclusive';
  if (basis === 'not_on_contract') return 'not_on_contract';
  if (basis === 'ads_excluded') return 'ads_excluded';
  if (!rateOk) return 'no_rate_match';
  if (!contractOk) return 'no_contract_match';
  if (price <= 0 && used > 0) return 'missing_unit_price';
  if (used > 0 && charged <= 0) return 'used_but_zero_charged';
  if (charged > 0 && price > 0) return null;
  if (used <= 0) return 'zero_usage';
  return 'review';
}

function aggregateAds(rows) {
  const byAirline = new Map();
  const gaps = [];

  for (const row of rows) {
    const code = customerCode(row);
    if (!code) {
      gaps.push({ airline: '', equipment: equipmentCode(row), reason: 'missing_customer_code', used: adsUsed(row), charged: adsCharged(row), amount: 0 });
      continue;
    }

    const reason = gapReason(row);
    const excl = amountExcl(row);
    const bucket = byAirline.get(code) ?? {
      customerCode: code,
      customerName: String(row.operationalData?.customerName ?? code),
      used: 0,
      charged: 0,
      amountExcl: 0,
      amountInclGst: 0,
      lineCount: 0,
      billableLineCount: 0,
    };
    bucket.lineCount += 1;
    bucket.used += adsUsed(row);
    bucket.charged += adsCharged(row);
    if (excl > 0) {
      bucket.billableLineCount += 1;
      bucket.amountExcl = round2(bucket.amountExcl + excl);
      bucket.amountInclGst = round2(bucket.amountInclGst + excl * GST);
    }
    byAirline.set(code, bucket);

    if (reason && reason !== 'zero_usage' && reason !== 'package_inclusive' && !reason.startsWith('ineligible:')) {
      gaps.push({
        airline: code,
        equipment: equipmentCode(row),
        reason,
        used: adsUsed(row),
        charged: adsCharged(row),
        unitPrice: unitPrice(row),
        amount: excl,
        pricingBasis: pricingBasis(row) || '—',
        rateMatched: row.rateMatch?.matched ? 'yes' : 'no',
        contractMatched: row.contractMatch?.matched ? 'yes' : 'no',
      });
    }
  }

  return { byAirline, gaps };
}

function aggregateCustomInvoices(headers, lines) {
  const byAirline = new Map();
  const linesByHeader = new Map();
  for (const line of lines) {
    const hid = String(line.invoiceId ?? '');
    if (!hid) continue;
    const bucket = linesByHeader.get(hid) ?? [];
    bucket.push(line);
    linesByHeader.set(hid, bucket);
  }

  for (const h of headers) {
    const code = String(h.customerCode ?? '').trim().toUpperCase();
    if (!code) continue;
    const invLines = linesByHeader.get(String(h._id)) ?? [];
    const bucket = byAirline.get(code) ?? {
      customerCode: code,
      customerName: String(h.customerName ?? code),
      draftNumbers: [],
      charged: 0,
      amountExcl: 0,
      amountInclGst: 0,
      lineCount: 0,
      draftCount: 0,
    };
    bucket.draftCount += 1;
    bucket.draftNumbers.push(h.draftNumber ?? h.invoiceNumber ?? String(h._id));
    for (const line of invLines) {
      bucket.lineCount += 1;
      const qty = Number(line.quantity ?? 0);
      const excl = Number(line.lineAmountExclTax ?? 0);
      const incl = Number(line.lineAmountInclTax ?? line.totalInclTax ?? 0);
      bucket.charged += qty > 0 ? qty : 0;
      bucket.amountExcl = round2(bucket.amountExcl + (excl > 0 ? excl : 0));
      bucket.amountInclGst = round2(bucket.amountInclGst + (incl > 0 ? incl : excl * GST));
    }
    byAirline.set(code, bucket);
  }
  return byAirline;
}

async function findMaaStationId(mongoUri) {
  await mongoose.connect(mongoUri);
  const col = mongoose.connection.collection('admin-stations');
  const station =
    (await col.findOne({ stationCode: STATION })) ||
    (await col.findOne({ code: new RegExp(`^${STATION}`, 'i') }));
  if (!station?._id) throw new Error(`Station ${STATION} not found`);
  return String(station._id);
}

async function login(api, env, stationId) {
  const userid = env.SUPERADMIN_USERNAME || env.BILLING_EXPORT_USERID;
  const password = env.SUPERADMIN_PASSWORD || env.BILLING_EXPORT_PASSWORD;
  if (!userid || !password) throw new Error('SUPERADMIN credentials missing in .env');
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-client': 'safety-incident' },
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
  if (!res.ok) throw new Error(data.message || `ADS fetch failed (${res.status})`);
  return data.data?.rows ?? data.rows ?? [];
}

async function loadCustomInvoices() {
  const billing = mongoose.connection.collection('billing');
  const periodStart = new Date(FROM);
  const periodEnd = new Date(`${TO}T23:59:59.999Z`);

  const headers = await billing
    .find({
      docType: 'invoice_header',
      stationCode: STATION,
      invoiceCategory: 'CUSTOM',
      cancelled: { $ne: true },
      inBin: { $ne: true },
      billingPeriodStart: { $lte: periodEnd },
      billingPeriodEnd: { $gte: periodStart },
    })
    .project({
      customerCode: 1,
      customerName: 1,
      draftNumber: 1,
      invoiceNumber: 1,
      status: 1,
      totalExclTax: 1,
      totalInclTax: 1,
      billingPeriodStart: 1,
      billingPeriodEnd: 1,
    })
    .toArray();

  const headerIds = headers.map((h) => h._id);
  const lines =
    headerIds.length === 0
      ? []
      : await billing
          .find({
            docType: 'invoice_line',
            stationCode: STATION,
            invoiceId: { $in: headerIds },
          })
          .project({
            invoiceId: 1,
            description: 1,
            quantity: 1,
            unitPrice: 1,
            lineAmountExclTax: 1,
            lineAmountInclTax: 1,
          })
          .toArray();

  return { headers, lines };
}

async function loadAdsInvoices() {
  const billing = mongoose.connection.collection('billing');
  const periodStart = new Date(FROM);
  const periodEnd = new Date(`${TO}T23:59:59.999Z`);
  return billing
    .find({
      docType: 'invoice_header',
      stationCode: STATION,
      invoiceCategory: 'ADS',
      cancelled: { $ne: true },
      inBin: { $ne: true },
      billingPeriodStart: { $lte: periodEnd },
      billingPeriodEnd: { $gte: periodStart },
      status: { $in: ['draft', 'posted', 'approved', 'sent'] },
    })
    .project({ customerCode: 1, draftNumber: 1, invoiceNumber: 1, status: 1, totalInclTax: 1 })
    .toArray();
}

function buildRecommendedCustomLines(adsRows) {
  const map = new Map();
  for (const row of adsRows) {
    const code = customerCode(row);
    if (!code) continue;
    const excl = amountExcl(row);
    if (!(excl > 0)) continue;
    const eq = equipmentCode(row);
    const price = unitPrice(row);
    const uom = String(row.rateMatch?.uom ?? row.operationalData?.adsUom ?? 'Per Service').trim() || 'Per Service';
    const key = `${code}|${eq.toLowerCase()}|${price}|${uom.toLowerCase()}`;
    const bucket = map.get(key) ?? {
      customerCode: code,
      customerName: String(row.operationalData?.customerName ?? code),
      equipment: eq,
      unit: uom,
      ratePerUnit: price,
      used: 0,
      charged: 0,
      amountExcl: 0,
    };
    bucket.used += adsUsed(row);
    bucket.charged += adsCharged(row);
    bucket.amountExcl = round2(bucket.amountExcl + excl);
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) =>
    a.customerCode.localeCompare(b.customerCode) ||
    a.equipment.localeCompare(b.equipment),
  );
}

function buildComparison(adsByAirline, customByAirline, adsInvoices) {
  const adsInvoiceAirlines = new Set(adsInvoices.map((h) => String(h.customerCode ?? '').toUpperCase()).filter(Boolean));
  const allCodes = new Set([...adsByAirline.keys(), ...customByAirline.keys()]);
  const rows = [];

  for (const code of [...allCodes].sort()) {
    const ads = adsByAirline.get(code);
    const custom = customByAirline.get(code);
    const adsExpected = ads?.amountExcl ?? 0;
    const customActual = custom?.amountExcl ?? 0;
    const delta = round2(adsExpected - customActual);
    const hasAdsInvoice = adsInvoiceAirlines.has(code);

    let status;
    if (!ads && custom) status = 'custom_only_no_ads_source';
    else if (ads && !custom && adsExpected > 0) status = 'MISSING_CUSTOM_INVOICE';
    else if (ads && !custom && adsExpected <= 0) status = 'ads_no_billable_amount';
    else if (ads && custom && adsExpected <= 0 && customActual > 0) status = 'manual_custom_only';
    else if (ads && custom && custom.draftCount > 1) status = 'DUPLICATE_DRAFTS';
    else if (ads && custom && adsExpected > 0 && Math.abs(delta) <= 1) status = 'ADS_FULLY_COVERED';
    else if (ads && custom && adsExpected > 0 && Math.abs(delta) > 1) status = 'AMOUNT_MISMATCH';
    else if (custom) status = 'ok';
    else status = 'no_activity';

    rows.push({
      customerCode: code,
      customerName: ads?.customerName ?? custom?.customerName ?? code,
      adsSourceLines: ads?.lineCount ?? 0,
      adsBillableLines: ads?.billableLineCount ?? 0,
      adsUsed: ads?.used ?? 0,
      adsCharged: ads?.charged ?? 0,
      adsAmountExcl: adsExpected,
      adsAmountInclGst: ads?.amountInclGst ?? 0,
      customDrafts: custom?.draftNumbers?.join(', ') ?? '—',
      customDraftCount: custom?.draftCount ?? 0,
      customLines: custom?.lineCount ?? 0,
      customCharged: custom?.charged ?? 0,
      customAmountExcl: customActual,
      customAmountInclGst: custom?.amountInclGst ?? 0,
      deltaExcl: delta,
      hasAdsInvoiceDraft: hasAdsInvoice ? 'yes' : 'no',
      status,
    });
  }
  return rows;
}

function writeWorkbook({ comparison, gaps, adsInvoices, customHeaders, recommended }) {
  const wb = XLSX.utils.book_new();

  const cmpSheet = XLSX.utils.json_to_sheet(comparison);
  XLSX.utils.book_append_sheet(wb, cmpSheet, 'Airline comparison');

  const gapSheet = XLSX.utils.json_to_sheet(gaps);
  XLSX.utils.book_append_sheet(wb, gapSheet, 'ADS gaps to review');

  const missing = comparison.filter((r) =>
    ['MISSING_CUSTOM_INVOICE', 'AMOUNT_MISMATCH', 'custom_only_no_ads_source'].includes(r.status),
  );
  const missSheet = XLSX.utils.json_to_sheet(missing.length ? missing : [{ note: 'No gaps — all airlines match' }]);
  XLSX.utils.book_append_sheet(wb, missSheet, 'Action required');

  const adsInv = XLSX.utils.json_to_sheet(
    adsInvoices.map((h) => ({
      customerCode: h.customerCode,
      draft: h.draftNumber ?? h.invoiceNumber,
      status: h.status,
      totalInclTax: h.totalInclTax,
    })),
  );
  XLSX.utils.book_append_sheet(wb, adsInv, 'ADS invoices (separate)');

  const customInv = XLSX.utils.json_to_sheet(
    customHeaders.map((h) => ({
      customerCode: h.customerCode,
      draft: h.draftNumber ?? h.invoiceNumber,
      status: h.status,
      totalExcl: h.totalExclTax,
      totalIncl: h.totalInclTax,
      period: `${ymd(h.billingPeriodStart)} → ${ymd(h.billingPeriodEnd)}`,
    })),
  );
  XLSX.utils.book_append_sheet(wb, customInv, 'Custom invoices');

  const recSheet = XLSX.utils.json_to_sheet(recommended);
  XLSX.utils.book_append_sheet(wb, recSheet, 'Recommended custom lines');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
}

async function main() {
  const env = loadEnv();
  const mongoUri = env.MONGO_URI || env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI missing');

  const stationId = await findMaaStationId(mongoUri);
  const token = await login(apiBase, env, stationId);
  const adsRows = await fetchAdsRows(apiBase, token);
  const { byAirline: adsByAirline, gaps } = aggregateAds(adsRows);

  const { headers: customHeaders, lines: customLines } = await loadCustomInvoices();
  const customByAirline = aggregateCustomInvoices(customHeaders, customLines);
  const adsInvoices = await loadAdsInvoices();

  const comparison = buildComparison(adsByAirline, customByAirline, adsInvoices);
  const recommended = buildRecommendedCustomLines(adsRows);
  writeWorkbook({ comparison, gaps, adsInvoices, customHeaders, recommended });

  const missing = comparison.filter((r) => r.status === 'MISSING_CUSTOM_INVOICE');
  const mismatch = comparison.filter((r) => r.status === 'AMOUNT_MISMATCH');

  console.log(`ADS source rows: ${adsRows.length}`);
  console.log(`Airlines in ADS: ${adsByAirline.size}`);
  console.log(`Custom invoice drafts: ${customHeaders.length}`);
  console.log(`Airlines with CUSTOM draft: ${customByAirline.size}`);
  console.log(`Airlines with ADS invoice (separate path): ${adsInvoices.length}`);
  console.log(`Gap rows to review: ${gaps.length}`);
  console.log(`MISSING custom invoice: ${missing.length}`);
  console.log(`AMOUNT mismatch: ${mismatch.length}`);
  console.log(`Wrote: ${outPath}`);

  if (missing.length) {
    console.log('\nAirlines needing custom invoice:');
    for (const r of missing) {
      console.log(`  ${r.customerCode} — expected excl ₹${r.adsAmountExcl}`);
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  void mongoose.disconnect();
  process.exit(1);
});
