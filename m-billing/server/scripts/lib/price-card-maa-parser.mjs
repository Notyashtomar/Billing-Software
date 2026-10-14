/**
 * Parse Chennai MAA ADS price-card workbook sheets into contract import payloads.
 */
import { classifyBhsConcessionCoverage, concessionNoteTexts } from './bhs-concession-coverage.mjs';
import {
  BHS_GROUPED_AIRCRAFT_CUSTOMERS,
  appendBhsAircraftCondition,
  expandBhsAircraftLabel,
  groupedBhsAircraftLabel,
  remarksForSplitAircraft,
} from './bhs-aircraft-row.mjs';

const SKIP_SHEETS = new Set([
  'Check Points',
  'Check List',
  'List',
  'ULDs',
  'BME Rate',
  'Aeroprime',
  'Akasa',
]);

/** Domestic-only operators at MAA (no intl sector on price card). */
const DOMESTIC_ONLY_SHEETS = new Set(['6E', 'SG', 'OG', 'UK']);

/** International carriers when price card has no explicit DOM/INTL markers. */
const INTERNATIONAL_ONLY_SHEETS = new Set([
  'EK',
  'EY',
  'LH',
  'GF',
  'BG',
  'BI',
  'SL',
  'BS',
  'BJ',
  'YTO',
  'HER',
  'Hercules',
  'AFCOM',
  'FITS',
  'Fits',
]);

/** Sheet name → IATA customer code (default: sheet name uppercased). */
export const SHEET_CUSTOMER_CODE = {
  '6E': '6E',
  Hercules: 'HER',
  AFCOM: 'AFCOM',
  Fits: 'FITS',
  Akasa: 'QP',
  AkasaNew: 'QP',
  'Akasa New': 'QP',
  'Air Asia': 'I5',
  'Salam-Passenger': 'OV',
  'Salam-Cargo': 'OVC',
  QRC: 'QRC',
  OG: 'OG',
  FL: 'FL',
  UK: 'UK',
  ITA: 'AZ',
  CEN: 'C6',
  'HEAPLRom Cargo': 'HER',
  'HEAPL-Aerotrans': 'HER',
  TKF: 'TK',
  'TK-Pax': 'TK',
  'TK-PAX': 'TK',
  CXF: 'CX',
  'ET-PAX': 'ET',
  ETF: 'ET',
  'KE-Pax': 'KE',
  HYF: 'HY',
  'SF-WG': 'WG',
  'DHL Express': 'QY',
  DHL: 'DAL',
  LHF: 'LHF',
  'LHF-1': 'LHF',
  AFKL: 'AF',
  MAIL: '8M',
  CI: 'CIF',
};

const BHS_COLUMN_RE =
  /^(TRND|TRNS|DOM|INTL|TRANSIT|CODE\s*[CE]|UMNR|CARGO|LD3|LD11|PAJ|PMA|ULD|PF$|CREW\s*ASSISTANCE\s*ESCORTING|VIP|TRANSIT|DEPORTEE|DEEP\s*CLEANING|DISINFECTION|HEAD\s*SET|PASSENGER\s*STEPS|WATER\s*UPLIFT|EXTRA\s*STAFF|ADDITONAL\s*MANPOWER|AIRCRAFT\s*DISINFECTION|BREAK\s*COOLING|APRONT?\s*TRANSPORT|PASSENGER\s*COACH|CREW\s*COACH|PAX\s*COACH|PAX$|CREW$|CARGO\s*SUPERVISION|ALL\s*OTHER\s*ULD|FLIGHT\s*PER\s*MONTH|FROM\s*11|ABOVE\s*21)/i;

const VALID_CLAUSE_TYPES = new Set([
  'ferry',
  'technical_landing',
  'return_to_ramp',
  'equipment_standby',
  'disbursements',
  'cpi',
  'free_inclusions',
  'custom',
]);

function cellValue(raw) {
  if (raw == null) return '';
  if (raw instanceof Date) return raw;
  if (typeof raw === 'object') {
    if (raw.result != null) return cellValue(raw.result);
    if (Array.isArray(raw.richText)) return raw.richText.map((p) => p.text ?? '').join('');
    if (raw.text != null) return String(raw.text);
  }
  return raw;
}

function cellText(raw) {
  const v = cellValue(raw);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? '').trim();
}

function cellNumber(raw) {
  const v = cellValue(raw);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').replace(/,/g, '').trim();
  if (!s || /%|collection|included|foc|note|per/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeKey(s) {
  return String(s ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const MONTH_INDEX = {
  JAN: 0,
  JANUARY: 0,
  FEB: 1,
  FEBRUARY: 1,
  MAR: 2,
  MARCH: 2,
  APR: 3,
  APRIL: 3,
  MAY: 4,
  JUN: 5,
  JUNE: 5,
  JUL: 6,
  JULY: 6,
  AUG: 7,
  AUGUST: 7,
  SEP: 8,
  SEPT: 8,
  SEPTEMBER: 8,
  OCT: 9,
  OCTOBER: 9,
  NOV: 10,
  NOVEMBER: 10,
  DEC: 11,
  DECEMBER: 11,
};

function isOpenEndedTo(raw) {
  const s = normalizeKey(cellText(raw));
  return /^(OPEN|OPEN ENDED|OPEN-ENDED|TBD|TILL FURTHER|AS PER.*CONTRACT)$/.test(s);
}

function parseLooseDateText(s) {
  const text = String(s ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return new Date(`${text.slice(0, 10)}T00:00:00`);
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/i.test(text)) {
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) {
      const d = startOfLocalDay(new Date(parsed));
      if (d.getFullYear() >= 2010 && d.getFullYear() <= 2100) return d;
    }
  }
  const dmy = text.match(
    /^(\d{1,2})[\/\-.\s]+([A-Za-z]{3,9}|\d{1,2})[\/\-.\s]+(\d{4})$/,
  );
  if (dmy) {
    const day = Number(dmy[1]);
    const year = Number(dmy[3]);
    const monthToken = dmy[2].toUpperCase();
    const month = MONTH_INDEX[monthToken] ?? (Number(monthToken) >= 1 ? Number(monthToken) - 1 : -1);
    if (month >= 0 && day >= 1 && day <= 31 && year >= 2010 && year <= 2100) {
      return new Date(year, month, day);
    }
  }
  const named = text.match(
    /(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/,
  );
  if (named) {
    const month = MONTH_INDEX[named[2].toUpperCase()];
    const day = Number(named[1]);
    const year = Number(named[3]);
    if (month != null && day >= 1 && year >= 2010 && year <= 2100) {
      return new Date(year, month, day);
    }
  }
  return null;
}

function parseDateCell(raw, opts = {}) {
  if (opts.allowOpen && isOpenEndedTo(raw)) return new Date(2099, 11, 31);
  const v = cellValue(raw);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const d = startOfLocalDay(v);
    return d.getFullYear() >= 2010 && d.getFullYear() <= 2100 ? d : null;
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    const utc = new Date(Date.UTC(1899, 11, 30 + Math.floor(v)));
    const d = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
    return d.getFullYear() >= 2010 && d.getFullYear() <= 2100 ? d : null;
  }
  return parseLooseDateText(cellText(raw));
}

function formatIsoDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Delhi tabs that the Chennai code map sends to the wrong airline. */
const DELHI_SHEET_CUSTOMER_CODE = {
  CI: 'CI',
  MAIL: 'MAIL',
  'DHL Express': 'DHLE',
  DHL: 'DHL',
};

/** Cochin workbook tabs → IATA customer code (same codes as the airline master). */
const COK_SHEET_CUSTOMER_CODE = {
  'SL-COK': 'SL',
  'OD-COK': 'OD',
  'J9-COK': 'J9',
  AIX: 'IX',
  'QP-New': 'QP',
};

function customerCodeForSheet(sheetName, stationCode = 'MAA') {
  const station = String(stationCode).toUpperCase();
  if (station === 'DEL' && DELHI_SHEET_CUSTOMER_CODE[sheetName]) {
    return DELHI_SHEET_CUSTOMER_CODE[sheetName];
  }
  if (station === 'COK' && COK_SHEET_CUSTOMER_CODE[sheetName]) {
    return COK_SHEET_CUSTOMER_CODE[sheetName];
  }
  return SHEET_CUSTOMER_CODE[sheetName] ?? sheetName.toUpperCase();
}

function contractSuffixForSheet(sheetName) {
  return /CARGO|TKF|ETF|CXF|HYF|^LHF|DHL/i.test(sheetName) ? 'CARGO' : 'SGHA';
}

function contractNumberForSheet(sheetName, stationCode = 'MAA') {
  const station = String(stationCode ?? 'MAA').trim().toUpperCase() || 'MAA';
  const suffix = contractSuffixForSheet(sheetName);
  return `${customerCodeForSheet(sheetName, station)}-${station}-${suffix}`;
}

function sheetSlug(sheetName) {
  return String(sheetName ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Two Delhi sheets must not collapse into one contract. The later end date keeps the shared number. */
function assignDelhiContractNumbers(sheets) {
  const groups = new Map();
  for (const sheet of sheets) {
    const list = groups.get(sheet.contractNumber) ?? [];
    list.push(sheet);
    groups.set(sheet.contractNumber, list);
  }
  const out = [];
  for (const [number, list] of groups) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    const ranked = [...list].sort((a, b) => String(b.priceValidTo).localeCompare(String(a.priceValidTo)));
    ranked.forEach((sheet, index) => {
      if (index === 0) {
        out.push(sheet);
        return;
      }
      const suffix = number.endsWith('-CARGO') ? 'CARGO' : 'SGHA';
      const station = sheet.stationCode || 'DEL';
      out.push({ ...sheet, contractNumber: `${sheetSlug(sheet.sheetName)}-${station}-${suffix}` });
    });
  }
  return out;
}

function isFromLabel(key) {
  return key === 'FROM' || key === 'STARTING DATE' || key === 'START DATE' || key === 'VALID FROM';
}

function isToLabel(key) {
  return key === 'TO' || key === 'ENDING DATE' || key === 'END DATE' || key === 'VALID TO';
}

function isFromToHeader(c1, c2) {
  return isFromLabel(c1) && isToLabel(c2);
}

function isSnoLabel(key) {
  const k = String(key ?? '').replace(/\.+$/, '');
  return k === 'S.NO' || k === 'S NO' || k === 'SNO';
}

function isClauseLabel(key) {
  return /^(CLAUSE|CLAUSES|NOTE|NOTES|TERM|TERMS)$/.test(String(key ?? ''));
}

/** @returns {Array<{ row: number, fromCol: number, toCol: number }>} */
function findHeaderRows(sheet) {
  const clauseStart = findClauseStart(sheet);
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (clauseStart && rowNumber >= clauseStart) return;
    const cells = [];
    for (let col = 1; col <= 8; col++) {
      cells.push({ col, key: normalizeKey(cellText(row.getCell(col).value)) });
    }
    for (let i = 0; i < cells.length - 1; i++) {
      if (isFromToHeader(cells[i].key, cells[i + 1].key)) {
        rows.push({ row: rowNumber, fromCol: cells[i].col, toCol: cells[i + 1].col });
        return;
      }
    }
  });
  return rows;
}

function findClauseStart(sheet) {
  let start = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (start) return;
    const c1 = normalizeKey(cellText(row.getCell(1).value));
    const c2 = normalizeKey(cellText(row.getCell(2).value));
    const c3 = normalizeKey(cellText(row.getCell(3).value));
    if (isSnoLabel(c1) && (isClauseLabel(c2) || isClauseLabel(c3))) start = rowNumber;
  });
  return start;
}

