/* =========================
   Data flow (scheduled airlines / sidebar forms)
=========================
   • flight (FlightData): from table row; single source for "which flight".
     All form API URLs use flight.slNo (serial). Display fallback: use flight
     when no server data (e.g. flight.airline, flight.flightNo, flight.staDate).
   • Main Details: server → MainDetailsForm dbData; also lifted to parent
     as mainDetails for sidebar header (mainDetails ?? flight).
   • Terminal / Load Control: server response merged into form state with
     fallback to flight.*.
   • Ramp (ramp-details-1/2/3): fetched but not yet stored in state;
     forms show flight + placeholders until "populate from server" is implemented.
========================= */

import { displayFlightNoFromScheduleData } from '@/lib/schedule-flight-no-display';

export interface FlightData {
  destination: string | null;
  /** Serial number (same as MainDetailsData.flightSerialNumber) */
  slNo: string;
  /** Flight number (same as MainDetailsData.flightCode) */
  flightNo: string;
  /** Airline name (same as MainDetailsData.airlineName) */
  airline: string;
  /** Airline IATA/code when present on the row */
  airlineCode?: string;
  /** Aircraft type (same as MainDetailsData.aircraftType) */
  aircraft: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  /** Actual arrival date when present on FHR / NS FHR rows. */
  ataDate?: string;
  ataTime?: string;
  /** Actual departure date when present on FHR / NS FHR rows. */
  atdDate?: string;
  atdTime?: string;

  exportedNAV: string;
  rampLocked: string;
  paxLocked: string;
  gsdLocked: string;

  flightType: string;
  /**
   * Main Details category merged from scheduled pipeline / `fhr_collection`:
   * `category_of_flights`, `Cate_of_Flight`, `categoryOfFlight`, etc.
   */
  cateOfFlight?: string;
  /** Main Details "Type of Handling" (`TypeofHandling`); shown in scheduled table Type column when set. */
  typeOfHandling?: string;
  hClose: string;
  fBag: string;
  lBag: string;

  /** Routing from schedule / creation merge (`Routing`, `route`, `routing` on raw row). */
  route?: string;
  /** Optional display label from server (e.g. FL-100001). */
  serialLabel?: string;
  /** Legacy DB serial from imported operational forms (usually 5 digits). */
  legacySlNo?: string;

  /**
   * When the Creation → Scheduled Airlines document exists for this advance master serial
   * (`scheduleId`), ISO timestamp of `scheduled_airlines_creation.createdAt` (API-only).
   */
  scheduledAirlinesCreationCreatedAt?: string;
  /** Advance / schedule master id when present on the merged row (API / export). */
  scheduleId?: string;

  /**
   * High-level row status from server (`listDailyFromAdvance`): Open | Closed | Cancelled.
   * Closed = main + terminal + ramp + load-control documents all exist for the operational serial.
   */
  flightStatus?: string;
  /** Presence flags from server merge (operational DB serial). */
  hasMainDetails?: boolean;
  hasTerminalDetails?: boolean;
  hasRampDetails?: boolean;
  hasLoadControlDetails?: boolean;
  /** Saved equipment/manpower doc exists for ops serial (from daily pipeline merge). */
  hasEquipmentManpowerDetails?: boolean;

  /** Merge source hint from daily list (`advance_schedule_setup`, `scheduled_airlines_creation`, etc.). */
  scheduleSource?: string;
  /** Main-details / FHR base-flight flag when present on the row. */
  baseFlight?: string;
  challanNo?: string;
  bookingNo?: string;
  ops?: string;

  isCancelled: boolean;
}

export interface FlightStats {
  totalFlights: number;
  cancelledFlights: number;
  operationalFlights: number;

  airlines: Record<string, number>;
  flightTypes: Record<string, number>;

  lockStats: {
    rampLocked: number;
    paxLocked: number;
    gsdLocked: number;
    exportedNAV: number;
  };

  flightsByDate: Record<string, number>;
  aircraftTypes: Record<string, number>;
  cancellationRate: number;
}

/** Cancelled schedule row: flight number starts with CANC (case-insensitive, after trim). */
export function isScheduleCancelledFlightNo(raw: unknown): boolean {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .startsWith('CANC');
}

/**
 * Maps `Cate_of_Flight` (main-details category) to domestic vs international.
 * Matches `MainDetailsService.bucketScheduledFlightCategory` rules (cargo + domestic/intl, SDP/SDF vs SIP/SIF wording).
 */
export function domesticInternationalBucketFromCateOfFlight(
  cateOfFlightRaw: unknown,
): 'domestic' | 'international' | null {
  const raw = String(cateOfFlightRaw ?? '').trim();
  if (!raw) return null;
  const n = raw.toLowerCase().replace(/\s+/g, ' ');
  if (n.includes('cargo')) {
    if (n.includes('domestic')) return 'domestic';
    return 'international';
  }
  if (n.startsWith('domestic')) return 'domestic';
  if (n.includes('international')) return 'international';
  return null;
}

/* =========================
   Main Details (server response / form data)
========================= */

export interface DelayEntry {
  delay: string;
  reasonOfDelay: string;
  gh: boolean;
  oth: boolean;
}

/**
 * MainDetailsData: main details API response / stored document.
 * Field names match the server (main-details controller & schema).
 *
 * Mapping from FlightData (table row):
 *   flightSerialNumber ← FlightData.slNo (number)
 *   airlineName        ← FlightData.airline
 *   flightCode         ← FlightData.flightNo
 *   aircraftType       ← FlightData.aircraft
 */
