import type { CreateMainDetailsDto } from 'src/main-details/dto/create-main-details.dto';
import type { CreateTerminalDetailsDto } from 'src/terminal-details/dto/create-terminal-details.dto';
import type { CreateRampDetails1Dto } from 'src/ramp-details-1/dto/create-ramp-details-1.dto';
import type { CreateLoadControlDetailsDto } from 'src/load-control-details/dto/create-load-control-details.dto';
import type { CreateAttachmentsDto } from 'src/attachments/dto/create-attachments.dto';

/**
 * Display-header → schema mapping for `HYD_july_skd_flights.xls`.
 *
 * Date and time stay **split** (`STADate` + `STATime`, …) matching
 * `main-details` / `terminal-details` / `ramp-details-1`. Combined export
 * timestamps go to `lastSnapshotAt` / `workbookExtras`.
 */

export function normalizeHydHeader(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Every workbook header (row 1) → mapper key. Keep 1:1 so no column is dropped. */
export const HYD_JULY_HEADER_KEYS: Record<string, string> = {
  'serial number': 'serialNumber',
  'customer name': 'customerName',
  'customer code': 'customerCode',
  'flight no': 'flightNo',
  'aircraft type': 'aircraftType',
  'aircraft body': 'aircraftBody',
  'category of flight': 'categoryOfFlight',
  'type of handling': 'typeOfHandling',
  'type of flight': 'typeOfFlight',
  'route': 'route',
  'cargo': 'cargo',
  'sta date': 'staDate',
  'sta time': 'staTime',
  'ata date': 'ataDate',
  'ata time': 'ataTime',
  'std date': 'stdDate',
  'std time': 'stdTime',
  'atd date': 'atdDate',
  'atd time': 'atdTime',
  'delay on std': 'delayOnStd',
  'delay on sta': 'delayOnSta',
  'delay status': 'delayStatus',
  'arr wcc': 'arrWcc',
  'arr wcs': 'arrWcs',
  'arr wcr': 'arrWcr',
  'dep wcc': 'depWcc',
  'dep wcs': 'depWcs',
  'dep wcr': 'depWcr',
  'total wcc': 'totalWcc',
  'total wchs': 'totalWchs',
  'total wchr': 'totalWchr',
  'terminal': 'terminal',
  'return to ramp': 'returnToRamp',
  'send status flight data': 'sendStatusFlightData',
  'send status wchc': 'sendStatusWchc',
  'send status wchs': 'sendStatusWchs',
  'send status wchr': 'sendStatusWchr',
  'uld arr': 'uldArr',
  'cargo arr': 'cargoArr',
  'mail arr': 'mailArr',
  'uld plan': 'uldPlan',
  'cargo plan': 'cargoPlan',
  'mail plan': 'mailPlan',
  'uld dep': 'uldDep',
  'cargo dep': 'cargoDep',
  'mail dep': 'mailDep',
  report1: 'report1',
  'report no 1': 'reportNo1',
  report2: 'report2',
  'report no 2': 'reportNo2',
  report3: 'report3',
  'report no 3': 'reportNo3',
  report4: 'report4',
  'report no 4': 'reportNo4',
  report5: 'report5',
  'report no 5': 'reportNo5',
  report6: 'report6',
  'report no 6': 'reportNo6',
  mtow: 'mtow',
  regn: 'regn',
  'flight dataexported date': 'flightDataExportedDate',
  'flight dataexported by': 'flightDataExportedBy',
  'flight dataexportedby id': 'flightDataExportedById',
  'wchc exported date': 'wchcExportedDate',
  'wchc exported by': 'wchcExportedBy',
  'wchc exportedby id': 'wchcExportedById',
  'wchs exported date': 'wchsExportedDate',
  'wchs exported by': 'wchsExportedBy',
  'wchs exportedby id': 'wchsExportedById',
  'wchr exported date': 'wchrExportedDate',
  'wchr exported by': 'wchrExportedBy',
  'wchr exportedby id': 'wchrExportedById',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v > 0 && v < 1) {
      const totalMinutes = Math.round(v * 24 * 60) % (24 * 60);
      return `${pad2(Math.floor(totalMinutes / 60))}:${pad2(totalMinutes % 60)}`;
    }
    return String(v);
  }
  return String(v).trim();
}

function isBlank(v: string): boolean {
  const s = v.trim();
  return !s || s === '-' || s.toLowerCase() === 'null';
}