function rowCells(sheet, rowNumber) {
  const map = new Map();
  sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, col) => {
    map.set(col, cell.value);
  });
  return map;
}

function rowHasPrices(sheet, rowNumber) {
  const cells = rowCells(sheet, rowNumber);
  for (const [col, raw] of cells) {
    if (col < 4) continue;
    const n = cellNumber(raw);
    if (n != null && n > 0) return true;
  }
  return false;
}

function pickBestRateCandidate(candidates, asOfDay) {
  if (candidates.length === 0) return null;
  const overlapping = candidates.filter((c) => c.from <= asOfDay && c.to >= asOfDay);
  const pricedOverlap = overlapping.filter((c) => c.hasPrices);
  if (pricedOverlap.length) return pricedOverlap[pricedOverlap.length - 1];
  if (overlapping.length) return overlapping[overlapping.length - 1];
  return candidates[candidates.length - 1];
}

function pickValidTillRow(sheet, asOf) {
  const asOfDay = startOfLocalDay(asOf);
  const candidates = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const text = cellText(row.getCell(1).value);
    const match = text.match(/valid(?:ity)?\s*(?:till|until|to)\s+(.+)$/i);
    if (!match) return;
    const to = parseLooseDateText(match[1]);
    if (!to) return;
    if (!rowHasPrices(sheet, rowNumber)) return;
    const from = new Date(to.getFullYear() - 1, to.getMonth(), to.getDate() + 1);
    candidates.push({ row: rowNumber, from, to, hasPrices: true });
  });
  return pickBestRateCandidate(candidates, asOfDay);
}

function pickRateRow(sheet, headerRow, asOf, fromCol = 1, toCol = 2, options = {}) {
  const backfill = options.backfill !== false;
  const asOfDay = startOfLocalDay(asOf);
  const clauseStart = findClauseStart(sheet);
  const last = clauseStart ? clauseStart - 1 : Math.min(sheet.rowCount, headerRow + 40);
  const candidates = [];
  for (let r = headerRow + 1; r <= last; r++) {
    const cells = rowCells(sheet, r);
    const from = parseDateCell(cells.get(fromCol));
    const toText = cellText(cells.get(toCol));
    let to = parseDateCell(cells.get(toCol), { allowOpen: true });
    let openEnded = isOpenEndedTo(cells.get(toCol));
    if (from && !to && toText) {
      to = new Date(2099, 11, 31);
      openEnded = true;
    }
    if (to && to.getFullYear() >= 2090) openEnded = true;
    if (!from || !to || from > to) continue;
    candidates.push({ row: r, from, to, hasPrices: rowHasPrices(sheet, r), openEnded });
  }
  const dated = pickBestRateCandidate(candidates, asOfDay);
  const till = pickValidTillRow(sheet, asOf);
  const chosen =
    till && (!dated || (dated.to < asOfDay && till.to >= asOfDay)) ? till : dated ?? till;
  if (!chosen) return null;
  const filledCells = new Map();
  if (!backfill) {
    // Delhi: merge non-open covering rows oldest → newest so addenda can fill
    // different columns (VJ BHS vs equipment, C6 A320 vs A330). Skip open-ended
    // legacy rows so blank 2026 package columns are not filled from old addenda (AF).
    const covering = candidates
      .filter((c) => c.from <= asOfDay && c.to >= asOfDay && !c.openEnded)
      .sort((a, b) => a.from - b.from || a.row - b.row);
    const latest = covering.length ? covering[covering.length - 1] : chosen;
    const source = covering.length ? covering : [chosen];
    for (const c of source) {
      const cells = rowCells(sheet, c.row);
      for (const [col, raw] of cells) {
        if (col < 4) continue;
        const n = cellNumber(raw);
        if (n != null && n > 0) filledCells.set(col, raw);
      }
    }
    return { ...latest, filledCells };
  }
  if (backfill) {
    for (const c of candidates) {
      if (c.row > chosen.row) continue;
      const cells = rowCells(sheet, c.row);
      for (const [col, raw] of cells) {
        if (col < 4) continue;
        const n = cellNumber(raw);
        if (n != null && n > 0) filledCells.set(col, raw);
      }
    }
  }
  const chosenCells = rowCells(sheet, chosen.row);
  for (const [col, raw] of chosenCells) {
    if (col < 4) filledCells.set(col, raw);
    else if (backfill) {
      const n = cellNumber(raw);
      if (n != null && n > 0) filledCells.set(col, raw);
    } else {
      filledCells.set(col, raw);
    }
  }
  return { ...chosen, filledCells };
}

/** Cochin: each dated row that covers as-of is its own rate (Dom / Intl / Engineering). */
function listCokRateRows(sheet, headerRow, asOf, fromCol = 1, toCol = 2) {
  const asOfDay = startOfLocalDay(asOf);
  const clauseStart = findClauseStart(sheet);
  const last = clauseStart ? clauseStart - 1 : Math.min(sheet.rowCount, headerRow + 80);
  const candidates = [];
  for (let r = headerRow + 1; r <= last; r++) {
    const cells = rowCells(sheet, r);
    const from = parseDateCell(cells.get(fromCol));
    const toText = cellText(cells.get(toCol));
    let to = parseDateCell(cells.get(toCol), { allowOpen: true });
    let openEnded = isOpenEndedTo(cells.get(toCol));
    if (from && !to && toText) {
      to = new Date(2099, 11, 31);
      openEnded = true;
    }
    if (to && to.getFullYear() >= 2090) openEnded = true;
    if (!from || !to || from > to) continue;
    if (!rowHasPrices(sheet, r)) continue;
    candidates.push({ row: r, from, to, hasPrices: true, openEnded, filledCells: cells });
  }
  const covering = candidates.filter((c) => c.from <= asOfDay && c.to >= asOfDay);
  const closed = covering.filter((c) => !c.openEnded);
  const chosen = closed.length ? closed : covering.length ? covering : candidates.slice(-1);
  if (!chosen.length) return [];
  const latest = chosen[chosen.length - 1];
  const older = candidates.filter((c) => c.row < latest.row && (closed.length === 0 || !c.openEnded));
  for (const prev of [...older].reverse()) {
    for (const [col, raw] of prev.filledCells) {
      if (col < 4) continue;
      if (cellNumber(raw) == null) continue;
      if (chosen.some((row) => cellNumber(row.filledCells.get(col)) != null)) continue;
      latest.filledCells.set(col, raw);
    }
  }
  return chosen;
}

function cokRowContext(sheet, rowNumber, headerMeta) {
  const texts = [];
  const lastLabelCol = Math.max(headerMeta.toCol + 1, 3);
  for (let col = 1; col <= lastLabelCol; col++) {
    texts.push(cellTextAt(sheet, rowNumber, col));
  }
  const blob = texts.filter(Boolean).join(' ');
  const sector = inferExplicitSector(blob);
  const engineering = /engineering/i.test(blob);
  return { blob, sector, engineering };
}

function extractAircraftTypes(headerText) {
  const h = normalizeKey(headerText);
  if (!h || BHS_COLUMN_RE.test(h)) return [];
  if (/^(WCHR|WCHS|WCHC|GPU|ACU|ASU|AMB|PB|PUSH|TOW|WS|TS|BC|PSL|EBC|IST|HS|WC|STEP|WATER|CREW|MANPOWER)/.test(h)) {
    return [];
  }
  return String(headerText)
    .split(/[/,]|\bor\b/gi)
    .map((p) => p.replace(/\([^)]*\)/g, '').trim().toUpperCase())
    .filter((p) => p.length >= 2 && !/^(DOM|INTL|CODE|NB|WB)$/.test(p));
}

function inferBillingFlightCategory(billingRef) {
  const b = normalizeKey(billingRef);
  if (b === 'DOM' || b.startsWith('DOMESTIC')) return 'Dom';
  if (b === 'INTL' || b === 'INT' || b.startsWith('INTERNATIONAL')) return 'Int';
  if (b.startsWith('TRNS')) return 'Int';
  if (b.startsWith('TRND')) return 'Dom';
  if (/CHARTER/.test(b) && /INTL|INTERNATIONAL/.test(b)) return 'Int';
  if (/CHARTER/.test(b)) return 'Dom';
  return null;
}

/**
 * Sector written on the Delhi sheet.
 * DOM / DOMESTIC → Dom. INTL / INLT / INTERNATIONAL → Int.
 * A cell that says both (for example "Dom & Intl") is one price for both.
 * TRND / TRNS / per turnaround are not sectors on the Delhi card.
 */
export function inferExplicitSector(raw) {
  const b = normalizeKey(raw);
  if (!b || b.length > 80) return null;
  const hasDom = /\bDOMESTIC\b/.test(b) || /(?:^|[^A-Z])DOM(?:[^A-Z]|$)/.test(b);
  const hasInt = /\bINTERNATIONAL\b/.test(b) || /\bINTL\b/.test(b) || /\bINLT\b/.test(b);
  if (hasDom && hasInt) return 'Both';
  if (hasDom) return 'Dom';
  if (hasInt) return 'Int';
  return null;
}

function cellTextAt(sheet, rowNumber, col) {
  const cell = sheet.getRow(rowNumber).getCell(col);
  let value = cell.value;
  if ((value == null || value === '') && cell.master && cell.master !== cell) {
    value = cell.master.value;
  }
  return cellText(value);
}

function delhiColumnSector(equipmentHeader, sectorLabel, billingRef) {
  return (
    inferExplicitSector(equipmentHeader) ||
    inferExplicitSector(sectorLabel) ||
    inferExplicitSector(billingRef) ||
    null
  );
}

