/**
 * Column layout for Pax shift "Flight Details" (PDF + report view).
 * Field names match `PaxShiftFlightHandlingForm` / `psr-flight-details` snapshot keys.
 */

export type FlightHandlingFieldMap = Record<string, string | number> | null | undefined;

export function fhCell(fh: FlightHandlingFieldMap, key: string): string {
  if (!fh) return '';
  const raw = fh[key];
  if (raw == null) return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  const v = String(raw).trim();
  return v || '';
}

export function fhCellOrDash(fh: FlightHandlingFieldMap, key: string): string {
  const v = fhCell(fh, key);
  return v || '—';
}

export const FLIGHT_DETAILS_TIMES_HEADERS = [
  'STA',
  'STD',
  'ETA',
  'ATA',
  'ETD',
  'ATD',
  'GATE',
  'A/C',
  'Ground Time',
  'Version',
  'Seating Capacity',
] as const;

export const FLIGHT_DETAILS_TIMES_KEYS = [
  'sta',
  'std',
  'eta',
  'ata',
  'etd',
  'atd',
  'gate',
  'acType',
  'groundTime',
  'version',
  'seatCap',
] as const;

export function buildFlightDetailsTimesRow(fh: FlightHandlingFieldMap): string[] {
  return FLIGHT_DETAILS_TIMES_KEYS.map((k) => fhCellOrDash(fh, k));
}

/** PDF panel layout: 4 equal columns of label : value (same keys as times row). */
export type PaxFlightDetailsPanelField = { label: string; key: string };

export const PAX_FLIGHT_DETAILS_PANEL_COL1: PaxFlightDetailsPanelField[] = [
  { label: 'STA', key: 'sta' },
  { label: 'ATA', key: 'ata' },
  { label: 'ETA', key: 'eta' },
];

export const PAX_FLIGHT_DETAILS_PANEL_COL2: PaxFlightDetailsPanelField[] = [
  { label: 'STD', key: 'std' },
  { label: 'ATD', key: 'atd' },
  { label: 'ETD', key: 'etd' },
];

export const PAX_FLIGHT_DETAILS_PANEL_COL3: PaxFlightDetailsPanelField[] = [
  { label: 'GATE', key: 'gate' },
  { label: 'Ground Time', key: 'groundTime' },
  { label: 'Version', key: 'version' },
];

export const PAX_FLIGHT_DETAILS_PANEL_COL4: PaxFlightDetailsPanelField[] = [
  { label: 'A/C', key: 'acType' },
  { label: 'Seating Capacity', key: 'seatCap' },
];

/** All Flight Details panel columns (left → right). */
export const PAX_FLIGHT_DETAILS_PANEL_COLUMNS: readonly PaxFlightDetailsPanelField[][] = [
  PAX_FLIGHT_DETAILS_PANEL_COL1,
  PAX_FLIGHT_DETAILS_PANEL_COL2,
  PAX_FLIGHT_DETAILS_PANEL_COL3,
  PAX_FLIGHT_DETAILS_PANEL_COL4,
];

/** Delay table: wide description + minutes (3 rows). */
export function buildDelayCodeRows(fh: FlightHandlingFieldMap): string[][] {
  const r1 = [combineDelayDesc(fhCell(fh, 'delayCode'), ''), fhCellOrDash(fh, 'delayMins')];
  const r2 = [
    combineDelayDesc(fhCell(fh, 'delayCodeExtra_0'), fhCell(fh, 'delayDescExtra_0')),
    '—',
  ];
  const r3 = [
    combineDelayDesc(fhCell(fh, 'delayCodeExtra_1'), fhCell(fh, 'delayDescExtra_1')),
    '—',
  ];
  return [r1, r2, r3];
}

function combineDelayDesc(code: string, notes: string): string {
  const c = code.trim();
  const n = notes.trim();
  if (c && n) return `${c} — ${n}`;
  return c || n || '—';
}

/** Passenger + transit + baggage: same keys as form `pax_${row}_${col}` (col from PAX_COLUMNS). */
export const PAX_REPORT_COLUMNS: readonly string[] = [
  'TTL',
  'F',
  'C',
  'Y',
  'P-Eco',
  'CUSS-chk-in/HONS',
  'CUSS',
  'MAAS',
  'WCH',
  'UM',
  'INF',
  'AVIH',
  'Tran Int',
  'Tran Dom',
  'Bag Cnt',
];

export const PAX_REPORT_HEADERS: readonly string[] = [
  'Info',
  ...PAX_REPORT_COLUMNS.slice(0, 12),
  'Int/Dom',
  'Dom/Int',
  'Baggage Count',
];

/** Shorter labels for Pax PDF table headers (same column order as `PAX_REPORT_HEADERS`). */
/** Compact headers for the horizontal Pax PDF table (16 columns). */
export const PAX_REPORT_PDF_HEADERS: readonly string[] = [
  'Info',
  'TTL',
  'F',
  'C',
  'Y',
  'P-Eco',
  'CUSS/H',
  'CUSS',
  'MAAS',
  'WCH',
  'UM',
  'INF',
  'AVIH',
  'I/D',
  'D/I',
  'Bag',
];

