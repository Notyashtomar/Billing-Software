import {
  sanitizeScheduleFlightNoInput,
  sanitizeScheduleRoutingInput,
  scheduleFlightNumber,
  scheduleRouting,
} from '@/lib/form-validation';
import {
  sameDayStaNotBeforeStd,
  validityOrderError,
} from '@/components/fris/advance/scheduleSetupShared';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const ADVANCE_SCHEDULE_CSV_TEMPLATE =
  'Airline,Flight No,STA Time,STD Time,Routing,Aircraft,Aircraft Body,Freighter,Type of Handling,Next Day,Valid From,Valid To,Flight Type,Operation Split,Arrival Flight No,Departure Flight No,Mon,Tue,Wed,Thu,Fri,Sat,Sun,Active\n' +
  'AERO NOMAD,101,06:30,07:15,DEL-BOM,B737-800,NB,No,Turnaround,False,28/02/2026,31/03/2026,International,No,,,Yes,Yes,Yes,Yes,Yes,No,No,Yes\n';

export type AdvanceScheduleAirlineOption = {
  id: string;
  name: string;
  code: string;
};

export type ParsedScheduleCsvRow = {
  rowNumber: number;
  payload: Record<string, unknown>;
};

export type ScheduleCsvParseResult = {
  rows: ParsedScheduleCsvRow[];
  skipped: { rowNumber: number; reason: string }[];
};

