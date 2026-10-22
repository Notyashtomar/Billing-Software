export type AircraftMasterSheetRow = {
  sortIndex: number;
  serialNo: string;
  aircraftType: string;
  icaoCode: string;
  mtowKg: string;
  passengerCapacity: string;
  manufacturer: string;
  aircraftBody: string;
  wingspanM: string;
  description: string;
  active: string;
  category: string;
  categoryCode: string;
  activeSecondary: string;
  ceilingRate: string;
  arrayRate: string;
  validTill: string;
};

/** Columns written by Export, in the aircraft-master workbook order. */
export const AIRCRAFT_MASTER_EXPORT_LABELS = [
  'S_No_',
  'Aircraft Type',
  'Manufacturer',
  'Aircraft Body',
  'ICAO Code',
  'Wingspan (m)',
  'MTOW (kg)',
  'Passenger Capacity',
  'Description',
  'Active',
  'Category',
  'Category code',
  'Status',
  'Ceiling rate',
  'Aera rates',
  'Valid till',
] as const;

const HEADER_FIELD: Record<string, keyof Omit<AircraftMasterSheetRow, 'sortIndex'>> = {
  s_no_: 'serialNo',
  's no': 'serialNo',
  's no.': 'serialNo',
  'serial no': 'serialNo',
  'serial no.': 'serialNo',
  'aircraft type': 'aircraftType',
  type: 'aircraftType',
  'icao code': 'icaoCode',
  icao: 'icaoCode',
  'mtow (kg)': 'mtowKg',
  mtow: 'mtowKg',
  'passenger capacity': 'passengerCapacity',
  passengers: 'passengerCapacity',
  manufacturer: 'manufacturer',
  'aircraft body': 'aircraftBody',
  body: 'aircraftBody',
  'wingspan (m)': 'wingspanM',
  wingspan: 'wingspanM',
  description: 'description',
  'category code': 'categoryCode',
  'tariff category': 'categoryCode',
  'ceiling rate': 'ceilingRate',
  'aera rates': 'arrayRate',
  'valid till': 'validTill',
};

export function normalizeAircraftHeader(value: unknown): string {
  const key = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (key === 'array rate' || key === 'aera rate') return 'aera rates';
  if (key === 'active') return 'status';
  if (key === 'valid until' || key === 'valid to' || key === 'validity') return 'valid till';
  return key;
}

function cell(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object' && value && 'text' in value) {
    return String((value as { text?: unknown }).text ?? '').trim();
  }
  return String(value).trim();
}

export function emptyAircraftMasterRow(sortIndex = 0): AircraftMasterSheetRow {
  return {
    sortIndex,
    serialNo: '',
    aircraftType: '',
    icaoCode: '',
    mtowKg: '',
    passengerCapacity: '',
    manufacturer: '',
    aircraftBody: '',
    wingspanM: '',
    description: '',
    active: '',
    category: '',
    categoryCode: '',
    activeSecondary: '',
    ceilingRate: '',
    arrayRate: '',
    validTill: '',
  };
}

export function aircraftMasterRowHasContent(row: Omit<AircraftMasterSheetRow, 'sortIndex'>): boolean {
  return Object.values(row).some((value) => String(value ?? '').trim());
}

/** Map one sheet line. The first Category/Active columns stay the text fields; the second become code and status. */
export function aircraftMasterRowFromLine(
  headers: unknown[],
  line: unknown[],
  sortIndex: number,
): AircraftMasterSheetRow {
  const row = emptyAircraftMasterRow(sortIndex);
  let statusSeen = 0;
  let categorySeen = 0;
  headers.forEach((header, index) => {
    const key = normalizeAircraftHeader(header);
    if (!key) return;
    let field: keyof Omit<AircraftMasterSheetRow, 'sortIndex'> | undefined;
    if (key === 'status') {
      field = statusSeen++ === 0 ? 'active' : 'activeSecondary';
    } else if (key === 'category') {
      field = categorySeen++ === 0 ? 'category' : 'categoryCode';
    } else {
      field = HEADER_FIELD[key];
    }
    if (!field || row[field]) return;
    row[field] = cell(line[index]);
  });
  return row;
}

/** Read the Aircraft sheet. The header row is the first row that contains Aircraft Type. */
export function aircraftMasterRowsFromSheet(matrix: unknown[][]): AircraftMasterSheetRow[] {
  const headerIndex = matrix.findIndex(
    (row) =>
      Array.isArray(row) &&
      row.some((value) => normalizeAircraftHeader(value) === 'aircraft type'),
  );
  if (headerIndex < 0) return [];
  const headers = matrix[headerIndex] ?? [];
  const rows: AircraftMasterSheetRow[] = [];
  for (const line of matrix.slice(headerIndex + 1)) {
    if (!Array.isArray(line)) continue;
    const row = aircraftMasterRowFromLine(headers, line, rows.length);
    if (!aircraftMasterRowHasContent(row)) continue;
    rows.push(row);
  }
  return rows;
}