export interface MainDetailsData {
  _id?: string;
  /** Serial number (same as FlightData.slNo) */
  flightSerialNumber: number;
  /** Airline name (same as FlightData.airline) */
  airlineName: string;
  /** Parent / operating company (non-scheduled booking). */
  companyName?: string;
  /** Non-scheduled booking operator (FHR shows Airline-Operator). */
  operator?: string;
  /** Airline code (`Arline_Code` on server) */
  airlineCode?: string;
  /** Flight number/code (same as FlightData.flightNo) */
  flightCode: string;
  ifOperationSplit?: boolean;
  arrivalFlightNo?: string;
  departureFlightNo?: string;
  ataDate?: string;
  ataTime?: string;
  atdDate?: string;
  atdTime?: string;
  iposDate?: string;
  iposTime?: string;
  etdDate?: string;
  etdTime?: string;
  regnNo?: string;
  terminalCode?: string;
  route?: string;
  ops?: string;
  /** Mirrors Mongo `TypeofHandling` / Excel “Type of Handling”. */
  typeOfHandling?: string;
  flightCategory?: string;
  stationBaseNightHalt?: boolean;
  aircraftType?: string;
  mtow?: string;
  aircraftBody?: string;
  freighter?: boolean;
  medicalPassenger?: boolean;
  returnToRamp?: boolean;
  stdLessThanSta?: boolean;
  arrivalDelay?: string;
  departureStatus?: string;
  departureDelay?: string;
  departureDelays?: DelayEntry[];
  arrivalDelays?: DelayEntry[];
  ghRep?: string;
  airlineRep?: string;
  challanNo?: string;
  bookingNo?: string;
  flightCancelled?: boolean;
  /** Opt-in: email FHR to airline when all locks complete. */
  shareFhrToAirline?: boolean;
  /** Opt-in: email FHR + GSE + Team to GH rep when all locks complete. */
  shareReportsToGhRep?: boolean;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

/* =========================
   Terminal Details (server payload)
========================= */
export interface TerminalDetailsData {
  _id?: string;
  serialNo?: number;
  airlinesOperator?: string;
  flightNo?: string;
  routing?: string;
  operations?: string;
  acType?: string;
  sta?: string;
  staDate?: string;
  std?: string;
  stdDate?: string;
  igm?: string;
  egm?: string;
  dpr?: string;
  ohd?: string;
  offLoadPax?: string;
  ahl?: string;
  gatePlanned?: string;
  gateFinal?: string;
  counterOpen?: string;
  counterClose?: string;
  systemBagCount?: string;
  boardingOpen?: string;
  boardingClose?: string;
  beltNo?: string;
  passengerArrived?: string;
  departed?: string;
  transit?: string;
  cabinBreakupF?: string;
  cabinBreakupC?: string;
  cabinBreakupY?: string;
  arrivalWheelChairR?: string;
  arrivalWheelChairS?: string;
  arrivalWheelChairC?: string;
  departureWheelChairR?: string;
  departureWheelChairS?: string;
  departureWheelChairC?: string;
  /** True when saved from Terminal Details form (not Excel/FHR seed). */
  enteredFromForm?: boolean;
}

/* =========================
   Load Control Details (server payload)
========================= */
export interface LoadControlDetailsData {
  _id?: string;
  serialNo?: number;
  airlinesOperator?: string;
  routing?: string;
  acType?: string;
  std?: string;
  flightNo?: string;
  operations?: string;
  sta?: string;
  staDate?: string;
  stdDate?: string;
  loadingDiagramGivenAt?: string;
  loadingSheetPrintedAt?: string;
  loadingSheetDeliveredAt?: string;
  flightPlanFieldAt?: string;
  fic?: string;
  adc?: string;
}

/* =========================
   Ramp Details 1 – Ramp Details Form (server payload)
========================= */
export interface RampDetails1Data {
  _id?: string;
  serialNo?: number;
  airlinesOperator?: string;
  flightNo?: string;
  routing?: string;
  operations?: string;
  etdDate?: string;
  acType?: string;
  staDate?: string;
  std?: string;
  etd?: string;
  sta?: string;
  ata?: string;
  stdDate?: string;
  ataDate?: string;
  bayPlanned?: string;
  bayFinal?: string;
  arrivalBaggageCount?: string;
  /** Bag reconciliation (Mongo `bagreco`). */
  bagreco?: string;
  /** First/last bag in arrival hall: dates stored as Fbarr / Lbarr; times in *HallTime. */
  firstBagArrivalHallDate?: string;
  firstBagArrivalHallTime?: string;
  Fbarr?: string;
  bmaCount?: string;
  lastBagArrivalHallDate?: string;
  lastBagArrivalHallTime?: string;
  Lbarr?: string;
  bbaBelt?: string;
  firstBagInBmaDate?: string;
  firstBagInBmaTime?: string;
  arrivalBag?: string;
  lastBagInBmaDate?: string;
  lastBagInBmaTime?: string;
  xRay?: boolean;
  cleaningStartedDate?: string;
  cleaningStartedTime?: string;
  oneSidedBelt?: boolean;
  customChecked?: boolean;
  cleaningClosedDate?: string;
  cleaningClosedTime?: string;
  ldc?: string;
  ldp?: string;
  mdp?: string;
  cgoPcsIn?: string;
  cgoPcsOut?: string;
  courierPcsIn?: string;
  courierPcsOut?: string;
  ifNightHalt?: boolean;
  holdOpenFrontDate?: string;
  holdOpenFrontTime?: string;
  holdOpenRearDate?: string;
  holdOpenRearTime?: string;
  holdOpenBulkDate?: string;
  holdOpenBulkTime?: string;
  holdOpenMainDeckDate?: string;
  holdOpenMainDeckTime?: string;
  holdCloseFrontDate?: string;
  holdCloseFrontTime?: string;
  holdCloseRearDate?: string;
  holdCloseRearTime?: string;
  holdCloseBulkDate?: string;
  holdCloseBulkTime?: string;
  holdCloseMainDeckDate?: string;
  holdCloseMainDeckTime?: string;
  lastActivityHoldDate?: string;
  lastActivityHoldTime?: string;
  arrivalUldCount?: string;
  arrivalCargoWeight?: string;
  arrivalMailWeight?: string;
  depPlannedUldCount?: string;
  depPlannedCargoWeight?: string;
  depPlannedMailWeight?: string;
  depActualUldCount?: string;
  depActualCargoWeight?: string;
  depActualMailWeight?: string;
  transitCargoUld?: string;
  transitCargoWeight?: string;
  transitCargoMail?: string;
}

/* =========================
   Ramp Details 2 – Duty Allocation Form (server payload)
========================= */
export interface RampDetails2Data {
  _id?: string;
  serialNo?: number;
  chooseEmployee?: string;
  name?: string;
  area?: string;
  dutyAllocation?: string;
  remarks?: string;
  aircraft?: string;
  staTime?: string;
  routing?: string;
  atdDate?: string;
  airline?: string;
  operation?: string;
  stdDate?: string;
  ataDate?: string;
  atdTime?: string;
  flightNo?: string;
  staDate?: string;
  stdTime?: string;
  ataTime?: string;
}

/* =========================
   Ramp Details 3 – Ramp Duty Allocation Report (server payload)
========================= */
export interface EmployeeAllocationRowData {
  employeeCode?: string;
  employeeName?: string;
  area?: string;
  dutyAllocation?: string;
  remarks?: string;
}

export interface RampDetails3Data {
  _id?: string;
  serialNo?: number;
  fhrNo?: string;
  airline?: string;
  flightNo?: string;
  aircraft?: string;
  operation?: string;
  staDate?: string;
  staTime?: string;
  stdDate?: string;
  stdTime?: string;
  routing?: string;
  ataDate?: string;
  ataTime?: string;
  atdDate?: string;
  atdTime?: string;
  employeeAllocations?: EmployeeAllocationRowData[];
}

/* =========================
   Remarks (server payload)
========================= */
/** Airline remarks satisfaction rating (must match server / Mongo). */
export const AIRLINE_REMARKS_RATINGS = [
  'Not Satisfactory',
  'Below Average',
  'Satisfactory',
  'Good',
  'Excellent',
] as const;
export type AirlineRemarksRating = (typeof AIRLINE_REMARKS_RATINGS)[number];

/** Map schedule STA date (dd/mm/yyyy, mm/dd ambiguous as dd/mm, or yyyy-mm-dd) to ISO calendar day for filtering. */
export function staDateStringToIsoYmd(
  sta: string | undefined | null,
): string | null {
  const s = String(sta ?? '').trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = s
    .split(/[/-]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 3 && parts[2].length === 4) {
    const d0 = parts[0].padStart(2, '0');
    const m0 = parts[1].padStart(2, '0');
    const y = parts[2];
    return `${y}-${m0}-${d0}`;
  }
  return null;
}

export interface RemarksData {
  _id?: string;
  serialNo?: number;
  airline?: string;
  flightNo?: string;
  toOpenInTab?: boolean;
  ghRemarks?: string;
  airlineRemarks?: string;
  /** Required on save (scheduled remarks form). */
  airlineRemarksRating?: AirlineRemarksRating | string;
  /** STA calendar day YYYY-MM-DD for dashboard date-range aggregation. */
  flightStaDateIso?: string;
  wantFeedback?: boolean;
  feedbackRemarks?: string;
  ghRep?: string;
  airlineRep?: string;
  airrep?: string;
  flightCancelled?: boolean;
}

/* =========================
   Equipment / Manpower (server payload)
========================= */
export interface EquipmentManpowerEntryData {
  name?: string;
  fromDate?: string;
  fromTime?: string;
  toDate?: string;
  toTime?: string;
  remarks?: string;
  exportedInNav?: string;
}

export interface EquipmentManpowerData {
  _id?: string;
  serialNo?: number;
  airlinesOperator?: string;
  flightNo?: string;
  routing?: string;
  operations?: string;
  acType?: string;
  sta?: string;
  staDate?: string;
  std?: string;
  stdDate?: string;
  atdDate?: string;
  listType?: string;
  entries?: EquipmentManpowerEntryData[];
  verifiedBy?: string;
  verifiedByCode?: string;
  verifiedAt?: string;
}

/* =========================
   Attachments (server payload)
========================= */
export interface AttachmentReportEntryData {
  checked?: boolean;
  reportName?: string;
  reportNo?: string;
}

export interface AttachmentsData {
  _id?: string;
  fhrNo?: number;
  reports?: AttachmentReportEntryData[];
  noOfScanReports?: string;
  attachmentFileName?: string;
  attachmentPath?: string;
}

/* =========================
   Reports (single report document – server payload)
========================= */
export interface ReportData {
  _id?: string;
  serialNo?: number;
  reportType?: string;
  viewedAt?: string;
  viewedBy?: string;
  signatureCleared?: boolean;
  signatureClearedAt?: string;
  signatureClearedBy?: string;
}

/* =========================
   Normalizers: raw API response → typed form data
   Maps Mongo / FHR embed keys (PascalCase, Excel row-2 names) → client form field names.
========================= */

function normIsRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === 'object' && !Array.isArray(x);
}

function normPickStr(
  r: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const k of keys) {
    if (!(k in r)) continue;
    const v = r[k];
    if (v == null || v === '') continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return undefined;
}

/** Split "dd/mm/yyyy HH:mm" (or dash/ISO) into date-only + time-only for ramp hold fields. */
function splitHoldDateTimeParts(raw: string | undefined): {
  date: string;
  time: string;
} {
  const t = String(raw ?? '').trim();
  if (!t) return { date: '', time: '' };
  if (t.includes('T')) {
    const idx = t.indexOf('T');
    return { date: t.slice(0, idx).trim(), time: t.slice(idx + 1).trim() };
  }
  const m = t.match(
    /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})(?:\s+(.+))?$/,
  );
  if (m) {
    return { date: (m[1] ?? '').trim(), time: (m[2] ?? '').trim() };
  }
  if (/\d{1,2}:\d{2}/.test(t) && !/[/-]/.test(t)) {
    return { date: '', time: t };
  }
  return { date: t, time: '' };
}

function normHoldDateTime(
  r: Record<string, unknown>,
  dateKeys: string[],
  timeKeys: string[],
): { date?: string; time?: string } {
  const rawDate = normPickStr(r, ...dateKeys);
  const rawTime = normPickStr(r, ...timeKeys);
  const fromDate = splitHoldDateTimeParts(rawDate);
  const date = fromDate.date || undefined;
  const time = (rawTime || fromDate.time || undefined) as string | undefined;
  return {
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
  };
}