/** Schema date: `dd/MM/yyyy`. Combined datetime keeps only the date part. */
export function asSchemaDate(raw: string): string {
  const s = cell(raw);
  if (isBlank(s)) return '';

  const iso = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(s);
  if (iso) return `${pad2(Number(iso[3]))}/${pad2(Number(iso[2]))}/${iso[1]}`;

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (dmy) {
    return `${pad2(Number(dmy[1]))}/${pad2(Number(dmy[2]))}/${dmy[3]}`;
  }

  const named = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/.exec(s);
  if (named) {
    const month = monthNameToNumber(named[2]);
    if (month) return `${pad2(Number(named[1]))}/${pad2(month)}/${named[3]}`;
  }

  return s.split(/\s+/)[0] ?? s;
}

/** Schema time: `HH:mm`. Combined datetime keeps only the clock part. */
export function asSchemaTime(raw: string): string {
  const s = cell(raw);
  if (isBlank(s)) return '';

  const afterDate = s.match(
    /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})\s+(.+)$/,
  );
  const clock = (afterDate?.[2] ?? s).replace(/\./g, ':').trim();

  const ampm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(clock);
  if (!ampm) {
    const bare = /^(\d{1,2}):(\d{2})/.exec(clock);
    return bare ? `${pad2(Number(bare[1]))}:${pad2(Number(bare[2]))}` : clock;
  }
  let hour = Number(ampm[1]);
  const minute = Number(ampm[2]);
  const mer = (ampm[4] ?? '').toLowerCase();
  if (mer === 'pm' && hour < 12) hour += 12;
  if (mer === 'am' && hour === 12) hour = 0;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function monthNameToNumber(name: string): number | null {
  const key = name.slice(0, 3).toLowerCase();
  const map: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  return map[key] ?? null;
}

