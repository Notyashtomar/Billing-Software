/**
 * Map FHR equipmentDetails / equipmentManpower.entries → ADS-family billing source rows.
 * Used for MAA ADS invoicing (scheduled FHR is source of truth; not ads_usage_data).
 */

import { reportDateYmd } from '../utils/invoicing-flight-report.mapper';
import { resolveBillingCustomerCode } from '../utils/billing-customer-code.util';
import { lookupAdhocRate } from './ads-adhoc-tariff';
import { adsEquipmentFamilyKey } from './ads-equipment-inclusion.util';
import { adsTimeBasedUnits, isAdsTimeBasedUom } from './rate-card-billing-scope';
import { toBillingTrackableFullName } from 'src/common/billing-trackable-equipment-name';

export type AdsEquipmentCatalogItem = {
  abbr: string;
  description: string;
  unit_type?: string;
  category?: string;
};

export type FhrAdsMappedRow = {
  sourceType: 'equipment' | 'manpower';
  sourceRef: {
    serialNo: string;
    flightNo: string;
    usageRowId: string;
  };
  operationalData: Record<string, unknown>;
  customerCode: string;
  serviceCode: string;
  billingDate: string;
};

/** Uppercase trimmed key for matching FHR `equipment_name` to catalog abbr/description. */
export function normalizeCatalogKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export type AdsCatalogIndex = {
  byAbbr: Map<string, AdsEquipmentCatalogItem>;
  byDescription: Map<string, AdsEquipmentCatalogItem>;
};

export function buildAdsCatalogIndex(
  items: readonly AdsEquipmentCatalogItem[],
): AdsCatalogIndex {
  const byAbbr = new Map<string, AdsEquipmentCatalogItem>();
  const byDescription = new Map<string, AdsEquipmentCatalogItem>();
  for (const item of items) {
    const abbr = normalizeCatalogKey(item.abbr);
    const desc = normalizeCatalogKey(item.description);
    if (abbr) {
      byAbbr.set(abbr, item);
      byAbbr.set(compactCatalogKey(abbr), item);
    }
    if (desc) {
      byDescription.set(desc, item);
      byDescription.set(compactCatalogKey(desc), item);
    }
  }
  return { byAbbr, byDescription };
}

function compactCatalogKey(key: string): string {
  return key.replace(/[^A-Z0-9]+/g, '');
}

/** Strip UI quantity suffixes like `EBT (×2)`. */
function stripQtySuffix(name: string): string {
  return name.replace(/\s*\(×\d+\)\s*$/i, '').trim();
}

/**
 * Resolve equipment label from FHR line — tolerates legacy EQ:/MP: pipes, casing,
 * and alternate field names used across MAA imports and forms.
 */
export function resolveRawEquipmentName(line: Record<string, unknown>): string {
  const candidates = [
    line.equipment_name,
    line.equipmentName,
    line.Equipment_Name,
    line.equipment,
    line.name,
  ];
  for (const raw of candidates) {
    let text = String(raw ?? '').trim();
    if (!text) continue;
    text = text.replace(/^(EQ|MP)\s*:\s*/i, '');
    const segments = text
      .split('|')
      .map((segment) => stripQtySuffix(segment.trim()))
      .filter(Boolean);
    for (const segment of segments) {
      if (segment) return segment;
    }
  }
  return '';
}

export function resolveCatalogItem(
  rawName: string,
  catalog: AdsCatalogIndex,
): AdsEquipmentCatalogItem | null {
  const key = normalizeCatalogKey(rawName);
  if (!key) return null;

  const direct = catalog.byAbbr.get(key) ?? catalog.byDescription.get(key);
  if (direct) return direct;

  const compact = compactCatalogKey(key);
  if (compact) {
    const compactHit = catalog.byAbbr.get(compact) ?? catalog.byDescription.get(compact);
    if (compactHit) return compactHit;

    if (compact.length >= 3) {
      for (const [abbr, item] of catalog.byAbbr) {
        const abbrCompact = compactCatalogKey(abbr);
        if (
          abbrCompact.length >= 3 &&
          (compact.includes(abbrCompact) || abbrCompact.includes(compact))
        ) {
          return item;
        }
      }
    }
  }

  const rawFamily = adsEquipmentFamilyKey(rawName);
  if (rawFamily) {
    for (const item of catalog.byAbbr.values()) {
      const itemFamily =
        adsEquipmentFamilyKey(item.abbr) ?? adsEquipmentFamilyKey(item.description);
      if (itemFamily && itemFamily === rawFamily) return item;
    }
  }

  for (const [desc, item] of catalog.byDescription) {
    if (desc.length >= 4 && key.length >= 4 && (key.includes(desc) || desc.includes(key))) {
      return item;
    }
  }

  return null;
}

