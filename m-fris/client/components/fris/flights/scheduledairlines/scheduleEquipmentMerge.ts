import {
  type FlightData,
  type MainDetailsData,
  normalizeMainDetailsData,
} from '@/utils/dataProcessor';
import type { ScheduleFieldsFromRawApi } from './scheduledRowSchedule';
import {
  scheduleStaDateDisplay,
  scheduleStdDateDisplay,
  scheduleStaTimeRawDisplay,
  scheduleStdTimeRawDisplay,
} from './scheduledRowSchedule';
import type { ScheduledAirlineEquipmentTemplateRow } from '@/lib/api';
import { toDisplayDate } from './scheduleDisplayDate';

export const SCHEDULE_EQ_ID_PREFIX = 'eq-sched:';

export type ScheduleEquipmentManpowerEntry = {
  id: string;
  equipmentName: string;
  equipmentSerialNo: string;
  employeeName: string;
  employeeId: string;
  designation: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  remarks: string;
  exportedInNav: string;
};

export type ScheduledAirlineEquipmentTemplate = {
  equipmentName: string;
  equipmentCode: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  /** Advance → Schedule Equipment remarks (e.g. Arrival / Departure). */
  remarks?: string;
};

type ScheduleEquipmentRuleLike = {
  timeRequired?: boolean;
  option1Basis?: string;
  option1Sign?: string;
  option1Minutes?: number;
  option2Basis?: string;
  option2Sign?: string;
  option2Minutes?: number;
};

type ScheduleEquipmentMilestones = {
  ataDate: string;
  ataTime: string;
  atdDate: string;
  atdTime: string;
  defaultDate: string;
};

function isoOrRawToDisplayDate(raw: string | undefined, fallback: string): string {
  return toDisplayDate(raw) || fallback;
}

function normalizeTimeHhMm(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const normalized = s.replace(/\./g, ':');
  const parts = normalized.split(':').map((p) => p.trim());
  if (parts.length >= 2) {
    const h = parts[0].padStart(2, '0').slice(-2);
    const m = parts[1].padStart(2, '0').slice(0, 2);
    return `${h}:${m}`;
  }
  return '';
}

