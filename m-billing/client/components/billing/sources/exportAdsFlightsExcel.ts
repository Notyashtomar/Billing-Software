import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';
import type { BillingSourceRow } from '@/lib/billing-shared/billing-sources';
import {
  filterBillingRowsByAdsBriefs,
  formatAdsFlightBhsIncludedEntries,
  formatAdsFlightChargedEntries,
  formatAdsFlightEngagementEntries,
  type BillingAdsBriefKey,
} from './billingAdsBriefStats';
import {
  scheduledFlightAircraftBody,
  scheduledFlightAircraftType,
  scheduledFlightEligibleLabel,
} from './billingScheduledFlightDisplay';

const HEADERS = [
  'Prep',
  'Serial / ID',
  'Flight',
  'Aircraft type',
  'Aircraft body',
  'Equipment engagement',
  'Included in BHS',
  'Charged',
  'Eligible',
  'Contract',
  'Rate',
  'Validation',
] as const;

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

function adsFlightSerialLabel(row: BillingSourceRow): string {
  const serial = String(row.sourceRef.serialNo ?? '').trim();
  return serial || String(row.sourceRef.usageRowId ?? '') || '—';
}

function adsFlightNumberLabel(row: BillingSourceRow): string {
  return String(
    row.operationalData.flightNoEquipmentNo ??
      row.operationalData.flightNo ??
      row.sourceRef.flightNo ??
      '—',
  );
}

function prepStatusLabel(row: BillingSourceRow): string {
  return row.sentToPreparation ? 'Sent' : 'Unsent';
}

function contractLabel(row: BillingSourceRow): string {
  return row.contractMatch.matched ? 'Matched' : 'Not matched';
}

function rateLabel(row: BillingSourceRow): string {
  return row.rateMatch.matched ? 'Matched' : 'Not matched';
}

function validationLabel(row: BillingSourceRow): string {
  const failed = row.validationStatus.errors.filter((e) => !e.passed).length;
  const base = row.validationStatus.passed ? 'Passed' : 'Failed';
  return failed > 0 ? `${base} (${failed})` : base;
}

function labelCountEntries(
  entries: ReadonlyArray<{ label: string; count: number }>,
): string {
  if (entries.length === 0) return '—';
  return entries.map((entry) => `${entry.label}: ${entry.count}`).join('; ');
}

function labelValueEntries(
  entries: ReadonlyArray<{ label: string; value: string }>,
): string {
  if (entries.length === 0) return '—';
  return entries.map((entry) => `${entry.label}: ${entry.value}`).join('; ');
}

function scopedLinesForFlight(
  row: BillingSourceRow,
  flightKeyForRow: (row: BillingSourceRow) => string,
  linesByFlightKey: ReadonlyMap<string, BillingSourceRow[]>,
): BillingSourceRow[] {
  const flightKey = flightKeyForRow(row);
  return linesByFlightKey.get(flightKey) ?? [];
}

export type ExportAdsFlightsExcelOpts = {
  rows: BillingSourceRow[];
  adsLinesByFlightKey: ReadonlyMap<string, BillingSourceRow[]>;
  adsBriefFilters: ReadonlySet<BillingAdsBriefKey>;
  flightKeyForRow: (row: BillingSourceRow) => string;
  from: string;
  to: string;
  customerCode?: string;
};

/** Export visible ADS flight rows (after table filters) to Excel. */
export async function exportAdsFlightsToExcel(
  opts: ExportAdsFlightsExcelOpts,
): Promise<void> {
  const { rows, adsLinesByFlightKey, adsBriefFilters, flightKeyForRow, from, to } =
    opts;
  const customer = (opts.customerCode ?? '').trim().toUpperCase();
  const paletteActive = adsBriefFilters.size > 0;

  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BWMS Billing';
  const sheet = workbook.addWorksheet('ADS flights', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  const titleParts = ['ADS flights export'];
  if (customer) titleParts.push(customer);
  if (from && to) titleParts.push(`${from} to ${to}`);
  const titleRow = sheet.addRow([titleParts.join(' · ')]);
  sheet.mergeCells(1, 1, 1, HEADERS.length);
  titleRow.getCell(1).font = { bold: true, size: 13 };
  titleRow.height = 22;

  const metaRow = sheet.addRow([
    `${rows.length} flight${rows.length === 1 ? '' : 's'} · palette ${
      paletteActive ? `${adsBriefFilters.size} filter(s)` : 'none'
    }`,
  ]);
  sheet.mergeCells(2, 1, 2, HEADERS.length);
  metaRow.getCell(1).font = { size: 10, color: { argb: 'FF64748B' } };

  const headerRow = sheet.addRow([...HEADERS]);
  headerRow.font = { bold: true, size: 10 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  for (const row of rows) {
    const lines = scopedLinesForFlight(row, flightKeyForRow, adsLinesByFlightKey);
    const scoped = paletteActive
      ? filterBillingRowsByAdsBriefs(lines, adsBriefFilters)
      : [];

    const engagement = paletteActive
      ? labelValueEntries(formatAdsFlightEngagementEntries(scoped))
      : 'Check palette equipment';
    const bhsIncluded = paletteActive
      ? labelCountEntries(formatAdsFlightBhsIncludedEntries(scoped))
      : 'Check palette equipment';
    const charged = paletteActive
      ? labelCountEntries(formatAdsFlightChargedEntries(scoped))
      : 'Check palette equipment';

    sheet.addRow([
      prepStatusLabel(row),
      adsFlightSerialLabel(row),
      adsFlightNumberLabel(row),
      scheduledFlightAircraftType(row),
      scheduledFlightAircraftBody(row),
      engagement,
      bhsIncluded,
      charged,
      scheduledFlightEligibleLabel(row),
      contractLabel(row),
      rateLabel(row),
      validationLabel(row),
    ]);
  }

  sheet.columns = [
    { width: 10 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 12 },
    { width: 36 },
    { width: 22 },
    { width: 16 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  const stamp = new Date().toISOString().slice(0, 10);
  const customerToken = customer || 'all';
  saveAs(toBlob(buffer), `ads-flights-${customerToken}-${from || stamp}.xlsx`);
}
