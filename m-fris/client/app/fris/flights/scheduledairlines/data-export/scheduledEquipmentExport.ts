import { equipmentManpowerByFlight, fetchFhrDocsBatch } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import {
  buildAbbrDescriptionLookup,
  buildAbbrUnitTypeLookup,
  type GseCatalogRow,
  resolveGseDisplayNameFromCatalog,
  resolveUnitTypeFromCatalog,
} from '@/components/fris/flights/scheduledairlines/gseCatalogLookup';
import { splitEquipmentDateTimeForDisplay } from '@/components/fris/flights/scheduledairlines/reportPdfUtils';
import {
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
  nsRawSerialCandidatesForLockFetch,
  type FlightData,
} from '@/utils/dataProcessor';

const fetch = frisFetch;

const EQ_PREFIX = 'EQ:';

export type EquipmentFlatRow = {
  flight: FlightData;
  type_of_handling: string;
  cate_of_flight: string;
  type_of_flight: string;
  aircraft_body: string;
  equipment_name: string;
  unit_type: string;
  equipment_quantity: string;
  from_date: string;
  from_time: string;
  to_date: string;
  to_time: string;
  usage_time: string;
  remarks: string;
};

export const EQUIPMENT_TABLE_COLUMNS: Array<{
  id: string;
  header: string;
  get: (r: EquipmentFlatRow) => string;
}> = [
  { id: 'sl', header: 'Sl. No.', get: (r) => displayScheduledAirlinesTableSerial(r.flight) },
  { id: 'airline', header: 'Airline', get: (r) => String(r.flight.airline ?? '') },
  { id: 'fn', header: 'Flight No', get: (r) => String(r.flight.flightNo ?? '') },
  { id: 'ac', header: 'Aircraft', get: (r) => String(r.flight.aircraft ?? '') },
  { id: 'toh', header: 'Type of Handling', get: (r) => r.type_of_handling },
  { id: 'cof', header: 'Category of Flight', get: (r) => r.cate_of_flight },
  { id: 'tof', header: 'Type of Flight', get: (r) => r.type_of_flight },
  { id: 'acbody', header: 'Aircraft Body', get: (r) => r.aircraft_body },
  { id: 'staD', header: 'STA Date', get: (r) => String(r.flight.staDate ?? '') },
  { id: 'staT', header: 'STA Time', get: (r) => String(r.flight.staTime ?? '') },
  { id: 'stdD', header: 'STD Date', get: (r) => String(r.flight.stdDate ?? '') },
  { id: 'stdT', header: 'STD Time', get: (r) => String(r.flight.stdTime ?? '') },
  { id: 'gse', header: 'GSE Name', get: (r) => r.equipment_name },
  { id: 'unit_type', header: 'Unit Type', get: (r) => r.unit_type },
  { id: 'qty', header: 'Qty', get: (r) => r.equipment_quantity },
  { id: 'fd', header: 'From Date', get: (r) => r.from_date },
  { id: 'ft', header: 'From Time', get: (r) => r.from_time },
  { id: 'td', header: 'To Date', get: (r) => r.to_date },
  { id: 'tt', header: 'To Time', get: (r) => r.to_time },
  { id: 'eng', header: 'Eng. time', get: (r) => r.usage_time },
  { id: 'rem', header: 'Remarks', get: (r) => r.remarks },
];

type FhrDoc = Record<string, unknown>;

function fhrString(value: unknown): string | number | boolean {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return '';
}

function mainDetailsFromFhrDoc(doc: FhrDoc | null): Record<string, unknown> | undefined {
  if (!doc || typeof doc !== 'object') return undefined;
  if (
    doc.mainDetails != null &&
    typeof doc.mainDetails === 'object' &&
    !Array.isArray(doc.mainDetails)
  ) {
    return doc.mainDetails as Record<string, unknown>;
  }
  return undefined;
}

function typeOfHandlingFromFhrDoc(doc: FhrDoc | null): string {
  if (!doc || typeof doc !== 'object') return '';
  const md = mainDetailsFromFhrDoc(doc);
  return String(
    fhrString(doc.typeOfHandling) ||
      fhrString(doc.type_of_handling) ||
      fhrString(doc.TypeofHandling) ||
      fhrString(md?.TypeofHandling) ||
      fhrString(md?.type_of_handling) ||
      fhrString(md?.typeOfHandling),
  ).trim();
}