export function paxSnapshotKey(row: 'arrivals' | 'departures', col: string): string {
  return `pax_${row}_${col}`;
}

export function buildPaxRow(fh: FlightHandlingFieldMap, row: 'arrivals' | 'departures'): string[] {
  const label = row === 'arrivals' ? 'Arrival' : 'Departure';
  const cells = PAX_REPORT_COLUMNS.map((col) => fhCellOrDash(fh, paxSnapshotKey(row, col)));
  return [label, ...cells];
}

export const LEVEL4_HEADERS = ['Level-4 Bags', 'Description'] as const;

export function buildLevel4Row(fh: FlightHandlingFieldMap): string[] {
  return [fhCellOrDash(fh, 'level4Bags'), fhCellOrDash(fh, 'level4BagsDesc')];
}

export const ARRIVAL_MHB_HEADERS = [
  'Arrival MHB',
  'No. of PIR',
  'No. of Bags',
  'No. of DPR',
  'AOC',
  'OHD',
  'No Of Bag',
  'Baggage Clearance FIG',
  "Baggage Short in M 'up",
] as const;

export const ARRIVAL_MHB_KEYS = [
  'arrivalMhb',
  'mhbPir',
  'mhbBag1',
  'mhbDpr',
  'mhbAoc',
  'mhbOhd',
  'mhbBag2',
  'mhbBagClmcFig',
  'mhbBagShort',
] as const;

export function buildArrivalMhbRow(fh: FlightHandlingFieldMap): string[] {
  return ARRIVAL_MHB_KEYS.map((k) => fhCellOrDash(fh, k));
}

export const ADDITIONAL_INFO_HEADERS = [
  'Additional Info',
  'Tele CHK',
  'Web CHK',
  'M & M',
  'DEPU',
  'DEPA',
  'INAD',
  'Ofld By IMMig',
  'No Show',
  'Cbn Clsd',
  'Hld Clsd',
  'Crew Brd at',
  'CUSS Check in',
] as const;

export const ADDITIONAL_INFO_KEYS = [
  'additionalInfo',
  'addTeleChk',
  'addWebChk',
  'addMilesMore',
  'addDepu',
  'addDepa',
  'addInad',
  'addOffloadImmig',
  'addGateNoShow',
  'addCabinDoorClosed',
  'addHoldClosed',
  'addCrewBoarded',
  'addCussCheckin',
] as const;

export function buildAdditionalInfoRow(fh: FlightHandlingFieldMap): string[] {
  return ADDITIONAL_INFO_KEYS.map((k) => fhCellOrDash(fh, k));
}

/**
 * Flip a wide table (many columns, few rows) into vertical form:
 * field names in the first column, values in one or more data columns.
 */
export function transposeWideTable(
  columnHeaders: readonly string[],
  dataRows: string[][],
  valueColumnTitle = 'Value',
): { headers: string[]; rows: string[][] } {
  const hdrs = [...columnHeaders];
  if (dataRows.length === 0) {
    return { headers: ['Field', valueColumnTitle], rows: hdrs.map((h) => [h, '—']) };
  }
  if (dataRows.length === 1) {
    const row = dataRows[0]!;
    return {
      headers: ['Field', valueColumnTitle],
      rows: hdrs.map((h, i) => [h, String(row[i] ?? '').trim() || '—']),
    };
  }
  const newHeaders = ['Field', ...dataRows.map((r) => String(r[0] ?? '').trim() || '—')];
  const newRows = hdrs.map((h, ci) => [
    h,
    ...dataRows.map((r) => String(r[ci] ?? '').trim() || '—'),
  ]);
  return { headers: newHeaders, rows: newRows };
}

/**
 * Vertical passenger/transit table. Omits the horizontal “Info” column (row labels only),
 * so Arrival/Departure are not duplicated as a bogus “Info” data row.
 */
export function transposePaxReportTable(fh: FlightHandlingFieldMap): { headers: string[]; rows: string[][] } {
  const arrivals = buildPaxRow(fh, 'arrivals');
  const departures = buildPaxRow(fh, 'departures');
  const headers = ['Field', 'Arrival', 'Departure'];
  const rows: string[][] = [];
  for (let ci = 1; ci < PAX_REPORT_PDF_HEADERS.length; ci++) {
    rows.push([
      PAX_REPORT_PDF_HEADERS[ci]!,
      String(arrivals[ci] ?? '').trim() || '—',
      String(departures[ci] ?? '').trim() || '—',
    ]);
  }
  return { headers, rows };
}

export function briefHandlingDescription(fh: FlightHandlingFieldMap): string {
  return fhCell(fh, 'handlingDescription') || '—';
}

/** Footer row: matches Flight Details form “Report compiled by”. */
export const COMPILED_BY_HEADERS = ['Compiled By :', 'Designation', 'Date :'] as const;

export const COMPILED_BY_KEYS = ['compiledBy', 'designation', 'compiledDate'] as const;

export function buildCompiledByRow(fh: FlightHandlingFieldMap): string[] {
  return COMPILED_BY_KEYS.map((k) => fhCellOrDash(fh, k));
}