/** Parse `HH:MM` / `H:MM` usage into fractional hours. */
export function parseUsageHours(raw: unknown): number | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const hm = text.match(/^(\d{1,3}):(\d{2})\b/);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m) || m >= 60) return null;
    const hours = h + m / 60;
    return hours > 0 ? hours : null;
  }
  const asNum = Number(text);
  if (Number.isFinite(asNum) && asNum > 0 && asNum < 48) return asNum;
  return null;
}

/** Clock time (`HH:MM` or `HHMM`) → minutes past midnight. */
function clockToMinutes(raw: unknown): number | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const hm = t.match(/^(\d{1,2}):?(\d{2})$/);
  if (!hm) return null;
  const h = Number(hm[1]);
  const m = Number(hm[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Engagement duration (fractional hours) from a from/to date+time window.
 * Fallback used only when an explicit usage_time is absent. Handles usage that
 * crosses midnight via the from/to dates (or a single-day midnight rollover).
 */
export function engagementHoursFromWindow(
  line: Record<string, unknown>,
): number | null {
  const fromMin = clockToMinutes(line.from_time ?? line.fromTime);
  const toMin = clockToMinutes(line.to_time ?? line.toTime);
  if (fromMin == null || toMin == null) return null;

  const fromYmd = reportDateYmd(line.from_date ?? line.fromDate);
  const toYmd = reportDateYmd(line.to_date ?? line.toDate);
  let dayDiff = 0;
  if (fromYmd && toYmd) {
    const a = Date.parse(`${fromYmd}T00:00:00Z`);
    const b = Date.parse(`${toYmd}T00:00:00Z`);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      dayDiff = Math.round((b - a) / 86_400_000);
    }
  }

  let minutes = dayDiff * 1440 + (toMin - fromMin);
  // Same clock on the same day (00:00–00:00) is an empty window, not a 24-hour shift.
  if (minutes === 0 && dayDiff === 0 && toMin === fromMin) return null;
  // to-time before from-time with no spanning dates → assume next-day rollover.
  if (minutes <= 0 && dayDiff === 0) minutes += 1440;
  if (minutes <= 0) return null;
  return minutes / 60;
}

const MANPOWER_NAME_RE =
  /\b(CSA|CSH|UH|WW|WCHR|WCHS|WCHC|SUP|SR\.?\s*CSA|MAAS|MANPOWER|MARSHAL|FLOOR\s*WALK|WING\s*WALK|CREW|STAFF|WHITE\s*COLLAR)\b/i;

export function classifyAdsSourceType(
  rawName: string,
  catalogItem: AdsEquipmentCatalogItem | null,
): 'equipment' | 'manpower' {
  const unit = String(catalogItem?.unit_type ?? '').trim().toLowerCase();
  if (unit.includes('manpower') || unit === 'mp' || unit === 'personnel') {
    return 'manpower';
  }
  if (unit.includes('equipment') || unit === 'eq') {
    return 'equipment';
  }
  const name = `${rawName} ${catalogItem?.description ?? ''}`;
  if (MANPOWER_NAME_RE.test(name)) return 'manpower';
  return 'equipment';
}

export function resolveAdsParticularName(
  rawName: string,
  catalogItem: AdsEquipmentCatalogItem | null,
): string {
  const kind = classifyAdsSourceType(rawName, catalogItem);
  const billed = toBillingTrackableFullName(rawName, kind === 'manpower' ? 'manpower' : 'equipment');
  if (billed && billed !== rawName) return billed;
  const desc = String(catalogItem?.description ?? '').trim();
  if (desc) {
    const billedDesc = toBillingTrackableFullName(
      desc,
      kind === 'manpower' ? 'manpower' : 'equipment',
    );
    return billedDesc || desc;
  }
  return billed || String(rawName ?? '').trim();
}

/**
 * ADS Used / Charged quantities are always whole units (no fractional hours on invoice).
 */
export function toWholeAdsUnits(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const whole = Math.round(value);
  return whole > 0 ? whole : 1;
}

/**
 * Parse billable count from FHR `equipmentDetails.remarks`.
 * Examples:
 * - `01:30 DEP - 06TRIP` → 6
 * - `Arrival 04 // Departure 04` → 8
 * - `A-1 D-2 03TRIPS` → 3 (explicit TRIPS wins)
 * - `13:20 08` → 8 (duration + count)
 * Pure `HH:MM` duration alone → null (not a quantity).
 */
export function parseAdsRemarksQuantity(raw: unknown): number | null {
  const text = String(raw ?? '').trim();
  if (!text || text === '-' || text === '–') return null;

  const trip = text.match(/(\d+)\s*TRIPS?\b/i);
  if (trip) {
    const n = Number(trip[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const arrDep = text.match(
    /Arrival\s*[:=\-]?\s*(\d+)\s*(?:\/\/|\/|,|;|\||\s+)\s*Departure\s*[:=\-]?\s*(\d+)/i,
  );
  if (arrDep) {
    const a = Number(arrDep[1]);
    const d = Number(arrDep[2]);
    if (Number.isFinite(a) && Number.isFinite(d) && a + d > 0) return a + d;
  }

  const ad = text.match(/\bA\s*[:=\-]?\s*(\d+)\b.*?\bD\s*[:=\-]?\s*(\d+)\b/i);
  if (ad) {
    const a = Number(ad[1]);
    const d = Number(ad[2]);
    if (Number.isFinite(a) && Number.isFinite(d) && a + d > 0) return a + d;
  }

  const timeCount = text.match(/^\d{1,3}:\d{2}\s+(\d+)\b/);
  if (timeCount) {
    const n = Number(timeCount[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  if (/^\d{1,4}$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

/**
 * Compute used units once UOM is known (rate card / adhoc).
 * - Time-based UOM (Per Hour / Per Half Hour / Per 15 Minutes): billed by
 *   engagement time only — started hour / half-hour / 15-minute blocks
 *   (Per Hour tolerates a 5-min grace). Quantity is ignored for time-based equipment.
 * - Otherwise: equipment qty × remarks count (when remarks encode trips/units).
 * Always returns a whole number.
 */
export function computeAdsUsedUnits(opts: {
  qty: number;
  usageHours: number | null;
  uom?: string | null;
  minBillableUnits?: number | null;
  /** Count parsed from FHR remarks (`06TRIP`, `Arrival 04 // Departure 04`, …). */
  remarksQuantity?: number | null;
}): number {
  const qty = Number.isFinite(opts.qty) && opts.qty > 0 ? opts.qty : 1;
  const remarksQty =
    opts.remarksQuantity != null &&
    Number.isFinite(opts.remarksQuantity) &&
    opts.remarksQuantity > 0
      ? opts.remarksQuantity
      : null;
  const engagementMinutes =
    opts.usageHours != null && opts.usageHours > 0 ? opts.usageHours * 60 : null;

  const timeUnits = adsTimeBasedUnits(opts.uom, engagementMinutes);
  const quantityUnits = remarksQty != null ? qty * remarksQty : qty;
  // Time-based UOMs bill only the engagement. No usage time means nothing to charge.
  let used = isAdsTimeBasedUom(opts.uom)
    ? timeUnits ?? 0
    : timeUnits != null
      ? timeUnits
      : quantityUnits;

  const min = Number(opts.minBillableUnits);
  if (Number.isFinite(min) && min > used) used = min;
  return toWholeAdsUnits(used);
}

function pickCustomerCode(
  main: Record<string, unknown>,
  terminal: Record<string, unknown> = {},
): string {
  // MAA often stores flight no in Arline_Code (IX2718) — normalize to IX.
  return resolveBillingCustomerCode(main, {}, pickFlightNo(main, terminal));
}

function pickFlightNo(
  main: Record<string, unknown>,
  terminal: Record<string, unknown> = {},
): string {
  const arrival = String(
    main.ArrivalFltNo ?? main.arrivalFltNo ?? terminal.ArrivalFltNo ?? '',
  ).trim();
  const departure = String(
    main.DepartureFltNo ?? main.departureFltNo ?? terminal.DepartureFltNo ?? '',
  ).trim();
  if (arrival && departure) {
    return arrival === departure ? arrival : `${arrival}/${departure}`;
  }
  const direct = String(
    departure ||
      arrival ||
      terminal.FlightNo ||
      terminal.flightNo ||
      main.FlightNo ||
      main.flightNo ||
      main.Flight_No ||
      main.FltNo ||
      main.flight_no ||
      '',
  ).trim();
  if (direct) return direct;

  // MAA FHR often stores the flight pair only on Arline_Code (e.g. IX2660/2975).
  const arline = String(main.Arline_Code ?? main.airlineCode ?? '').trim();
  if (arline && /\d/.test(arline)) return arline;
  return '';
}

function pickAircraftType(main: Record<string, unknown>): string {
  return String(
    main.TypeCraft ?? main.typeCraft ?? main.AircraftType ?? main.aircraftType ?? '',
  ).trim();
}

function pickCategoryOfFlight(main: Record<string, unknown>): string {
  return String(
    main.Cate_of_Flight ??
      main.CategoryOfFlight ??
      main.categoryOfFlight ??
      main.DomInt ??
      main.domInt ??
      main.NatureOfFlight ??
      main.Typeofflight ??
      '',
  ).trim();
}

/** True when equipment label is Crew Coach (FHR / catalog variants). */
export function isCrewCoachEquipmentLabel(raw: unknown): boolean {
  const compact = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/[^A-Z0-9]+/g, '');
  return compact.includes('CREWCOACH');
}

/**
 * Turnaround = paired ARR/DEP flight (one shared crew coach).
 * Detect via ops/typeOfHandling, flight-no slash pair, or distinct ARR+DEP numbers.
 */
export function isTurnaroundFlightContext(
  op: Record<string, unknown> | null | undefined,
  flightNo?: unknown,
): boolean {
  const src = op ?? {};
  const handling = String(
    src.typeOfHandling ??
      src.TypeofHandling ??
      src.ops ??
      src.opsType ??
      src.typeOfFlight ??
      src.Typeofflight ??
      '',
  )
    .trim()
    .toLowerCase();
  if (handling.includes('turnaround') || handling === 'ta') return true;

  const pair = String(
    flightNo ??
      src.flightNo ??
      src.flightNoEquipmentNo ??
      src.FlightNo ??
      '',
  ).trim();
  if (pair.includes('/')) return true;

  const arrival = String(
    src.ArrivalFltNo ?? src.arrivalFltNo ?? '',
  ).trim();
  const departure = String(
    src.DepartureFltNo ?? src.departureFltNo ?? '',
  ).trim();
  return Boolean(arrival && departure && arrival !== departure);
}

/**
 * Turnaround flights use one crew coach — keep a single billable row (qty 1).
 * ARR+DEP lines / multi-TRIP remarks must not double-charge.
 */
export function collapseTurnaroundCrewCoachRows(
  rows: FhrAdsMappedRow[],
): FhrAdsMappedRow[] {
  if (rows.length === 0) return rows;

  const sample = rows[0]?.operationalData ?? {};
  const flightNo = rows[0]?.sourceRef?.flightNo ?? sample.flightNo;
  if (!isTurnaroundFlightContext(sample, flightNo)) return rows;

  const crewIndexes: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const op = rows[i].operationalData ?? {};
    const label =
      op.equipment ??
      op.particular ??
      op.equipment_name ??
      op.equipmentName ??
      rows[i].serviceCode;
    if (isCrewCoachEquipmentLabel(label)) crewIndexes.push(i);
  }
  if (crewIndexes.length === 0) return rows;

  const keepIdx = crewIndexes[0];
  const keep = rows[keepIdx];
  const op = { ...(keep.operationalData ?? {}) };
  op.qty = 1;
  op.remarksQuantity = 1;
  op.chargeableUnits = 1;
  op.turnaroundCrewCoachCapped = true;
  keep.operationalData = op;

  if (crewIndexes.length === 1) return rows;

  const drop = new Set(crewIndexes.slice(1));
  return rows.filter((_, i) => !drop.has(i));
}

/** Cap Crew Coach used units to 1 on turnaround flights. */
export function capTurnaroundCrewCoachUsedUnits(
  used: number,
  op: Record<string, unknown> | null | undefined,
  particular?: unknown,
): number {
  const whole = toWholeAdsUnits(used);
  if (whole <= 0) return 0;
  const label =
    particular ??
    op?.adsParticular ??
    op?.particular ??
    op?.equipment ??
    op?.equipment_name ??
    op?.equipmentName ??
    '';
  if (!isCrewCoachEquipmentLabel(label)) return whole;
  if (!isTurnaroundFlightContext(op, op?.flightNo ?? op?.flightNoEquipmentNo)) {
    return whole;
  }
  return Math.min(1, whole);
}

function lineBillingYmd(
  line: Record<string, unknown>,
  main: Record<string, unknown>,
): string | null {
  return (
    reportDateYmd(line.from_date) ??
    reportDateYmd(line.fromDate) ??
    reportDateYmd(main.ATDDate) ??
    reportDateYmd(main.atdDate) ??
    reportDateYmd(main.STADate) ??
    reportDateYmd(main.staDate) ??
    reportDateYmd(main.STA_Date) ??
    null
  );
}

function mapDetailLine(opts: {
  serialNo: number;
  main: Record<string, unknown>;
  terminal: Record<string, unknown>;
  line: Record<string, unknown>;
  lineIndex: number;
  catalog: AdsCatalogIndex;
  fromYmd: string;
  toYmd: string;
  /**
   * When set (BHS-parity flight window), include the line even if equipment
   * from_date is outside the search range, and stamp billing to the flight date.
   */
  flightWindowYmd?: string | null;
}): FhrAdsMappedRow | null {
  const cleanedName = resolveRawEquipmentName(opts.line);
  if (!cleanedName) return null;

  const lineDate = lineBillingYmd(opts.line, opts.main);
  const billingDate = opts.flightWindowYmd || lineDate;
  if (!billingDate) return null;
  if (
    !opts.flightWindowYmd &&
    (billingDate < opts.fromYmd || billingDate > opts.toYmd)
  ) {
    return null;
  }

  const catalogItem = resolveCatalogItem(cleanedName, opts.catalog);
  const particular = resolveAdsParticularName(cleanedName, catalogItem);
  const sourceType = classifyAdsSourceType(cleanedName, catalogItem);
  const qtyRaw = Number(
    opts.line.equipment_quantity ?? opts.line.quantity ?? opts.line.qty ?? 1,
  );
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
  const remarksQuantity = parseAdsRemarksQuantity(opts.line.remarks);
  const usageHours =
    parseUsageHours(
      opts.line.usage_time ?? opts.line.usageTime ?? opts.line.remarks,
    ) ?? engagementHoursFromWindow(opts.line);
  // Provisional chargeable units: prefer hours when present (hourly adhoc common);
  // enrichment recomputes with final UOM (+ remarks qty for trip/service UOMs).
  const provisionalUnits =
    usageHours != null && usageHours > 0
      ? qty * usageHours
      : remarksQuantity != null
        ? qty * remarksQuantity
        : qty;

  const flightNo = pickFlightNo(opts.main, opts.terminal);
  const customerCode = pickCustomerCode(opts.main, opts.terminal);
  const aircraftType = pickAircraftType(opts.main);
  const categoryOfFlight = pickCategoryOfFlight(opts.main);
  const typeOfHandling = String(
    opts.main.TypeofHandling ?? opts.main.typeOfHandling ?? '',
  ).trim();
  const ops = String(
    opts.main.ops ?? opts.main.opsType ?? opts.main.Typeofflight ?? '',
  ).trim();
  const arrivalFltNo = String(
    opts.main.ArrivalFltNo ??
      opts.main.arrivalFltNo ??
      opts.terminal.ArrivalFltNo ??
      '',
  ).trim();
  const departureFltNo = String(
    opts.main.DepartureFltNo ??
      opts.main.departureFltNo ??
      opts.terminal.DepartureFltNo ??
      '',
  ).trim();

  const serviceCode =
    sourceType === 'manpower'
      ? `ADS - Manpower - ${particular}`
      : `ADS - Equipment - ${particular}`;

  // Turnaround Crew Coach: bill at most one unit even when remarks say 02TRIP.
  const turnaroundCrew =
    isCrewCoachEquipmentLabel(particular) ||
    isCrewCoachEquipmentLabel(cleanedName);
  const isTurnaround = isTurnaroundFlightContext(
    {
      typeOfHandling,
      ops,
      ArrivalFltNo: arrivalFltNo,
      DepartureFltNo: departureFltNo,
      flightNo,
    },
    flightNo,
  );
  const cappedRemarks =
    turnaroundCrew && isTurnaround
      ? 1
      : remarksQuantity ?? undefined;
  const cappedQty = turnaroundCrew && isTurnaround ? 1 : qty;
  const cappedChargeable =
    turnaroundCrew && isTurnaround
      ? 1
      : provisionalUnits;

  return {
    sourceType,
    sourceRef: {
      serialNo: String(opts.serialNo),
      flightNo,
      usageRowId: `${opts.serialNo}:${opts.lineIndex}`,
    },
    operationalData: {
      equipment: particular,
      particular,
      equipment_name: cleanedName,
      qty: cappedQty,
      remarksQuantity: cappedRemarks,
      usageHours: usageHours ?? undefined,
      chargeableUnits: cappedChargeable,
      aircraftType,
      TypeCraft: aircraftType,
      categoryOfFlight,
      typeOfHandling: typeOfHandling || undefined,
      TypeofHandling: typeOfHandling || undefined,
      ops: ops || undefined,
      opsType: ops || undefined,
      ArrivalFltNo: arrivalFltNo || undefined,
      DepartureFltNo: departureFltNo || undefined,
      customerCode,
      customerName:
        String(opts.main.Airline ?? opts.main.AirlineName ?? opts.main.airlineName ?? '').trim() ||
        undefined,
      Airline: String(opts.main.Airline ?? '').trim() || undefined,
      Arline_Code: String(opts.main.Arline_Code ?? '').trim() || undefined,
      serialNumber: String(opts.serialNo),
      SerialNo: opts.serialNo,
      flightNo,
      flightNoEquipmentNo: flightNo,
      from_date: opts.line.from_date ?? opts.line.fromDate,
      from_time: opts.line.from_time ?? opts.line.fromTime,
      to_date: opts.line.to_date ?? opts.line.toDate,
      to_time: opts.line.to_time ?? opts.line.toTime,
      usage_time: opts.line.usage_time ?? opts.line.usageTime,
      remarks: opts.line.remarks,
      billingDateYmd: billingDate,
      atdDate: billingDate,
      ataDate:
        reportDateYmd(opts.main.ATADate) ??
        reportDateYmd(opts.main.ataDate) ??
        undefined,
      ATADate:
        reportDateYmd(opts.main.ATADate) ??
        reportDateYmd(opts.main.ataDate) ??
        undefined,
      staDate:
        reportDateYmd(opts.main.STADate) ??
        reportDateYmd(opts.main.staDate) ??
        billingDate,
      ...(turnaroundCrew && isTurnaround
        ? { turnaroundCrewCoachCapped: true }
        : {}),
    },
    customerCode: customerCode || 'UNK',
    serviceCode,
    billingDate,
  };
}

/**
 * Flatten one FHR doc into ADS mapped rows (equipmentDetails first, else embed entries).
 * Also synthesizes Cabin / Night Halt Cleaning from ramp cleaning evidence when missing.
 */
export function mapFhrDocToAdsRows(
  fhr: {
    SerialNo?: unknown;
    mainDetails?: Record<string, unknown> | null;
    terminalDetails?: Record<string, unknown> | null;
    rampDetails1?: Record<string, unknown> | null;
    equipmentDetails?: unknown;
    equipmentManpower?: Record<string, unknown> | null;
  },
  catalog: AdsCatalogIndex,
  opts: { fromYmd: string; toYmd: string; flightWindowYmd?: string | null },
): FhrAdsMappedRow[] {
  const serialNo = Number(fhr.SerialNo);
  if (!Number.isFinite(serialNo) || serialNo <= 0) return [];
  const main = (fhr.mainDetails ?? {}) as Record<string, unknown>;
  const terminal = (fhr.terminalDetails ?? {}) as Record<string, unknown>;
  const ramp = (fhr.rampDetails1 ?? {}) as Record<string, unknown>;
  const lineOpts = {
    serialNo,
    main,
    terminal,
    ramp,
    catalog,
    fromYmd: opts.fromYmd,
    toYmd: opts.toYmd,
    flightWindowYmd: opts.flightWindowYmd,
  };

  const details = Array.isArray(fhr.equipmentDetails)
    ? (fhr.equipmentDetails as Record<string, unknown>[])
    : [];

  const rows: FhrAdsMappedRow[] = [];
  if (details.length > 0) {
    details.forEach((line, lineIndex) => {
      const mapped = mapDetailLine({
        ...lineOpts,
        line,
        lineIndex,
      });
      if (mapped) rows.push(mapped);
    });
    appendWheelchairRows(rows, lineOpts);
    appendCleaningRows(rows, lineOpts);
    return collapseTurnaroundCrewCoachRows(rows);
  }

  const embed = fhr.equipmentManpower;
  const entries = Array.isArray(embed?.entries)
    ? (embed.entries as Record<string, unknown>[])
    : [];
  entries.forEach((entry, lineIndex) => {
    const line: Record<string, unknown> = {
      equipment_name:
        entry.equipmentName ||
        entry.equipmentSerialNo ||
        String(entry.name ?? '')
          .replace(/^(EQ|MP)\s*:\s*/i, '')
          .split('|')[0],
      equipment_quantity: 1,
      from_date: entry.fromDate,
      from_time: entry.fromTime,
      to_date: entry.toDate,
      to_time: entry.toTime,
      usage_time: entry.remarks,
      remarks: entry.remarks,
      name: entry.name,
    };
    const mapped = mapDetailLine({
      ...lineOpts,
      line,
      lineIndex,
    });
    if (mapped) {
      if (String(entry.entryType ?? '').toLowerCase() === 'manpower') {
        mapped.sourceType = 'manpower';
      } else if (String(entry.entryType ?? '').toLowerCase() === 'equipment') {
        mapped.sourceType = 'equipment';
      }
      rows.push(mapped);
    }
  });
  appendWheelchairRows(rows, lineOpts);
  appendCleaningRows(rows, lineOpts);
  return collapseTurnaroundCrewCoachRows(rows);
}

/**
 * Wheelchairs are NOT stored in equipmentDetails — they live in FHR
 * terminalDetails as passenger counts.
 *
 * Field names vary by source:
 * - Excel / legacy: wcr|wcs|wcc + Departure_wcr|wcs|wcc
 * - Scheduled Airlines Terminal Details form: arrivalWheelChairR|S|C +
 *   departureWheelChairR|S|C
 *
 * Map WCHR / WCHS / WCHC to ADS rows (qty = arrival + departure pax) so they
 * appear on the ADS palette and bill when the contract lists them. Not on the
 * contract → enrichment marks package_inclusive (never charged). Emits at most
 * 3 rows/flight, only when count > 0.
 */
const WHEELCHAIR_SPECS: ReadonlyArray<{
  code: 'WCHR' | 'WCHS' | 'WCHC';
  /** Arrival-side aliases (pick one source — do not double-count). */
  arrivalFields: readonly string[];
  /** Departure-side aliases (pick one source — do not double-count). */
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

/** First positive finite number among alias fields (avoids double-count). */
function firstPositiveCount(
  terminal: Record<string, unknown>,
  fields: readonly string[],
): number {
  for (const f of fields) {
    const n = Number(terminal?.[f]);
    if (Number.isFinite(n) && n > 0 && n <= 500) return n;
  }
  // Case-insensitive fallback for mixed key casings in lean docs.
  const wanted = new Set(fields.map((f) => f.toLowerCase()));
  for (const [key, raw] of Object.entries(terminal ?? {})) {
    if (!wanted.has(key.toLowerCase())) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0 && n <= 500) return n;
  }
  return 0;
}

/** Arrival + departure wheelchair pax for one type (WCHR / WCHS / WCHC). */
export function wheelchairCountForType(
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

function appendWheelchairRows(
  rows: FhrAdsMappedRow[],
  lineOpts: {
    serialNo: number;
    main: Record<string, unknown>;
    terminal: Record<string, unknown>;
    ramp?: Record<string, unknown>;
    catalog: AdsCatalogIndex;
    fromYmd: string;
    toYmd: string;
    flightWindowYmd?: string | null;
  },
): void {
  const { terminal, main } = lineOpts;
  // Stamp the wheelchair line to the flight's ATD/STA so it lands in range.
  const fromDate = main.ATDDate ?? main.atdDate ?? main.STADate ?? main.staDate;
  WHEELCHAIR_SPECS.forEach((spec, i) => {
    const qty = wheelchairCountForType(terminal, spec.code);
    if (qty <= 0) return;
    const mapped = mapDetailLine({
      ...lineOpts,
      line: {
        // Keep short code for contract matching (Scheduled Flight - WCHR ↔ WCHR).
        equipment_name: spec.code,
        equipment_quantity: qty,
        from_date: fromDate,
      },
      // Offset index keeps usageRowId unique vs equipment/manpower lines.
      lineIndex: 900000 + i,
    });
    if (mapped) {
      // Human-readable particular for invoice / adhoc tariff labels.
      mapped.operationalData.equipment = `Wheel Chair -${spec.code}`;
      mapped.operationalData.particular = `Wheel Chair -${spec.code}`;
      mapped.serviceCode = `Scheduled Flight - ${spec.code}`;
      rows.push(mapped);
    }
  });
}

function nonEmptyCleaningValue(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

function truthyOperationalFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return text === 'true' || text === 'yes' || text === 'y' || text === '1';
}

/** Ramp cleaning From/To (or started/closed aliases) means cabin cleaning was done. */
export function hasRampCleaningEvidence(
  ramp: Record<string, unknown> | null | undefined,
): boolean {
  const r = ramp ?? {};
  return (
    nonEmptyCleaningValue(r.CleaningFr) ||
    nonEmptyCleaningValue(r.cleaningStartedDate) ||
    nonEmptyCleaningValue(r.cleaningStartedTime) ||
    nonEmptyCleaningValue(r.CleaningTo) ||
    nonEmptyCleaningValue(r.cleaningClosedDate) ||
    nonEmptyCleaningValue(r.cleaningClosedTime)
  );
}

/** Night-halt flight marker from ramp and/or main details. */
export function isNightHaltFlight(
  main: Record<string, unknown> | null | undefined,
  ramp: Record<string, unknown> | null | undefined,
): boolean {
  const m = main ?? {};
  const r = ramp ?? {};
  return (
    truthyOperationalFlag(r.ifNightHalt) ||
    truthyOperationalFlag(m.stationBaseNightHalt) ||
    truthyOperationalFlag(m.StationBaseNightHalt) ||
    truthyOperationalFlag(m.BaseFlight) ||
    truthyOperationalFlag(m.IsStationBased)
  );
}

function cleaningLabelKey(value: unknown): string {
  return normalizeCatalogKey(value).replace(/[^A-Z0-9]+/g, ' ').trim();
}

function rowsAlreadyHaveCleaning(
  rows: FhrAdsMappedRow[],
  kind: 'cabin' | 'night-halt',
): boolean {
  return rows.some((row) => {
    const label = cleaningLabelKey(
      row.operationalData.particular ??
        row.operationalData.equipment ??
        row.operationalData.equipment_name ??
        row.serviceCode,
    );
    if (!label) return false;
    if (kind === 'cabin') {
      return (
        label === 'CABIN CLEANING' ||
        label.includes('CABIN CLEANING') ||
        label.includes('INTERIOR CLEANING')
      );
    }
    return (
      label === 'NIGHT HALT CLEANING' ||
      label.includes('NIGHT HALT CLEANING') ||
      (label.includes('NIGHT HALT') && label.includes('CLEAN'))
    );
  });
}

/**
 * When FHR ramp has cleaning times, emit Cabin Cleaning (and Night Halt Cleaning
 * when the flight is marked night-halt). Skips when equipmentDetails already
 * carries the same particular so counts are never doubled.
 */
function appendCleaningRows(
  rows: FhrAdsMappedRow[],
  lineOpts: {
    serialNo: number;
    main: Record<string, unknown>;
    terminal: Record<string, unknown>;
    ramp?: Record<string, unknown>;
    catalog: AdsCatalogIndex;
    fromYmd: string;
    toYmd: string;
    flightWindowYmd?: string | null;
  },
): void {
  const ramp = lineOpts.ramp ?? {};
  if (!hasRampCleaningEvidence(ramp)) return;

  const main = lineOpts.main;
  const cleaningFrom =
    String(ramp.CleaningFr ?? ramp.cleaningStartedDate ?? '').trim() ||
    undefined;
  const cleaningTo =
    String(ramp.CleaningTo ?? ramp.cleaningClosedDate ?? '').trim() || undefined;
  const fromDate =
    cleaningFrom ||
    main.ATDDate ||
    main.atdDate ||
    main.STADate ||
    main.staDate;

  const specs: Array<{
    kind: 'cabin' | 'night-halt';
    particular: string;
    usageSuffix: string;
    lineIndex: number;
  }> = [
    {
      kind: 'cabin',
      particular: 'Cabin Cleaning',
      usageSuffix: 'cleaning:cabin',
      lineIndex: 910000,
    },
  ];
  if (isNightHaltFlight(main, ramp)) {
    specs.push({
      kind: 'night-halt',
      particular: 'Night Halt Cleaning',
      usageSuffix: 'cleaning:night-halt',
      lineIndex: 910001,
    });
  }

  for (const spec of specs) {
    if (rowsAlreadyHaveCleaning(rows, spec.kind)) continue;
    const mapped = mapDetailLine({
      ...lineOpts,
      line: {
        equipment_name: spec.particular,
        equipment_quantity: 1,
        from_date: fromDate,
        from_time: ramp.cleaningStartedTime,
        to_date: cleaningTo || fromDate,
        to_time: ramp.cleaningClosedTime,
        remarks: 'Synthesized from FHR ramp cleaning times',
      },
      lineIndex: spec.lineIndex,
    });
    if (!mapped) continue;
    mapped.sourceRef.usageRowId = `${lineOpts.serialNo}:${spec.usageSuffix}`;
    mapped.operationalData.equipment = spec.particular;
    mapped.operationalData.particular = spec.particular;
    mapped.operationalData.equipment_name = spec.particular;
    mapped.operationalData.adsParticular = spec.particular;
    mapped.operationalData.cleaningFrom = cleaningFrom;
    mapped.operationalData.cleaningTo = cleaningTo;
    mapped.operationalData.cleaningSynthesizedFromRamp = true;
    mapped.serviceCode = `ADS - Equipment - ${spec.particular}`;
    rows.push(mapped);
  }
}

/** Hint whether adhoc tariff recognizes this particular (for tests / diagnostics). */
export function hasAdhocMatch(particular: string): boolean {
  return lookupAdhocRate(particular, { domestic: true }) != null;
}