function normPickNum(
  r: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const k of keys) {
    if (!(k in r)) continue;
    const v = r[k];
    if (v == null || v === '') continue;
    const n = Number(String(v).replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function normPickBool(
  r: Record<string, unknown>,
  ...keys: string[]
): boolean | undefined {
  for (const k of keys) {
    if (!(k in r)) continue;
    const v = r[k];
    if (v === true || v === false) return v;
    if (v === 1) return true;
    if (v === 0) return false;
    const s = String(v ?? '')
      .trim()
      .toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
  }
  return undefined;
}

function normMapDelayList(arr: unknown): DelayEntry[] | undefined {
  if (!Array.isArray(arr)) return undefined;
  const out: DelayEntry[] = [];
  for (const item of arr) {
    if (!normIsRecord(item)) continue;
    const delay = String(item.delay ?? item.Delay ?? '').trim();
    const reason = String(
      item.reasonOfDelay ?? item.ReasonofDelay ?? '',
    ).trim();
    const gh = normPickBool(item, 'gh') ?? false;
    const oth = normPickBool(item, 'oth') ?? false;
    if (!delay && !reason && !gh && !oth) continue;
    out.push({ delay, reasonOfDelay: reason, gh, oth });
  }
  return out.length > 0 ? out : undefined;
}

function normIdString(r: Record<string, unknown>): string | undefined {
  const id = r._id;
  if (id == null) return undefined;
  if (typeof id === 'object' && id !== null && '$oid' in (id as object)) {
    return String((id as { $oid: string }).$oid);
  }
  return String(id);
}

/** Collapse duplicate flight-no segments (e.g. `EK-1087/EK-1087` → `EK-1087`). */
function dedupeFlightNoSegments(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t.includes('/')) return t;
  const parts = t
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return t;
  if (parts.every((p) => p.toUpperCase() === parts[0]!.toUpperCase())) {
    return parts[0]!;
  }
  return t;
}

function flightCodeFromArrivalDeparture(arr: string, dep: string): string {
  const a = arr.trim();
  const d = dep.trim();
  if (!a && !d) return '';
  if (a && d) {
    if (a.toUpperCase() === d.toUpperCase()) return a;
    return `${a}/${d}`;
  }
  return a || d;
}

/** Normalize main-details API response to MainDetailsData */
export function normalizeMainDetailsData(raw: unknown): MainDetailsData | null {
  if (!normIsRecord(raw)) return null;
  const r = raw;
  const serial = normPickNum(r, 'flightSerialNumber', 'SerialNo') ?? 0;
  const airline = normPickStr(r, 'airlineName', 'Airline') ?? '';
  const airlineCode = normPickStr(r, 'airlineCode', 'Arline_Code') ?? '';
  const arr = normPickStr(r, 'arrivalFlightNo', 'ArrivalFltNo') ?? '';
  const dep = normPickStr(r, 'departureFlightNo', 'DepartureFltNo') ?? '';
  const storedFlightNo = (normPickStr(r, 'FlightNo', 'flightNo') ?? '').replace(/\s+/g, '');
  let flightCode = /^CANC/i.test(storedFlightNo)
    ? storedFlightNo
    : (normPickStr(r, 'flightCode', 'DepartureFltNo', 'ArrivalFltNo') ?? '');
  if (!String(flightCode).trim()) {
    flightCode = flightCodeFromArrivalDeparture(arr, dep);
  }
  flightCode = dedupeFlightNoSegments(flightCode);

  return {
    _id: normIdString(r),
    flightSerialNumber: serial,
    airlineName: airline,
    companyName: normPickStr(r, 'companyName', 'CompanyName') ?? '',
    airlineCode: airlineCode || undefined,
    flightCode,
    ifOperationSplit: normPickBool(r, 'ifOperationSplit'),
    arrivalFlightNo: arr || normPickStr(r, 'arrivalFlightNo', 'ArrivalFltNo'),
    departureFlightNo:
      dep || normPickStr(r, 'departureFlightNo', 'DepartureFltNo'),
    ataDate: normPickStr(r, 'ataDate', 'ATADate'),
    ataTime: normPickStr(r, 'ataTime', 'ATATime'),
    atdDate: normPickStr(r, 'atdDate', 'ATDDate'),
    atdTime: normPickStr(r, 'atdTime', 'ATDTime'),
    iposDate: normPickStr(r, 'iposDate', 'IPosDate'),
    iposTime: normPickStr(r, 'iposTime', 'IPosTime'),
    etdDate: normPickStr(r, 'etdDate'),
    etdTime: normPickStr(r, 'etdTime', 'ETDtime'),
    regnNo: normPickStr(r, 'regnNo', 'Regn'),
    terminalCode: normPickStr(r, 'terminalCode', 'Terminal'),
    route: normPickStr(r, 'route', 'Route'),
    ops: normPickStr(r, 'ops', 'Typeofflight'),
    typeOfHandling: normPickStr(r, 'typeOfHandling', 'TypeofHandling'),
    flightCategory: normPickStr(r, 'flightCategory', 'Cate_of_Flight'),
    stationBaseNightHalt: normPickBool(r, 'stationBaseNightHalt'),
    aircraftType: normPickStr(r, 'aircraftType', 'TypeCraft'),
    mtow: normPickStr(r, 'mtow', 'MTOW'),
    aircraftBody: normPickStr(r, 'aircraftBody'),
    freighter: normPickBool(r, 'freighter', 'Freighter') ?? false,
    medicalPassenger:
      normPickBool(r, 'medicalPassenger', 'MedicalPassenger') ?? false,
    returnToRamp: normPickBool(r, 'returnToRamp'),
    stdLessThanSta: normPickBool(r, 'stdLessThanSta'),
    arrivalDelay: normPickStr(r, 'arrivalDelay', 'ActualDelay'),
    departureStatus: normPickStr(r, 'departureStatus'),
    departureDelay: normPickStr(r, 'departureDelay'),
    departureDelays: normMapDelayList(r.departureDelays),
    arrivalDelays: normMapDelayList(r.arrivalDelays),
    ghRep: normPickStr(r, 'ghRep', 'PAX_Airline_SignByDate'),
    airlineRep: normPickStr(r, 'airlineRep', 'airrep'),
    flightCancelled: normPickBool(r, 'flightCancelled') ?? false,
    shareFhrToAirline: normPickBool(r, 'shareFhrToAirline') ?? false,
    shareReportsToGhRep: normPickBool(r, 'shareReportsToGhRep') ?? false,
    challanNo: normPickStr(
      r,
      'challanNo',
      'ChallanNo',
      'Challan No',
      'performaNo',
      'PerformaNo',
      'Performa No',
    ),
    bookingNo: normPickStr(r, 'bookingNo', 'BookingNo', 'Booking No'),
    operator: normPickStr(r, 'operator', 'Operator'),
    createdAt: normPickStr(r, 'createdAt'),
    updatedAt: normPickStr(r, 'updatedAt'),
  };
}

/** Normalize terminal-details API response to TerminalDetailsData */
export function normalizeTerminalDetailsData(
  raw: unknown,
): TerminalDetailsData | null {
  if (!normIsRecord(raw)) return null;
  const r = raw;
  return {
    _id: normIdString(r),
    serialNo: normPickNum(r, 'serialNo'),
    airlinesOperator: normPickStr(r, 'airlinesOperator'),
    flightNo: normPickStr(r, 'flightNo', 'FlightNo'),
    routing: normPickStr(r, 'routing'),
    operations: normPickStr(r, 'operations', 'Typeofflight'),
    acType: normPickStr(r, 'acType', 'TypeCraft'),
    sta: normPickStr(r, 'sta', 'STATime'),
    staDate: normPickStr(r, 'staDate', 'STADate'),
    std: normPickStr(r, 'std', 'STDTime'),
    stdDate: normPickStr(r, 'stdDate', 'STDDate'),
    igm: normPickStr(r, 'igm', 'IGMNo'),
    egm: normPickStr(r, 'egm', 'EGMNo'),
    dpr: normPickStr(r, 'dpr'),
    ohd: normPickStr(r, 'ohd'),
    offLoadPax: normPickStr(r, 'offLoadPax'),
    ahl: normPickStr(r, 'ahl'),
    gatePlanned: normPickStr(r, 'gatePlanned', 'GatePlanned'),
    gateFinal: normPickStr(r, 'gateFinal', 'GateFinal'),
    counterOpen: normPickStr(r, 'counterOpen', 'cntopen'),
    counterClose: normPickStr(r, 'counterClose', 'cntclose'),
    systemBagCount: normPickStr(r, 'systemBagCount', 'SystemBagCount'),
    boardingOpen: normPickStr(r, 'boardingOpen', 'brdopen'),
    boardingClose: normPickStr(r, 'boardingClose', 'brdclose'),
    beltNo: normPickStr(r, 'beltNo'),
    passengerArrived: normPickStr(r, 'passengerArrived', 'arrivalpax'),
    departed: normPickStr(r, 'departed', 'deppax'),
    transit: normPickStr(r, 'transit'),
    cabinBreakupF: normPickStr(r, 'cabinBreakupF', 'CabincnfF'),
    cabinBreakupC: normPickStr(r, 'cabinBreakupC', 'CabincnfC'),
    cabinBreakupY: normPickStr(r, 'cabinBreakupY', 'CabincnfY'),
    arrivalWheelChairR: normPickStr(r, 'arrivalWheelChairR', 'wcr'),
    arrivalWheelChairS: normPickStr(r, 'arrivalWheelChairS', 'wcs'),
    arrivalWheelChairC: normPickStr(r, 'arrivalWheelChairC', 'wcc'),
    departureWheelChairR: normPickStr(
      r,
      'departureWheelChairR',
      'Departure_wcr',
    ),
    departureWheelChairS: normPickStr(
      r,
      'departureWheelChairS',
      'Departure_wcs',
    ),
    departureWheelChairC: normPickStr(
      r,
      'departureWheelChairC',
      'Departure_wcc',
    ),
    enteredFromForm: r.enteredFromForm === true || r.enteredFromForm === 'true',
  };
}

/**
 * Terminal form/UI names → `CreateTerminalDetailsDto` / Mongo field names
 * (required for `ValidationPipe({ whitelist: true })` on POST/PATCH).
 */
export function terminalDetailsFormToSavePayload(input: {
  airlinesOperator: string;
  flightNo: string;
  routing: string;
  operations: string;
  acType: string;
  sta: string;
  staDate: string;
  std: string;
  stdDate: string;
  igm: string;
  egm: string;
  dpr: string;
  ohd: string;
  offLoadPax: string;
  ahl: string;
  gatePlanned: string;
  gateFinal: string;
  counterOpen: string;
  counterClose: string;
  systemBagCount: string;
  boardingOpen: string;
  boardingClose: string;
  beltNo: string;
  passengerArrived: string;
  departed: string;
  transit: string;
  cabinBreakupF: string;
  cabinBreakupC: string;
  cabinBreakupY: string;
  arrivalWheelChairR: string;
  arrivalWheelChairS: string;
  arrivalWheelChairC: string;
  departureWheelChairR: string;
  departureWheelChairS: string;
  departureWheelChairC: string;
}): Record<string, string | boolean> {
  return {
    airlinesOperator: input.airlinesOperator,
    FlightNo: input.flightNo,
    routing: input.routing,
    Typeofflight: input.operations,
    TypeCraft: input.acType,
    STATime: input.sta,
    STADate: input.staDate,
    STDTime: input.std,
    STDDate: input.stdDate,
    IGMNo: input.igm,
    EGMNo: input.egm,
    dpr: input.dpr,
    ohd: input.ohd,
    offLoadPax: input.offLoadPax,
    ahl: input.ahl,
    GatePlanned: input.gatePlanned,
    GateFinal: input.gateFinal,
    cntopen: input.counterOpen,
    cntclose: input.counterClose,
    SystemBagCount: input.systemBagCount,
    brdopen: input.boardingOpen,
    brdclose: input.boardingClose,
    beltNo: input.beltNo,
    arrivalpax: input.passengerArrived,
    deppax: input.departed,
    transit: input.transit,
    CabincnfF: input.cabinBreakupF,
    CabincnfC: input.cabinBreakupC,
    CabincnfY: input.cabinBreakupY,
    wcr: input.arrivalWheelChairR,
    wcs: input.arrivalWheelChairS,
    wcc: input.arrivalWheelChairC,
    Departure_wcr: input.departureWheelChairR,
    Departure_wcs: input.departureWheelChairS,
    Departure_wcc: input.departureWheelChairC,
    enteredFromForm: true,
  };
}

/**
 * Ramp details 1 form / UI field names → `CreateRampDetails1Dto` / Mongo field names.
 * Required for `ValidationPipe({ whitelist: true })` on POST/PATCH (otherwise cargo and
 * other mismatched keys are stripped and never reach `rampDetails1` / `fhr_collection`).
 */
export interface RampDetails1FormSaveInput {
  airlinesOperator: string;
  flightNo: string;
  routing?: string;
  operations?: string;
  etdDate?: string;
  acType?: string;
  staDate?: string;
  std?: string;
  etd?: string;
  sta?: string;
  ata?: string;
  stdDate?: string;
  ataDate?: string;
  bayPlanned?: string;
  bayFinal?: string;
  /** Departure bags (Mongo `arrivalBaggageCount`). */
  arrivalBaggageCount?: string;
  /** Arrival Bag (Mongo `airlinecount`). */
  arrivalBag?: string;
  airlinecount?: string;
  bagreco?: string;
  Fbarr?: string;
  firstBagArrivalHallTime?: string;
  firstBagArrivalHallDate?: string;
  bmaCount?: string;
  Lbarr?: string;
  lastBagArrivalHallTime?: string;
  lastBagArrivalHallDate?: string;
  bbaBelt?: string;
  firstBagInBmaDate?: string;
  firstBagInBmaTime?: string;
  lastBagInBmaDate?: string;
  lastBagInBmaTime?: string;
  xRay?: boolean;
  cleaningStartedDate?: string;
  cleaningStartedTime?: string;
  oneSidedBelt?: boolean;
  customChecked?: boolean;
  cleaningClosedDate?: string;
  cleaningClosedTime?: string;
  ldc?: string;
  ldp?: string;
  mdp?: string;
  cgoPcsIn?: string;
  cgoPcsOut?: string;
  courierPcsIn?: string;
  courierPcsOut?: string;
  ifNightHalt?: boolean;
  holdOpenFrontDate?: string;
  holdOpenFrontTime?: string;
  holdOpenRearDate?: string;
  holdOpenRearTime?: string;
  holdOpenBulkDate?: string;
  holdOpenBulkTime?: string;
  holdOpenMainDeckDate?: string;
  holdOpenMainDeckTime?: string;
  holdCloseFrontDate?: string;
  holdCloseFrontTime?: string;
  holdCloseRearDate?: string;
  holdCloseRearTime?: string;
  holdCloseBulkDate?: string;
  holdCloseBulkTime?: string;
  holdCloseMainDeckDate?: string;
  holdCloseMainDeckTime?: string;
  lastActivityHoldDate?: string;
  lastActivityHoldTime?: string;
  /** Cargo: scheduled uses `arrivalUld` + `arrivalUldCount`; non-scheduled uses `arrivalNoOfULD`. */
  arrivalUld?: string;
  arrivalUldCount?: string;
  arrivalNoOfULD?: string;
  arrivalCargoWeight?: string;
  arrivalMailWeight?: string;
  depPlannedUld?: string;
  depPlannedUldCount?: string;
  depPlannedNoOfULD?: string;
  depPlannedCargoWeight?: string;
  depPlannedMailWeight?: string;
  depActualUld?: string;
  depActualUldCount?: string;
  depActualNoOfULD?: string;
  depActualCargoWeight?: string;
  depActualMailWeight?: string;
  transitUld?: string;
  transitCargoUld?: string;
  transitCargoNoOfULD?: string;
  transitCargoWeight?: string;
  transitMailWeight?: string;
  transitCargoMail?: string;
}

function rampSaveStr(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

export function rampDetails1FormToSavePayload(
  input: RampDetails1FormSaveInput,
): Record<string, string | boolean> {
  const uldarr = rampSaveStr(
    input.arrivalUldCount ?? input.arrivalUld ?? input.arrivalNoOfULD,
  );
  const uldplan = rampSaveStr(
    input.depPlannedUldCount ?? input.depPlannedUld ?? input.depPlannedNoOfULD,
  );
  const uldatcdep = rampSaveStr(
    input.depActualUldCount ?? input.depActualUld ?? input.depActualNoOfULD,
  );
  const transitcgo = rampSaveStr(
    input.transitCargoUld ?? input.transitUld ?? input.transitCargoNoOfULD,
  );
  const transitCargoMail = rampSaveStr(
    input.transitCargoMail ?? input.transitMailWeight,
  );

  const payload: Record<string, string | boolean> = {
    airlinesOperator: rampSaveStr(input.airlinesOperator),
    FlightNo: rampSaveStr(input.flightNo),
    Route: rampSaveStr(input.routing),
    Typeofflight: rampSaveStr(input.operations),
    etdDate: rampSaveStr(input.etdDate),
    TypeCraft: rampSaveStr(input.acType),
    STADate: rampSaveStr(input.staDate),
    STDTime: rampSaveStr(input.std),
    etd: rampSaveStr(input.etd),
    STATime: rampSaveStr(input.sta),
    ATATime: rampSaveStr(input.ata),
    STDDate: rampSaveStr(input.stdDate),
    ATADate: rampSaveStr(input.ataDate),
    BayPlanned: rampSaveStr(input.bayPlanned),
    BayFinal: rampSaveStr(input.bayFinal),
    // Bay & Baggage: Departure bags → arrivalBaggageCount; Arrival Bag → airlinecount
    arrivalBaggageCount: rampSaveStr(input.arrivalBaggageCount),
    airlinecount: rampSaveStr(input.arrivalBag ?? input.airlinecount),
    Fbarr: rampSaveStr(input.Fbarr),
    firstBagArrivalHallDate: rampSaveStr(input.firstBagArrivalHallDate),
    firstBagArrivalHallTime: rampSaveStr(input.firstBagArrivalHallTime),
    bmaCount: rampSaveStr(input.bmaCount),
    Lbarr: rampSaveStr(input.Lbarr),
    bagreco: rampSaveStr(input.bagreco),
    lastBagArrivalHallDate: rampSaveStr(input.lastBagArrivalHallDate),
    lastBagArrivalHallTime: rampSaveStr(input.lastBagArrivalHallTime),
    bbaBelt: rampSaveStr(input.bbaBelt),
    firstBagInBmaDate: rampSaveStr(input.firstBagInBmaDate),
    firstBagInBmaTime: rampSaveStr(input.firstBagInBmaTime),
    lastBagInBmaDate: rampSaveStr(input.lastBagInBmaDate),
    lastBagInBmaTime: rampSaveStr(input.lastBagInBmaTime),
    CleaningFr: rampSaveStr(input.cleaningStartedDate),
    cleaningStartedTime: rampSaveStr(input.cleaningStartedTime),
    CleaningTo: rampSaveStr(input.cleaningClosedDate),
    cleaningClosedTime: rampSaveStr(input.cleaningClosedTime),
    HoldCnfLDC: rampSaveStr(input.ldc),
    HoldCnfLDP: rampSaveStr(input.ldp),
    HoldCnfMDP: rampSaveStr(input.mdp),
    cgopcsin: rampSaveStr(input.cgoPcsIn),
    cgopcout: rampSaveStr(input.cgoPcsOut),
    Courierin: rampSaveStr(input.courierPcsIn),
    Courierout: rampSaveStr(input.courierPcsOut),
    Frontopen: rampSaveStr(input.holdOpenFrontDate),
    holdOpenFrontTime: rampSaveStr(input.holdOpenFrontTime),
    Rearopen: rampSaveStr(input.holdOpenRearDate),
    holdOpenRearTime: rampSaveStr(input.holdOpenRearTime),
    Bulkopen: rampSaveStr(input.holdOpenBulkDate),
    holdOpenBulkTime: rampSaveStr(input.holdOpenBulkTime),
    MDopen: rampSaveStr(input.holdOpenMainDeckDate),
    holdOpenMainDeckTime: rampSaveStr(input.holdOpenMainDeckTime),
    Frontclose: rampSaveStr(input.holdCloseFrontDate),
    holdCloseFrontTime: rampSaveStr(input.holdCloseFrontTime),
    Rearclose: rampSaveStr(input.holdCloseRearDate),
    holdCloseRearTime: rampSaveStr(input.holdCloseRearTime),
    Bulkclose: rampSaveStr(input.holdCloseBulkDate),
    holdCloseBulkTime: rampSaveStr(input.holdCloseBulkTime),
    MDclose: rampSaveStr(input.holdCloseMainDeckDate),
    holdCloseMainDeckTime: rampSaveStr(input.holdCloseMainDeckTime),
    LasteActivityOnHold: rampSaveStr(input.lastActivityHoldDate),
    lastActivityHoldTime: rampSaveStr(input.lastActivityHoldTime),
    uldarr,
    cgoarr: rampSaveStr(input.arrivalCargoWeight),
    mailarr: rampSaveStr(input.arrivalMailWeight),
    uldplan,
    cgoplan: rampSaveStr(input.depPlannedCargoWeight),
    mailplan: rampSaveStr(input.depPlannedMailWeight),
    uldatcdep,
    cgoactdep: rampSaveStr(input.depActualCargoWeight),
    mailactdep: rampSaveStr(input.depActualMailWeight),
    transitcgo,
    transitCargoWeight: rampSaveStr(input.transitCargoWeight),
    transitCargoMail,
  };

  if (input.xRay !== undefined) payload.xRay = input.xRay;
  if (input.oneSidedBelt !== undefined)
    payload.oneSidedBelt = input.oneSidedBelt;
  if (input.customChecked !== undefined)
    payload.customChecked = input.customChecked;
  if (input.ifNightHalt !== undefined) payload.ifNightHalt = input.ifNightHalt;

  return payload;
}

/**
 * Load-control form/UI names → `CreateLoadControlDetailsDto` / Mongo field names
 * (required for `ValidationPipe({ whitelist: true })` on POST/PATCH).
 */
export function loadControlDetailsFormToSavePayload(input: {
  airlinesOperator: string;
  flightNo: string;
  routing: string;
  acType: string;
  std: string;
  operations: string;
  sta: string;
  staDate: string;
  stdDate: string;
  loadingDiagramGivenAt: string;
  loadingSheetPrintedAt: string;
  loadingSheetDeliveredAt: string;
  flightPlanFieldAt: string;
  fic: string;
  adc: string;
}): Record<string, string> {
  return {
    airlinesOperator: input.airlinesOperator,
    FlightNo: input.flightNo,
    routing: input.routing,
    TypeCraft: input.acType,
    STDTime: input.std,
    Typeofflight: input.operations,
    STATime: input.sta,
    STADate: input.staDate,
    STDDate: input.stdDate,
    loadingDiagramGivenAt: input.loadingDiagramGivenAt,
    loadingSheetPrintedAt: input.loadingSheetPrintedAt,
    loadingSheetDeliveredAt: input.loadingSheetDeliveredAt,
    flightPlanFieldAt: input.flightPlanFieldAt,
    fic: input.fic,
    adc: input.adc,
  };
}

/** Normalize load-control-details API response to LoadControlDetailsData */
export function normalizeLoadControlDetailsData(
  raw: unknown,
): LoadControlDetailsData | null {
  if (!normIsRecord(raw)) return null;
  const r = raw;
  return {
    _id: normIdString(r),
    serialNo: normPickNum(r, 'serialNo'),
    airlinesOperator: normPickStr(r, 'airlinesOperator'),
    routing: normPickStr(r, 'routing'),
    acType: normPickStr(r, 'acType', 'TypeCraft'),
    std: normPickStr(r, 'std', 'STDTime'),
    flightNo: normPickStr(r, 'flightNo', 'FlightNo'),
    operations: normPickStr(r, 'operations', 'Typeofflight'),
    sta: normPickStr(r, 'sta', 'STATime'),
    staDate: normPickStr(r, 'staDate', 'STADate'),
    stdDate: normPickStr(r, 'stdDate', 'STDDate'),
    loadingDiagramGivenAt: normPickStr(r, 'loadingDiagramGivenAt'),
    loadingSheetPrintedAt: normPickStr(r, 'loadingSheetPrintedAt'),
    loadingSheetDeliveredAt: normPickStr(r, 'loadingSheetDeliveredAt'),
    flightPlanFieldAt: normPickStr(r, 'flightPlanFieldAt'),
    fic: normPickStr(r, 'fic', 'FICNO'),
    adc: normPickStr(r, 'adc', 'ADCNO'),
  };
}

/** Normalize ramp-details-1 API response to RampDetails1Data */
export function normalizeRampDetails1Data(
  raw: unknown,
): RampDetails1Data | null {
  if (!normIsRecord(raw)) return null;
  const r = raw;
  const nb = normPickBool;
  return {
    _id: normIdString(r),
    serialNo: normPickNum(r, 'serialNo'),
    airlinesOperator: normPickStr(r, 'airlinesOperator'),
    flightNo: normPickStr(r, 'flightNo', 'FlightNo'),
    routing: normPickStr(r, 'routing', 'Route'),
    operations: normPickStr(r, 'operations', 'Typeofflight'),
    etdDate: normPickStr(r, 'etdDate'),
    acType: normPickStr(r, 'acType', 'TypeCraft'),
    staDate: normPickStr(r, 'staDate', 'STADate'),
    std: normPickStr(r, 'std', 'STDTime'),
    etd: normPickStr(r, 'etd'),
    sta: normPickStr(r, 'sta', 'STATime'),
    ata: normPickStr(r, 'ata', 'ATATime'),
    stdDate: normPickStr(r, 'stdDate', 'STDDate'),
    ataDate: normPickStr(r, 'ataDate', 'ATADate'),
    bayPlanned: normPickStr(r, 'bayPlanned', 'BayPlanned'),
    bayFinal: normPickStr(r, 'bayFinal', 'BayFinal'),
    arrivalBaggageCount: normPickStr(r, 'arrivalBaggageCount'),
    firstBagArrivalHallDate: normPickStr(r, 'Fbarr', 'firstBagArrivalHallDate'),
    firstBagArrivalHallTime: normPickStr(r, 'firstBagArrivalHallTime'),
    Fbarr: normPickStr(r, 'Fbarr'),
    bmaCount: normPickStr(r, 'bmaCount'),
    lastBagArrivalHallDate: normPickStr(r, 'Lbarr', 'lastBagArrivalHallDate'),
    lastBagArrivalHallTime: normPickStr(r, 'lastBagArrivalHallTime'),
    Lbarr: normPickStr(r, 'Lbarr'),
    bbaBelt: normPickStr(r, 'bbaBelt'),
    firstBagInBmaDate: normPickStr(r, 'firstBagInBmaDate'),
    firstBagInBmaTime: normPickStr(r, 'firstBagInBmaTime'),
    // Arrival Bag from airlinecount only — never fall back to departure bags
    arrivalBag: normPickStr(r, 'arrivalBag', 'airlinecount'),
    bagreco: normPickStr(r, 'bagreco'),
    lastBagInBmaDate: normPickStr(r, 'lastBagInBmaDate'),
    lastBagInBmaTime: normPickStr(r, 'lastBagInBmaTime'),
    xRay: nb(r, 'xRay'),
    cleaningStartedDate: normPickStr(r, 'cleaningStartedDate', 'CleaningFr'),
    cleaningStartedTime: normPickStr(r, 'cleaningStartedTime'),
    oneSidedBelt: nb(r, 'oneSidedBelt'),
    customChecked: nb(r, 'customChecked'),
    cleaningClosedDate: normPickStr(r, 'cleaningClosedDate', 'CleaningTo'),
    cleaningClosedTime: normPickStr(r, 'cleaningClosedTime'),
    ldc: normPickStr(r, 'ldc', 'HoldCnfLDC'),
    ldp: normPickStr(r, 'ldp', 'HoldCnfLDP'),
    mdp: normPickStr(r, 'mdp', 'HoldCnfMDP'),
    cgoPcsIn: normPickStr(r, 'cgoPcsIn', 'cgopcsin'),
    cgoPcsOut: normPickStr(r, 'cgoPcsOut', 'cgopcout'),
    courierPcsIn: normPickStr(r, 'courierPcsIn', 'Courierin'),
    courierPcsOut: normPickStr(r, 'courierPcsOut', 'Courierout'),
    ifNightHalt: nb(r, 'ifNightHalt'),
    ...(() => {
      const frontOpen = normHoldDateTime(
        r,
        ['holdOpenFrontDate', 'Frontopen'],
        ['holdOpenFrontTime'],
      );
      const rearOpen = normHoldDateTime(
        r,
        ['holdOpenRearDate', 'Rearopen'],
        ['holdOpenRearTime'],
      );
      const bulkOpen = normHoldDateTime(
        r,
        ['holdOpenBulkDate', 'Bulkopen'],
        ['holdOpenBulkTime'],
      );
      const mdOpen = normHoldDateTime(
        r,
        ['holdOpenMainDeckDate', 'MDopen'],
        ['holdOpenMainDeckTime'],
      );
      const frontClose = normHoldDateTime(
        r,
        ['holdCloseFrontDate', 'Frontclose'],
        ['holdCloseFrontTime'],
      );
      const rearClose = normHoldDateTime(
        r,
        ['holdCloseRearDate', 'Rearclose'],
        ['holdCloseRearTime'],
      );
      const bulkClose = normHoldDateTime(
        r,
        ['holdCloseBulkDate', 'Bulkclose'],
        ['holdCloseBulkTime'],
      );
      const mdClose = normHoldDateTime(
        r,
        ['holdCloseMainDeckDate', 'MDclose'],
        ['holdCloseMainDeckTime'],
      );
      const lastAct = normHoldDateTime(
        r,
        ['lastActivityHoldDate', 'LasteActivityOnHold'],
        ['lastActivityHoldTime'],
      );
      return {
        holdOpenFrontDate: frontOpen.date,
        holdOpenFrontTime: frontOpen.time,
        holdOpenRearDate: rearOpen.date,
        holdOpenRearTime: rearOpen.time,
        holdOpenBulkDate: bulkOpen.date,
        holdOpenBulkTime: bulkOpen.time,
        holdOpenMainDeckDate: mdOpen.date,
        holdOpenMainDeckTime: mdOpen.time,
        holdCloseFrontDate: frontClose.date,
        holdCloseFrontTime: frontClose.time,
        holdCloseRearDate: rearClose.date,
        holdCloseRearTime: rearClose.time,
        holdCloseBulkDate: bulkClose.date,
        holdCloseBulkTime: bulkClose.time,
        holdCloseMainDeckDate: mdClose.date,
        holdCloseMainDeckTime: mdClose.time,
        lastActivityHoldDate: lastAct.date,
        lastActivityHoldTime: lastAct.time,
      };
    })(),
    arrivalUldCount: normPickStr(r, 'arrivalUldCount', 'uldarr'),
    arrivalCargoWeight: normPickStr(r, 'arrivalCargoWeight', 'cgoarr'),
    arrivalMailWeight: normPickStr(r, 'arrivalMailWeight', 'mailarr'),
    depPlannedUldCount: normPickStr(r, 'depPlannedUldCount', 'uldplan'),
    depPlannedCargoWeight: normPickStr(r, 'depPlannedCargoWeight', 'cgoplan'),
    depPlannedMailWeight: normPickStr(r, 'depPlannedMailWeight', 'mailplan'),
    depActualUldCount: normPickStr(r, 'depActualUldCount', 'uldatcdep'),
    depActualCargoWeight: normPickStr(r, 'depActualCargoWeight', 'cgoactdep'),
    depActualMailWeight: normPickStr(r, 'depActualMailWeight', 'mailactdep'),
    transitCargoUld: normPickStr(r, 'transitCargoUld', 'transitcgo'),
    transitCargoWeight: normPickStr(r, 'transitCargoWeight'),
    transitCargoMail: normPickStr(r, 'transitCargoMail'),
  };
}

function normalizeRampDetails2Row(
  row: Record<string, unknown>,
): RampDetails2Data {
  const base = { ...row } as RampDetails2Data;
  if (row.airline == null && row.Airline != null)
    base.airline = String(row.Airline);
  if (row.flightNo == null && row.FlightNo != null)
    base.flightNo = String(row.FlightNo);
  if (row.operation == null && row.Typeofflight != null)
    base.operation = String(row.Typeofflight);
  if (row.routing == null && row.Route != null)
    base.routing = String(row.Route);
  if (row.staDate == null && row.STADate != null)
    base.staDate = String(row.STADate);
  if (row.staTime == null && row.STATime != null)
    base.staTime = String(row.STATime);
  if (row.stdDate == null && row.STDDate != null)
    base.stdDate = String(row.STDDate);
  if (row.stdTime == null && row.STDTime != null)
    base.stdTime = String(row.STDTime);
  if (row.ataDate == null && row.ATADate != null)
    base.ataDate = String(row.ATADate);
  if (row.ataTime == null && row.ATATime != null)
    base.ataTime = String(row.ATATime);
  if (row.atdDate == null && row.ATDDate != null)
    base.atdDate = String(row.ATDDate);
  if (row.atdTime == null && row.ATDTime != null)
    base.atdTime = String(row.ATDTime);
  return base;
}

/** Normalize ramp-details-2 API response to RampDetails2Data. Server returns an array of rows per flight; use first (latest) for single-row form. */
export function normalizeRampDetails2Data(
  raw: unknown,
): RampDetails2Data | null {
  const list = normalizeRampDetails2List(raw);
  return list.length > 0 ? list[0] : null;
}

/** All duty-allocation rows for a flight (ramp-details-2 returns an array). */
export function normalizeRampDetails2List(raw: unknown): RampDetails2Data[] {
  if (raw == null) return [];
  const d = (raw as Record<string, unknown>)?.data ?? raw;
  if (Array.isArray(d)) {
    return d
      .filter((row): row is Record<string, unknown> => normIsRecord(row))
      .map(normalizeRampDetails2Row);
  }
  if (normIsRecord(d)) return [normalizeRampDetails2Row(d)];
  return [];
}

/** Map duty-allocation form row → report / PDF employee allocation row. */
export function mapRampDetails2ToEmployeeAllocation(
  row: RampDetails2Data,
): EmployeeAllocationRowData {
  const choose = String(row.chooseEmployee ?? '').trim();
  const name = String(row.name ?? '').trim();
  let employeeCode = choose;
  let employeeName = name;
  const sep = choose.indexOf(' - ');
  if (sep !== -1) {
    employeeCode = choose.slice(0, sep).trim();
    if (!employeeName) employeeName = choose.slice(sep + 3).trim();
  }
  return {
    employeeCode: employeeCode || undefined,
    employeeName: employeeName || undefined,
    area: row.area?.trim() || undefined,
    dutyAllocation: row.dutyAllocation?.trim() || undefined,
    remarks: row.remarks?.trim() || undefined,
  };
}

/** Normalize ramp-details-3 API response. Unwrap raw.data if present. Server returns null when no document exists. */
export function normalizeRampDetails3Data(
  raw: unknown,
): RampDetails3Data | null {
  if (
    raw == null ||
    (typeof raw === 'object' && (raw as Record<string, unknown>).data === null)
  )
    return null;
  const d = (raw as Record<string, unknown>)?.data ?? raw;
  if (typeof d !== 'object' || d === null) return null;
  const obj = d as Record<string, unknown>;
  const base = { ...(obj as RampDetails3Data) };
  if (obj.airline == null && obj.Airline != null)
    base.airline = String(obj.Airline);
  if (obj.flightNo == null && obj.FlightNo != null)
    base.flightNo = String(obj.FlightNo);
  if (obj.operation == null && obj.Typeofflight != null)
    base.operation = String(obj.Typeofflight);
  if (obj.routing == null && obj.Route != null)
    base.routing = String(obj.Route);
  if (obj.staDate == null && obj.STADate != null)
    base.staDate = String(obj.STADate);
  if (obj.staTime == null && obj.STATime != null)
    base.staTime = String(obj.STATime);
  if (obj.stdDate == null && obj.STDDate != null)
    base.stdDate = String(obj.STDDate);
  if (obj.stdTime == null && obj.STDTime != null)
    base.stdTime = String(obj.STDTime);
  if (obj.ataDate == null && obj.ATADate != null)
    base.ataDate = String(obj.ATADate);
  if (obj.ataTime == null && obj.ATATime != null)
    base.ataTime = String(obj.ATATime);
  if (obj.atdDate == null && obj.ATDDate != null)
    base.atdDate = String(obj.ATDDate);
  if (obj.atdTime == null && obj.ATDTime != null)
    base.atdTime = String(obj.ATDTime);
  if (Array.isArray(obj?.employeeAllocations)) {
    base.employeeAllocations =
      obj.employeeAllocations as EmployeeAllocationRowData[];
  }
  return base;
}

/** Normalize remarks API response to RemarksData */
export function normalizeRemarksData(raw: unknown): RemarksData | null {
  if (!normIsRecord(raw)) return null;
  const r = raw;
  return {
    _id: normIdString(r),
    serialNo: normPickNum(r, 'serialNo'),
    airline: normPickStr(r, 'airline', 'Airline'),
    flightNo: normPickStr(r, 'flightNo', 'FlightNo'),
    toOpenInTab: normPickBool(r, 'toOpenInTab'),
    ghRemarks: normPickStr(r, 'ghRemarks', 'PaxGHAirlineRep_Name'),
    airlineRemarks: normPickStr(r, 'airlineRemarks', 'AirRepRem'),
    airlineRemarksRating: normPickStr(r, 'airlineRemarksRating'),
    flightStaDateIso: normPickStr(r, 'flightStaDateIso'),
    wantFeedback: normPickBool(r, 'wantFeedback'),
    feedbackRemarks: normPickStr(r, 'feedbackRemarks'),
    ghRep: normPickStr(r, 'ghRep', 'PAX_Airline_SignByDate'),
    airlineRep: normPickStr(r, 'airlineRep', 'airrep'),
    flightCancelled: normPickBool(r, 'flightCancelled'),
  };
}

/** Normalize equipment-manpower API response to EquipmentManpowerData */
export function normalizeEquipmentManpowerData(
  raw: unknown,
): EquipmentManpowerData | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as EquipmentManpowerData;
}

/** Normalize attachments API response to AttachmentsData */
export function normalizeAttachmentsData(raw: unknown): AttachmentsData | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as AttachmentsData;
}

