import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';
import { fetchFlightsReferenceAircraft } from '@/lib/api';
import { formatBillingDate } from '@/lib/billing-shared/billing-date-format';
import { displayAircraftTypesForPriceCardEntry } from '@/lib/billing-shared/bhs-grouped-aircraft';
import { bhsPriceTypeLabel } from '@/lib/billing-shared/exclusive-bhs-concession';
import {
  formatPriceCardAirlineCategory,
  isOpenEndedBillingDate,
} from '@/lib/billing-shared/enums';
import { contractForPriceCardEntry } from '@/lib/billing-shared/price-card-airline-rows';
import type { BillingContract, BillingPriceCardAirline } from '@/lib/billing-shared/types';
import { inferWideBodyFromAircraftType } from '../sources/billingScheduledFlightDisplay';

const HEADERS = [
  'Station',
  'Airline code',
  'Airline name',
  'Aircraft type',
  'Aircraft body',
  'Flight category',
  'Price type',
  'Currency',
  'Comprehensive price',
  'Price valid from',
  'Price valid to',
] as const;

const PRICE_COLUMN = 9;

const HEADER_FILL = 'FF1C0770';
const HEADER_FONT = 'FFFFFFFF';
const TITLE_FILL = 'FF261CC1';
const BAND_A = 'FFF7F8FC';
const BAND_B = 'FFEEF2FF';

type ExportRow = {
  station: string;
  airlineCode: string;
  airlineName: string;
  aircraftType: string;
  aircraftBody: 'NB' | 'WB' | '';
  category: string;
  priceType: string;
  currency: string;
  price: number | null;
  validFrom: string;
  validTo: string;
};

function toBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const plain = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([plain], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function validToLabel(entry: BillingPriceCardAirline): string {
  if (entry.openEnded || isOpenEndedBillingDate(entry.validTo)) return 'Open';
  return formatBillingDate(entry.validTo, '');
}

function storedAircraftBody(value: unknown): 'NB' | 'WB' | '' {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';
  if (raw === 'WB' || raw.includes('WIDE')) return 'WB';
  if (raw === 'NB' || raw.includes('NARROW')) return 'NB';
  return '';
}

function aircraftLookupKeys(aircraftType: string): string[] {
  const compact = aircraftType.trim().toUpperCase().replace(/\s+/g, '');
  const loose = compact.replace(/[^A-Z0-9]/g, '');
  return [...new Set([compact, loose].filter((key) => key.length >= 2))];
}

async function loadAircraftBodyCatalog(): Promise<Map<string, 'NB' | 'WB'>> {
  const map = new Map<string, 'NB' | 'WB'>();
  try {
    const list = (await fetchFlightsReferenceAircraft()) as Record<string, unknown>[];
    for (const doc of list) {
      const aircraft = String(doc.aircraft ?? '').trim();
      const body = storedAircraftBody(doc.aircraftBody);
      if (!aircraft || !body) continue;
      for (const key of aircraftLookupKeys(aircraft)) map.set(key, body);
    }
  } catch {
    return map;
  }
  return map;
}

function aircraftBodyForType(
  aircraftType: string,
  catalog: Map<string, 'NB' | 'WB'>,
): 'NB' | 'WB' | '' {
  const type = aircraftType.trim();
  if (!type) return '';
  for (const key of aircraftLookupKeys(type)) {
    const hit = catalog.get(key);
    if (hit) return hit;
  }
  return inferWideBodyFromAircraftType(type) ? 'WB' : 'NB';
}

function priceTypeLabel(
  entry: BillingPriceCardAirline,
  contracts: BillingContract[],
): string {
  const label = bhsPriceTypeLabel(
    contractForPriceCardEntry(entry, contracts)?.bhsConcessionCoverage,
  );
  return label === '—' ? '' : label;
}

function buildRows(
  entries: BillingPriceCardAirline[],
  contracts: BillingContract[],
  aircraftBodies: Map<string, 'NB' | 'WB'>,
): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const entry of entries) {
    if (entry.handlingType !== 'BHS' || entry.active === false) continue;
    const aircraftTypes = displayAircraftTypesForPriceCardEntry(entry);
    const price =
      entry.price != null && Number.isFinite(entry.price) ? entry.price : null;
    for (const aircraftType of aircraftTypes) {
      rows.push({
        station: String(entry.stationCode ?? '').trim().toUpperCase(),
        airlineCode: entry.customerCode.trim().toUpperCase(),
        airlineName: entry.airlineName.trim() || entry.customerCode.trim().toUpperCase(),
        aircraftType: aircraftType || entry.aircraftType.trim().toUpperCase(),
        aircraftBody: aircraftBodyForType(
          aircraftType || entry.aircraftType,
          aircraftBodies,
        ),
        category: formatPriceCardAirlineCategory(entry.category),
        priceType: priceTypeLabel(entry, contracts),
        currency: String(entry.currencyCode ?? '').trim().toUpperCase(),
        price,
        validFrom: formatBillingDate(entry.validFrom, ''),
        validTo: validToLabel(entry),
      });
    }
  }

  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const key = [
        row.station,
        row.airlineCode,
        row.aircraftType,
        row.aircraftBody,
        row.category,
        row.priceType,
        row.currency,
        row.price ?? '',
        row.validFrom,
        row.validTo,
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      a.airlineName.localeCompare(b.airlineName) ||
      a.airlineCode.localeCompare(b.airlineCode) ||
      a.aircraftType.localeCompare(b.aircraftType) ||
      a.category.localeCompare(b.category) ||
      a.validFrom.localeCompare(b.validFrom),
    );
}

