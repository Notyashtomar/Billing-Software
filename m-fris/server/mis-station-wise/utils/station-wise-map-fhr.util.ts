import { addDaysYmd, ymdToDdMmYyyy } from './station-wise-months.util';
import { previewCellsFromRow } from './station-wise-evaluate.util';
import {
  resolveStationWiseRowHighlights,
  type StationWiseCellHighlight,
} from './station-wise-conditional-format.util';

export type StationWiseInputRow = {
  serialNo: number | string;
  airline: string;
  /** IATA / FHR airline code (EK, LH, SG). Used for Month Wise sheet tabs. */
  airlineCode: string;
  flightNo: string;
  typeCraft: string;
  staTime: number | '';
  staDate: string;
  stdTime: number | '';
  stdDate: string;
  ataTime: number | '';
  ataDate: string;
  atdTime: number | '';
  atdDate: string;
  delay: string;
  actualDelay: number | '';
  delay1: number | '';
  reasonOfDelay: string;
  delay2: number | '';
  delaycode2: string;
  delay3: number | '';
  delaycode3: string;
  staYmd: string;
  /** FHR `stationCode` — used by Airline Wise all-station collect. */
  stationCode?: string;
};

export type StationWisePreviewFlight = {
  serialNo: string;
  airline: string;
  airlineCode?: string;
  stationCode?: string;
  flightNo: string;
  typeCraft: string;
  staTime: string;
  staDate: string;
  stdTime: string;
  stdDate: string;
  ataTime: string;
  ataDate: string;
  atdTime: string;
  atdDate: string;
  delay: string;
  actualDelay: string;
  delay1: string;
  reasonOfDelay: string;
  delay2: string;
  delaycode2: string;
  delay3: string;
  delaycode3: string;
  /** Operating-day key used to filter month chips on the preview. */
  staYmd: string;
  /** Excel column letter → display value (A–T + evaluated formulas). */
  cells: Record<string, string>;
  /** Same MAA conditional formatting as the downloaded workbook. */
  cellStyles?: Record<string, StationWiseCellHighlight>;
};

function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

/** Canonical FLIGHT REPORT names so SG/IX rows land on SpiceJet / Air India Express. */
export function normalizeStationWiseAirlineName(
  name: string,
  flightNo = '',
): string {
  const compact = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (compact.includes('spice')) return 'SpiceJet';
  if (compact.includes('airindiaexpress') || compact === 'aix') {
    return 'Air India Express';
  }
  const prefix = flightNo.replace(/^CANC[\s-]*/i, '').trim().toUpperCase();
  if (!name) {
    if (prefix.startsWith('SG')) return 'SpiceJet';
    if (prefix.startsWith('IX')) return 'Air India Express';
  }
  return name;
}

const AIRLINE_NAME_CODE_FALLBACK: Record<string, string> = {
  spicejet: 'SG',
  airindiaexpress: 'IX',
  indigo: '6E',
  airfrance: 'AF',
  airarabia: 'G9',
  klm: 'KL',
  swiss: 'LX',
  swissinternational: 'LX',
  thaiairways: 'TG',
  thai: 'TG',
  unitedairlines: 'UA',
  united: 'UA',
  omanair: 'WY',
  emirates: 'EK',
  etihadairways: 'EY',
  etihad: 'EY',
  lufthansa: 'LH',
  gulfair: 'GF',
  srilankanairlines: 'UL',
  srilankan: 'UL',
  bimanbangladeshairlines: 'BG',
  bimanbangladesh: 'BG',
  royalbruneiairlines: 'BI',
  royalbrunei: 'BI',
  usbanglaairlines: 'BS',
  usbangla: 'BS',
};