/** Normalize single report document to ReportData */
export function normalizeReportData(raw: unknown): ReportData | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as ReportData;
}

/* =========================
   Helpers (Normalization)
========================= */

const isYes = (value?: string) =>
  value?.toLowerCase() === 'yes' || value?.toLowerCase() === 'true';

/** Ramp / Pax / GSD lock column is engaged (saved form present). */
export const isScheduledFlightLockEngaged = (value?: unknown): boolean => {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === 'yes' || s === 'locked' || s === '1';
};

export const areAllScheduledFlightLocksEngaged = (
  flight: Pick<FlightData, 'rampLocked' | 'paxLocked' | 'gsdLocked'>,
): boolean =>
  isScheduledFlightLockEngaged(flight.rampLocked) &&
  isScheduledFlightLockEngaged(flight.paxLocked) &&
  isScheduledFlightLockEngaged(flight.gsdLocked);

/** Scheduled Airlines OPEN column: cancelled > all forms > all locks > server status. */
export function resolveScheduledAirlinesFlightStatus(
  flight: FlightData,
): 'Open' | 'Closed' | 'Cancelled' {
  if (
    flight.isCancelled ||
    isScheduleCancelledFlightNo(flight.flightNo) ||
    String(flight.flightStatus ?? '')
      .trim()
      .toLowerCase() === 'cancelled'
  ) {
    return 'Cancelled';
  }
  if (
    flight.hasMainDetails &&
    flight.hasTerminalDetails &&
    flight.hasRampDetails &&
    flight.hasLoadControlDetails
  ) {
    return 'Closed';
  }
  if (areAllScheduledFlightLocksEngaged(flight)) {
    return 'Closed';
  }
  const fs = String(flight.flightStatus ?? '')
    .trim()
    .toLowerCase();
  if (fs === 'closed') return 'Closed';
  if (fs === 'open') return 'Open';
  return 'Open';
}

