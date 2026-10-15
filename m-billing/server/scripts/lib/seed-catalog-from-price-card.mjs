/**
 * Upsert price-card extra equipment / manpower / services into the billing
 * service catalog for every station, plus pan-India RAF adhoc labels.
 *
 * Existing catalog rows are never overwritten (insert-only).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../../../../api/package.json'));
const API_DIR = resolve(__dirname, '../../../../api');
const REPO_ROOT = resolve(__dirname, '../../../..');

const DOC_TYPE_CATALOG = 'service_catalog';
const DOC_TYPE_RAF = 'raf_adhoc_rate';
const RAF_ALL_STATIONS = '*';
const RAF_VALID_FROM = new Date('2026-03-01T00:00:00.000Z');
const RAF_VALID_TO = new Date('2027-03-31T23:59:59.000Z');

/** Stripped codes treated as the same catalog family — skip insert if any member exists. */
const CODE_FAMILIES = [
  ['GPU', 'GPU-NB', 'GPU-WB', 'GPU-90KV', 'GPU-140KV', 'GPU-180KV', 'GPU-280KV'],
  ['ACU', 'ACU-NB', 'ACU-WB'],
  ['ASU', 'ASU-NB', 'ASU-WB'],
  ['PBNB', 'PBWB', 'PB', 'PUSH BACK', 'PUSHBACK'],
  ['TOW', 'PTOW', 'ISTNB', 'ISTWB', 'TOWING', 'SHORT TOW', 'LONG TOW'],
  ['PAX COACH', 'PAX-COACH', 'COACH', 'PASSENGER COACH'],
  ['CREW COACH'],
  ['PS-WS', 'WS', 'WATER', 'WATER CART', 'WATER SERVICE'],
  ['PS-TS', 'TS', 'TOILET', 'TOILET CART', 'TOILET SERVICE'],
  ['PSL-TOWABLE', 'PSL', 'STEP-LADDER', 'STEP LADDER'],
  ['BFL-TOWABLE', 'BFL'],
  ['AMB'],
  ['HS', 'HEADSET'],
  ['BC', 'BLUE COLLAR'],
  ['WC', 'WHITE COLLAR'],
  ['DEEP CLEANING'],
  ['NIGHT HALT CLEANING'],
  ['CABIN CLEANING'],
  ['DISINFECTION'],
  ['WCHR', 'WCHR/S'],
  ['WCHS'],
  ['WCHC'],
  ['EBT', 'ELECTRIC TUG'],
  ['DT', 'DIESEL TUG', 'TRACTOR'],
  ['FORK'],
  ['DO', 'DRIVER'],
  ['SUP', 'SUPERVISOR'],
  ['UH'],
];

function stripPrefix(label) {
  let value = String(label ?? '').trim();
  const re =
    /^(cancel\s+)?((ads|raf)(\s*-\s*(equipment|manpower))?|non[\s-]*scheduled(\s*-\s*(equipment|manpower|flight)|\s+flight)?|scheduled(\s*-\s*(equipment|manpower)|\s+flight)?)\s*-\s*/i;
  for (let i = 0; i < 3; i += 1) {
    const next = value.replace(re, '').trim().replace(/^-\s*/, '');
    if (next === value) break;
    value = next;
  }
  return value.trim();
}

function normCode(value) {
  return stripPrefix(value).replace(/\s+/g, ' ').trim().toUpperCase();
}

function familyCovers(code, existingStripped) {
  const needle = normCode(code);
  if (!needle) return false;
  if (existingStripped.has(needle)) return true;
  for (const family of CODE_FAMILIES) {
    const members = family.map((m) => m.toUpperCase());
    if (!members.includes(needle)) continue;
    if (members.some((m) => existingStripped.has(m))) return true;
  }
  return false;
}

export function catalogRowsForItem(item) {
  const code = String(item.code ?? '').trim();
  const description = String(item.description ?? code).trim() || code;
  const uom = String(item.uom ?? 'Per service').trim() || 'Per service';
  const kind = item.kind === 'manpower' ? 'manpower' : item.kind === 'cleaning' ? 'cleaning' : 'equipment';

  if (kind === 'manpower') {
    return [
      { serviceCode: `Scheduled - Manpower - ${code}`, category: 'manpower', description, uom, itemKind: 'manpower' },
      {
        serviceCode: `Non Scheduled - Manpower - ${code}`,
        category: 'manpower',
        description,
        uom,
        itemKind: 'manpower',
      },
      { serviceCode: `RAF - Manpower - ${code}`, category: 'manpower', description, uom, itemKind: 'manpower' },
    ];
  }

  const scheduledCategory = kind === 'cleaning' ? 'cleaning' : 'equipment';
  return [
    {
      serviceCode: `Scheduled - Equipment - ${code}`,
      category: scheduledCategory,
      description,
      uom,
      itemKind: kind === 'cleaning' ? 'equipment' : item.kind === 'service' ? 'service' : 'equipment',
    },
    {
      serviceCode: `Non Scheduled - Equipment - ${code}`,
      category: 'non_scheduled',
      description,
      uom,
      itemKind: kind === 'cleaning' ? 'equipment' : item.kind === 'service' ? 'service' : 'equipment',
    },
    {
      serviceCode: `RAF - Equipment - ${code}`,
      category: 'raf',
      description,
      uom,
      itemKind: kind === 'cleaning' ? 'equipment' : item.kind === 'service' ? 'service' : 'equipment',
    },
  ];
}