/** Prefer FHR Arline_Code, else flight-no prefix (EK123 → EK), else known-name map. */
export function resolveStationWiseAirlineCode(
  explicit: string,
  flightNo: string,
  airlineName = '',
): string {
  const fromField = String(explicit ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();
  if (/^[A-Z0-9]{2,5}$/.test(fromField) && !/^\d+$/.test(fromField)) {
    return fromField;
  }

  const flight = String(flightNo ?? '')
    .replace(/^CANC[\s-]*/i, '')
    .trim()
    .toUpperCase()
    .split('/')[0]
    ?.trim() ?? '';
  // IATA-style: letters (or digit+letters) then flight digits — EK1 → EK, not EK1.
  const fromFlight =
    /^([A-Z]{2,3}|\d[A-Z]{2})(?=\d)/.exec(flight)?.[1] ??
    (/^([A-Z]{2,3}|\d[A-Z]{2})$/.exec(flight)?.[1] ?? '');
  if (fromFlight) return fromFlight;

  const compact = airlineName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return AIRLINE_NAME_CODE_FALLBACK[compact] ?? '';
}

export function parseToYmd(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, '0')}-${String(raw.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(s);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

/** Excel time as fraction of a day, or empty. */
export function parseToExcelTime(raw: unknown): number | '' {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 0 && raw < 1.5) return raw;
    if (raw > 1 && raw < 24) return raw / 24;
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return (
      (raw.getUTCHours() * 3600 + raw.getUTCMinutes() * 60 + raw.getUTCSeconds()) /
      86400
    );
  }
  const s = String(raw).trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return '';
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] ?? 0);
  if (![hh, mm, ss].every(Number.isFinite)) return '';
  return (hh * 3600 + mm * 60 + ss) / 86400;
}

