import { toBillingTrackableFullName } from 'src/common/billing-trackable-equipment-name';

/** Map equipment-manpower embed entry → `fhr_collection.equipmentDetails` line (one row per entry). */
export function equipmentManpowerEntryToFhrDetail(entry: {
  name?: string;
  entryType?: string;
  equipmentName?: string;
  equipmentSerialNo?: string;
  employeeName?: string;
  employeeId?: string;
  designation?: string;
  fromDate?: string;
  fromTime?: string;
  toDate?: string;
  toTime?: string;
  remarks?: string;
}): Record<string, string | number> | null {
  const type = String(entry.entryType ?? '').trim().toLowerCase();
  const name = String(entry.name ?? '').trim();
  const isEquipment =
    type === 'equipment' || (!type && name.startsWith('EQ:'));
  if (!isEquipment) return null;

  const equipmentName = String(entry.equipmentName ?? '').trim();
  const equipmentSerialNo = String(entry.equipmentSerialNo ?? '').trim();
  const equipment_name =
    toBillingTrackableFullName(equipmentName || equipmentSerialNo, 'equipment') ||
    equipmentName ||
    equipmentSerialNo;
  if (!equipment_name) return null;

  const from = splitStoredDateTime(entry.fromDate, entry.fromTime);
  const to = splitStoredDateTime(entry.toDate, entry.toTime);
  const usage_time = durationHhMm(from.date, from.time, to.date, to.time);

  return {
    equipment_name,
    equipment_quantity: 1,
    from_date: from.date,
    from_time: from.time,
    to_date: to.date,
    to_time: to.time,
    usage_time,
    remarks: String(entry.remarks ?? '').trim(),
    employee_name: String(entry.employeeName ?? '').trim(),
    employee_id: String(entry.employeeId ?? '').trim(),
    designation: String(entry.designation ?? '').trim(),
  };
}

export function scheduleTemplateToFhrDetail(template: {
  equipmentName?: string;
  equipmentCode?: string;
  fromDate?: string;
  fromTime?: string;
  toDate?: string;
  toTime?: string;
  /** Advance → Schedule Equipment remarks (e.g. Arrival / Departure). */
  remarks?: string;
}): Record<string, string | number> | null {
  const equipmentName = String(template.equipmentName ?? '').trim();
  const equipmentCode = String(template.equipmentCode ?? '').trim();
  const equipment_name =
    toBillingTrackableFullName(equipmentName || equipmentCode, 'equipment') ||
    equipmentName ||
    equipmentCode;
  if (!equipment_name) return null;

  const from_date = String(template.fromDate ?? '').trim();
  const from_time = String(template.fromTime ?? '').trim();
  const to_date = String(template.toDate ?? '').trim();
  const to_time = String(template.toTime ?? '').trim();

  return {
    equipment_name,
    equipment_quantity: 1,
    from_date,
    from_time,
    to_date,
    to_time,
    usage_time: durationHhMm(from_date, from_time, to_date, to_time),
    remarks: String(template.remarks ?? '').trim(),
  };
}

function splitStoredDateTime(
  dateRaw?: string,
  timeRaw?: string,
): { date: string; time: string } {
  const dateStr = String(dateRaw ?? '').trim();
  const timeStr = String(timeRaw ?? '').trim();
  if (!dateStr) return { date: '', time: normalizeTime(timeStr) };

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return { date: `${d}/${m}/${y}`, time: normalizeTime(timeStr) };
  }

  const parts = dateStr.split(/[-/]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (a.length === 4) {
      return { date: `${b.padStart(2, '0')}/${c.padStart(2, '0')}/${a}`, time: normalizeTime(timeStr) };
    }
    return {
      date: `${a.padStart(2, '0')}/${b.padStart(2, '0')}/${c}`,
      time: normalizeTime(timeStr),
    };
  }

  return { date: dateStr, time: normalizeTime(timeStr) };
}

function normalizeTime(raw: string): string {
  const s = String(raw ?? '').trim().replace(/\./g, ':');
  if (!s) return '00:00';
  const parts = s.split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return '00:00';
}

function durationHhMm(
  fromDate: string,
  fromTime: string,
  toDate: string,
  toTime: string,
): string {
  const from = parseDdMmYyyyHhMm(fromDate, fromTime);
  const to = parseDdMmYyyyHhMm(toDate, toTime);
  if (!from || !to) return '';
  const diffMs = to.getTime() - from.getTime();
  if (diffMs <= 0) return '00:00';
  const totalMins = Math.round(diffMs / 60_000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseDdMmYyyyHhMm(dateStr: string, timeStr: string): Date | null {
  const dRaw = String(dateStr ?? '').trim();
  const tRaw = String(timeStr ?? '').trim();
  if (!dRaw) return null;
  const parts = dRaw.split(/[-/]/).map((p) => Number(p.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [d, m, y] = parts;
  const tp = tRaw.replace(/\./g, ':').split(':').map((p) => Number(p.trim()));
  const h = tp[0] ?? 0;
  const min = tp[1] ?? 0;
  const date = new Date(y, m - 1, d, h, min, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}