function delhiPackageSector(equipmentHeader, sectorLabel, billingRef, flightCategories, delhiStation) {
  if (!delhiStation) {
    const cat =
      inferBillingFlightCategory(sectorLabel) ||
      inferBillingFlightCategory(billingRef) ||
      inferBillingFlightCategory(equipmentHeader) ||
      (flightCategories.length === 1 ? flightCategories[0] : 'Dom');
    return { category: cat === 'Int' ? 'Int' : 'Dom', appliesToBoth: false };
  }
  const explicit = delhiColumnSector(equipmentHeader, sectorLabel, billingRef);
  if (explicit === 'Dom' || explicit === 'Int') return { category: explicit, appliesToBoth: false };
  if (explicit === 'Both') return { category: 'Dom', appliesToBoth: true };
  const hasDom = flightCategories.includes('Dom');
  const hasInt = flightCategories.includes('Int');
  if (hasDom && hasInt) return { category: 'Dom', appliesToBoth: true };
  if (hasInt) return { category: 'Int', appliesToBoth: false };
  if (hasDom) return { category: 'Dom', appliesToBoth: false };
  return { category: 'Dom', appliesToBoth: false };
}

function extractBhsAircraftLabel(equipmentHeader) {
  const h = String(equipmentHeader ?? '').replace(/\s+/g, ' ').trim();
  const n = normalizeKey(h);
  const ac = h.match(
    /\b(A3\d{2}(?:-\d{2,4})?|A380|A350|B7\d{2}F?(?:-\w+)?(?:-\d+)?|MD1[01]|Q400|ATR[-\s]?\d{2,3}|B737(?:-MAX)?(?:-?\d)?)\b/i,
  );
  if (ac) return ac[1].toUpperCase().replace(/\s+/g, '-');
  const band = (n.match(/(\d+\s*-\s*\d+|\d+\s+AND ABOVE)/) || [])[1] || '';
  if (/COMPREHENSIVE/.test(n)) return `COMP ${band || 'HANDLING'}`.trim().slice(0, 40);
  if (/RAMP HANDLING/.test(n)) return `RAMP ${band || 'HANDLING'}`.trim().slice(0, 40);
  if (/TERMINAL HANDLING/.test(n)) return 'TERMINAL';
  if (/LOAD CONTROL/.test(n)) return 'LOAD CONTROL';
  if (/CHARTER/.test(n)) return /INTL|INTERNATIONAL/.test(n) ? 'CHARTER-INT' : 'CHARTER-DOM';
  if (isDelhiCargoPackageVariant(equipmentHeader)) {
    return /TECHNICAL/.test(n) ? 'Technical' : 'Transit';
  }
  const cleaned = h.replace(/\([^)]*\)/g, '').trim();
  return cleaned.slice(0, 40);
}

function prefixedAdsServiceCode(code, kind) {
  const raw = String(code ?? '').trim();
  if (!raw) return '';
  if (/^(scheduled|non scheduled|raf)\s*-/i.test(raw)) return raw;
  if (kind === 'manpower') return `Scheduled - Manpower - ${raw}`;
  return `Scheduled - Equipment - ${raw}`;
}

function contractCategoryFromFlightCategories(flightCategories, stationCode = 'MAA') {
  if (flightCategories.includes('Dom') && flightCategories.includes('Int')) return 'Both';
  if (flightCategories.includes('Dom')) return 'Dom';
  if (flightCategories.includes('Int')) return 'Int';
  // Delhi: no Domestic/International words on the sheet → do not invent both.
  if (String(stationCode).toUpperCase() === 'DEL') return '';
  return 'Both';
}

function detectDelhiFlightCategories(sheet, headerRows) {
  let hasDom = false;
  let hasInt = false;
  let hasFreighter = false;
  for (const headerMeta of headerRows) {
    const headerRow = headerMeta.row;
    const billingRefRow = headerRow > 1 ? headerRow - 1 : headerRow;
    const sectorRow = headerRow > 2 ? headerRow - 2 : billingRefRow;
    const maxCol = Math.max(sheet.columnCount || 0, 4);
    for (let col = 4; col <= maxCol; col++) {
      for (const row of [headerRow, billingRefRow, sectorRow]) {
        const raw = cellTextAt(sheet, row, col);
        const sector = inferExplicitSector(raw);
        if (sector === 'Dom' || sector === 'Both') hasDom = true;
        if (sector === 'Int' || sector === 'Both') hasInt = true;
        const n = normalizeKey(raw);
        // B777F / MD11 freighter columns — cargo cards often omit Dom/Int labels.
        if (/\b(B7\d{2}F|MD1[01]|B747[\s-]?F|A33\dF|FREIGHTER)\b/.test(n)) {
          hasFreighter = true;
        }
      }
    }
  }
  // Freighter/cargo sheets without sector words → Int (matches International-Cargo prep).
  if (!hasDom && !hasInt && hasFreighter) hasInt = true;
  const categories = [];
  if (hasDom) categories.push('Dom');
  if (hasInt) categories.push('Int');
  return categories;
}

function detectFlightCategories(sheet, headerRows, sheetName, stationCode = 'MAA') {
  if (String(stationCode).toUpperCase() === 'DEL') {
    return detectDelhiFlightCategories(sheet, headerRows);
  }
  let hasDom = false;
  let hasInt = false;
  /** aircraft header → { trnd, trns } for TRND/TRNS pairs on same band. */
  const aircraftBands = new Map();

  for (const headerMeta of headerRows) {
    const headerRow = headerMeta.row;
    const billingRefRow = headerRow > 1 ? headerRow - 1 : headerRow;
    const headerCells = rowCells(sheet, headerRow);
    const billingCells = rowCells(sheet, billingRefRow);
    const maxCol = Math.max(...headerCells.keys(), ...billingCells.keys(), 3);

    for (let col = 4; col <= maxCol; col++) {
      const equipmentHeader = cellText(headerCells.get(col));
      const billingRef = cellText(billingCells.get(col));
      if (!equipmentHeader && !billingRef) continue;

      const cat = inferBillingFlightCategory(billingRef);
      if (cat === 'Dom') hasDom = true;
      if (cat === 'Int') hasInt = true;

      if (isBhsOnlyColumn(equipmentHeader, billingRef)) {
        const bandKey = normalizeKey(equipmentHeader);
        if (bandKey) {
          const entry = aircraftBands.get(bandKey) ?? { trnd: false, trns: false };
          const ref = normalizeKey(billingRef);
          if (ref.startsWith('TRND')) entry.trnd = true;
          if (ref.startsWith('TRNS')) entry.trns = true;
          aircraftBands.set(bandKey, entry);
        }
      }
    }
  }

  for (const entry of aircraftBands.values()) {
    if (entry.trnd && entry.trns) {
      hasDom = true;
      hasInt = true;
    }
  }

  if (String(stationCode).toUpperCase() === 'COK') {
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 45) return;
      for (let col = 1; col <= 8; col++) {
        const sector = inferExplicitSector(cellText(row.getCell(col).value));
        if (sector === 'Dom' || sector === 'Both') hasDom = true;
        if (sector === 'Int' || sector === 'Both') hasInt = true;
      }
    });
  }

  const categories = [];
  if (hasDom) categories.push('Dom');
  if (hasInt) categories.push('Int');

  if (categories.length === 0) {
    if (stationCode !== 'DEL' && stationCode !== 'COK' && DOMESTIC_ONLY_SHEETS.has(sheetName)) return ['Dom'];
    if (stationCode !== 'DEL' && stationCode !== 'COK' && INTERNATIONAL_ONLY_SHEETS.has(sheetName)) return ['Int'];
    return ['Dom', 'Int'];
  }

  return categories;
}

function expandRulesForFlightCategories(rules, flightCategories, stationCode = 'MAA') {
  if (String(stationCode).toUpperCase() === 'DEL') {
    const sheetBoth = flightCategories.includes('Dom') && flightCategories.includes('Int');
    const only = flightCategories.length === 1 ? flightCategories[0] : null;
    const expanded = [];
    for (const rule of rules) {
      if (rule.category === 'Dom' || rule.category === 'Int') {
        expanded.push(rule);
        continue;
      }
      // Column says both, or the sheet has both sectors and this column names neither:
      // one shared price, saved on Dom and on Int.
      if (rule.category === 'Both' || (rule.category == null && sheetBoth)) {
        expanded.push({ ...rule, category: 'Dom' }, { ...rule, category: 'Int' });
        continue;
      }
      if (only) {
        expanded.push({ ...rule, category: only });
        continue;
      }
      const { category: _ignored, ...rest } = rule;
      expanded.push(rest);
    }
    return expanded;
  }

  if (flightCategories.length <= 1) {
    const only = flightCategories[0];
    return rules.map((rule) => ({
      ...rule,
      category: rule.category ?? only,
    }));
  }

  const expanded = [];
  for (const rule of rules) {
    if (rule.category === 'Dom' || rule.category === 'Int') {
      expanded.push(rule);
      continue;
    }
    for (const category of flightCategories) {
      expanded.push({ ...rule, category });
    }
  }
  return expanded;
}

function inferServiceCode(equipmentHeader, billingRef = '') {
  const h = normalizeKey(equipmentHeader);
  const ref = normalizeKey(billingRef);
  const combined = `${h} ${ref}`;

  if (/WCHR\s*\/\s*S\s*\/\s*C|WCHR\/S\/C|WCHR\/S\/WCHC|WCHR\/S\b|WCHR\/S\/C/.test(combined)) return 'WCHR';
  if (/^WCHR\/S$|^WCHR\/S\b|WCHR\/S(?!\/)/.test(h) && !/WCHC/.test(h)) return 'WCHR';
  if (/^WCHR\b/.test(h)) return 'WCHR';
  if (/^WCHS\b/.test(h)) return 'WCHS';
  if (/^WCHC\b/.test(h)) return 'WCHC';

  if (/GPU.*180|GPU.*WB|GPU WB/.test(combined)) return 'GPU-WB';
  if (/GPU.*140|GPU.*90|GPU.*NB|GPU NB|GPU HALF/.test(combined)) return 'GPU-NB';
  if (/^GPU\b/.test(h)) return 'GPU-NB';

  if (/ACU.*WB|ACU WB/.test(combined)) return 'ACU-WB';
  if (/ACU.*NB|ACU NB|^ACU\b/.test(combined)) return 'ACU-NB';

  if (/ASU.*WB/.test(combined)) return 'ASU-WB';
  if (/^ASU\b/.test(h)) return 'ASU-NB';

  if (/^AMB\b|STRETCHER/.test(h)) return 'AMB';
  if (/^PB\b|PUSH\s*BACK|PBNB/.test(h)) return 'PBNB';
  if (/SHORT\s*TOW|^IST\b/.test(h)) return 'PTOW';
  if (/LONG\s*TOW|^TOW\b|TOWING|PTOW/.test(h)) return 'PTOW';
  if (/^WS\b|WATER\s*SERVICE|WATER\s*UPLIFT|^WU\b/.test(h)) return 'PS-WS';
  if (/^TS\b|TOILET/.test(h)) return 'PS-TS';
  if (/^BC\b|BLUE\s*COLLAR/.test(h)) return 'BC';
  if (/^WC\b/.test(h) && !/WCHR|WCHS|WCHC/.test(h)) return 'WC';
  if (/PSL|TOWABLE/.test(combined)) return 'PSL-Towable';
  if (/^HS\b|HEAT/.test(h)) return 'HS';
  if (/STEP\s*LADDER/.test(combined)) return 'Step-Ladder';

  return '';
}