export function parseFlexibleDateTime(raw: string): Date | null {
  const s = cell(raw);
  if (isBlank(s)) return null;

  const named = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(
    s,
  );
  if (named) {
    const month = monthNameToNumber(named[2]);
    if (month) {
      return new Date(
        Number(named[3]),
        month - 1,
        Number(named[1]),
        Number(named[4] ?? 0),
        Number(named[5] ?? 0),
        0,
        0,
      );
    }
  }

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(
    s,
  );
  if (us) {
    let hour = Number(us[4]);
    const mer = (us[7] ?? '').toLowerCase();
    if (mer === 'pm' && hour < 12) hour += 12;
    if (mer === 'am' && hour === 12) hour = 0;
    return new Date(
      Number(us[3]),
      Number(us[1]) - 1,
      Number(us[2]),
      hour,
      Number(us[5]),
      Number(us[6] ?? 0),
      0,
    );
  }

  const date = asSchemaDate(s);
  const time = asSchemaTime(s) || '00:00';
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  const hm = /^(\d{2}):(\d{2})/.exec(time);
  if (!dmy || !hm) return null;
  const d = new Date(
    Number(dmy[3]),
    Number(dmy[2]) - 1,
    Number(dmy[1]),
    Number(hm[1]),
    Number(hm[2]),
    0,
    0,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export function staDateToIsoYmd(raw: string): string | null {
  const date = asSchemaDate(raw);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseYesNo(raw: string): boolean {
  const s = cell(raw).toLowerCase();
  return s === 'y' || s === 'yes' || s === 'true' || s === '1';
}

export type HydFlightNoParts = {
  flightNo: string;
  arrival: string;
  departure: string;
  split: boolean;
};

function airlinePrefix(leg: string): string {
  const m = /^([A-Za-z0-9]{2})/.exec(leg.trim());
  return m?.[1]?.toUpperCase() ?? '';
}

function expandNumericLeg(leg: string, prefix: string, hyphenStyle: boolean): string {
  const t = leg.trim();
  if (!t) return '';
  if (/^\d+$/.test(t) && prefix) {
    return hyphenStyle ? `${prefix}-${t}` : `${prefix}${t}`;
  }
  return t;
}

function hasFlightNumber(leg: string): boolean {
  const t = leg.trim();
  if (!t) return false;
  const rest = t.slice(2).replace(/^[\s-]+/, '');
  return /\d/.test(rest);
}

/**
 * Split `VJ-1803/1804`, `QR500/501`, `S5 /212` (originate), `S5 213/` (terminate).
 */
export function parseHydFlightNo(raw: string): HydFlightNoParts {
  const flightNo = cell(raw).replace(/\s+/g, ' ');
  if (!flightNo) {
    return { flightNo: '', arrival: '', departure: '', split: false };
  }
  const slash = flightNo.indexOf('/');
  if (slash < 0) {
    return {
      flightNo,
      arrival: flightNo,
      departure: flightNo,
      split: false,
    };
  }
  const left = flightNo.slice(0, slash).trim();
  const right = flightNo.slice(slash + 1).trim();
  const prefix = airlinePrefix(left) || airlinePrefix(right);
  const hyphenStyle = /[A-Za-z]{2,3}-/.test(flightNo);

  const arrival = hasFlightNumber(left) ? left : '';
  const departure = hasFlightNumber(right)
    ? expandNumericLeg(right, prefix, hyphenStyle)
    : '';

  const split = Boolean(arrival && departure && arrival !== departure);
  return { flightNo, arrival, departure, split };
}

export type HydMappedRow = {
  serial: number;
  headersMapped: string[];
  headersUnmapped: string[];
  main: CreateMainDetailsDto;
  terminal: CreateTerminalDetailsDto;
  ramp: CreateRampDetails1Dto;
  load: CreateLoadControlDetailsDto;
  remarks: {
    Airline: string;
    FlightNo: string;
  };
  attachments: CreateAttachmentsDto;
  staIso: string;
  lastSnapshotAt: Date | null;
  lastSnapshotReason: string;
  workbookExtras: Record<string, string>;
};

export function rowObjectFromHeaders(
  headers: unknown[],
  line: unknown[],
): { mapped: Record<string, string>; unmapped: string[]; mappedHeaders: string[] } {
  const mapped: Record<string, string> = {};
  const unmapped: string[] = [];
  const mappedHeaders: string[] = [];
  const colCount = Math.max(headers.length, line.length);
  for (let c = 0; c < colCount; c++) {
    const header = cell(headers[c]);
    if (!header) continue;
    const key = HYD_JULY_HEADER_KEYS[normalizeHydHeader(header)];
    const value = cell(line[c]);
    if (!key) {
      unmapped.push(header);
      continue;
    }
    mappedHeaders.push(header);
    if (mapped[key] === undefined || mapped[key] === '') {
      mapped[key] = value;
    }
  }
  return { mapped, unmapped, mappedHeaders };
}

function delayEntry(delay: string): { Delay: string; ReasonofDelay: string; gh: boolean; oth: boolean } {
  return { Delay: delay, ReasonofDelay: '', gh: false, oth: false };
}

function buildReports(row: Record<string, string>): CreateAttachmentsDto {
  const reports: NonNullable<CreateAttachmentsDto['reports']> = [];
  for (let i = 1; i <= 6; i++) {
    const name = cell(row[`report${i}`]);
    const no = cell(row[`reportNo${i}`]);
    if (!name && !no) continue;
    reports.push({
      checked: Boolean(name || no),
      reportName: name,
      reportNo: no,
    });
  }
  return { reports };
}

function extrasFromRow(row: Record<string, string>): Record<string, string> {
  const keys: Array<[string, string]> = [
    ['totalWcc', 'Total WCC'],
    ['totalWchs', 'Total WCHS'],
    ['totalWchr', 'Total WCHR'],
    ['sendStatusFlightData', 'Send Status(Flight Data)'],
    ['sendStatusWchc', 'Send Status(WCHC)'],
    ['sendStatusWchs', 'Send Status(WCHS)'],
    ['sendStatusWchr', 'Send Status(WCHR)'],
    ['flightDataExportedDate', 'Flight DataExported Date'],
    ['flightDataExportedBy', 'Flight DataExported By'],
    ['flightDataExportedById', 'Flight DataExportedBy ID'],
    ['wchcExportedDate', 'WCHC Exported Date'],
    ['wchcExportedBy', 'WCHC Exported By'],
    ['wchcExportedById', 'WCHC ExportedBy ID'],
    ['wchsExportedDate', 'WCHS Exported Date'],
    ['wchsExportedBy', 'WCHS Exported By'],
    ['wchsExportedById', 'WCHS ExportedBy ID'],
    ['wchrExportedDate', 'WCHR Exported Date'],
    ['wchrExportedBy', 'WCHR Exported By'],
    ['wchrExportedById', 'WCHR ExportedBy ID'],
  ];
  const out: Record<string, string> = {};
  for (const [key, label] of keys) {
    const v = cell(row[key]);
    if (!isBlank(v)) out[label] = v;
  }
  return out;
}

export function mapHydJulyRow(
  headers: unknown[],
  line: unknown[],
): HydMappedRow | { error: string } {
  const { mapped: row, unmapped, mappedHeaders } = rowObjectFromHeaders(
    headers,
    line,
  );
  const serial = Number(String(row.serialNumber ?? '').replace(/,/g, ''));
  if (!Number.isFinite(serial) || serial <= 0) {
    return { error: 'Missing or invalid Serial Number' };
  }

  const airline = cell(row.customerName);
  const code = cell(row.customerCode);
  const legs = parseHydFlightNo(row.flightNo);
  if (!airline || !legs.flightNo) {
    return { error: 'Customer Name and Flight No are required' };
  }

  const staDate = asSchemaDate(row.staDate);
  const staTime = asSchemaTime(row.staTime);
  const stdDate = asSchemaDate(row.stdDate);
  const stdTime = asSchemaTime(row.stdTime);
  const ataDate = asSchemaDate(row.ataDate);
  const ataTime = asSchemaTime(row.ataTime);
  const atdDate = asSchemaDate(row.atdDate);
  const atdTime = asSchemaTime(row.atdTime);
  const typeCraft = cell(row.aircraftType);
  const typeOfFlight = cell(row.typeOfFlight);
  const route = cell(row.route);
  const delaySta = cell(row.delayOnSta);
  const delayStd = cell(row.delayOnStd);
  const delayStatus = cell(row.delayStatus);

  const main: CreateMainDetailsDto = {
    Airline: airline,
    Arline_Code: code || airline.slice(0, 2).toUpperCase(),
    FlightNo: legs.flightNo,
    ArrivalFltNo: legs.arrival,
    DepartureFltNo: legs.departure,
    ifOperationSplit: legs.split,
    STADate: staDate,
    STATime: staTime,
    STDDate: stdDate,
    STDTime: stdTime,
    ATADate: ataDate,
    ATATime: ataTime,
    ATDDate: atdDate,
    ATDTime: atdTime,
    TypeCraft: typeCraft,
    aircraftBody: cell(row.aircraftBody),
    Cate_of_Flight: cell(row.categoryOfFlight),
    TypeofHandling: cell(row.typeOfHandling),
    Typeofflight: typeOfFlight,
    Route: route,
    Terminal: cell(row.terminal),
    Regn: cell(row.regn),
    MTOW: cell(row.mtow),
    freighter: parseYesNo(row.cargo),
    returnToRamp: parseYesNo(row.returnToRamp),
    ActualDelay: delaySta,
    departureDelay: delayStd,
    departureStatus: delayStatus,
  };

  if (staDate && stdDate && staTime && stdTime) {
    const staIso = `${staDateToIsoYmd(staDate)}T${staTime}`;
    const stdIso = `${staDateToIsoYmd(stdDate)}T${stdTime}`;
    if (staIso && stdIso) main.stdLessThanSta = stdIso < staIso;
  }

  if (delaySta) main.arrivalDelays = [delayEntry(delaySta)];
  if (delayStd) main.departureDelays = [delayEntry(delayStd)];

  const terminal: CreateTerminalDetailsDto = {
    airlinesOperator: airline,
    FlightNo: legs.flightNo,
    routing: route,
    Typeofflight: typeOfFlight,
    TypeCraft: typeCraft,
    STADate: staDate,
    STATime: staTime,
    STDDate: stdDate,
    STDTime: stdTime,
    wcc: cell(row.arrWcc),
    wcs: cell(row.arrWcs),
    wcr: cell(row.arrWcr),
    Departure_wcc: cell(row.depWcc),
    Departure_wcs: cell(row.depWcs),
    Departure_wcr: cell(row.depWcr),
  };

  const ramp: CreateRampDetails1Dto = {
    airlinesOperator: airline,
    FlightNo: legs.flightNo,
    Route: route,
    Typeofflight: typeOfFlight,
    TypeCraft: typeCraft,
    STADate: staDate,
    STATime: staTime,
    STDDate: stdDate,
    STDTime: stdTime,
    ATADate: ataDate,
    ATATime: ataTime,
    uldarr: cell(row.uldArr),
    cgoarr: cell(row.cargoArr),
    mailarr: cell(row.mailArr),
    uldplan: cell(row.uldPlan),
    cgoplan: cell(row.cargoPlan),
    mailplan: cell(row.mailPlan),
    uldatcdep: cell(row.uldDep),
    cgoactdep: cell(row.cargoDep),
    mailactdep: cell(row.mailDep),
  };

  const load: CreateLoadControlDetailsDto = {
    airlinesOperator: airline,
    FlightNo: legs.flightNo,
    routing: route,
    TypeCraft: typeCraft,
    Typeofflight: typeOfFlight,
    STADate: staDate,
    STATime: staTime,
    STDDate: stdDate,
    STDTime: stdTime,
  };

  const snapshotAt = parseFlexibleDateTime(row.flightDataExportedDate);
  const exportedBy = cell(row.flightDataExportedBy);
  const exportedById = cell(row.flightDataExportedById);
  const lastSnapshotReason = [
    'hyd_july_skd_seed',
    exportedBy && `exportedBy=${exportedBy}`,
    exportedById && `exportedById=${exportedById}`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    serial,
    headersMapped: mappedHeaders,
    headersUnmapped: unmapped,
    main,
    terminal,
    ramp,
    load,
    remarks: { Airline: airline, FlightNo: legs.flightNo },
    attachments: buildReports(row),
    staIso: staDateToIsoYmd(staDate) || staDateToIsoYmd(stdDate) || '1970-01-01',
    lastSnapshotAt: snapshotAt,
    lastSnapshotReason,
    workbookExtras: extrasFromRow(row),
  };
}
