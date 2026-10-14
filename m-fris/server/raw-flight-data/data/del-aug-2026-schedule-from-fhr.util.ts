/**
 * Build Delhi (DEL) Advance → Schedule Setup masters from August 2026
 * `fhr_collection` rows so Airline Schedule flight numbers stay aligned
 * with already-seeded daily FHR (CANC- prefix stripped).
 */
import {
  buildScheduleIdentityKey,
  detectScheduleSeason,
  formatScheduleDateDdMmYyyy,
  isValidScheduleFlightNo,
  isValidScheduleRouting,
  normalizeScheduleFlightNoForStorage,
  normalizeScheduleRoutingForStorage,
  withAirlineCodePrefix,
} from '../utils/schedule-season.util';

export interface DelScheduleDays {
  Mon: boolean;
  Tue: boolean;
  Wed: boolean;
  Thu: boolean;
  Fri: boolean;
  Sat: boolean;
  Sun: boolean;
}

export interface DelScheduleSeedRow {
  airlineCode: string;
  airlineName: string;
  flightNo: string;
  arrivalFlightNo: string;
  departureFlightNo: string;
  ifOperationSplit: boolean;
  routing: string;
  aircraft: string;
  aircraftBody: 'NB' | 'WB';
  flightType: 'Domestic' | 'International';
  typeOfHandling: string;
  staTime: string;
  stdTime: string;
  validFrom: string;
  validTo: string;
  scheduleDays: DelScheduleDays;
  nextDay: boolean;
  freighter: boolean;
  identityKey: string;
  seasonKey: string;
  season: string;
  fhrCount: number;
}