function itemKindFromCategory(category, kind) {
  if (kind === 'manpower' || category === 'manpower') return 'manpower';
  if (kind === 'service') return 'service';
  return 'equipment';
}

function catalogKindMatches(doc, itemKind) {
  const code = String(doc.serviceCode ?? '').toLowerCase();
  const category = String(doc.category ?? '').toLowerCase();
  if (itemKind === 'manpower') {
    return category === 'manpower' || code.includes('manpower');
  }
  if (itemKind === 'cleaning') {
    return category === 'cleaning' || /clean/.test(code);
  }
  return category !== 'manpower' && !code.includes('manpower');
}

function resolveRowsForItem(item, templateByCode) {
  const existing = [];
  const seen = new Set();
  for (const doc of templateByCode.values()) {
    const code = String(doc.serviceCode ?? '').trim();
    if (!code) continue;
    if (!catalogKindMatches(doc, item.kind)) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    if (!familyCovers(item.code, new Set([normCode(code)])) && normCode(code) !== normCode(item.code)) {
      continue;
    }
    seen.add(key);
    existing.push({
      serviceCode: code,
      category: doc.category,
      description: doc.description || item.description,
      uom: doc.uom || item.uom,
      itemKind: itemKindFromCategory(doc.category, item.kind),
      template: doc,
    });
  }
  if (existing.length > 0) return existing;
  return catalogRowsForItem(item).map((row) => ({ ...row, template: null }));
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function loadMongoUri() {
  for (const p of [resolve(REPO_ROOT, '.env'), resolve(API_DIR, '.env')]) {
    loadEnvFile(p);
  }
  return (process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();
}

function canonicalStationCode(doc) {
  const sc = String(doc.stationCode ?? '').trim().toUpperCase();
  if (sc && sc !== '*') return sc;
  const code = String(doc.code ?? '').trim().toUpperCase();
  if (!code) return '';
  return code.replace(/-\d+$/, '');
}

async function listStationCodes(db) {
  const stations = await db
    .collection('admin-stations')
    .find({}, { projection: { stationCode: 1, code: 1 } })
    .toArray();
  const codes = new Set();
  for (const doc of stations) {
    const code = canonicalStationCode(doc);
    if (code) codes.add(code);
  }
  const catalogStations = await db.collection('billing').distinct('stationCode', {
    docType: DOC_TYPE_CATALOG,
  });
  for (const raw of catalogStations) {
    const code = String(raw ?? '').trim().toUpperCase();
    if (code && code !== '*') codes.add(code);
  }
  return [...codes].sort();
}

function catalogDoc(row, stationCode, now) {
  return {
    docType: DOC_TYPE_CATALOG,
    serviceCode: row.serviceCode,
    description: row.description,
    lineType: 'service',
    category: row.category,
    uom: row.uom,
    sacCode: '',
    royaltyApplicable: false,
    active: true,
    exportLogType: row.serviceCode,
    stationCode,
    createdAt: now,
    updatedAt: now,
  };
}

function rafDoc(row, now, sourceWorkbook) {
  return {
    docType: DOC_TYPE_RAF,
    itemKind: row.itemKind,
    label: row.serviceCode,
    remarks: row.description,
    uom: row.uom,
    validFrom: RAF_VALID_FROM,
    validTo: RAF_VALID_TO,
    stationCode: RAF_ALL_STATIONS,
    sourceWorkbook,
    createdAt: now,
    updatedAt: now,
  };
}

function catalogDocFromExisting(existing, stationCode, now) {
  return {
    docType: DOC_TYPE_CATALOG,
    serviceCode: existing.serviceCode,
    description: existing.description,
    lineType: existing.lineType || 'service',
    category: existing.category,
    uom: existing.uom,
    sacCode: existing.sacCode ?? '',
    gstProdPostingGroup: existing.gstProdPostingGroup,
    royaltyApplicable: existing.royaltyApplicable ?? false,
    active: existing.active !== false,
    exportLogType: existing.exportLogType || existing.serviceCode,
    stationCode,
    createdAt: now,
    updatedAt: now,
  };
}

async function bulkInsertOnly(col, ops) {
  if (ops.length === 0) return { upserted: 0, matched: 0 };
  let upserted = 0;
  let matched = 0;
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const chunk = ops.slice(i, i + CHUNK);
    const result = await col.bulkWrite(chunk, { ordered: false });
    upserted += result.upsertedCount ?? 0;
    matched += result.matchedCount ?? 0;
  }
  return { upserted, matched };
}

export async function seedCatalogFromPriceCardItems(items, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const sourceWorkbook = String(opts.sourceWorkbook ?? 'price-card.xlsx');
  const mongoose = require('mongoose');
  const uri = loadMongoUri();
  if (!uri) {
    throw new Error('MONGO_URI / MONGODB_URI missing. Set it in repo-root .env or BWMS/apps/api/.env');
  }

  await mongoose.connect(uri);
  try {
    const db = mongoose.connection.db;
    const billing = db.collection('billing');

    const existingCatalog = await billing
      .find(
        { docType: DOC_TYPE_CATALOG },
        {
          projection: {
            serviceCode: 1,
            stationCode: 1,
            description: 1,
            lineType: 1,
            category: 1,
            uom: 1,
            sacCode: 1,
            gstProdPostingGroup: 1,
            royaltyApplicable: 1,
            active: 1,
            exportLogType: 1,
          },
        },
      )
      .toArray();

    const exactByStation = new Map();
    const strippedByStation = new Map();
    const templateByCode = new Map();
    const addSet = (map, key, value) => {
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(value);
    };
    for (const doc of existingCatalog) {
      const station = String(doc.stationCode ?? '').trim().toUpperCase();
      const code = String(doc.serviceCode ?? '').trim();
      if (!station || !code) continue;
      addSet(exactByStation, station, code.toLowerCase());
      addSet(strippedByStation, station, normCode(code));
      const key = code.toLowerCase();
      if (!templateByCode.has(key)) templateByCode.set(key, doc);
    }

    const requestedStations = Array.isArray(opts.stationCodes)
      ? opts.stationCodes.map((s) => String(s ?? '').trim().toUpperCase()).filter(Boolean)
      : [];
    const stations =
      requestedStations.length > 0 ? requestedStations : await listStationCodes(db);
    if (stations.length === 0) {
      throw new Error('No station codes found in admin-stations / billing catalog');
    }
    const seedRaf = opts.seedRaf !== false && requestedStations.length === 0;

    const existingRaf = await billing
      .find(
        { docType: DOC_TYPE_RAF, stationCode: RAF_ALL_STATIONS },
        { projection: { label: 1, itemKind: 1 } },
      )
      .toArray();
    const rafKeys = new Set(
      existingRaf.map((d) => `${String(d.itemKind)}::${String(d.label).trim().toLowerCase()}`),
    );

    const catalogOps = [];
    const rafOps = [];
    const preview = [];
    const now = new Date();

    for (const item of items) {
      const rows = resolveRowsForItem(item, templateByCode);
      const labelsWritten = [];
      for (const row of rows) {
        let stationHits = 0;
        for (const stationCode of stations) {
          const exact = exactByStation.get(stationCode) ?? new Set();
          if (exact.has(row.serviceCode.toLowerCase())) continue;

          const insertDoc = row.template
            ? catalogDocFromExisting(row.template, stationCode, now)
            : catalogDoc(row, stationCode, now);
          catalogOps.push({
            updateOne: {
              filter: {
                docType: DOC_TYPE_CATALOG,
                stationCode,
                serviceCode: row.serviceCode,
              },
              update: { $setOnInsert: insertDoc },
              upsert: true,
            },
          });
          stationHits += 1;
          exact.add(row.serviceCode.toLowerCase());
          exactByStation.set(stationCode, exact);
        }
        if (stationHits > 0) labelsWritten.push(row.serviceCode);

        const rafKey = `${row.itemKind}::${row.serviceCode.toLowerCase()}`;
        if (seedRaf && !rafKeys.has(rafKey) && !row.template) {
          rafOps.push({
            updateOne: {
              filter: {
                docType: DOC_TYPE_RAF,
                stationCode: RAF_ALL_STATIONS,
                itemKind: row.itemKind,
                label: row.serviceCode,
              },
              update: { $setOnInsert: rafDoc(row, now, sourceWorkbook) },
              upsert: true,
            },
          });
          rafKeys.add(rafKey);
        }
      }
      if (labelsWritten.length > 0) {
        preview.push({
          kind: item.kind,
          code: item.code,
          uom: item.uom,
          description: item.description,
          sheets: item.sheets ?? [item.sheetName],
          labels: labelsWritten,
        });
      }
    }

    if (dryRun) {
      return {
        dryRun: true,
        stations: stations.length,
        collected: items.length,
        newItems: preview.length,
        catalogWrites: catalogOps.length,
        rafWrites: rafOps.length,
        preview,
      };
    }

    const catalogResult = await bulkInsertOnly(billing, catalogOps);
    const rafResult = await bulkInsertOnly(billing, rafOps);

    return {
      dryRun: false,
      stations: stations.length,
      stationCodes: stations,
      collected: items.length,
      newItems: preview.length,
      catalogInserted: catalogResult.upserted,
      catalogAlreadyPresent: catalogResult.matched,
      rafInserted: rafResult.upserted,
      preview,
    };
  } finally {
    await mongoose.disconnect();
  }
}