function parseBoolLike(v: unknown): boolean {
  if (v === true) return true;
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function pickField(row: Record<string, string>, ...aliases: string[]): string {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    const v = row[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function resolveAirline(
  row: Record<string, string>,
  airlines: AdvanceScheduleAirlineOption[],
  fallback: AdvanceScheduleAirlineOption | null | undefined,
): AdvanceScheduleAirlineOption | null {
  const name = pickField(row, 'Airline', 'airline', 'Airline Name');
  const code = pickField(row, 'Airline Code', 'airline code', 'Code');

  if (name) {
    const exact = airlines.find((a) => a.name.trim().toLowerCase() === name.toLowerCase());
    if (exact) return exact;
    const partial = airlines.find((a) =>
      a.name.trim().toLowerCase().includes(name.toLowerCase()),
    );
    if (partial) return partial;
  }

  if (code) {
    const byCode = airlines.find((a) => a.code.trim().toLowerCase() === code.toLowerCase());
    if (byCode) return byCode;
  }

  return fallback ?? null;
}

function parseScheduleDays(row: Record<string, string>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  let hasDayColumn = false;
  for (const day of DAYS) {
    const raw = pickField(row, day, day.toLowerCase(), day.toUpperCase());
    if (raw) {
      hasDayColumn = true;
      out[day] = parseBoolLike(raw);
    } else {
      out[day] = true;
    }
  }
  if (!hasDayColumn) {
    const combined = pickField(row, 'Days', 'Day Selection', 'Operate On');
    if (combined) {
      const tokens = combined
        .split(/[,;/|]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      for (const day of DAYS) {
        out[day] = tokens.some(
          (t) => t === day.toLowerCase() || t.startsWith(day.toLowerCase()),
        );
      }
    }
  }
  return out;
}

function buildPayload(
  airline: AdvanceScheduleAirlineOption,
  row: Record<string, string>,
): Record<string, unknown> | null {
  const flightNoRaw = pickField(row, 'Flight No', 'Flight No.', 'flightNo', 'Flight Number');
  const aircraft = pickField(row, 'Aircraft', 'A/C Type', 'AC Type', 'TypeCraft');
  const validFrom = pickField(row, 'Valid From', 'validFrom', 'STA Date', 'staDate');
  const validTo = pickField(row, 'Valid To', 'validTo', 'STD Date', 'stdDate');

  if (!flightNoRaw) return null;
  if (!aircraft) return null;
  if (!validFrom || !validTo) return null;
  if (validityOrderError(validFrom, validTo)) return null;

  const flightNo = sanitizeScheduleFlightNoInput(flightNoRaw);
  if (!flightNo || scheduleFlightNumber(flightNo)) return null;

  const sta = pickField(row, 'STA Time', 'STA', 'staTime', 'STATime') || '00:00';
  const std = pickField(row, 'STD Time', 'STD', 'stdTime', 'STDTime') || '00:00';
  const routingRaw = pickField(row, 'Routing', 'Route', 'routing', 'route');
  const routing = sanitizeScheduleRoutingInput(routingRaw);
  if (routing && scheduleRouting(routing)) return null;
  const flightType = pickField(
    row,
    'Flight Type',
    'Type Of Flight',
    'Type of flight',
    'flightType',
    'Category',
  );
  const aircraftBody = pickField(row, 'Aircraft Body', 'aircraftBody', 'A Body') || 'NB';
  const freighter = pickField(row, 'Freighter', 'freighter') || 'No';
  const typeOfHandling =
    pickField(row, 'Type of Handling', 'Type Of Handling', 'Handling', 'typeOfHandling') ||
    'Turnaround';
  const nextDayRaw = pickField(row, 'Next Day', 'nextDay');
  const nextDay = parseBoolLike(nextDayRaw) ? 'true' : 'false';
  if (sameDayStaNotBeforeStd(sta, std, nextDay === 'true')) return null;
  const operationSplit = parseBoolLike(
    pickField(row, 'Operation Split', 'IsSplit', 'ifOperationSplit', 'Split'),
  );
  const arrivalFlightNo = sanitizeScheduleFlightNoInput(
    pickField(row, 'Arrival Flight No', 'Arrival Flt No', 'arrivalFlightNo'),
  );
  const departureFlightNo = sanitizeScheduleFlightNoInput(
    pickField(row, 'Departure Flight No', 'Departure Flt No', 'departureFlightNo'),
  );
  if (operationSplit) {
    if (!arrivalFlightNo || scheduleFlightNumber(arrivalFlightNo, 'Arrival flight number')) {
      return null;
    }
    if (
      !departureFlightNo ||
      scheduleFlightNumber(departureFlightNo, 'Departure flight number')
    ) {
      return null;
    }
  }
  const active = parseBoolLike(pickField(row, 'Active', 'active') || 'yes');
  const scheduleDays = parseScheduleDays(row);
  const serialNo = pickField(row, 'Serial No', 'S No', 'serialNo', 'Sl No');

  const payload: Record<string, unknown> = {
    Airline: airline.name,
    'Airline Code': airline.code,
    airline: airline.name,
    'Flight No': flightNo,
    flightNo,
    'Flight Type': flightType,
    'Type of flight': flightType,
    flight: flightType,
    'STA Time': sta,
    'STD Time': std,
    staTime: sta,
    stdTime: std,
    Routing: routing,
    route: routing,
    Aircraft: aircraft,
    TypeCraft: aircraft,
    aircraft,
    'Aircraft Body': aircraftBody,
    aircraftBody,
    Freighter: freighter,
    'Type of Handling': typeOfHandling,
    'Next Day': nextDay === 'true' ? 'True' : 'False',
    nextDay,
    'Valid From': validFrom,
    'Valid To': validTo,
    'Operation Split': operationSplit ? 'Yes' : 'No',
    ifOperationSplit: operationSplit,
    'Arrival Flight No': arrivalFlightNo,
    arrivalFlightNo,
    'Departure Flight No': departureFlightNo,
    departureFlightNo,
    scheduleDays,
    Active: active ? 'Yes' : 'No',
    active,
    scheduleSource: 'advance_schedule_setup',
    exportedNAV: 'No',
    rampLocked: 'No',
    paxLocked: 'No',
    gsdLocked: 'No',
  };

  if (serialNo) {
    payload.serialNo = serialNo;
  }

  return payload;
}

export function parseAdvanceScheduleCsv(
  text: string,
  airlines: AdvanceScheduleAirlineOption[],
  fallbackAirline: AdvanceScheduleAirlineOption | null | undefined,
): ScheduleCsvParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return { rows: [], skipped: [{ rowNumber: 0, reason: 'CSV must include a header row and at least one data row.' }] };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows: ParsedScheduleCsvRow[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.every((v) => !v.trim())) continue;

    const rowRecord: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (header) rowRecord[header] = values[idx] ?? '';
    });

    const rowNumber = i + 1;
    const airline = resolveAirline(rowRecord, airlines, fallbackAirline);
    if (!airline) {
      skipped.push({
        rowNumber,
        reason: 'Airline not found. Add an Airline column or select an airline above before import.',
      });
      continue;
    }

    const payload = buildPayload(airline, rowRecord);
    if (!payload) {
      skipped.push({
        rowNumber,
        reason: 'Missing required fields (Flight No, Aircraft, Valid From, Valid To).',
      });
      continue;
    }

    rows.push({ rowNumber, payload });
  }

  return { rows, skipped };
}

export function downloadAdvanceScheduleCsvTemplate(): void {
  const blob = new Blob([ADVANCE_SCHEDULE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'advance-schedule-import-format.csv';
  a.click();
  URL.revokeObjectURL(url);
}