function mapUomToken(raw) {
  const t = normalizeKey(raw);
  if (!t) return '';
  if (/^(HYD|MAA|DEL|BLR|BOM|CCU|GOI|COK|TRV|PNQ|AMD|GAU|IXC|IXB|HYDERABAD|CHENNAI|LOCATION|UOM|DOMESTIC|INTERNATIONAL)$/.test(t)) {
    return '';
  }
  if (/^PF$|PER\s*FLIGHT|PSPF/.test(t)) return 'Per Flight';
  if (/^PM$|PER\s*MONTH|PSPM/.test(t)) return 'Per Month';
  if (/^PS$|PER\s*SERVICE|PSPR/.test(t)) return 'Per Service';
  if (/^PU$|PER\s*UNIT/.test(t)) return 'Per Unit';
  if (/^PUM$|PER\s*MINOR|UNACCOMPANIED/.test(t)) return 'Per minor';
  if (/^PTD$/.test(t)) return 'Per Hour';
  if (/^PST$|PER\s*START/.test(t)) return 'Per start';
  if (/^PTW$|^PTOW$|PER\s*TOW/.test(t)) return 'Per Tow';
  if (/^PP$|PER\s*PUSH/.test(t)) return 'Per push/tow';
  if (/^PTRIP$|PER\s*TRIP|^PT$/.test(t)) return 'Per Trip';
  if (/^PSHIFT$|PER\s*SHIFT/.test(t)) return 'Per valet/shift';
  if (/^PH$|PER\s*HOUR|PSPH|HOUR OR PART/.test(t)) return 'Per Hour';
  if (/^PL$|PER\s*LIFT/.test(t)) return 'EA';
  if (/^PULD$|\bULD\b/.test(t)) return 'ULD';
  if (/^PTRND$|PER\s*TURNAROUND/.test(t)) return 'Per Turnaround';
  if (/TONNE|P TONNE|PTONNE/.test(t)) return 'Per Unit';
  if (/30\s*MIN|HALF\s*HOUR|HALF\s*HR/.test(t)) return 'Per Half Hour';
  if (/15\s*MIN/.test(t)) return 'Per 15 Minutes';
  if (/PER\s*PAX|PER\s*PASSENGER/.test(t)) return 'Per passenger';
  if (/^EA$/.test(t)) return 'EA';
  if (/^HR$|^MIN$|^FLIGHT$|^TRIP$/.test(t)) return t === 'HR' ? 'HR' : t === 'MIN' ? 'MIN' : t === 'TRIP' ? 'TRIP' : 'FLIGHT';
  if (/^MAX\s*\d+\s*MIN/.test(t)) return 'MIN';
  if (t.length <= 12 && /^[A-Z0-9 /]+$/.test(t) && !/\d{4}/.test(t)) return '';
  return '';
}

function inferUom(billingRef, equipmentHeader = '') {
  const mapped = mapUomToken(billingRef);
  if (mapped) return mapped;
  const text = normalizeKey(`${billingRef} ${equipmentHeader}`);
  if (/WCHR|WCHS|WCHC|WHEEL/.test(text)) return 'EA';
  if (/PER\s*15\s*MIN|15\s*MIN/.test(text)) return 'Per 15 Minutes';
  if (/HALF\s*HR|HALF\s*HOUR|PART\s*THEREOF/.test(text)) return 'Per Half Hour';
  if (/PER\s*60\s*MIN|PER\s*HOUR|\bPH\b|HOUR OR PART|REMOTE BAY PER HOUR/.test(text)) return 'Per Hour';
  if (/PER\s*MINUTE|\bMIN\b/.test(text)) return 'MIN';
  if (/PER\s*START|\bPST\b/.test(text)) return 'Per start';
  if (/PER\s*TOW|PTOW|PTW/.test(text)) return 'Per Tow';
  if (/PER\s*PUSH|\bPP\b/.test(text)) return 'Per push/tow';
  if (/PER\s*SERVICE|\bPS\b/.test(text)) return 'Per service';
  if (/PER\s*TRIP|\bPTRIP\b/.test(text)) return 'Per Trip';
  if (/PER\s*MONTH|\bPM\b|PSPM/.test(text)) return 'Per Month';
  if (/PER\s*UNIT|\bPU\b/.test(text)) return 'Per Unit';
  if (/PER\s*LIFT/.test(text)) return 'EA';
  if (/PER\s*FLIGHT|\bPF\b/.test(text)) return 'Per Flight';
  if (/PER\s*PAX|PASSENGER/.test(text) && /MASS|PAX/.test(text)) return 'Per passenger';
  if (/WCHR|WCHS|WCHC|WCH/.test(text)) return 'EA';
  return 'Per service';
}