function cellText(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value);
}

/** Width in Excel character units. Bold headers need more than the raw name length. */
function columnWidth(header: string, values: string[]): number {
  const longestValue = values.reduce((max, value) => Math.max(max, value.length), 0);
  const headerWidth = header.length + 4;
  return Math.min(46, Math.max(headerWidth, longestValue + 2, 12));
}

export async function exportBhsPriceCardsToExcel(
  entries: BillingPriceCardAirline[],
  contracts: BillingContract[],
): Promise<void> {
  const aircraftBodies = await loadAircraftBodyCatalog();
  const rows = buildRows(entries, contracts, aircraftBodies);
  if (rows.length === 0) {
    throw new Error('No BHS price cards to export for this station.');
  }

  const station = rows[0]?.station || 'station';
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FRIS Billing';
  const sheet = workbook.addWorksheet('BHS price cards', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  const title = sheet.addRow([
    `BHS comprehensive price cards — ${station}`,
  ]);
  sheet.mergeCells(1, 1, 1, HEADERS.length);
  title.height = 26;
  title.getCell(1).font = { bold: true, size: 16, color: { argb: HEADER_FONT }, name: 'Calibri' };
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } };
  title.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const subtitle = sheet.addRow([
    'Airline, aircraft body, Inclusive or Exclusive price type, comprehensive handling price, and price validity. One row per aircraft.',
  ]);
  sheet.mergeCells(2, 1, 2, HEADERS.length);
  subtitle.height = 20;
  subtitle.getCell(1).font = { size: 11, color: { argb: 'FF1C0770' }, name: 'Calibri' };
  subtitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1FF5E' } };
  subtitle.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const headerRow = sheet.addRow([...HEADERS]);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: HEADER_FONT }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false, indent: 1 };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF150558' } },
    };
  });

  let band = 0;
  let previousAirline = '';
  for (const row of rows) {
    if (row.airlineCode !== previousAirline) {
      band += 1;
      previousAirline = row.airlineCode;
    }
    const added = sheet.addRow([
      row.station,
      row.airlineCode,
      row.airlineName,
      row.aircraftType,
      row.aircraftBody,
      row.category,
      row.priceType,
      row.currency,
      row.price,
      row.validFrom,
      row.validTo,
    ]);
    added.height = 20;
    const fill = band % 2 === 0 ? BAND_B : BAND_A;
    added.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { size: 11, name: 'Calibri', color: { argb: 'FF1F2937' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: col === PRICE_COLUMN ? 'right' : 'left',
        indent: col === PRICE_COLUMN ? 0 : 1,
      };
      if (col === 5 && (cell.value === 'NB' || cell.value === 'WB')) {
        cell.font = { size: 11, name: 'Calibri', bold: true, color: { argb: 'FF1C0770' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (col === 7 && (cell.value === 'Inclusive' || cell.value === 'Exclusive' || cell.value === 'Mixed')) {
        cell.font = {
          size: 11,
          name: 'Calibri',
          bold: true,
          color: { argb: cell.value === 'Exclusive' ? 'FF9A3412' : 'FF166534' },
        };
      }
      if (col === PRICE_COLUMN && typeof cell.value === 'number') {
        cell.numFmt = '#,##0.00';
        cell.font = { size: 11, name: 'Calibri', bold: true, color: { argb: 'FF1C0770' } };
      }
    });
  }

  const valueColumns = rows.map((row) => [
    row.station,
    row.airlineCode,
    row.airlineName,
    row.aircraftType,
    row.aircraftBody,
    row.category,
    row.priceType,
    row.currency,
    row.price == null ? '' : row.price.toFixed(2),
    row.validFrom,
    row.validTo,
  ]);
  HEADERS.forEach((header, index) => {
    const values = valueColumns.map((column) => cellText(column[index]));
    sheet.getColumn(index + 1).width = columnWidth(header, values);
  });

  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3 + rows.length, column: HEADERS.length },
  };
  sheet.pageSetup.printTitlesRow = '3:3';

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(toBlob(buffer), `bhs-comprehensive-price-cards-${station}-${stamp}.xlsx`);
}