function cateOfFlightFromFhrDoc(doc: FhrDoc | null): string {
  if (!doc || typeof doc !== 'object') return '';
  const md = mainDetailsFromFhrDoc(doc);
  return String(
    fhrString(doc.cate_of_flight) ||
      fhrString(doc.cateOfFlight) ||
      fhrString(doc.flightCategory) ||
      fhrString(md?.cate_of_flight) ||
      fhrString(md?.Cate_of_Flight) ||
      fhrString(md?.flightCategory),
  ).trim();
}

function typeOfFlightFromFhrDoc(doc: FhrDoc | null): string {
  const md = mainDetailsFromFhrDoc(doc);
  return String(
    fhrString(md?.Typeofflight) ||
      fhrString(md?.typeOfFlight) ||
      fhrString(md?.type_of_flight) ||
      fhrString(doc?.Typeofflight) ||
      fhrString(doc?.typeOfFlight),
  ).trim();
}

function aircraftBodyFromFhrDoc(doc: FhrDoc | null): string {
  const md = mainDetailsFromFhrDoc(doc);
  return String(
    fhrString(md?.aircraftBody) ||
      fhrString(md?.AircraftBody) ||
      fhrString(md?.aircraft_body) ||
      fhrString(doc?.aircraftBody),
  ).trim();
}

function aircraftTypeRawFromFhrDoc(doc: FhrDoc | null): string {
  const md = mainDetailsFromFhrDoc(doc);
  return String(
    fhrString(md?.TypeCraft) ||
      fhrString(md?.typeCraft) ||
      fhrString(md?.aircraftType) ||
      fhrString(doc?.TypeCraft) ||
      fhrString(doc?.aircraftType),
  ).trim();
}

function normalizeEmbeddedAircraftBody(raw: string): 'NB' | 'WB' | '' {
  const ab = raw.trim().toUpperCase();
  if (!ab) return '';
  if (ab === 'WB' || ab.includes('WIDE')) return 'WB';
  if (ab === 'NB' || ab.includes('NARROW')) return 'NB';
  return '';
}

function isWideBodyTypeCraft(tc: string): boolean {
  return /\b(777|787|747|380|350|330|340|359)\b/.test(tc.trim().toUpperCase());
}

export function normalizeAircraftTypeForBodyLookup(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9/-]/g, '')
    .replace(/-+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/[-/]{2,}/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');
}

export function buildAircraftBodyLookupMap(rows: unknown[]): Map<string, 'NB' | 'WB'> {
  const map = new Map<string, 'NB' | 'WB'>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    if (o.active === false) continue;
    const aircraft = normalizeAircraftTypeForBodyLookup(String(o.aircraft ?? ''));
    if (!aircraft || aircraft.length < 2) continue;
    const wb = String(o.aircraftBody ?? '').trim().toUpperCase() === 'WB';
    map.set(aircraft, wb ? 'WB' : 'NB');
  }
  return map;
}