export const isExportedNavStatus = (value?: string) => {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  return s === 'exported' || s === 'yes' || s === 'y';
};

const isExported = isExportedNavStatus;

/* =========================
   Data Processor (API JSON)
========================= */

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return '';
}

/** Ops labels and the placeholder "Unknown" are not a flight category. */
function firstFlightCategory(...vals: unknown[]): string {
  const skip = new Set([
    'unknown',
    'turnaround',
    'transit',
    'arrival',
    'departure',
  ]);
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s || skip.has(s.toLowerCase())) continue;
    return s;
  }
  return '';
}

/** API / Mongo may send boolean flags as strings. */
function coercePresenceFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/**
 * Normalized serial number display used across scheduled flights UI.
 * Handles numeric-like values such as "12.0" and returns a clean string.
 */
export function displayFlightInstanceSerial(value: unknown): string {
  if (value == null) return '-';
  const raw = String(value).trim();
  if (!raw) return '-';

  if (/^\d+\.0+$/.test(raw)) {
    return raw.split('.')[0];
  }

  return raw;
}

/** Strip FL- prefix for serial comparisons (display keeps formatting via displayFlightInstanceSerial). */
function scheduledAirlinesSerialDigits(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^FL-/i, '');
}

/**
 * Advance schedule masters use `legacySlNo` for the 6-digit setup serial (FHR enrich).
 * Per operating day, `attachStableSerials` assigns a distinct instance `slNo` (100000+).
 * True legacy imports use `legacySlNo` < 100000 (e.g. 16616) with a different instance `slNo`.
 */
