/**
 * Seed yellow Sheet1 columns from MAA-customers-addresses.xlsx onto
 * advance-airline rows for Chennai (MAA) only.
 *
 * Match: excel "airline code" prefix before '-' (AC-MAA → AC) to existing
 * `code`. Does not create airlines, rename them, or touch other stations.
 *
 * From BWMS/apps/api:
 *   node scripts/seed-maa-airline-parent-companies.mjs
 *   node scripts/seed-maa-airline-parent-companies.mjs --dry-run
 */
import { config } from 'dotenv';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const STATION = 'MAA';
const WORKBOOK = join(__dirname, '..', 'data', 'MAA-customers-addresses.xlsx');
const COLLECTION = 'advance-airline';
const DRY_RUN = process.argv.includes('--dry-run');

const HEADER_TO_FIELD = {
  name: 'parentCompanyName',
  address: 'address',
  'address 2': 'address2',
  'address 3': 'address3',
  'state code': 'stateCode',
  'gst registration no.': 'gstRegistrationNo',
  'gst registration no': 'gstRegistrationNo',
};

function cellText(cell) {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.hyperlink) return String(v.text || v.hyperlink);
  }
  return String(v);
}

function isYellowFill(fill) {
  if (!fill || fill.type !== 'pattern') return false;
  const fg = String(fill.fgColor?.argb || '').toUpperCase();
  return fg === 'FFFFFF00' || fg === 'FFFF00' || fg.endsWith('FFFF00');
}

function excelAirlineCodePrefix(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .split('-')[0]
    .replace(/[^A-Z0-9]/g, '');
}

function headerKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isChennaiStation(value) {
  const t = String(value ?? '').trim().toUpperCase();
  return t === 'CHENNAI' || t === 'MAA' || t === '';
}

function pickExcelRow(rows) {
  if (!rows.length) return null;
  const notOld = rows.filter((r) => !/-OLD$/i.test(r.excelCode));
  const pool = notOld.length ? notOld : rows;
  const schedule = pool.filter((r) => /^schedule/i.test(r.operation));
  const pool2 = schedule.length ? schedule : pool;
  const maa = pool2.filter((r) => /-(MAA)$/i.test(r.excelCode));
  return maa[0] || pool2[0];
}

function maaAirlineFilter(code) {
  return {
    code: { $regex: `^${code}$`, $options: 'i' },
    $or: [
      { stationCode: STATION },
      { stationCode: { $exists: false } },
      { stationCode: null },
      { stationCode: '' },
    ],
  };
}

function normalizeStation(value) {
  return String(value ?? '').trim().toUpperCase();
}

async function readYellowRows() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(WORKBOOK);
  const ws = wb.getWorksheet('Sheet1') || wb.worksheets[0];
  if (!ws) throw new Error('Sheet1 not found in MAA-customers-addresses.xlsx');

  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellText(cell).trim();
  });

  const yellowHits = {};
  const dataRowCount = Math.max(0, ws.rowCount - 1);
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c < headers.length; c++) {
      if (isYellowFill(row.getCell(c).fill)) {
        yellowHits[c] = (yellowHits[c] || 0) + 1;
      }
    }
  }
  const yellowCols = Object.keys(yellowHits)
    .map(Number)
    .filter((c) => yellowHits[c] > dataRowCount * 0.5)
    .sort((a, b) => a - b);

  const codeCol =
    headers.findIndex((h) => headerKey(h) === 'airline code') ||
    yellowCols[0] ||
    1;
  const stationCol = headers.findIndex((h) => headerKey(h) === 'station');
  const operationCol = headers.findIndex((h) => headerKey(h) === 'operation');

  const fieldCols = [];
  for (const col of yellowCols) {
    const field = HEADER_TO_FIELD[headerKey(headers[col])];
    if (field) fieldCols.push({ col, field, header: headers[col] });
  }

  const grouped = new Map();
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const excelCode = cellText(row.getCell(codeCol)).trim();
    if (!excelCode) continue;
    const stationVal = stationCol > 0 ? cellText(row.getCell(stationCol)) : 'CHENNAI';
    if (!isChennaiStation(stationVal)) continue;
    const prefix = excelAirlineCodePrefix(excelCode);
    if (!prefix) continue;
    const payload = {};
    for (const { col, field } of fieldCols) {
      payload[field] = cellText(row.getCell(col)).trim();
    }
    const rec = {
      excelCode,
      prefix,
      operation: operationCol > 0 ? cellText(row.getCell(operationCol)).trim() : '',
      payload,
    };
    const list = grouped.get(prefix) || [];
    list.push(rec);
    grouped.set(prefix, list);
  }

  return {
    sheet: ws.name,
    yellowHeaders: yellowCols.map((c) => headers[c]),
    fieldCols: fieldCols.map((f) => f.field),
    rows: [...grouped.entries()].map(([prefix, list]) => ({
      prefix,
      chosen: pickExcelRow(list),
      skipped: list.length - 1,
    })),
  };
}

