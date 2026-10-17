/** Header labels exactly as they appear on the Aircraft Master sheet. */
export const AIRCRAFT_MASTER_COLUMN_LABELS = [
  'S_No_',
  'Aircraft Type',
  'Description',
  'Manufacturer',
  'Category',
  'Ceiling rate',
  'Aera rates',
  'Valid till',
  'ICAO Code',
  'MTOW (kg)',
  'Passenger Capacity',
  'Aircraft Body',
  'Wingspan (m)',
  'Status',
  'Status',
] as const;

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

/** Returns the missing column labels. Values may be blank; headers may not. */
export function missingAircraftMasterHeaders(headers: unknown[]): string[] {
  const counts = new Map<string, number>();
  for (const header of headers) {
    const key = normalizeAircraftHeader(header);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const required = new Map<string, { label: string; count: number }>();
  for (const label of AIRCRAFT_MASTER_COLUMN_LABELS) {
    const key = normalizeAircraftHeader(label);
    const current = required.get(key);
    if (current) current.count += 1;
    else required.set(key, { label, count: 1 });
  }

  const missing: string[] = [];
  for (const { label, count } of required.values()) {
    const found = counts.get(normalizeAircraftHeader(label)) ?? 0;
    if (found < count) {
      missing.push(count > 1 ? `${label} (must appear ${count} times)` : label);
    }
  }
  return missing;
}
