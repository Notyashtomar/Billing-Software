import type { BillingSourceRow } from '@/lib/billing-shared/billing-sources';
import { formatBillingDate } from '@/lib/billing-shared/billing-date-format';

export const MAAS_SHIFT_DAY = 'Day (06:00-18:00)';
export const MAAS_SHIFT_NIGHT = 'Night (18:00-06:00)';

export const MAAS_SHIFT_OPTIONS = [
  { value: '', label: 'All shifts' },
  { value: MAAS_SHIFT_DAY, label: MAAS_SHIFT_DAY },
  { value: MAAS_SHIFT_NIGHT, label: MAAS_SHIFT_NIGHT },
] as const;

export const MAAS_SERVICE_TYPE_OPTIONS = [
  { value: '', label: 'All service types' },
  { value: 'Single', label: 'Single passenger' },
  { value: 'Group', label: 'Group escort' },
] as const;

export const MAAS_STAFF_TYPE_OPTIONS = [
  { value: '', label: 'All staff types' },
  { value: 'Single', label: 'Single staff' },
  { value: 'Group', label: 'Group staff' },
] as const;

export const MAAS_GLOVE_OPTIONS = [
  { value: '', label: 'All glove services' },
  { value: 'white', label: 'White glove' },
  { value: 'blue', label: 'Blue glove' },
  { value: 'none', label: 'No glove flag' },
] as const;

export type MaasShiftFilter = (typeof MAAS_SHIFT_OPTIONS)[number]['value'];
export type MaasServiceTypeFilter = (typeof MAAS_SERVICE_TYPE_OPTIONS)[number]['value'];
export type MaasStaffTypeFilter = (typeof MAAS_STAFF_TYPE_OPTIONS)[number]['value'];
export type MaasGloveFilter = (typeof MAAS_GLOVE_OPTIONS)[number]['value'];

export type MaasBillingFilters = {
  shift: MaasShiftFilter;
  serviceType: MaasServiceTypeFilter;
  staffType: MaasStaffTypeFilter;
  glove: MaasGloveFilter;
};

export const EMPTY_MAAS_BILLING_FILTERS: MaasBillingFilters = {
  shift: '',
  serviceType: '',
  staffType: '',
  glove: '',
};