function resolveScheduledAirlinesOperationalSerial(
  flight: Pick<FlightData, 'slNo' | 'legacySlNo'>,
): string {
  const sl = scheduledAirlinesSerialDigits(flight.slNo);
  const legacy = scheduledAirlinesSerialDigits(flight.legacySlNo);
  if (sl && legacy && sl !== legacy) {
    const slN = Number(sl);
    const legN = Number(legacy);
    if (legN >= 100000 && slN >= 100000) return sl;
    if (legN < 100000) return legacy;
    return sl;
  }
  if (legacy) return legacy;
  return sl;
}

/**
 * Scheduled Airlines table / headers: show the serial that matches Mongo operations.
 * Prefer `legacySlNo` when the server linked a seeded `mainDetails` row (e.g. 16616);
 * otherwise show the global instance `slNo` (flight_instance_index).
 */
export function displayScheduledAirlinesTableSerial(
  flight: Pick<FlightData, 'slNo' | 'legacySlNo'>,
): string {
  return displayFlightInstanceSerial(
    resolveScheduledAirlinesOperationalSerial(flight),
  );
}

/**
 * Serial used for ns-raw-flight-data form URLs when Mongo was seeded under a legacy ID
 * but the schedule row shows the global instance serial (100000+).
 */
export function nsFormSerialForFlight(
  flight: Pick<FlightData, 'slNo' | 'legacySlNo'>,
): string {
  return resolveScheduledAirlinesOperationalSerial(flight);
}