export type DelFhrLean = {
  mainDetails?: Record<string, unknown> | null;
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const noneDays = (): DelScheduleDays => ({
  Mon: false,
  Tue: false,
  Wed: false,
  Thu: false,
  Fri: false,
  Sat: false,
  Sun: false,
});

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function cleanFlightToken(raw: unknown): string {
  let s = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  s = s.replace(/^CANC[-–]?/, '');
  return normalizeScheduleFlightNoForStorage(s);
}

function parseDdMmYyyy(raw: unknown): Date | null {
  const s = str(raw);
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (
    d.getFullYear() !== Number(m[3]) ||
    d.getMonth() !== Number(m[2]) - 1 ||
    d.getDate() !== Number(m[1])
  ) {
    return null;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function hhMm(raw: unknown): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(str(raw));
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Keep 2–3 IATA airport codes (drop terminal tokens like T / 1). */
export function routingFromFhrRoute(raw: unknown): string {
  const tokens = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => /^[A-Z]{3}$/.test(t));
  const codes: string[] = [];
  for (const t of tokens) {
    if (codes[codes.length - 1] !== t) codes.push(t);
  }
  if (codes.length >= 3) {
    return normalizeScheduleRoutingForStorage(codes.slice(0, 3).join('-'));
  }
  if (codes.length === 2) {
    return normalizeScheduleRoutingForStorage(codes.join('-'));
  }
  return '';
}

export function flightNoFromFhrMain(
  airlineCode: string,
  main: Record<string, unknown>,
): {
  flightNo: string;
  arrivalFlightNo: string;
  departureFlightNo: string;
  ifOperationSplit: boolean;
} {
  const code = airlineCode.trim().toUpperCase();
  const arr = cleanFlightToken(main.ArrivalFltNo ?? main.arrivalFlightNo);
  const dep = cleanFlightToken(main.DepartureFltNo ?? main.departureFlightNo);
  const stored = cleanFlightToken(main.FlightNo ?? main.flightNo);
  const split =
    main.ifOperationSplit === true ||
    String(main.ifOperationSplit ?? '')
      .trim()
      .toLowerCase() === 'yes';

  if (split && arr && dep) {
    const a = withAirlineCodePrefix(code, arr);
    const d = withAirlineCodePrefix(code, dep);
    const pair = a.toUpperCase() === d.toUpperCase() ? a : `${a}/${d}`;
    if (isValidScheduleFlightNo(pair)) {
      return {
        flightNo: pair,
        arrivalFlightNo: a,
        departureFlightNo: d,
        ifOperationSplit: a.toUpperCase() !== d.toUpperCase(),
      };
    }
    const shortDep = d.startsWith(code) ? d.slice(code.length) : d;
    const compact = `${a}/${shortDep}`;
    if (isValidScheduleFlightNo(compact)) {
      return {
        flightNo: compact,
        arrivalFlightNo: a,
        departureFlightNo: d,
        ifOperationSplit: true,
      };
    }
  }

  if (stored && isValidScheduleFlightNo(stored)) {
    return {
      flightNo: stored,
      arrivalFlightNo: arr,
      departureFlightNo: dep,
      ifOperationSplit: split && Boolean(arr && dep && arr !== dep),
    };
  }

  if (arr && dep) {
    const a = withAirlineCodePrefix(code, arr);
    const d = withAirlineCodePrefix(code, dep);
    const pair = a.toUpperCase() === d.toUpperCase() ? a : `${a}/${d}`;
    if (isValidScheduleFlightNo(pair)) {
      return {
        flightNo: pair,
        arrivalFlightNo: a,
        departureFlightNo: d,
        ifOperationSplit: a.toUpperCase() !== d.toUpperCase(),
      };
    }
  }

  const one = withAirlineCodePrefix(code, stored || arr || dep);
  return {
    flightNo: isValidScheduleFlightNo(one) ? one : '',
    arrivalFlightNo: arr,
    departureFlightNo: dep,
    ifOperationSplit: false,
  };
}

function handlingFromFhr(main: Record<string, unknown>): string {
  const raw = str(main.Typeofflight || main.TypeofHandling);
  if (/transit/i.test(raw)) return 'Transit';
  if (/terminat/i.test(raw)) return 'Terminate';
  if (/origin/i.test(raw)) return 'Originate';
  return 'Turnaround';
}

function flightTypeFromFhr(main: Record<string, unknown>): 'Domestic' | 'International' {
  const raw = str(main.Cate_of_Flight || main.Typeofflight);
  return /dom/i.test(raw) ? 'Domestic' : 'International';
}

function isNextDay(sta: string, std: string): boolean {
  const [ah, am] = (sta || '00:00').split(':').map(Number);
  const [dh, dm] = (std || '00:00').split(':').map(Number);
  return dh * 60 + dm < ah * 60 + am;
}

type Variant = {
  airlineCode: string;
  airlineName: string;
  flightNo: string;
  arrivalFlightNo: string;
  departureFlightNo: string;
  ifOperationSplit: boolean;
  routing: string;
  aircraft: string;
  aircraftBody: 'NB' | 'WB';
  flightType: 'Domestic' | 'International';
  typeOfHandling: string;
  staTime: string;
  stdTime: string;
  freighter: boolean;
  nextDay: boolean;
  days: DelScheduleDays;
  first: Date;
  last: Date;
  n: number;
};

function identityGroupKey(airlineName: string, flightNo: string, routing: string): string {
  return `${airlineName.trim().toLowerCase()}|${flightNo}|${routing}`;
}

export function buildDelAug2026ScheduleRowsFromFhr(
  docs: DelFhrLean[],
): DelScheduleSeedRow[] {
  const variants = new Map<string, Variant>();

  for (const doc of docs) {
    const main =
      doc.mainDetails && typeof doc.mainDetails === 'object'
        ? doc.mainDetails
        : {};
    const airlineName = str(main.Airline);
    const airlineCode = str(main.Arline_Code).toUpperCase();
    if (!airlineName || !airlineCode) continue;

    const built = flightNoFromFhrMain(airlineCode, main);
    if (!built.flightNo) continue;

    const routing = routingFromFhrRoute(main.Route);
    if (!isValidScheduleRouting(routing) || !routing) continue;

    const staTime = hhMm(main.STATime);
    const stdTime = hhMm(main.STDTime);
    const staDate = parseDdMmYyyy(main.STADate);
    if (!staDate) continue;

    const aircraft = str(main.TypeCraft).toUpperCase().replace(/\s+/g, '-');
    const body = String(main.aircraftBody ?? '').toUpperCase() === 'WB' ? 'WB' : 'NB';
    const variantKey = [
      identityGroupKey(airlineName, built.flightNo, routing),
      staTime,
      stdTime,
      aircraft,
    ].join('|');

    let v = variants.get(variantKey);
    if (!v) {
      v = {
        airlineCode,
        airlineName,
        flightNo: built.flightNo,
        arrivalFlightNo: built.arrivalFlightNo,
        departureFlightNo: built.departureFlightNo,
        ifOperationSplit: built.ifOperationSplit,
        routing,
        aircraft,
        aircraftBody: body,
        flightType: flightTypeFromFhr(main),
        typeOfHandling: handlingFromFhr(main),
        staTime,
        stdTime,
        freighter: main.freighter === true,
        nextDay: isNextDay(staTime, stdTime),
        days: noneDays(),
        first: staDate,
        last: staDate,
        n: 0,
      };
      variants.set(variantKey, v);
    }
    v.n += 1;
    if (staDate < v.first) v.first = staDate;
    if (staDate > v.last) v.last = staDate;
    v.days[DAY_NAMES[staDate.getDay()]] = true;
  }

  const groups = new Map<string, Variant[]>();
  for (const v of variants.values()) {
    const k = identityGroupKey(v.airlineName, v.flightNo, v.routing);
    const list = groups.get(k) ?? [];
    list.push(v);
    groups.set(k, list);
  }

  const rows: DelScheduleSeedRow[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => b.n - a.n);
    const winner = list[0];
    const days = noneDays();
    let first = winner.first;
    let last = winner.last;
    let n = 0;
    for (const v of list) {
      n += v.n;
      if (v.first < first) first = v.first;
      if (v.last > last) last = v.last;
      for (const d of Object.keys(days) as Array<keyof DelScheduleDays>) {
        if (v.days[d]) days[d] = true;
      }
    }
    const validFrom = formatScheduleDateDdMmYyyy(first);
    const validTo = formatScheduleDateDdMmYyyy(last);
    const seasonInfo = detectScheduleSeason(validFrom);
    const identityKey = buildScheduleIdentityKey({
      seasonKey: seasonInfo.seasonKey,
      airline: winner.airlineName,
      flightNo: winner.flightNo,
      routing: winner.routing,
    });
    rows.push({
      airlineCode: winner.airlineCode,
      airlineName: winner.airlineName,
      flightNo: winner.flightNo,
      arrivalFlightNo: winner.arrivalFlightNo,
      departureFlightNo: winner.departureFlightNo,
      ifOperationSplit: winner.ifOperationSplit,
      routing: winner.routing,
      aircraft: winner.aircraft,
      aircraftBody: winner.aircraftBody,
      flightType: winner.flightType,
      typeOfHandling: winner.typeOfHandling,
      staTime: winner.staTime,
      stdTime: winner.stdTime,
      validFrom,
      validTo,
      scheduleDays: days,
      nextDay: winner.nextDay,
      freighter: winner.freighter,
      identityKey,
      seasonKey: seasonInfo.seasonKey,
      season: seasonInfo.season,
      fhrCount: n,
    });
  }

  rows.sort(
    (a, b) =>
      a.airlineCode.localeCompare(b.airlineCode) ||
      a.flightNo.localeCompare(b.flightNo) ||
      a.routing.localeCompare(b.routing),
  );
  return rows;
}

export function airlinesToEnsureFromRows(
  rows: DelScheduleSeedRow[],
): Array<{ name: string; code: string }> {
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!map.has(r.airlineCode)) map.set(r.airlineCode, r.airlineName);
  }
  return [...map.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function aircraftToEnsureFromRows(
  rows: DelScheduleSeedRow[],
): Array<{ aircraft: string; aircraftBody: 'NB' | 'WB' }> {
  const map = new Map<string, 'NB' | 'WB'>();
  for (const r of rows) {
    if (!r.aircraft || r.aircraft.length < 2) continue;
    if (!map.has(r.aircraft)) map.set(r.aircraft, r.aircraftBody);
  }
  return [...map.entries()].map(([aircraft, aircraftBody]) => ({
    aircraft,
    aircraftBody,
  }));
}