function parseDdMmYyyyHhMm(dateStr: string, timeStr: string): Date | null {
  const dRaw = String(dateStr ?? '').trim();
  const tRaw = String(timeStr ?? '').trim();
  if (!dRaw) return null;
  const parts = dRaw.split(/[-/]/).map((p) => Number(p.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [d, m, y] = parts;
  let h = 0;
  let min = 0;
  if (tRaw) {
    const tp = tRaw.replace(/\./g, ':').split(':').map((p) => Number(p.trim()));
    h = tp[0] ?? 0;
    min = tp[1] ?? 0;
  }
  const date = new Date(y, m - 1, d, h, min, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDdMmYyyy(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatHhMm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function applyScheduleEquipmentOffset(
  dateDdMmYyyy: string,
  timeHhMm: string,
  sign: string,
  minutes: number,
): { date: string; time: string } {
  const dt = parseDdMmYyyyHhMm(dateDdMmYyyy, timeHhMm);
  if (!dt) {
    return { date: dateDdMmYyyy || '', time: timeHhMm || '00:00' };
  }
  const deltaMs =
    (String(sign).trim() === 'Plus' ? 1 : -1) *
    Math.max(0, Number(minutes) || 0) *
    60_000;
  const out = new Date(dt.getTime() + deltaMs);
  return {
    date: formatDdMmYyyy(out),
    time: formatHhMm(out),
  };
}

/** Client-side From/To window (mirrors server schedule-equipment-time.util). */
export function scheduleEquipmentWindowFromRule(
  rule: ScheduleEquipmentRuleLike,
  milestones: Omit<ScheduleEquipmentMilestones, 'defaultDate'>,
  defaultDate: string,
): { fromDate: string; fromTime: string; toDate: string; toTime: string } {
  const zero = { date: defaultDate, time: '00:00' };
  const option1Minutes = Math.max(0, Number(rule.option1Minutes) || 0);
  const option2Minutes = Math.max(0, Number(rule.option2Minutes) || 0);
  const useTimedWindow =
    rule.timeRequired === true || option1Minutes > 0 || option2Minutes > 0;

  if (!useTimedWindow) {
    return {
      fromDate: zero.date,
      fromTime: zero.time,
      toDate: zero.date,
      toTime: zero.time,
    };
  }

  const basisDateTime = (basis: string) => {
    const b = String(basis ?? '')
      .trim()
      .toUpperCase();
    if (b === 'ATD') {
      return {
        date: milestones.atdDate || defaultDate,
        time: milestones.atdTime || '00:00',
      };
    }
    return {
      date: milestones.ataDate || defaultDate,
      time: milestones.ataTime || '00:00',
    };
  };

  const fromBase = basisDateTime(rule.option1Basis ?? 'ATA');
  const toBase = basisDateTime(rule.option2Basis ?? 'ATD');
  const from = applyScheduleEquipmentOffset(
    fromBase.date,
    fromBase.time,
    rule.option1Sign ?? 'Minus',
    option1Minutes,
  );
  const to = applyScheduleEquipmentOffset(
    toBase.date,
    toBase.time,
    rule.option2Sign ?? 'Plus',
    option2Minutes,
  );
  return {
    fromDate: from.date,
    fromTime: from.time,
    toDate: to.date,
    toTime: to.time,
  };
}

/** Merge sidebar main details with FHR embed (normalized field names). */
export function resolveEffectiveMainDetailsForScheduleEquipment(
  fromProp?: MainDetailsData | null,
  fromFhr?: MainDetailsData | Record<string, unknown> | null,
): MainDetailsData | null {
  const prop = fromProp ? normalizeMainDetailsData(fromProp) : null;
  const fhr = fromFhr ? normalizeMainDetailsData(fromFhr) : null;
  if (!prop && !fhr) return null;
  if (!prop) return fhr;
  if (!fhr) return prop;
  return {
    ...fhr,
    ...prop,
    ataDate: prop.ataDate || fhr.ataDate,
    ataTime: prop.ataTime || fhr.ataTime,
    atdDate: prop.atdDate || fhr.atdDate,
    atdTime: prop.atdTime || fhr.atdTime,
    airlineCode: prop.airlineCode || fhr.airlineCode,
    airlineName: prop.airlineName || fhr.airlineName,
    aircraftBody: prop.aircraftBody || fhr.aircraftBody,
    aircraftType: prop.aircraftType || fhr.aircraftType,
    ifOperationSplit:
      prop.ifOperationSplit === true ? true : fhr.ifOperationSplit,
  };
}

/** ATA/ATD wall times for schedule equipment (actuals from main details, else STA/STD). */
export function resolveFlightMilestonesForScheduleEquipment(args: {
  flight: FlightData;
  mainDetails?: MainDetailsData | null;
  scheduleFromRaw?: ScheduleFieldsFromRawApi | null;
}): ScheduleEquipmentMilestones {
  const staDate = scheduleStaDateDisplay(args.flight, args.scheduleFromRaw ?? null);
  const stdDate = scheduleStdDateDisplay(args.flight, args.scheduleFromRaw ?? null);
  const staTime = scheduleStaTimeRawDisplay(args.flight, args.scheduleFromRaw ?? null);
  const stdTime = scheduleStdTimeRawDisplay(args.flight, args.scheduleFromRaw ?? null);
  const defaultDate = toDisplayDate(stdDate || staDate);
  const normalized = args.mainDetails
    ? normalizeMainDetailsData(args.mainDetails)
    : null;

  const hasActualAta = Boolean(
    normalized?.ataTime?.trim() || normalized?.ataDate?.trim(),
  );
  const hasActualAtd = Boolean(
    normalized?.atdTime?.trim() || normalized?.atdDate?.trim(),
  );

  const ataDate = hasActualAta
    ? isoOrRawToDisplayDate(normalized?.ataDate, toDisplayDate(staDate))
    : toDisplayDate(staDate);
  const atdDate = hasActualAtd
    ? isoOrRawToDisplayDate(normalized?.atdDate, toDisplayDate(stdDate))
    : toDisplayDate(stdDate);
  const ataTime = hasActualAta
    ? normalizeTimeHhMm(normalized?.ataTime) || staTime || '00:00'
    : staTime || '00:00';
  const atdTime = hasActualAtd
    ? normalizeTimeHhMm(normalized?.atdTime) || stdTime || '00:00'
    : stdTime || '00:00';

  return { ataDate, ataTime, atdDate, atdTime, defaultDate };
}

function isUsableAirlineCode(code: string | undefined | null): boolean {
  const c = String(code ?? '').trim();
  return c.length > 0 && c !== '-';
}

/** Strip placeholder codes so schedule-equipment lookup falls back to airline name. */
export function normalizeAirlineCodeForScheduleEquipment(
  code: string | undefined | null,
): string | undefined {
  return isUsableAirlineCode(code) ? String(code).trim() : undefined;
}

export function resolveScheduleEquipmentAirlineLookup(args: {
  mainDetails?: MainDetailsData | null;
  flight?: FlightData;
}): { airlineCode?: string; airlineName?: string } {
  const normalized = args.mainDetails
    ? normalizeMainDetailsData(args.mainDetails)
    : null;
  const airlineCode = normalizeAirlineCodeForScheduleEquipment(
    normalized?.airlineCode ?? args.flight?.airlineCode,
  );
  const airlineName = (
    normalized?.airlineName ??
    args.flight?.airline ??
    ''
  ).trim();
  return {
    airlineCode,
    airlineName: airlineName || undefined,
  };
}

export function resolveAircraftBodyForScheduleEquipment(
  mainDetails?: MainDetailsData | null,
  flight?: FlightData,
  catalogBodyByType?: Map<string, 'NB' | 'WB'>,
): 'NB' | 'WB' {
  const normalized = mainDetails ? normalizeMainDetailsData(mainDetails) : null;
  const embedded = (normalized?.aircraftBody ?? '').trim().toUpperCase();
  if (embedded === 'WB' || embedded === 'NB') return embedded;
  const type = (normalized?.aircraftType ?? flight?.aircraft ?? '').trim();
  if (type && catalogBodyByType?.size) {
    const hit = catalogBodyByType.get(type.toLowerCase());
    if (hit) return hit;
  }
  const tc = type.toUpperCase();
  if (/\b(777|787|747|380|350|330|340|359)\b/.test(tc)) return 'WB';
  return 'NB';
}

/** Recompute From/To on the client using current ATA/ATD + option offsets. */
export function applyMilestonesToScheduleEquipmentTemplates(
  rules: ScheduledAirlineEquipmentTemplateRow[],
  milestones: ScheduleEquipmentMilestones,
): ScheduledAirlineEquipmentTemplate[] {
  return rules.map((rule) => {
    const window = scheduleEquipmentWindowFromRule(rule, milestones, milestones.defaultDate);
    return {
      equipmentName: rule.equipmentName,
      equipmentCode: rule.equipmentCode,
      fromDate: window.fromDate,
      fromTime: window.fromTime,
      toDate: window.toDate,
      toTime: window.toTime,
      remarks: String(rule.remarks ?? '').trim() || undefined,
    };
  });
}

function normEquipmentName(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** One row per equipment code (fallback: name). Keeps first occurrence. */
export function dedupeScheduleEquipmentTemplates(
  templates: ScheduledAirlineEquipmentTemplate[],
): ScheduledAirlineEquipmentTemplate[] {
  const seen = new Set<string>();
  const out: ScheduledAirlineEquipmentTemplate[] = [];
  for (const t of templates) {
    const codeKey = t.equipmentCode.trim().toUpperCase();
    const nameKey = normEquipmentName(t.equipmentName);
    if (!codeKey && !nameKey) continue;
    if ((codeKey && seen.has(`c:${codeKey}`)) || (nameKey && seen.has(`n:${nameKey}`))) {
      continue;
    }
    if (codeKey) seen.add(`c:${codeKey}`);
    if (nameKey) seen.add(`n:${nameKey}`);
    out.push(t);
  }
  return out;
}

function entryMatchesTemplate(
  entry: ScheduleEquipmentManpowerEntry,
  template: ScheduledAirlineEquipmentTemplate,
): boolean {
  const codeKey = template.equipmentCode.trim().toUpperCase();
  const nameKey = normEquipmentName(template.equipmentName);
  const entryCode = entry.equipmentSerialNo.trim().toUpperCase();
  const entryName = normEquipmentName(entry.equipmentName);
  if (codeKey && entryCode && entryCode === codeKey) return true;
  if (nameKey && entryName && entryName === nameKey) return true;
  if (codeKey && entry.id === `${SCHEDULE_EQ_ID_PREFIX}${codeKey}`) return true;
  // FHR-published schedule lines use eq-fhr-* ids; match by name/code above.
  return false;
}

/** Merge Advance → Schedule Equipment templates into the GSE list (recalculates From/To). */
export function mergeScheduleEquipmentIntoEntries(
  existing: ScheduleEquipmentManpowerEntry[],
  templates: ScheduledAirlineEquipmentTemplate[],
): ScheduleEquipmentManpowerEntry[] {
  const uniqueTemplates = dedupeScheduleEquipmentTemplates(templates);
  if (uniqueTemplates.length === 0) {
    return existing;
  }

  const templateCodes = new Set(
    uniqueTemplates
      .map((t) => t.equipmentCode.trim().toUpperCase())
      .filter(Boolean),
  );
  const templateNames = new Set(
    uniqueTemplates
      .map((t) => normEquipmentName(t.equipmentName))
      .filter(Boolean),
  );

  // Keep only true manual adds — drop prior schedule / FHR copies of the same GSE.
  const manual = existing.filter((e) => {
    if (e.id.startsWith(SCHEDULE_EQ_ID_PREFIX)) return false;
    if (e.id.startsWith('eq-fhr-')) return false;
    const code = e.equipmentSerialNo.trim().toUpperCase();
    if (code && templateCodes.has(code)) return false;
    const name = normEquipmentName(e.equipmentName);
    if (name && templateNames.has(name)) return false;
    return true;
  });

  const scheduleEntries = uniqueTemplates.map((t) => {
    const codeKey = t.equipmentCode.trim().toUpperCase();
    const scheduleId = `${SCHEDULE_EQ_ID_PREFIX}${codeKey || normEquipmentName(t.equipmentName)}`;
    const prior = existing.find((e) => entryMatchesTemplate(e, t));
    const priorRemarks = String(prior?.remarks ?? '').trim();
    const templateRemarks = String(t.remarks ?? '').trim();
    return {
      id: scheduleId,
      equipmentName: t.equipmentName,
      equipmentSerialNo: t.equipmentCode,
      employeeName: prior?.employeeName ?? '',
      employeeId: prior?.employeeId ?? '',
      designation: prior?.designation || '',
      fromDate: t.fromDate,
      fromTime: t.fromTime,
      toDate: t.toDate,
      toTime: t.toTime,
      // Prefer operator-edited notes; else Advance Schedule Equipment remarks.
      remarks: priorRemarks || templateRemarks,
      exportedInNav: prior?.exportedInNav ?? 'N',
    };
  });

  return [...scheduleEntries, ...manual];
}

/**
 * Fill empty `storedRemarks` on GSE rows from Advance → Schedule Equipment remarks
 * (e.g. Arrival / Departure). Used when FHR already published with blank remarks.
 */
export function enrichEquipmentStoredRemarksFromScheduleTemplates<
  T extends {
    equipmentName?: string;
    equipmentId?: string;
    equipmentSerialNo?: string;
    storedRemarks?: string;
  },
>(
  rows: T[],
  templates: Array<{
    equipmentName?: string;
    equipmentCode?: string;
    remarks?: string;
  }>,
): T[] {
  if (!rows.length || !templates.length) return rows;

  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const t of templates) {
    const remarks = String(t.remarks ?? '').trim();
    if (!remarks) continue;
    const code = String(t.equipmentCode ?? '').trim().toUpperCase();
    const name = normEquipmentName(t.equipmentName);
    if (code && !byCode.has(code)) byCode.set(code, remarks);
    if (name && !byName.has(name)) byName.set(name, remarks);
  }
  if (byCode.size === 0 && byName.size === 0) return rows;

  return rows.map((row) => {
    if (String(row.storedRemarks ?? '').trim()) return row;
    const code = String(row.equipmentId ?? row.equipmentSerialNo ?? '')
      .trim()
      .toUpperCase();
    const name = normEquipmentName(row.equipmentName);
    const hit =
      (code && byCode.get(code)) || (name && byName.get(name)) || undefined;
    if (!hit) return row;
    return { ...row, storedRemarks: hit };
  });
}