function parseFreeAllowance(billingRef, equipmentHeader, serviceCode) {
  const local = `${billingRef} ${equipmentHeader}`;
  const lower = local.toLowerCase();

  if (/not included|additional charge|at additional|chargeable when|no foc|not in bhs/i.test(lower)) {
    if (/one\s*service\s*included|one\s*pb\s*included|one\s*push|included in bhs|included in bh|included in turnaround|inc\. in bhs|i serv\. included|one included|one foc|\(\s*one\s*foc\s*\)/i.test(lower)) {
      // mixed — fall through
    } else if (!/^WCH/.test(serviceCode)) {
      return 0;
    }
  }

  if (serviceCode === 'PBNB' && /one\s*service\s*included|one\s*pb\s*included|one\s*push\s*back\s*included|\(one\s*pushback\s*included\)|one\s*push\s*back\s*\(one\s*foc\)/i.test(local)) {
    return 1;
  }
  if ((serviceCode === 'PS-WS' || serviceCode === 'PS-TS') && /one\s*service\s*included/i.test(local)) {
    return 1;
  }
  if (serviceCode === 'PSL-Towable') {
    if (/1\s*psl\s*at\s*aerobridge|1\s*psi\s*at\s*aerobridge/i.test(local)) return 1;
    if (/2\s*psl.*remote|2\s*psi.*remote/i.test(local)) return 2;
    if (/(\d+)\s*psl|(\d+)\s*psi/i.test(local)) {
      const m = local.match(/(\d+)\s*psl|(\d+)\s*psi/i);
      return Number(m[1] ?? m[2] ?? 0);
    }
  }

  if (/^WCH/.test(serviceCode)) {
    const isMonthlyPool = /per\s*month/i.test(local) && !/per\s*flight/i.test(local);
    if (!isMonthlyPool) {
      const perFlightMatch = local.match(
        /(\d+)\s*(?:WCHR|WCHS|WCHC|WCH)[/\sS/C]*(?:per\s*flight|included in bh|included in bhs|complimentary)/i,
      );
      if (perFlightMatch) return Number(perFlightMatch[1]);
    }
    const nbWbMatch = local.match(/(\d+)\s*for\s*nb[^0-9]*(\d+)\s*for\s*wb/i);
    if (nbWbMatch) return Math.max(Number(nbWbMatch[1]), Number(nbWbMatch[2]));
  }

  if (/upto\s*2|\(\s*2\s*inc\.?\s*in\s*bhs\s*\)|\(\s*2\s*service\s*foc|\b2\s*psi\b/i.test(local)) {
    if (serviceCode === 'PSL-Towable') return 2;
  }

  const foc = local.match(/(\d+)\s*FOC\b/i);
  if (foc) return Number(foc[1]);

  return 0;
}

function parseWheelchairSplit(clauseTexts) {
  const text = clauseTexts.join(' ');
  const nbWb = text.match(/(\d+)\s*for\s*NB[^0-9]*(\d+)\s*for\s*WB/i);
  if (nbWb) return { free: Number(nbWb[1]), freeNb: Number(nbWb[1]), freeWb: Number(nbWb[2]) };

  const perFlight = text.match(
    /(\d+)\s*(?:WCHR|WCHS|WCHC|WCH)[/\sS/C/R]*(?:per\s*flight|included in bh|included in bhs|complimentary)/i,
  );
  if (perFlight) {
    const snippet = text.slice(perFlight.index ?? 0, (perFlight.index ?? 0) + 120);
    if (!/per\s*month/i.test(snippet)) {
      const n = Number(perFlight[1]);
      return { free: n, freeNb: n, freeWb: n };
    }
  }
  return null;
}

function isBhsOnlyColumn(equipmentHeader, billingRef) {
  const h = normalizeKey(equipmentHeader);
  const ref = normalizeKey(billingRef);
  if (BHS_COLUMN_RE.test(h)) return true;
  if (/^TRND|^TRNS|^DOM$|^INTL$|^CODE\s*[CE]$/.test(h)) return true;
  if (/^TRND|^TRNS|^DOM$|^INTL$/.test(ref) && extractAircraftTypes(equipmentHeader).length > 0) return true;
  if (/FLIGHT PER MONTH|FROM 11-20|ABOVE 21/.test(h)) return true;
  return false;
}

function isNoiseColumn(equipmentHeader) {
  const h = normalizeKey(equipmentHeader);
  if (!h) return true;
  if (/^(REMARKS?|REFER|NOTE|NOTES|ACTION)$/.test(h)) return true;
  if (/IRREGULAR OPERTION|IROPS|HOTAC|HOTEL ACCOM|ACTUAL COST/.test(h)) return true;
  if (/^\d+\s*[-–]\s*\d+$/.test(h)) return true;
  if (/USAGE COST|ALL WIDE BODY AIRCRAFT/.test(h)) return true;
  if (/^(COST|TC|SM|FL|CONS)$/.test(h)) return true;
  return false;
}

function isBhsPackageColumn(equipmentHeader, billingRef = '') {
  const h = normalizeKey(equipmentHeader);
  const ref = normalizeKey(billingRef);
  if (/^(TRND|TRNS|DOM|INTL|CODE\s*[CE])$/.test(h)) return true;
  if (/^(TRND|TRNS|DOM|INTL)$/.test(ref) && extractAircraftTypes(equipmentHeader).length > 0) {
    return true;
  }
  if (
    /RAMP HANDLING|TERMINAL HANDLING|LOAD CONTROL|COMPREHENSIVE HANDLING|FLIGHT PER MONTH|CHARTER FLIGHTS|FROM \d|AND ABOVE/.test(
      h,
    )
  ) {
    return true;
  }
  if (
    /^(A\d{2,3}|B\d{3}|Q\d{3}|ATR)/.test(h) &&
    !/GPU|ACU|ASU|WCH|AMB|PUSH|TOW|COACH|PSL|WATER|TOILET|TUG|LADDER|HEADSET|CLEAN|COLLAR|DRIVER|SUPERVISOR|ULD|CARGO/.test(
      h,
    )
  ) {
    return true;
  }
  return false;
}

function isDelhiServiceColumn(equipmentHeader, billingRef = '') {
  const h = normalizeKey(`${equipmentHeader} ${billingRef}`);
  if (/RAMP HANDLING|COMPREHENSIVE HANDLING|TERMINAL HANDLING|LOAD CONTROL|FLIGHT PER MONTH/.test(h)) {
    return false;
  }
  return /COACH|GPU|ACU|ASU|\bWCH|WHEEL|WATER|TOILET|MANPOWER|PORTER|COLLAR|SUPERVIS|\bTOW\b|PUSH\s*BACK|HEAD\s*SET|HEADSET|CLEAN|DISINFECT|\bULD\b|LOADER|FORKLIFT|TAIL\s*STAND|DEEP CLEAN|PAX\b|CREW\b/.test(
    h,
  );
}

function isDelhiCargoPackageVariant(equipmentHeader) {
  const h = normalizeKey(equipmentHeader);
  // Headers like "Tansit" (sheet typo), Transit, Technical — cargo BHS packages, not ADS.
  return (
    /^(TRANSIT|TANSIT|TRNSIT|TECHNICAL)(?:\b|\s|$)/.test(h) ||
    /TECHNICAL\s*LANDING/.test(h) ||
    /TECHNICAL\s*HANDLING/.test(h)
  );
}

function isCokHandlingPackage(equipmentHeader, billingRef = '') {
  if (isDelhiHandlingPackage(equipmentHeader, billingRef)) return true;
  const h = normalizeKey(equipmentHeader);
  if (/BHS\s*RATE|HANDLING CHARGE/.test(h)) return true;
  if (/UPTO\s*\d+\s*F/.test(h) && /PW|PER\s*WEEK|FLIGHT/.test(h)) return true;
  if (/^\d+\s*-\s*\d+$/.test(h) || /\d+\s*(AND\s*)?ABOVE/.test(h) || /^FROM\s*\d+/.test(h)) return true;
  return false;
}

function isDelhiHandlingPackage(equipmentHeader, billingRef = '') {
  if (isDelhiServiceColumn(equipmentHeader, billingRef)) return false;
  const h = normalizeKey(equipmentHeader);
  // Load Control is usually an ADS/service line on Delhi cards (e.g. VS), not a BHS package.
  if (/RAMP HANDLING|COMPREHENSIVE|TERMINAL HANDLING|FLIGHT PER MONTH|CHARTER FLIGHT/.test(h)) {
    return true;
  }
  // Freighter suffixes (B777F) must match — `\bB7\d{2}\b` fails when F follows.
  if (
    /\b(A3\d{2}|A380|A350|A220|A310|A300|B7\d{2}F?|B74|Q400|ATR|MD\d{1,2}|DC\d|IL\d{2}|AN12|DASH|CRJ|E1\d{2})\b/.test(
      h,
    )
  ) {
    return true;
  }
  if (isDelhiCargoPackageVariant(equipmentHeader)) return true;
  if (/CODE\s*[CDE]/.test(h)) return true;
  return false;
}

function isDelhiVolumeBandLabel(label) {
  const n = normalizeKey(label);
  if (!n) return false;
  if (/\b(A3\d{2}|A380|A350|A220|B7\d{2}F?|Q400|ATR|CRJ|E1\d{2}|MD\d{1,2})\b/.test(n)) return false;
  if (isDelhiCargoPackageVariant(label)) return true;
  return (
    /FLIGHT\s*PER\s*MONTH/.test(n) ||
    /UPTO\s*\d+\s*MIN/.test(n) ||
    /BEYOND\s*\d+\s*MIN/.test(n) ||
    /\d+\s*AND\s*ABOVE/.test(n) ||
    /^(COMP|RAMP)\s/.test(n) ||
    (/COMPREHENSIVE|RAMP HANDLING|TERMINAL HANDLING/.test(n) &&
      !/\b(A3|B7|ATR|Q400)\b/.test(n))
  );
}

function looksLikeAircraftName(label) {
  const n = normalizeKey(label);
  return /\b(A3\d{2}|A380|A350|A220|A310|A300|B7\d{2}F?|B74|Q400|ATR|MD\d{1,2}|DC\d|IL\d{2}|AN12|DASH|CRJ|E1\d{2}|B737|B787|B777F?|B767|B757|B747)\b/.test(
    n,
  );
}

function delhiPackageLabel(equipmentHeader, billingRef = '') {
  const header = String(equipmentHeader ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/INLT/gi, 'INTL');
  const band = normalizeKey(billingRef);
  const headerKey = normalizeKey(header);
  let extra = '';
  if (/COMPREHENSIVE/.test(band)) extra = 'Comprehensive';
  else if (/RAMP/.test(band)) extra = 'Ramp';
  else if (/TERMINAL/.test(band)) extra = 'Terminal';
  else if (/LOAD CONTROL/.test(band)) extra = 'Load control';
  else if (/^TRND\b/.test(band) || /\bTRND\b/.test(headerKey)) extra = 'Turnaround';
  else if (/TRNSIT|TRANSIT|TANSIT/.test(band) || /^(TRANSIT|TANSIT|TRNSIT)\b/.test(headerKey)) {
    extra = 'Transit';
  } else if (/TECHNICAL/.test(band) || /^TECHNICAL\b/.test(headerKey)) extra = 'Technical';
  if (!extra || headerKey.includes(normalizeKey(extra))) {
    if (/^(TRANSIT|TANSIT|TRNSIT)\b/.test(headerKey)) return 'Transit';
    if (/^TECHNICAL\b/.test(headerKey)) return 'Technical';
    return header;
  }
  return `${header} (${extra})`;
}

/** Prefer a real aircraft name for the price-card aircraft column; keep band text in remarks. */
function delhiBhsPackageAircraftAndRemarks(equipmentHeader, billingRef, sheetAircraftTypes) {
  const packageLabel = delhiPackageLabel(equipmentHeader, billingRef);
  const remarks = [billingRef, equipmentHeader].filter(Boolean).join(' — ').slice(0, 240);
  const headerKey = normalizeKey(equipmentHeader);

  // Cargo Transit / Technical: distinct aircraft column so upsert keys don't collide with TRND.
  if (isDelhiCargoPackageVariant(equipmentHeader)) {
    const kind = /TECHNICAL/.test(headerKey) ? 'Technical' : 'Transit';
    const realFromSheet = (sheetAircraftTypes ?? []).find(
      (name) => looksLikeAircraftName(name) && !isDelhiVolumeBandLabel(name),
    );
    if (realFromSheet) {
      const base = String(realFromSheet).trim().toUpperCase();
      return {
        aircraftType: `${base} (${kind})`,
        remarks: remarks || `${base} (${kind})`,
      };
    }
    return { aircraftType: kind, remarks: remarks || kind };
  }

  const fromHeader = extractBhsAircraftLabel(equipmentHeader);
  if (fromHeader && looksLikeAircraftName(fromHeader) && !isDelhiVolumeBandLabel(fromHeader)) {
    return { aircraftType: fromHeader, remarks: remarks || packageLabel };
  }
  const realFromSheet = (sheetAircraftTypes ?? []).find(
    (name) => looksLikeAircraftName(name) && !isDelhiVolumeBandLabel(name),
  );
  if (realFromSheet) {
    return { aircraftType: String(realFromSheet).trim().toUpperCase(), remarks: remarks || packageLabel };
  }
  // Volume-only columns (Akasa-style): keep label temporarily; caller may remap later.
  return { aircraftType: packageLabel, remarks: remarks || packageLabel };
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function isRoyaltyWorkingRow(sheet, rowNumber) {
  const parts = [];
  for (let col = 1; col <= 3; col++) {
    parts.push(cellText(sheet.getRow(rowNumber).getCell(col).value));
  }
  return /royalty|less\s*:|net of/i.test(parts.join(' '));
}

function slugFromHeader(header) {
  return String(header ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function inferCatalogServiceCode(equipmentHeader, billingRef = '') {
  const mapped = inferServiceCode(equipmentHeader, billingRef);
  if (mapped) return mapped;
  const h = normalizeKey(equipmentHeader);
  if (/HEAD\s*SET|HEADSET/.test(h)) return 'HS';
  if (/NIGHT HALT.*DEEP|DEEP CLEANING/.test(h)) return 'Deep Cleaning';
  if (/NIGHT HALT|TRANSIT CLEANING/.test(h)) return 'Night Halt Cleaning';
  if (/DRIVER|EQUIPMENT OPERATOR|^DO$/.test(h)) return 'DO';
  if (/PAX[\s-]*COACH|PASSENGER\s*COACH|^COACH$/.test(h)) return 'PAX Coach';
  if (/CREW\s*COACH|CREW TRANSPORT/.test(h)) return 'Crew Coach';
  if (/ELECTRIC TUG|^E[\s-]?TUG|DEDICATED E TUG/.test(h)) return 'EBT';
  if (/DIESEL TUG|DEDICATED D TUG|^D[\s-]?TUG|^DT$/.test(h)) return 'DT';
  if (/TRACTOR/.test(h)) return 'DT';
  if (/STEP\s*LADDER|PASSENGER STEP|PSL \(/.test(h)) return 'PSL-Towable';
  if (/BFL/.test(h)) return 'BFL-Towable';
  if (/SUPERVISOR|^SUP\b/.test(h)) return 'Sup';
  if (/WHITE\s*COLLAR/.test(h)) return 'WC';
  if (/BLUE\s*COLLAR/.test(h)) return 'BC';
  if (/\bUH\b|UNIT\s*HEAD/.test(h)) return 'UH';
  if (/^MASS\b|MEET AND ASSIST/.test(h)) return 'MASS';
  if (/WHEELCHAIR LIFT/.test(h)) return 'WCH-Lift';
  if (/^EBC\b|EXCESS BAGGAGE/.test(h)) return 'EBC';
  if (/TICKETING/.test(h)) return 'Ticketing';
  if (/WASTE DISPOSAL/.test(h)) return 'Waste Disposal';
  if (/DISINFECT/.test(h)) return 'Disinfection';
  if (/DEODOR/.test(h)) return 'Deodorize';
  if (/ULD STORAGE/.test(h)) return 'ULD-Storage';
  if (/PBB|AEROBRIDGE|DOCKING/.test(h)) return 'PBB';
  if (/TAIL STAND/.test(h)) return 'Tail-Stand';
  if (/ENGINEERING VEHICLE|RAMP VEHICLE|MINI TRUCK/.test(h)) return 'Ramp Vehicle';
  if (/FORK/.test(h)) return 'FORK';
  if (/HEADSET OPERATION/.test(h)) return 'HS';
  if (/WATER CART|WATER SERVICE|WATER DISPOSAL/.test(h)) return 'PS-WS';
  if (/TOILET CART|TOILET SERVICE/.test(h)) return 'PS-TS';
  if (/AMBULIFT/.test(h)) return 'AMB';
  if (/PUSH BACK|ADDITIONAL PB/.test(h)) return 'PBNB';
  if (/SHORT TOW|LONG TOW|TOWING/.test(h)) return 'Tow';
  if (/APRON.*TRANSPORT|CREW\/STAFF TRANSPORT/.test(h)) return 'Crew Coach';
  if (/CANTER|BAGGAGE TRANS/.test(h)) return 'BT';
  if (/POWER CHARGE/.test(h)) return 'EV-Power';
  if (/DIESEL\/PETROL VEHICLE|PETROL\/DEISEL|CNG VEHICLE/.test(h)) return 'Diesel Vehicle';
  if (/^EV\b|ELECTRIC VEHICLE/.test(h)) return 'EV';
  if (/SPLIT OPERATION|SPILT OPERATION/.test(h)) return 'Split-Op';
  if (/FLIGHT DECK CLEANING/.test(h)) return 'Flight Deck Cleaning';
  if (/CARGO HOLD CLEANING|CARGO\/ULD/.test(h)) return 'Cargo Hold Cleaning';
  if (/EXTENDED CLEANING/.test(h)) return 'Extended Cleaning';
  if (/LIVE ANIMAL/.test(h)) return 'AVI';
  if (/ULD CLEAR/.test(h)) return 'ULD-Clearing';
  if (/AWB/.test(h)) return 'AWB';
  if (/DGN GOODS|DANGEROUS/.test(h)) return 'DGR';
  if (/CUSTOME DOC|CUSTOMS DOC/.test(h)) return 'Customs-Doc';
  if (/SURFACE TRPT|SURFACE TRANSPORT/.test(h)) return 'Surface-Trpt';
  if (/CARGO TRF|TRANSFER FEE/.test(h)) return 'Cargo-Trf';
  if (/^VAL\b/.test(h)) return 'VAL';
  if (/TRANSSHIP/.test(h)) return 'Transshipment';
  if (/^IH$|^EH$/.test(h)) return h;
  if (/BULK LOOSE|LOOSE CGO/.test(h)) return 'Bulk-CGO';
  if (/SPECIAL SHIPMENT/.test(h)) return 'Special-Shipment';
  if (/WATER UPLIFT/.test(h)) return 'PS-WS';
  if (/TRANSPORT OF VALUABLE/.test(h)) return 'VAL';
  if (/COMBINED GPU|GPU ONLY|GPU LONG HALT|GPU FIRST|BEYOND 4 HOURS|DEDICATED GPU/.test(h)) {
    return /WB/.test(h) ? 'GPU-WB' : 'GPU-NB';
  }
  if (/PCA/.test(h)) return 'ACU-NB';
  const slug = slugFromHeader(equipmentHeader);
  return slug || '';
}

function inferCatalogKind(equipmentHeader, serviceCode) {
  const h = normalizeKey(`${equipmentHeader} ${serviceCode}`);
  const code = String(serviceCode ?? '').trim();
  if (code === 'BC' || code === 'UH' || code === 'DO' || code === 'Sup' || code === 'MASS' || code === 'CSA' || code === 'AMS') {
    return 'manpower';
  }
  if (code === 'WC' && !/WATER/.test(h)) return 'manpower';
  if (
    /BLUE\s*COLLAR|WHITE\s*COLLAR|SUPERVISOR|^SUP\b|DRIVER|OPERATOR|^DO$|\bUH\b|UNIT\s*HEAD|EXTRA STAFF|MANPOWER|^MASS\b|ADDITIONAL MANPOWER|PERSONNEL/.test(
      h,
    ) &&
    !/WCHR|WCHS|WCHC|WATER CART|WATER SERVICE/.test(h)
  ) {
    return 'manpower';
  }
  if (
    /CLEANING|DISINFECT|DEODOR|WASTE DISPOSAL|NIGHT HALT|CABIN CLEAN|FLIGHT DECK/.test(h)
  ) {
    return 'cleaning';
  }
  if (
    /GPU|ACU|ASU|WCH|AMB|PUSH|TOW|COACH|PSL|TUG|TRACTOR|LADDER|HEADSET|BFL|FORK|VEHICLE|CART|ULD|PBB|TAIL STAND|TEMPO|DOLLY|LOADER|TROLLY|TROLLEY|CHOCK|PICKER|TRESSEL|TRESTLE|LDL|MDL|CHERRY|RAMP CAR/.test(
      h,
    )
  ) {
    return 'equipment';
  }
  return 'service';
}

function inferClauseType(clauseRef, body) {
  const text = `${clauseRef} ${body}`.toLowerCase();
  if (/ferry/.test(text)) return 'ferry';
  if (/technical landing/.test(text)) return 'technical_landing';
  if (/return to ramp|rtr\b/.test(text)) return 'return_to_ramp';
  if (/stand\s*by|standby|delay/.test(text)) return 'equipment_standby';
  if (/disbursement/.test(text)) return 'disbursements';
  if (/cpi|escalation|rate increase is capped|yoy/.test(text)) return 'cpi';
  if (/wheel\s*chair|wchr|included in bh|included in bhs|foc for|free inclusion/.test(text)) {
    return 'free_inclusions';
  }
  return 'custom';
}

function inferAppliesTo(body) {
  const text = body.toLowerCase();
  if (/delay/.test(text)) return 'delay';
  if (/xxln|xxld/.test(text)) return 'xxld';
  if (/equipment|wheel|gpu|acu|wchr/.test(text)) return 'equipment';
  if (/ferry|scheduled|flight cancellation|technical landing|return to ramp/.test(text)) {
    return 'scheduled';
  }
  return 'all';
}

function parseConditionalCharges(clauses) {
  const charges = {};
  let cancellationWithinHours;
  const text = clauses.map((c) => c.body).join('\n');

  const tech =
    text.match(/technical landing[^.\n]{0,120}?(\d+)\s*%/i) ??
    text.match(/(\d+)\s*%[^.\n]{0,40}technical/i);
  if (tech) {
    const pct = Number(tech[1]);
    charges.technicalHandlingChargesPercent = pct;
    charges.technicalHandling = pct; // legacy import workbook column
  }

  const rtr =
    text.match(/return to ramp[^.\n]{0,120}?(\d+)\s*%/i) ??
    text.match(/(\d+)\s*%\s*rtr/i) ??
    text.match(/\brtr\b[^.\n]{0,100}?(\d+)\s*%/i);
  if (rtr) charges.returnToRamp = Number(rtr[1]);

  const diverted =
    text.match(/divert[^.\n]{0,80}?(\d+)\s*%/i) ??
    text.match(/(\d+)\s*%\s*additional would be charge/i);
  if (diverted) charges.divertedDom = Number(diverted[1]);

  const delay =
    text.match(/stand\s*by[^.\n]{0,40}?(\d+)\s*%/i) ??
    text.match(/(\d+)\s*%[^.\n]{0,20}stand\s*by/i) ??
    text.match(/delay[^.\n]{0,100}?(\d+)\s*%/i);
  if (delay) charges.standby = Number(delay[1]);

  // "50% would be charge for XXLN if not intimated not less than 8 hrs from STA."
  const xxlnPct =
    text.match(/(\d+)\s*%[^.\n]{0,60}?xxl[nd]/i) ??
    text.match(/xxl[nd][^.\n]{0,80}?(\d+)\s*%/i);
  if (xxlnPct) charges.cancellationWithinHoursPercent = Number(xxlnPct[1]);

  const cancelHours =
    text.match(/xxl[nd][^.\n]{0,120}?(\d+)\s*hrs?/i) ??
    text.match(/not less than\s*(\d+)\s*hrs?/i) ??
    text.match(/cancellation[^.\n]{0,60}?within[^0-9]{0,20}(\d+)[^0-9]{0,10}hours?/i) ??
    text.match(/within\s*(\d+)\s*hours?[^.\n]{0,40}?cancellation/i) ??
    text.match(/cancellation within\s*(\d+)\s*hours?/i);
  if (cancelHours) cancellationWithinHours = Number(cancelHours[1]);

  return { conditionalCharges: charges, cancellationWithinHours };
}

function parseClauses(sheet, clauseStart) {
  if (!clauseStart) return [];
  const clauses = [];
  for (let r = clauseStart + 1; r <= sheet.rowCount; r++) {
    const cells = rowCells(sheet, r);
    const sno = cellText(cells.get(1));
    const clauseRef = cellText(cells.get(2));
    const body = cellText(cells.get(3)) || cellText(cells.get(4));
    if (!body && !clauseRef && !sno) continue;
    if (!body) continue;
    const clauseType = inferClauseType(clauseRef, body);
    if (!VALID_CLAUSE_TYPES.has(clauseType)) continue;
    clauses.push({
      clauseType,
      label: clauseRef || sno || undefined,
      body,
      appliesTo: inferAppliesTo(body),
    });
  }
  return clauses;
}

function detectSheetCurrency(sheet) {
  let blob = '';
  for (let r = 1; r <= 4; r++) {
    for (let c = 1; c <= 4; c++) {
      blob += ` ${cellText(sheet.getRow(r).getCell(c).value)}`;
    }
  }
  return /USD/i.test(blob) ? 'USD' : 'INR';
}

function titleAirlineName(raw) {
  return String(raw ?? '')
    .replace(/[-–—]\s*Rate Card.*$/i, '')
    .replace(/Rate Card.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectSheetMeta(sheet) {
  let airlineName = '';
  let validityText = '';
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > 3) return;
    const c1raw = cellText(row.getCell(1).value);
    const c1 = normalizeKey(c1raw);
    const c2 = cellText(row.getCell(2).value);
    const c3 = cellText(row.getCell(3).value);
    if (/AIRLINE|NAME OF AIRLINE/.test(c1)) airlineName = titleAirlineName(c2 || c3 || c1raw);
    if (c1 === 'VALIDITY') validityText = c2;
    if (!airlineName && /rate card/i.test(c1raw)) airlineName = titleAirlineName(c1raw);
  });
  return { airlineName, validityText };
}

function mergeRules(existing, incoming) {
  const key = `${incoming.serviceCode}|${incoming.category ?? ''}|${incoming.aircraftTypes.join(',')}|${incoming.uom}`;
  const idx = existing.findIndex(
    (r) =>
      `${r.serviceCode}|${r.category ?? ''}|${(r.aircraftTypes ?? []).join(',')}|${r.uom}` === key,
  );
  if (idx >= 0) existing[idx] = { ...existing[idx], ...incoming };
  else existing.push(incoming);
  return existing;
}

export function parsePriceCardSheet(sheet, opts = {}) {
  const asOf = opts.asOf instanceof Date ? opts.asOf : new Date('2026-08-15T00:00:00');
  const stationCode = String(opts.stationCode ?? 'MAA').trim().toUpperCase() || 'MAA';
  const includeExtraAds = Boolean(opts.includeExtraAds);
  const collectBhsPackages = Boolean(opts.collectBhsPackages);
  const sheetName = sheet.name;
  const keepAkasa = stationCode === 'DEL' && sheetName === 'Akasa';
  if (SKIP_SHEETS.has(sheetName) && !keepAkasa) return null;
  // QP-New is the live Akasa card. The older QP tab is the superseded schedule.
  if (stationCode === 'COK' && sheetName === 'QP') return null;

  const customerCode = customerCodeForSheet(sheetName, stationCode);
  const contractNumber = contractNumberForSheet(sheetName, stationCode);
  const meta = collectSheetMeta(sheet);
  const headerRows = findHeaderRows(sheet);
  const clauseStart = findClauseStart(sheet);
  const clauses = parseClauses(sheet, clauseStart);
  const clauseTexts = clauses.map((c) => c.body);
  const { conditionalCharges, cancellationWithinHours } = parseConditionalCharges(clauses);
  const wheelchairSplit = parseWheelchairSplit(clauseTexts);
  const flightCategories = detectFlightCategories(sheet, headerRows, sheetName, stationCode);
  const contractCategory = contractCategoryFromFlightCategories(flightCategories, stationCode);
  const delhiStation = stationCode === 'DEL';
  const cokStation = stationCode === 'COK';
  const currency = detectSheetCurrency(sheet);

  let adsRules = [];
  let aircraftTypes = new Set();
  let bhsPackages = [];
  let validFrom = '';
  let validTo = '';
  let priceOpenEnded = false;

  for (const headerMeta of headerRows) {
    const headerRow = headerMeta.row;
    const billingRefRow = headerRow > 1 ? headerRow - 1 : headerRow;
    const sectorRow = headerRow > 2 ? headerRow - 2 : billingRefRow;
    const headerCells = rowCells(sheet, headerRow);
    const billingCells = rowCells(sheet, billingRefRow);
    const sectorCells = rowCells(sheet, sectorRow);
    const ratePicks = cokStation
      ? listCokRateRows(sheet, headerRow, asOf, headerMeta.fromCol, headerMeta.toCol)
      : [
          pickRateRow(sheet, headerRow, asOf, headerMeta.fromCol, headerMeta.toCol, {
            backfill: !delhiStation,
          }),
        ].filter(Boolean);
    if (!ratePicks.length) continue;
    const spanFrom = ratePicks.reduce((min, pick) => (pick.from < min ? pick.from : min), ratePicks[0].from);
    const spanTo = ratePicks.reduce((max, pick) => (pick.to > max ? pick.to : max), ratePicks[0].to);
    validFrom = formatIsoDate(spanFrom);
    validTo = formatIsoDate(spanTo);
    if (ratePicks.some((pick) => pick.openEnded)) priceOpenEnded = true;

    for (const ratePick of ratePicks) {
    const rateCells = ratePick.filledCells ?? rowCells(sheet, ratePick.row);
    const rowCtx = cokStation ? cokRowContext(sheet, ratePick.row, headerMeta) : null;
    const focNoteRow = headerRow + 1;
    const focRowCells = rowCells(sheet, focNoteRow);
    const focRowIsNote =
      cokStation && !parseDateCell(focRowCells.get(headerMeta.fromCol));

    const maxCol = Math.max(
      ...headerCells.keys(),
      ...billingCells.keys(),
      ...sectorCells.keys(),
      ...rateCells.keys(),
      3,
    );

    const firstPriceCol = cokStation ? Math.max(headerMeta.toCol + 1, 4) : 4;
    for (let col = firstPriceCol; col <= maxCol; col++) {
      const equipmentHeader = cellText(headerCells.get(col));
      let billingRef = cellText(billingCells.get(col));
      if (focRowIsNote) {
        const focNote = cellText(focRowCells.get(col));
        if (/FOC/i.test(focNote)) billingRef = `${billingRef} ${focNote}`.trim();
      }
      const sectorLabel = delhiStation
        ? cellTextAt(sheet, sectorRow, col) || cellTextAt(sheet, billingRefRow, col) || cellTextAt(sheet, headerRow, col)
        : cellText(sectorCells.get(col)) || cellText(billingCells.get(col));
      if (!equipmentHeader) continue;

      let price = cellNumber(rateCells.get(col));
      if ((delhiStation || cokStation) && price != null) {
        if (delhiStation && isRoyaltyWorkingRow(sheet, ratePick.row) && price < 2) price = null;
        else price = roundMoney(price);
      }
      const packageCol = delhiStation
        ? isDelhiHandlingPackage(equipmentHeader, billingRef)
        : cokStation
          ? isCokHandlingPackage(equipmentHeader, billingRef)
          : isBhsPackageColumn(equipmentHeader, billingRef) || isBhsOnlyColumn(equipmentHeader, billingRef);

      if (packageCol) {
        extractAircraftTypes(equipmentHeader).forEach((a) => aircraftTypes.add(a));
        const resolved = (delhiStation || cokStation)
          ? delhiBhsPackageAircraftAndRemarks(equipmentHeader, billingRef, [...aircraftTypes])
          : {
              aircraftType: extractBhsAircraftLabel(equipmentHeader),
              remarks: [billingRef, equipmentHeader].filter(Boolean).join(' — ').slice(0, 240),
            };
        if (
          cokStation &&
          rowCtx?.engineering &&
          resolved.aircraftType &&
          !/engineering/i.test(resolved.aircraftType)
        ) {
          resolved.aircraftType = `${resolved.aircraftType} (Engineering)`.slice(0, 48);
        }
        if (
          cokStation &&
          /INTL|INTERNATIONAL/.test(normalizeKey(equipmentHeader)) &&
          resolved.aircraftType &&
          !/INTL/.test(normalizeKey(resolved.aircraftType))
        ) {
          resolved.aircraftType = `${resolved.aircraftType}-INTL`.slice(0, 48);
        }
        if (collectBhsPackages && resolved.aircraftType && price != null && price > 0) {
          const explicitSector = (delhiStation || cokStation)
            ? delhiColumnSector(equipmentHeader, sectorLabel, billingRef)
            : null;
          let sector = delhiPackageSector(
            equipmentHeader,
            sectorLabel,
            billingRef,
            flightCategories,
            delhiStation || cokStation,
          );
          if (cokStation && !explicitSector && (rowCtx?.sector === 'Dom' || rowCtx?.sector === 'Int')) {
            sector = { category: rowCtx.sector, appliesToBoth: false };
          }
          const header = String(equipmentHeader ?? '')
            .replace(/\s+/g, ' ')
            .trim();
          const sourceLabel =
            header.includes('/') && looksLikeAircraftName(header) ? header : resolved.aircraftType;
          const grouped = BHS_GROUPED_AIRCRAFT_CUSTOMERS.has(String(customerCode).toUpperCase());
          const expanded = expandBhsAircraftLabel(sourceLabel);
          const names = grouped
            ? [groupedBhsAircraftLabel(header, resolved.aircraftType)]
            : expanded.aircraft.length
              ? expanded.aircraft
              : [resolved.aircraftType];
          const remarksFor = (aircraftType) =>
            grouped
              ? appendBhsAircraftCondition(resolved.remarks, expanded.condition)
              : remarksForSplitAircraft(
                  resolved.remarks,
                  sourceLabel,
                  aircraftType,
                  expanded.condition,
                );
          for (const aircraftType of names) {
            if (!aircraftType) continue;
            bhsPackages.push({
              aircraftType,
              category: sector.category,
              appliesToBoth: sector.appliesToBoth,
              price,
              remarks: remarksFor(aircraftType),
            });
            if (
              !isDelhiVolumeBandLabel(aircraftType) &&
              looksLikeAircraftName(aircraftType) &&
              !/\(/.test(String(aircraftType))
            ) {
              aircraftTypes.add(aircraftType);
            }
          }
        }
        continue;
      }

      if (isNoiseColumn(equipmentHeader)) continue;

      let serviceCode = inferServiceCode(equipmentHeader, billingRef);
      let kind = inferCatalogKind(equipmentHeader, serviceCode || equipmentHeader);
      if (!serviceCode && includeExtraAds) {
        serviceCode = inferCatalogServiceCode(equipmentHeader, billingRef);
        kind = inferCatalogKind(equipmentHeader, serviceCode);
      }
      if (!serviceCode) continue;
      if (price == null || price <= 0) continue;

      const colAircraft = delhiStation ? [] : extractAircraftTypes(equipmentHeader);
      colAircraft.forEach((a) => aircraftTypes.add(a));

      let free = parseFreeAllowance(billingRef, equipmentHeader, serviceCode);
      let freeNb;
      let freeWb;
      if (/^WCH/.test(serviceCode) && wheelchairSplit) {
        free = wheelchairSplit.free;
        freeNb = wheelchairSplit.freeNb;
        freeWb = wheelchairSplit.freeWb;
      }

      const storedCode = includeExtraAds ? prefixedAdsServiceCode(serviceCode, kind) : serviceCode;
      let colCategory = delhiStation || cokStation
        ? delhiColumnSector(equipmentHeader, sectorLabel, billingRef)
        : inferBillingFlightCategory(sectorLabel) || inferBillingFlightCategory(billingRef);
      if (cokStation && !colCategory && (rowCtx?.sector === 'Dom' || rowCtx?.sector === 'Int')) {
        colCategory = rowCtx.sector;
      }

      const rule = {
        serviceCode: storedCode,
        includedForAds: true,
        alwaysChargeable: free === 0,
        freePerFlight: free,
        freePerFlightNb: freeNb,
        freePerFlightWb: freeWb,
        unitPriceINR: currency === 'USD' ? undefined : price,
        unitPriceUSD: currency === 'USD' ? price : undefined,
        uom: inferUom(billingRef, equipmentHeader),
        aircraftTypes: colAircraft,
        category: colCategory,
        remarks: [billingRef, equipmentHeader].filter(Boolean).join(' — ').slice(0, 240),
      };
      adsRules = mergeRules(adsRules, rule);
    }
    }
  }

  if (!validFrom || !validTo) {
    validFrom = '2026-01-01';
    validTo = '2026-12-31';
  }

  adsRules = expandRulesForFlightCategories(adsRules, flightCategories, stationCode);

  for (const rule of adsRules) {
    for (const ac of rule.aircraftTypes ?? []) {
      if (looksLikeAircraftName(ac) && !isDelhiVolumeBandLabel(ac)) {
        aircraftTypes.add(String(ac).trim().toUpperCase());
      }
    }
  }

  // Akasa-style Delhi cards price by volume band, not by aircraft column.
  // Prefer a real aircraft name on the price-card row; keep the band in remarks.
  // Cargo Transit/Technical stay distinct (`B777F (Transit)`) so Mongo upsert keys don't collide.
  const DELHI_BAND_AIRCRAFT_FALLBACK = { QP: 'B737-800' };
  const realAircraft = [...aircraftTypes].filter(
    (name) => looksLikeAircraftName(name) && !isDelhiVolumeBandLabel(name),
  );
  if (realAircraft.length === 0) {
    const fallback = DELHI_BAND_AIRCRAFT_FALLBACK[String(customerCode).toUpperCase()];
    if (fallback) realAircraft.push(fallback);
  }
  if (delhiStation && realAircraft.length > 0) {
    for (const row of bhsPackages) {
      if (!isDelhiVolumeBandLabel(row.aircraftType)) continue;
      const label = String(row.aircraftType ?? '');
      if (isDelhiCargoPackageVariant(label) || /^(TRANSIT|TECHNICAL)$/i.test(label)) {
        const kind = /TECHNICAL/i.test(label) ? 'Technical' : 'Transit';
        row.remarks = row.remarks || `${realAircraft[0]} (${kind})`;
        row.aircraftType = `${realAircraft[0]} (${kind})`;
        continue;
      }
      row.remarks = row.remarks || row.aircraftType;
      row.aircraftType = realAircraft[0];
    }
    for (const name of realAircraft) aircraftTypes.add(name);
    for (const name of [...aircraftTypes]) {
      if (isDelhiVolumeBandLabel(name)) aircraftTypes.delete(name);
    }
  }

  if (cokStation) {
    const priced = new Map();
    for (const row of bhsPackages) {
      const key = `${row.aircraftType}|${row.category}|${row.appliesToBoth ? 1 : 0}`;
      const prior = priced.get(key);
      if (prior != null && prior !== row.price) {
        const tag = String(row.remarks ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 28);
        if (tag) row.aircraftType = `${row.aircraftType} ${tag}`.trim().slice(0, 48);
      }
      priced.set(`${row.aircraftType}|${row.category}|${row.appliesToBoth ? 1 : 0}`, row.price);
    }
  }

  const uniqueBhs = [];
  const bhsSeen = new Set();
  for (const row of bhsPackages) {
    const key = `${row.aircraftType}|${row.category}|${row.price}|${row.appliesToBoth ? 1 : 0}|${row.remarks ?? ''}`;
    if (bhsSeen.has(key)) continue;
    bhsSeen.add(key);
    uniqueBhs.push(row);
  }

  // Freighter cards: Technical column is typically ~50% of TRND — stamp contract %.
  if (conditionalCharges.technicalHandlingChargesPercent == null) {
    const packText = (row) => `${row.remarks ?? ''} ${row.aircraftType ?? ''}`;
    const trnd = uniqueBhs.find((row) => /\bTRND\b|TURNAROUND/i.test(packText(row)));
    const tech = uniqueBhs.find(
      (row) => /TECHNICAL/i.test(packText(row)) && !/\bTRND\b/i.test(packText(row)),
    );
    if (trnd?.price && tech?.price && Number(trnd.price) > 0) {
      const ratio = Math.round((Number(tech.price) / Number(trnd.price)) * 100);
      if (ratio >= 45 && ratio <= 55) {
        conditionalCharges.technicalHandlingChargesPercent = 50;
        conditionalCharges.technicalHandling = 50;
      }
    }
  }

  return {
    sheetName,
    contractNumber,
    customerCode,
    stationCode,
    airlineName: meta.airlineName || customerCode,
    currency,
    validityText: meta.validityText,
    priceValidFrom: validFrom,
    priceValidTo: validTo,
    priceOpenEnded,
    contractCategory,
    flightCategories,
    aircraftTypes: [...aircraftTypes].filter(
      (name) => looksLikeAircraftName(name) && !/\(/.test(String(name)),
    ),
    conditionalCharges,
    cancellationWithinHours,
    adsEquipmentRules: adsRules,
    bhsPackages: uniqueBhs,
    clauses,
    adsBillingEnabled: adsRules.length > 0,
    ...(() => {
      const coverage = classifyBhsConcessionCoverage(concessionNoteTexts(sheet, cellText));
      if (!coverage) return {};
      return {
        bhsConcessionCoverage: coverage.coverage,
        bhsConcessionNote: coverage.note,
      };
    })(),
  };
}

function mergeParsedSheets(a, b) {
  const newer = String(b.priceValidTo ?? '') >= String(a.priceValidTo ?? '') ? b : a;
  const older = newer === b ? a : b;
  let ads = [...(older.adsEquipmentRules ?? [])];
  for (const rule of newer.adsEquipmentRules ?? []) ads = mergeRules(ads, rule);
  const bhs = [];
  const seen = new Set();
  for (const row of [...(older.bhsPackages ?? []), ...(newer.bhsPackages ?? [])]) {
    const key = `${row.aircraftType}|${row.category}|${row.price}|${row.appliesToBoth ? 1 : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bhs.push(row);
  }
  const clauses = (newer.clauses?.length ?? 0) >= (older.clauses?.length ?? 0) ? newer.clauses : older.clauses;
  return {
    ...newer,
    airlineName: newer.airlineName || older.airlineName,
    adsEquipmentRules: ads,
    bhsPackages: bhs,
    clauses,
    aircraftTypes: [...new Set([...(older.aircraftTypes ?? []), ...(newer.aircraftTypes ?? [])])],
    adsBillingEnabled: ads.length > 0,
    conditionalCharges: { ...(older.conditionalCharges ?? {}), ...(newer.conditionalCharges ?? {}) },
    cancellationWithinHours: newer.cancellationWithinHours ?? older.cancellationWithinHours,
  };
}

export function parsePriceCardWorkbook(workbook, opts = {}) {
  const stationCode = String(opts.stationCode ?? 'MAA').trim().toUpperCase();
  const sheets = [];
  for (const sheet of workbook.worksheets) {
    const result = parsePriceCardSheet(sheet, opts);
    if (result) sheets.push(result);
  }
  if (stationCode === 'DEL') return assignDelhiContractNumbers(sheets);
  const byContract = new Map();
  for (const result of sheets) {
    const existing = byContract.get(result.contractNumber);
    byContract.set(result.contractNumber, existing ? mergeParsedSheets(existing, result) : result);
  }
  return [...byContract.values()];
}

/**
 * Unique extra equipment / manpower / services from every price-card sheet.
 * Skips BHS package (aircraft handling) columns. Used to seed the service catalog.
 */
export function collectCatalogItemsFromSheet(sheet) {
  const sheetName = sheet.name;
  if (SKIP_SHEETS.has(sheetName)) return [];
  const headerRows = findHeaderRows(sheet);
  if (headerRows.length === 0) return [];

  const items = [];
  for (const headerMeta of headerRows) {
    const headerRow = headerMeta.row;
    const uomRow = headerRow > 1 ? headerRow - 1 : headerRow;
    const headerCells = rowCells(sheet, headerRow);
    const uomCells = rowCells(sheet, uomRow);
    const maxCol = Math.max(...headerCells.keys(), ...uomCells.keys(), 3);

    for (let col = 4; col <= maxCol; col++) {
      const equipmentHeader = cellText(headerCells.get(col)).replace(/\s+/g, ' ').trim();
      const uomRaw = cellText(uomCells.get(col));
      if (!equipmentHeader) continue;
      if (isNoiseColumn(equipmentHeader)) continue;
      if (isBhsPackageColumn(equipmentHeader, uomRaw)) continue;

      const serviceCode = inferCatalogServiceCode(equipmentHeader, uomRaw);
      if (!serviceCode) continue;

      const kind = inferCatalogKind(equipmentHeader, serviceCode);
      const uom = inferUom(uomRaw, equipmentHeader);
      items.push({
        sheetName,
        code: serviceCode,
        kind,
        description: equipmentHeader,
        uom,
        sourceHeader: equipmentHeader,
        sourceUom: uomRaw,
      });
    }
  }
  return items;
}

export function collectCatalogItemsFromWorkbook(workbook) {
  const byKey = new Map();
  for (const sheet of workbook.worksheets) {
    for (const item of collectCatalogItemsFromSheet(sheet)) {
      const key = `${item.kind}::${normalizeKey(item.code)}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...item, sheets: [item.sheetName] });
        continue;
      }
      if (!existing.sheets.includes(item.sheetName)) existing.sheets.push(item.sheetName);
      if (item.uom && item.uom !== 'Per service' && existing.uom === 'Per service') {
        existing.uom = item.uom;
      }
      if (item.description.length > existing.description.length) {
        existing.description = item.description;
      }
    }
  }
  return [...byKey.values()].sort((a, b) =>
    `${a.kind}:${a.code}`.localeCompare(`${b.kind}:${b.code}`),
  );
}