function resolveAircraftBodyFromLookupMap(
  map: Map<string, 'NB' | 'WB'>,
  rawType: string,
): 'NB' | 'WB' | '' {
  const tryOne = (fragment: string): 'NB' | 'WB' | null => {
    const normalized = normalizeAircraftTypeForBodyLookup(fragment ?? '');
    if (normalized.length < 2) return null;
    return map.get(normalized) ?? null;
  };
  const primary = tryOne(rawType);
  if (primary) return primary;
  const parts = String(rawType ?? '')
    .split(/[/|,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of parts) {
    const hit = tryOne(p);
    if (hit) return hit;
  }
  return '';
}

function resolveAircraftBodyFromFhrDoc(
  doc: FhrDoc | null,
  bodyMap: Map<string, 'NB' | 'WB'> | null,
): string {
  const tc = aircraftTypeRawFromFhrDoc(doc);
  if (bodyMap && bodyMap.size > 0 && tc) {
    const hit = resolveAircraftBodyFromLookupMap(bodyMap, tc);
    if (hit) return hit;
  }
  const embedded = normalizeEmbeddedAircraftBody(aircraftBodyFromFhrDoc(doc));
  if (embedded) return embedded;
  if (tc && isWideBodyTypeCraft(tc)) return 'WB';
  return '';
}

function equipmentManpowerEntryToDetailLine(
  entry: Record<string, unknown>,
): Record<string, unknown> | null {
  const type = String(entry.entryType ?? '').trim().toLowerCase();
  const name = String(entry.name ?? '').trim();
  const isEquipment = type === 'equipment' || (!type && name.startsWith(EQ_PREFIX));
  if (!isEquipment) return null;

  const equipmentName = String(entry.equipmentName ?? '').trim();
  const equipmentSerialNo = String(entry.equipmentSerialNo ?? '').trim();
  const equipment_name = equipmentSerialNo || equipmentName;
  if (!equipment_name) return null;

  const from = splitEquipmentDateTimeForDisplay(entry.fromDate, entry.fromTime);
  const to = splitEquipmentDateTimeForDisplay(entry.toDate, entry.toTime);

  return {
    equipment_name,
    equipment_quantity: 1,
    from_date: from.date,
    from_time: from.time,
    to_date: to.date,
    to_time: to.time,
    usage_time: '',
    remarks: String(entry.remarks ?? '').trim(),
  };
}

function equipmentDetailLineName(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const o = raw as Record<string, unknown>;
  return String(
    o.equipment_name ?? o.equipmentName ?? o.equipmentNo ?? o.name ?? '',
  ).trim();
}

function manpowerEquipmentLinesFromFhrDoc(doc: FhrDoc): unknown[] {
  const embed = doc.equipmentManpower as { entries?: unknown[] } | null | undefined;
  const entries = Array.isArray(embed?.entries) ? embed.entries : [];
  const lines: unknown[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const line = equipmentManpowerEntryToDetailLine(entry as Record<string, unknown>);
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Prefer published `equipmentDetails` that actually name a GSE unit.
 * Empty / summary-only arrays must not block the manpower-embed fallback — that is
 * how GSE PDF still shows equipment for serials whose scheduled FHR stub is blank.
 */
function equipmentDetailLinesFromFhrDoc(doc: FhrDoc): unknown[] {
  const details = Array.isArray(doc.equipmentDetails) ? doc.equipmentDetails : [];
  const namedDetails = details.filter((row) => equipmentDetailLineName(row));
  if (namedDetails.length > 0) return namedDetails;
  return manpowerEquipmentLinesFromFhrDoc(doc);
}

/** Among candidate FHR docs for one flight, pick the one that actually has GSE lines. */
function pickFhrDocWithEquipment(
  cands: string[],
  docsMap: Map<number, FhrDoc>,
): FhrDoc | null {
  const docs: FhrDoc[] = [];
  const seen = new Set<FhrDoc>();
  for (const c of cands) {
    const n = Number(c);
    if (!Number.isFinite(n) || !docsMap.has(n)) continue;
    const doc = docsMap.get(n) as FhrDoc;
    if (seen.has(doc)) continue;
    seen.add(doc);
    docs.push(doc);
  }
  if (docs.length === 0) return null;
  return (
    docs.find((d) => equipmentDetailLinesFromFhrDoc(d).length > 0) ?? docs[0]
  );
}

/**
 * Wheelchairs live on FHR `terminalDetails` as passenger counts (not in
 * `equipmentDetails`). Same field aliases as ADS billing so Excel WCHR/WCHS/WCHC
 * rows stay consistent with billed usage.
 */
const WHEELCHAIR_SPECS: ReadonlyArray<{
  code: 'WCHR' | 'WCHS' | 'WCHC';
  arrivalFields: readonly string[];
  departureFields: readonly string[];
}> = [
  {
    code: 'WCHR',
    arrivalFields: ['wcr', 'arrivalWheelChairR', 'ArrivalWheelChairR', 'arrival_wcr'],
    departureFields: [
      'Departure_wcr',
      'departureWheelChairR',
      'DepartureWheelChairR',
      'departure_wcr',
    ],
  },
  {
    code: 'WCHS',
    arrivalFields: ['wcs', 'arrivalWheelChairS', 'ArrivalWheelChairS', 'arrival_wcs'],
    departureFields: [
      'Departure_wcs',
      'departureWheelChairS',
      'DepartureWheelChairS',
      'departure_wcs',
    ],
  },
  {
    code: 'WCHC',
    arrivalFields: ['wcc', 'arrivalWheelChairC', 'ArrivalWheelChairC', 'arrival_wcc'],
    departureFields: [
      'Departure_wcc',
      'departureWheelChairC',
      'DepartureWheelChairC',
      'departure_wcc',
    ],
  },
];

function terminalDetailsFromFhrDoc(doc: FhrDoc | null): Record<string, unknown> {
  if (!doc || typeof doc !== 'object') return {};
  if (
    doc.terminalDetails != null &&
    typeof doc.terminalDetails === 'object' &&
    !Array.isArray(doc.terminalDetails)
  ) {
    return doc.terminalDetails as Record<string, unknown>;
  }
  return {};
}

function firstPositiveCount(
  terminal: Record<string, unknown>,
  fields: readonly string[],
): number {
  for (const f of fields) {
    const n = Number(terminal?.[f]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const wanted = new Set(fields.map((f) => f.toLowerCase()));
  for (const [key, raw] of Object.entries(terminal ?? {})) {
    if (!wanted.has(key.toLowerCase())) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function wheelchairCountForType(
  terminal: Record<string, unknown>,
  code: 'WCHR' | 'WCHS' | 'WCHC',
): number {
  const spec = WHEELCHAIR_SPECS.find((s) => s.code === code);
  if (!spec) return 0;
  return (
    firstPositiveCount(terminal, spec.arrivalFields) +
    firstPositiveCount(terminal, spec.departureFields)
  );
}

function flightMetaFromFhrDoc(
  doc: FhrDoc,
  bodyMap: Map<string, 'NB' | 'WB'> | null,
): Pick<
  EquipmentFlatRow,
  'type_of_handling' | 'cate_of_flight' | 'type_of_flight' | 'aircraft_body'
> {
  return {
    type_of_handling: typeOfHandlingFromFhrDoc(doc),
    cate_of_flight: cateOfFlightFromFhrDoc(doc),
    type_of_flight: typeOfFlightFromFhrDoc(doc),
    aircraft_body: resolveAircraftBodyFromFhrDoc(doc, bodyMap),
  };
}

function wheelchairStampDate(doc: FhrDoc, flight: FlightData): string {
  const md = mainDetailsFromFhrDoc(doc) ?? {};
  return String(
    fhrString(md.ATDDate) ||
      fhrString(md.atdDate) ||
      fhrString(md.STADate) ||
      fhrString(md.staDate) ||
      flight.atdDate ||
      flight.staDate ||
      '',
  ).trim();
}

/**
 * Build one Excel equipment row per wheelchair type with count > 0
 * (arrival + departure pax from terminal details).
 */
export function mapWheelchairLinesFromFhrDoc(
  doc: FhrDoc,
  flight: FlightData,
  gseLookup: Map<string, string>,
  unitTypeLookup: Map<string, string>,
  bodyMap: Map<string, 'NB' | 'WB'> | null,
): EquipmentFlatRow[] {
  const terminal = terminalDetailsFromFhrDoc(doc);
  if (Object.keys(terminal).length === 0) return [];

  const meta = flightMetaFromFhrDoc(doc, bodyMap);
  const stampDate = wheelchairStampDate(doc, flight);
  const rows: EquipmentFlatRow[] = [];

  for (const spec of WHEELCHAIR_SPECS) {
    const qty = wheelchairCountForType(terminal, spec.code);
    if (qty <= 0) continue;
    rows.push({
      flight,
      ...meta,
      equipment_name: resolveGseDisplayNameFromCatalog(spec.code, gseLookup),
      unit_type: resolveUnitTypeFromCatalog(spec.code, unitTypeLookup) || 'equipment',
      equipment_quantity: String(qty),
      from_date: stampDate,
      from_time: '',
      to_date: stampDate,
      to_time: '',
      usage_time: '',
      remarks: '',
    });
  }
  return rows;
}

export function mapEquipmentLinesFromFhrDoc(
  doc: FhrDoc,
  flight: FlightData,
  gseLookup: Map<string, string>,
  unitTypeLookup: Map<string, string>,
  bodyMap: Map<string, 'NB' | 'WB'> | null,
): EquipmentFlatRow[] {
  const list = equipmentDetailLinesFromFhrDoc(doc);
  if (list.length === 0) return [];

  const meta = flightMetaFromFhrDoc(doc, bodyMap);

  return list.map((raw) => {
    const o = raw as Record<string, unknown>;
    const rawName = equipmentDetailLineName(raw) || String(o.equipment_name ?? '');
    return {
      flight,
      ...meta,
      equipment_name: resolveGseDisplayNameFromCatalog(rawName, gseLookup),
      unit_type: resolveUnitTypeFromCatalog(rawName, unitTypeLookup),
      equipment_quantity:
        o.equipment_quantity != null && o.equipment_quantity !== ''
          ? String(o.equipment_quantity)
          : '',
      from_date: String(o.from_date ?? ''),
      from_time: String(o.from_time ?? ''),
      to_date: String(o.to_date ?? ''),
      to_time: String(o.to_time ?? ''),
      usage_time: String(o.usage_time ?? ''),
      remarks: String(o.remarks ?? ''),
    };
  });
}

async function fetchFhrDocForFlight(
  flight: FlightData,
  baseUrl: string,
): Promise<FhrDoc | null> {
  const trimmedBase = baseUrl.replace(/\/$/, '');
  const tried = new Set<string>();
  const docs: FhrDoc[] = [];
  const tokens = [
    ...nsRawSerialCandidatesForLockFetch(flight),
    String(flight.slNo ?? '').trim(),
  ].filter(Boolean);
  for (const cand of tokens) {
    const token = String(cand ?? '').trim();
    if (!token || tried.has(token)) continue;
    tried.add(token);
    try {
      const res = await fetch(
        `${trimmedBase}/fhr-collection/flight/${encodeURIComponent(token)}`,
      );
      if (!res.ok) continue;
      const doc = (await res.json()) as FhrDoc;
      if (!doc || typeof doc !== 'object') continue;
      docs.push(doc);
      if (equipmentDetailLinesFromFhrDoc(doc).length > 0) return doc;
    } catch {
      continue;
    }
  }
  return docs[0] ?? null;
}

async function fetchEquipmentManpowerEntries(
  flight: FlightData,
): Promise<unknown[] | null> {
  const tried = new Set<string>();
  const serials = [
    ...nsRawSerialCandidatesForLockFetch(flight),
    String(nsFormSerialForFlight(flight) ?? '').trim(),
    String(flight.slNo ?? '').trim(),
  ].filter(Boolean);
  for (const serial of serials) {
    const token = String(serial).trim();
    if (!token || tried.has(token)) continue;
    tried.add(token);
    try {
      const res = await fetch(equipmentManpowerByFlight(token).get());
      if (!res.ok) continue;
      const doc = (await res.json()) as { entries?: unknown[] };
      const entries = Array.isArray(doc.entries) ? doc.entries : [];
      if (entries.length > 0) return entries;
    } catch {
      continue;
    }
  }
  return null;
}

/** Load equipment lines for one scheduled flight (FHR embeds, then equipment-manpower API). */
export async function fetchEquipmentLinesForFlight(
  flight: FlightData,
  baseUrl: string,
  gseLookup: Map<string, string>,
  unitTypeLookup: Map<string, string>,
  bodyMap: Map<string, 'NB' | 'WB'> | null,
): Promise<EquipmentFlatRow[]> {
  const fhrDoc = await fetchFhrDocForFlight(flight, baseUrl);
  if (fhrDoc) {
    const rows = mapEquipmentLinesFromFhrDoc(
      fhrDoc,
      flight,
      gseLookup,
      unitTypeLookup,
      bodyMap,
    );
    if (rows.length > 0) return rows;
  }

  const apiEntries = await fetchEquipmentManpowerEntries(flight);
  if (apiEntries?.length) {
    const syntheticDoc: FhrDoc = {
      ...(fhrDoc ?? {}),
      equipmentManpower: { entries: apiEntries },
    };
    return mapEquipmentLinesFromFhrDoc(
      syntheticDoc,
      flight,
      gseLookup,
      unitTypeLookup,
      bodyMap,
    );
  }

  return [];
}

export type EquipmentLinesBatchResult = {
  /** GSE / manpower equipment lines from `equipmentDetails` (or manpower API). */
  equipmentRows: EquipmentFlatRow[];
  /**
   * WCHR / WCHS / WCHC rows from FHR `terminalDetails` passenger counts.
   * Kept separate so the export UI can opt in via checkbox (default off).
   */
  wheelchairRows: EquipmentFlatRow[];
};

/**
 * Batched equipment-lines lookup across many flights: one request resolves every
 * flight's FHR doc (instead of one `GET /fhr-collection/flight/:id` probe per
 * flight per candidate serial), which is what made large date ranges on the
 * Scheduled data export page time out. Falls back to the per-flight
 * `equipment-manpower` API only for flights with no FHR equipment lines.
 * Wheelchair (WCHR/WCHS/WCHC) counts are always extracted from terminal details
 * when an FHR doc is present — callers decide whether to include them in Excel.
 */
export async function fetchEquipmentLinesForFlightsBatch(
  flights: FlightData[],
  gseLookup: Map<string, string>,
  unitTypeLookup: Map<string, string>,
  bodyMap: Map<string, 'NB' | 'WB'> | null,
): Promise<EquipmentLinesBatchResult> {
  if (flights.length === 0) {
    return { equipmentRows: [], wheelchairRows: [] };
  }

  const candidatesByFlight = new Map<FlightData, string[]>();
  const allCandidateNumbers = new Set<number>();
  flights.forEach((f) => {
    const cands = nsRawSerialCandidatesForLockFetch(f);
    const withSl = cands.includes(String(f.slNo ?? '').trim())
      ? cands
      : [...cands, String(f.slNo ?? '').trim()].filter(Boolean);
    candidatesByFlight.set(f, withSl);
    withSl.forEach((c) => {
      const n = Number(c);
      if (Number.isFinite(n)) allCandidateNumbers.add(n);
    });
  });

  let docsMap: Map<number, FhrDoc>;
  try {
    docsMap = await fetchFhrDocsBatch(Array.from(allCandidateNumbers));
  } catch {
    docsMap = new Map();
  }

  const fallbackFlights: FlightData[] = [];
  const equipmentChunks: EquipmentFlatRow[][] = [];
  const wheelchairChunks: EquipmentFlatRow[][] = [];

  flights.forEach((f) => {
    const cands = candidatesByFlight.get(f) ?? [];
    const doc = pickFhrDocWithEquipment(cands, docsMap);
    if (doc) {
      wheelchairChunks.push(
        mapWheelchairLinesFromFhrDoc(doc, f, gseLookup, unitTypeLookup, bodyMap),
      );
    }
    const rows = doc
      ? mapEquipmentLinesFromFhrDoc(doc, f, gseLookup, unitTypeLookup, bodyMap)
      : [];
    if (rows.length > 0) {
      equipmentChunks.push(rows);
    } else {
      fallbackFlights.push(f);
    }
  });

  if (fallbackFlights.length > 0) {
    const fallbackChunks = await Promise.all(
      fallbackFlights.map(async (f) => {
        const apiEntries = await fetchEquipmentManpowerEntries(f);
        if (!apiEntries?.length) return [] as EquipmentFlatRow[];
        const syntheticDoc: FhrDoc = { equipmentManpower: { entries: apiEntries } };
        return mapEquipmentLinesFromFhrDoc(
          syntheticDoc,
          f,
          gseLookup,
          unitTypeLookup,
          bodyMap,
        );
      }),
    );
    equipmentChunks.push(...fallbackChunks);
  }

  return {
    equipmentRows: equipmentChunks.flat(),
    wheelchairRows: wheelchairChunks.flat(),
  };
}

export function buildEquipmentCatalogLookups(catalogItems: GseCatalogRow[]): {
  gseLookup: Map<string, string>;
  unitTypeLookup: Map<string, string>;
} {
  return {
    gseLookup: buildAbbrDescriptionLookup(catalogItems),
    unitTypeLookup: buildAbbrUnitTypeLookup(catalogItems),
  };
}