function opString(row: BillingSourceRow, ...keys: string[]): string {
  const op = row.operationalData ?? {};
  for (const key of keys) {
    const value = String(op[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function hourFromTime(raw: string): number | null {
  const match = /(\d{1,2})/.exec(String(raw ?? '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  return hour;
}

export function inferMaasShiftFromTime(raw: string): string {
  const hour = hourFromTime(raw);
  if (hour == null) return '';
  return hour >= 6 && hour < 18 ? MAAS_SHIFT_DAY : MAAS_SHIFT_NIGHT;
}

export function maasShiftLabel(row: BillingSourceRow): string {
  const explicit = opString(row, 'shift', 'maasShift');
  if (explicit) return explicit;
  return inferMaasShiftFromTime(
    opString(row, 'atdTime', 'staTime', 'ataTime', 'stdTime'),
  );
}

export function maasServiceTypeLabel(row: BillingSourceRow): string {
  const explicit = opString(row, 'serviceType', 'maasServiceType');
  if (explicit) return explicit;
  const notes = opString(row, 'escortNotes', 'bwfsRepRemarksI', 'airlineRepRemarksI');
  return /group/i.test(notes) ? 'Group' : 'Single';
}

export function maasStaffTypeLabel(row: BillingSourceRow): string {
  return opString(row, 'staffType', 'maasStaffType') || 'Single';
}

export function maasStaffLabel(row: BillingSourceRow): string {
  const name = opString(row, 'staffEmployeeName', 'staffName');
  const code = opString(row, 'staffEmployeeCode', 'staffCode');
  const type = maasStaffTypeLabel(row);
  const count = opString(row, 'staffCount') || '1';
  if (name && code) return `${type} · ${count} · ${code} — ${name}`;
  if (name) return `${type} · ${count} · ${name}`;
  if (code) return `${type} · ${count} · ${code}`;
  return `${type} · ${count}`;
}

export function maasPassengerLabel(row: BillingSourceRow): string {
  return opString(row, 'passengerName', 'paxName') || '—';
}

export function maasPnrLabel(row: BillingSourceRow): string {
  return opString(row, 'pnr', 'PNR') || '—';
}

export function maasPaxCount(row: BillingSourceRow): number {
  const raw = opString(row, 'pax', 'flightQuantity', 'qty');
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function maasPaxLabel(row: BillingSourceRow): string {
  return String(maasPaxCount(row));
}

export function maasWhiteGlove(row: BillingSourceRow): boolean {
  const flag = opString(row, 'whiteGlove').toLowerCase();
  if (flag === 'yes' || flag === 'true' || flag === 'y') return true;
  return /white\s*glove/i.test(
    opString(row, 'escortNotes', 'bwfsRepRemarksI', 'airlineRepRemarksI'),
  );
}

export function maasBlueGlove(row: BillingSourceRow): boolean {
  const flag = opString(row, 'blueGlove').toLowerCase();
  if (flag === 'yes' || flag === 'true' || flag === 'y') return true;
  return /blue\s*glove/i.test(
    opString(row, 'escortNotes', 'bwfsRepRemarksI', 'airlineRepRemarksI'),
  );
}

export function maasGloveLabel(row: BillingSourceRow): string {
  const white = maasWhiteGlove(row);
  const blue = maasBlueGlove(row);
  if (white && blue) return 'White + Blue';
  if (white) return 'White glove';
  if (blue) return 'Blue glove';
  return '—';
}

export function maasAirlineLabel(row: BillingSourceRow): string {
  return (
    opString(row, 'airlineName', 'customerName', 'Airline') ||
    opString(row, 'customerCode') ||
    '—'
  );
}

export function maasFlightLabel(row: BillingSourceRow): string {
  return (
    String(
      row.operationalData.flightNoEquipmentNo ??
        row.operationalData.flightNumber ??
        row.operationalData.flightNo ??
        row.sourceRef.flightNo ??
        '',
    ).trim() || '—'
  );
}

export function maasSerialLabel(row: BillingSourceRow): string {
  return (
    String(row.sourceRef.serialNo ?? row.operationalData.serialNumber ?? '').trim() || '—'
  );
}

export function maasServiceDateLabel(row: BillingSourceRow): string {
  return formatBillingDate(opString(row, 'serviceDate', 'atdDate', 'staDate', 'stdDate'));
}

export function maasRowMatchesFilters(
  row: BillingSourceRow,
  filters: MaasBillingFilters,
): boolean {
  if (filters.shift && maasShiftLabel(row) !== filters.shift) return false;
  if (filters.serviceType && maasServiceTypeLabel(row) !== filters.serviceType) return false;
  if (filters.staffType && maasStaffTypeLabel(row) !== filters.staffType) return false;
  if (filters.glove === 'white' && !maasWhiteGlove(row)) return false;
  if (filters.glove === 'blue' && !maasBlueGlove(row)) return false;
  if (filters.glove === 'none' && (maasWhiteGlove(row) || maasBlueGlove(row))) return false;
  return true;
}

export type MaasBillingStats = {
  escorts: number;
  passengers: number;
  singleEscorts: number;
  groupEscorts: number;
  dayShift: number;
  nightShift: number;
  whiteGlove: number;
  blueGlove: number;
  eligible: number;
  errors: number;
};

export function computeMaasBillingStats(rows: BillingSourceRow[]): MaasBillingStats {
  const stats: MaasBillingStats = {
    escorts: rows.length,
    passengers: 0,
    singleEscorts: 0,
    groupEscorts: 0,
    dayShift: 0,
    nightShift: 0,
    whiteGlove: 0,
    blueGlove: 0,
    eligible: 0,
    errors: 0,
  };
  for (const row of rows) {
    stats.passengers += maasPaxCount(row);
    if (maasServiceTypeLabel(row) === 'Group') stats.groupEscorts += 1;
    else stats.singleEscorts += 1;
    const shift = maasShiftLabel(row);
    if (shift === MAAS_SHIFT_NIGHT) stats.nightShift += 1;
    else if (shift === MAAS_SHIFT_DAY) stats.dayShift += 1;
    if (maasWhiteGlove(row)) stats.whiteGlove += 1;
    if (maasBlueGlove(row)) stats.blueGlove += 1;
    if (row.billingEligibility.eligible) stats.eligible += 1;
    if (!row.validationStatus.passed) stats.errors += 1;
  }
  return stats;
}