export function excelTimeToHm(value: number | ''): string {
  if (value === '' || !Number.isFinite(value)) return '';
  const total = Math.round(Number(value) * 24 * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function pickDate(
  ...values: unknown[]
): { ymd: string; display: string } | { ymd: ''; display: '' } {
  for (const v of values) {
    const ymd = parseToYmd(v);
    if (ymd) return { ymd, display: ymdToDdMmYyyy(ymd) };
  }
  return { ymd: '', display: '' };
}

function pickTime(...values: unknown[]): number | '' {
  for (const v of values) {
    const t = parseToExcelTime(v);
    if (t !== '') return t;
  }
  return '';
}

type DelayBits = { time: number | ''; reason: string };

function collectDelays(
  ...lists: unknown[]
): DelayBits[] {
  const out: DelayBits[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      const o = e as Record<string, unknown>;
      const reason = firstString(
        o.ReasonofDelay,
        o.reasonOfDelay,
        o.ReasonOfDelay,
        o.reason,
      );
      const time = pickTime(o.Delay, o.delay, o.delayTime, o.Time);
      if (!reason && time === '') continue;
      out.push({ time, reason });
      if (out.length >= 3) return out;
    }
  }
  return out;
}

function flightNoFromDoc(
  m: Record<string, unknown>,
  t: Record<string, unknown>,
  r1: Record<string, unknown>,
  r3: Record<string, unknown>,
  cancelled: boolean,
): string {
  const arr = firstString(m.ArrivalFltNo, m.arrivalFltNo);
  const dep = firstString(m.DepartureFltNo, m.departureFltNo);
  const combined =
    arr && dep && arr.toUpperCase() === dep.toUpperCase()
      ? arr
      : arr && dep
        ? `${arr}/${dep}`
        : arr || dep;
  const fallback = firstString(
    combined,
    m.FlightNo,
    m.flightNo,
    t.FlightNo,
    t.flightNo,
    r1.FlightNo,
    r1.flightNo,
    r3.FlightNo,
    r3.flightNo,
  );
  if (cancelled && !fallback.toUpperCase().startsWith('CANC')) {
    return fallback ? `CANC ${fallback}` : 'CANC';
  }
  return fallback;
}

function isCancelledDoc(doc: Record<string, unknown>, m: Record<string, unknown>): boolean {
  if (m.flightCancelled === true || doc.isCancelled === true) return true;
  const status = firstString(m.departureStatus, m.DepartureStatus, doc.departureStatus);
  if (status.toLowerCase() === 'cancelled' || status.toLowerCase() === 'xxld') {
    return true;
  }
  return false;
}

export function resolveStaYmd(doc: Record<string, unknown>): string | null {
  const m = (doc.mainDetails ?? {}) as Record<string, unknown>;
  const t = (doc.terminalDetails ?? {}) as Record<string, unknown>;
  const r1 = (doc.rampDetails1 ?? {}) as Record<string, unknown>;
  const r3 = (doc.rampDetails3 ?? {}) as Record<string, unknown>;
  const lc = (doc.loadControlDetails ?? {}) as Record<string, unknown>;
  const nested =
    parseToYmd(t.STADate) ||
    parseToYmd(t.staDate) ||
    parseToYmd(r1.STADate) ||
    parseToYmd(r1.staDate) ||
    parseToYmd(r3.STADate) ||
    parseToYmd(r3.staDate) ||
    parseToYmd(lc.STADate) ||
    parseToYmd(lc.staDate) ||
    parseToYmd(m.STADate) ||
    parseToYmd(m.staDate) ||
    parseToYmd(m.STDDate) ||
    parseToYmd(m.stdDate);
  if (nested) return nested;
  const remarks = (doc.remarks ?? {}) as Record<string, unknown>;
  const fromRemarks =
    parseToYmd(remarks.flightStaDateIso) ||
    parseToYmd(remarks.STADate) ||
    parseToYmd(remarks.staDate);
  if (fromRemarks) return fromRemarks;
  const staDates = Array.isArray(doc.staDates) ? doc.staDates : [];
  for (const raw of staDates) {
    const fromList = parseToYmd(raw);
    if (fromList) return fromList;
  }
  return null;
}

export function resolveStdYmd(doc: Record<string, unknown>): string | null {
  const m = (doc.mainDetails ?? {}) as Record<string, unknown>;
  const t = (doc.terminalDetails ?? {}) as Record<string, unknown>;
  const r1 = (doc.rampDetails1 ?? {}) as Record<string, unknown>;
  const r3 = (doc.rampDetails3 ?? {}) as Record<string, unknown>;
  const lc = (doc.loadControlDetails ?? {}) as Record<string, unknown>;
  return (
    parseToYmd(t.STDDate) ||
    parseToYmd(t.stdDate) ||
    parseToYmd(r1.STDDate) ||
    parseToYmd(r1.stdDate) ||
    parseToYmd(r3.STDDate) ||
    parseToYmd(r3.stdDate) ||
    parseToYmd(lc.STDDate) ||
    parseToYmd(lc.stdDate) ||
    parseToYmd(m.STDDate) ||
    parseToYmd(m.stdDate)
  );
}

/**
 * Month / range key. Overnight turnaround (STA last day, STD next day)
 * belongs on the STD month — MAA August TOTAL includes CANC IX 31/07→01/08.
 */
export function resolveStationWiseBucketYmd(
  doc: Record<string, unknown>,
): string | null {
  const sta = resolveStaYmd(doc);
  if (!sta) return null;
  const std = resolveStdYmd(doc);
  if (std) {
    const next = addDaysYmd(sta, 1);
    if (next && std === next) return std;
  }
  return sta;
}

export function mapFhrDocToStationWiseRow(
  doc: Record<string, unknown>,
): StationWiseInputRow | null {
  const m = (doc.mainDetails ?? {}) as Record<string, unknown>;
  const t = (doc.terminalDetails ?? {}) as Record<string, unknown>;
  const r1 = (doc.rampDetails1 ?? {}) as Record<string, unknown>;
  const r3 = (doc.rampDetails3 ?? {}) as Record<string, unknown>;
  const lc = (doc.loadControlDetails ?? {}) as Record<string, unknown>;

  const staYmd = resolveStationWiseBucketYmd(doc);
  if (!staYmd) return null;

  const cancelled = isCancelledDoc(doc, m);
  const serial = Number(doc.SerialNo ?? doc.flightSerialNumber ?? m.SerialNo ?? 0);
  const mappedFlight = flightNoFromDoc(m, t, r1, r3, cancelled);
  const flightNo =
    mappedFlight ||
    (Number.isFinite(serial) && serial > 0 ? String(serial) : '');
  if (!flightNo) return null;

  const sta = pickDate(
    lc.STADate,
    lc.staDate,
    t.STADate,
    t.staDate,
    r1.STADate,
    m.STADate,
    m.staDate,
    staYmd,
  );
  const std = pickDate(
    lc.STDDate,
    lc.stdDate,
    t.STDDate,
    t.stdDate,
    r1.STDDate,
    m.STDDate,
    m.stdDate,
    sta.ymd || staYmd,
  );

  // Do not invent ATA/ATD dates from STA — blank ATA drives CANC / formula branches in MAA sheet.
  const ataTime = pickTime(m.ATATime, m.ataTime, r1.ATATime, r3.ATATime);
  const atdTime = pickTime(m.ATDTime, m.atdTime, r3.ATDTime, r1.ATDTime);
  const ata = pickDate(m.ATADate, m.ataDate, r1.ATADate, r3.ATADate);
  const atd = pickDate(m.ATDDate, m.atdDate, r3.ATDDate, r1.ATDDate);
  const ataDate = ata.display || (ataTime !== '' ? sta.display : '');
  const atdDate =
    atd.display ||
    (atdTime !== '' ? std.display || ata.display || sta.display : '');

  const delays = collectDelays(m.departureDelays, m.arrivalDelays, doc.departureDelays, doc.arrivalDelays);

  const actualDelay = pickTime(m.ActualDelay, m.actualDelay, m.departureDelay);

  const airline = normalizeStationWiseAirlineName(
    firstString(
      m.Airline,
      m.airline,
      m.AirlineName,
      m.airlineName,
      t.airlinesOperator,
      t.Airline,
      t.AirlineName,
      doc.airline,
    ),
    flightNo,
  );

  return {
    serialNo: Number.isFinite(serial) && serial > 0 ? serial : '',
    airline,
    airlineCode: resolveStationWiseAirlineCode(
      firstString(
        m.Arline_Code,
        m.airlineCode,
        m['Airline Code'],
        m.AirlineCode,
        t.airlineCode,
        t.Arline_Code,
      ),
      flightNo,
      airline,
    ),
    flightNo,
    typeCraft: firstString(m.TypeCraft, t.TypeCraft, m.typeCraft),
    staTime: pickTime(lc.STATime, lc.staTime, t.STATime, t.staTime, r1.STATime, m.STATime, m.staTime),
    staDate: sta.display,
    stdTime: pickTime(lc.STDTime, lc.stdTime, t.STDTime, t.stdTime, r1.STDTime, m.STDTime, m.stdTime),
    stdDate: std.display,
    ataTime,
    ataDate,
    atdTime,
    atdDate,
    delay: firstString(m.departureStatus, m.DepartureStatus, doc.departureStatus),
    actualDelay: actualDelay === '' ? parseToExcelTime('00:00') : actualDelay,
    delay1: delays[0]?.time ?? '',
    reasonOfDelay: delays[0]?.reason ?? '',
    delay2: delays[1]?.time ?? '',
    delaycode2: delays[1]?.reason ?? '',
    delay3: delays[2]?.time ?? '',
    delaycode3: delays[2]?.reason ?? '',
    staYmd,
    stationCode: firstString(doc.stationCode, m.stationCode, t.stationCode).toUpperCase(),
  };
}

export function toPreviewFlight(row: StationWiseInputRow): StationWisePreviewFlight {
  const cells = previewCellsFromRow(row);
  return {
    serialNo: String(row.serialNo || ''),
    airline: row.airline,
    airlineCode: row.airlineCode,
    stationCode: row.stationCode,
    flightNo: row.flightNo,
    typeCraft: row.typeCraft,
    staTime: excelTimeToHm(row.staTime),
    staDate: row.staDate,
    stdTime: excelTimeToHm(row.stdTime),
    stdDate: row.stdDate,
    ataTime: excelTimeToHm(row.ataTime),
    ataDate: row.ataDate,
    atdTime: excelTimeToHm(row.atdTime),
    atdDate: row.atdDate,
    delay: row.delay,
    actualDelay: excelTimeToHm(row.actualDelay) || '00:00',
    delay1: excelTimeToHm(row.delay1),
    reasonOfDelay: row.reasonOfDelay,
    delay2: excelTimeToHm(row.delay2),
    delaycode2: row.delaycode2,
    delay3: excelTimeToHm(row.delay3),
    delaycode3: row.delaycode3,
    staYmd: row.staYmd,
    cells,
    cellStyles: resolveStationWiseRowHighlights(cells),
  };
}