function chooseTargetDocs(docs) {
  const maa = docs.filter((d) => normalizeStation(d.stationCode) === STATION);
  if (maa.length) return maa;
  return docs.filter((d) => !normalizeStation(d.stationCode));
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI / MONGODB_URI missing');
    process.exit(1);
  }

  const parsed = await readYellowRows();
  await mongoose.connect(uri);
  const col = mongoose.connection.collection(COLLECTION);

  const summary = {
    stationCode: STATION,
    dryRun: DRY_RUN,
    sheet: parsed.sheet,
    yellowHeaders: parsed.yellowHeaders,
    fields: parsed.fieldCols,
    excelPrefixes: parsed.rows.length,
    matched: 0,
    matchedCodes: [],
    updated: 0,
    skippedNoAirline: [],
    skippedOtherStation: [],
    skippedDuplicateKey: [],
    skippedLongPrefix: [],
  };

  try {
    for (const { prefix, chosen } of parsed.rows) {
      if (!chosen) continue;
      if (prefix.length > 5) {
        summary.skippedLongPrefix.push(`${chosen.excelCode} → ${prefix}`);
        continue;
      }
      const docs = await col.find(maaAirlineFilter(prefix)).toArray();
      const targets = chooseTargetDocs(docs);
      if (!targets.length) {
        if (docs.length) {
          summary.skippedOtherStation.push(`${prefix} (${chosen.excelCode})`);
        } else {
          summary.skippedNoAirline.push(`${prefix} (${chosen.excelCode})`);
        }
        continue;
      }
      summary.matched += 1;
      summary.matchedCodes.push(`${prefix} ← ${chosen.excelCode}`);
      const $set = {
        parentCompanyName: chosen.payload.parentCompanyName || '',
        address: chosen.payload.address || '',
        address2: chosen.payload.address2 || '',
        address3: chosen.payload.address3 || '',
        stateCode: (chosen.payload.stateCode || '').toUpperCase(),
        gstRegistrationNo: (chosen.payload.gstRegistrationNo || '').toUpperCase(),
      };
      for (const doc of targets) {
        const nextSet = { ...$set };
        if (!normalizeStation(doc.stationCode)) nextSet.stationCode = STATION;
        if (DRY_RUN) {
          summary.updated += 1;
          continue;
        }
        try {
          const result = await col.updateOne(
            { _id: doc._id, ...maaAirlineFilter(prefix) },
            { $set: nextSet },
          );
          if (result.modifiedCount || result.matchedCount) summary.updated += 1;
        } catch (err) {
          const code = err && typeof err === 'object' ? err.code : undefined;
          if (code === 11000) {
            summary.skippedDuplicateKey.push(`${prefix} ${String(doc._id)}`);
            continue;
          }
          throw err;
        }
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