/** Normalize STA/STD label to yyyy-MM-dd for stable row keys. */
function scheduleStaDayKeyLabel(dateLabel: string): string {
  const raw = String(dateLabel ?? '').trim();
  if (!raw) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    return `${parts[2]}-${m}-${d}`;
  }
  return raw;
}

/**
 * Stable React/list key: one row per operational serial + STA calendar day.
 * Required when the API expands recurring schedules to multiple operating days.
 */
export function scheduledAirlinesRowDedupeKey(f: FlightData): string {
  const op = String(nsFormSerialForFlight(f) ?? '')
    .trim()
    .replace(/^FL-/i, '');
  const ymd =
    scheduleStaDayKeyLabel(String(f.staDate ?? '').trim()) ||
    scheduleStaDayKeyLabel(String(f.stdDate ?? '').trim());
  if (op && ymd) return `op:${op}|${ymd}`;
  const sl = String(f.slNo ?? '').trim();
  if (sl && ymd) return `sl:${sl}|${ymd}`;
  if (sl) return `sl:${sl}`;
  return `anon:${f.airline}|${f.flightNo}|${ymd}|${String(f.staTime ?? '')}`;
}

/** Stable DOM id for a table row (highlights / scroll-into-view from dashboard links). */
export function scheduledAirlinesRowDomId(f: FlightData): string {
  const key = scheduledAirlinesRowDedupeKey(f);
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sa_row_${safe}`;
}

/**
 * Serials to try for ns-raw GETs (locks, FHR merge). Aligns with fhr-report/page serial trial:
 * primary ns form serial, table Sl.No, legacy, FL-stripped, digits-only — so filled FHR rows show
 * locks when data lives under instance or legacy.
 */
export function nsRawSerialCandidatesForLockFetch(
  flight: Pick<FlightData, 'slNo' | 'legacySlNo'>,
): string[] {
  const primary = nsFormSerialForFlight(flight);
  const sl = String(flight.slNo ?? '').trim();
  const leg = String(flight.legacySlNo ?? '')
    .trim()
    .replace(/^FL-/i, '');
  const raw = [primary, sl, leg].filter(Boolean);
  const expanded: string[] = [];
  for (const r of raw) {
    const t = String(r).trim();
    if (!t) continue;
    expanded.push(t, t.replace(/^FL-/i, ''), t.replace(/[^0-9]/g, ''));
  }
  return [...new Set(expanded.filter(Boolean))];
}

const serialDigitsOnly = (s: string) => s.replace(/\D/g, '');

/** Match UI search on serial against slNo / legacySlNo (ignores leading zeros). */
/**
 * Scheduled Airlines / data export: hide non-scheduled rows that may still
 * arrive via shared `fhr_collection` (NS bookings promote into the same store).
 */
export function shouldHideScheduledAirlinesTableRow(
  flight: FlightData,
): boolean {
  const norm = (v: unknown) =>
    String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

  const labels = [
    flight.flightType,
    flight.typeOfHandling,
    flight.cateOfFlight,
    flight.bookingNo,
    flight.challanNo,
  ].map(norm);

  return labels.some(
    (n) =>
      n.includes('non-scheduled') ||
      n.includes('non scheduled') ||
      n.includes('nonschedule') ||
      n.includes('non-skd') ||
      n.includes('nonskd') ||
      n.includes('/bkg/') ||
      n.includes('/cln/'),
  );
}

/**
 * Match Sl. No. search on Scheduled Airlines.
 * Uses the displayed instance serial — not concatenated slNo+legacySlNo (shared master serial
 * would otherwise match every operating day for one schedule).
 */
export function serialSearchMatches(
  flight: FlightData,
  queryRaw: string,
): boolean {
  const q = String(queryRaw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const qDigits = serialDigitsOnly(q);

  const sl = String(flight.slNo ?? '')
    .trim()
    .toLowerCase()
    .replace(/^fl-/i, '');
  const leg = String(flight.legacySlNo ?? '')
    .trim()
    .toLowerCase()
    .replace(/^fl-/i, '');
  const display = displayScheduledAirlinesTableSerial(flight).toLowerCase();
  const label = String(flight.serialLabel ?? '')
    .trim()
    .toLowerCase();

  const matchToken = (token: string): boolean => {
    const t = String(token ?? '')
      .trim()
      .toLowerCase()
      .replace(/^fl-/i, '');
    if (!t) return false;
    if (t === q || t.includes(q)) return true;
    if (qDigits.length >= 4) {
      const d = serialDigitsOnly(t);
      return d === qDigits || d.endsWith(qDigits);
    }
    if (qDigits.length > 0) {
      const d = serialDigitsOnly(t);
      return d === qDigits;
    }
    return false;
  };

  if (matchToken(display) || matchToken(label) || matchToken(sl)) return true;

  // Master schedule serial only when the row has no distinct instance serial yet.
  if (leg && (!sl || sl === leg) && matchToken(leg)) return true;

  return false;
}

/** Filters tab: airline name or operational Sl. No. */
export function scheduledAirlinesSerialOrAirlineMatches(
  flight: FlightData,
  queryRaw: string,
): boolean {
  const q = String(queryRaw ?? '').trim();
  if (!q) return true;
  const qLower = q.toLowerCase();
  if (
    String(flight.airline ?? '')
      .toLowerCase()
      .includes(qLower)
  )
    return true;
  return serialSearchMatches(flight, q);
}

export const processFlightData = (rawData: unknown[]): FlightData[] => {
  if (!Array.isArray(rawData)) return [];

  return rawData
    .map((item): FlightData => {
      // Handle MongoDB doc format { data: { ... } } or already-flat objects
      const baseItem = normIsRecord(item) ? item : {};
      const nestedData = baseItem.data;
      const d = normIsRecord(nestedData) ? nestedData : baseItem;

      const flightNo = displayFlightNoFromScheduleData(d);

      return {
        destination: firstNonEmpty(d.destination, d.Destination) ?? null,

        slNo: String(
          d.slNo ??
            d['Sl No'] ??
            d['Sl. No'] ??
            d['SL No'] ??
            d['SL.NO'] ??
            d['Sl.No'] ??
            d['Sr No'] ??
            d['Sr. No'] ??
            d['Serial No'] ??
            d['Serial Number'] ??
            d['S.No'] ??
            d.SlNo ??
            d.SerialNo ??
            d.serialNo ??
            '',
        ),
        flightNo,
        airline: firstNonEmpty(d.airline, d.Airline),
        airlineCode: firstNonEmpty(
          d.airlineCode,
          d['Airline Code'],
          d.Arline_Code,
        ),
        aircraft: firstNonEmpty(d.aircraft, d.Aircraft, d.TypeCraft),

        staDate: firstNonEmpty(
          d.staDate,
          d['STA Date'],
          d.STADate,
          d['Valid From'],
        ),
        staTime: firstNonEmpty(d.staTime, d['STA Time'], d.STATime),
        stdDate: firstNonEmpty(
          d.stdDate,
          d['STD Date'],
          d.STDDate,
          d['Valid To'],
        ),
        stdTime: firstNonEmpty(d.stdTime, d['STD Time'], d.STDTime),
        ataDate: firstNonEmpty(d.ataDate, d['ATA Date'], d.ATADate),
        ataTime: firstNonEmpty(d.ataTime, d['ATA Time'], d.ATATime),
        atdDate: firstNonEmpty(d.atdDate, d['ATD Date'], d.ATDDate),
        atdTime: firstNonEmpty(d.atdTime, d['ATD Time'], d.ATDTime),

        route: firstNonEmpty(d.route, d.Route, d.Routing, d.routing),
        serialLabel: firstNonEmpty(d.serialLabel, d['Serial Label']),
        legacySlNo: firstNonEmpty(
          d.legacySlNo,
          d['legacySlNo'],
          d['Legacy Sl.No'],
        ),
        scheduledAirlinesCreationCreatedAt: firstNonEmpty(
          d.scheduledAirlinesCreationCreatedAt,
        ),

        flightStatus: firstNonEmpty(
          d.flightStatus,
          d['Flight Status'],
          d.flight_status,
        ),
        hasMainDetails: coercePresenceFlag(d.hasMainDetails),
        hasTerminalDetails: coercePresenceFlag(d.hasTerminalDetails),
        hasRampDetails: coercePresenceFlag(d.hasRampDetails),
        hasLoadControlDetails: coercePresenceFlag(d.hasLoadControlDetails),
        hasEquipmentManpowerDetails: coercePresenceFlag(
          d.hasEquipmentManpowerDetails,
        ),
        scheduleSource: firstNonEmpty(d.scheduleSource, d['Schedule Source']),
        baseFlight: firstNonEmpty(
          d.baseFlight,
          d['Base Flight'],
          d.base_flight,
          d.BaseFlight,
        ),

        exportedNAV: firstNonEmpty(
          d.exportedNAV,
          d['Exported NAV'],
          d.ExportedNAV,
          'No',
        ),
        rampLocked: firstNonEmpty(
          d.rampLocked,
          d['Ramp Locked'],
          d.RampLocked,
          'No',
        ),
        paxLocked: firstNonEmpty(
          d.paxLocked,
          d['PAX Locked'],
          d['Pax Locked'],
          d.PaxLocked,
          'No',
        ),
        gsdLocked: firstNonEmpty(
          d.gsdLocked,
          d['GSD Locked'],
          d.GsdLocked,
          'No',
        ),

        flightType: firstNonEmpty(
          d.flight,
          d['Flight'],
          d.flightType,
          d['Flight Type'],
          d.FlightType,
          d.Typeofflight,
          d['Type of flight'],
          'Unknown',
        ),
        cateOfFlight: firstFlightCategory(
          d.category_of_flights,
          d.category_of_flight,
          d.cate_of_flight,
          d.Cate_of_Flight,
          d.categoryOfFlight,
          d.flightCategory,
          d['Category of Flight'],
          d['Flight Type'],
          d['Type of flight'],
          d.flightType,
          d.flight,
        ),
        typeOfHandling: firstNonEmpty(
          d.typeOfHandling,
          d.TypeofHandling,
          d['Type of Handling'],
        ),
        bookingNo: firstNonEmpty(
          d.bookingNo,
          d.BookingNo,
          d['Booking No'],
        ),
        challanNo: firstNonEmpty(
          d.challanNo,
          d.ChallanNo,
          d['Challan No'],
        ),
        hClose: firstNonEmpty(d.hClose, d['H Close'], d.HClose),
        fBag: firstNonEmpty(d.fBag, d['F Bag'], d.FBag),
        lBag: firstNonEmpty(d.lBag, d['L Bag'], d.LBag),

        isCancelled:
          d.isCancelled === true ||
          d['Is Cancelled'] === true ||
          String(d.flightStatus ?? '')
            .trim()
            .toLowerCase() === 'cancelled' ||
          isScheduleCancelledFlightNo(flightNo),
      };
    })
    .map((row) => ({
      ...row,
      flightStatus: resolveScheduledAirlinesFlightStatus(row),
    }));
};

/* =========================
   Statistics Calculator
========================= */

export const calculateStatistics = (data: FlightData[]): FlightStats => {
  const totalFlights = data.length;
  const cancelledFlights = data.filter((f) => f.isCancelled).length;
  const operationalFlights = totalFlights - cancelledFlights;

  const airlines: Record<string, number> = {};
  const flightTypes: Record<string, number> = {};
  const flightsByDate: Record<string, number> = {};
  const aircraftTypes: Record<string, number> = {};

  data.forEach((flight) => {
    airlines[flight.airline] = (airlines[flight.airline] || 0) + 1;

    flightTypes[flight.flightType] = (flightTypes[flight.flightType] || 0) + 1;

    flightsByDate[flight.staDate] = (flightsByDate[flight.staDate] || 0) + 1;

    const aircraft = flight.aircraft.split('/')[0];
    aircraftTypes[aircraft] = (aircraftTypes[aircraft] || 0) + 1;
  });

  const lockStats = {
    rampLocked: data.filter((f) => isYes(f.rampLocked)).length,
    paxLocked: data.filter((f) => isYes(f.paxLocked)).length,
    gsdLocked: data.filter((f) => isYes(f.gsdLocked)).length,
    exportedNAV: data.filter((f) => isExported(f.exportedNAV)).length,
  };

  return {
    totalFlights,
    cancelledFlights,
    operationalFlights,
    airlines,
    flightTypes,
    lockStats,
    flightsByDate,
    aircraftTypes,
    cancellationRate:
      totalFlights === 0 ? 0 : (cancelledFlights / totalFlights) * 100,
  };
};
