import { CreateMainDetailsDto } from 'src/main-details/dto/create-main-details.dto';

/**
 * Legacy multi-column delay fields. Peeled into `workbookExtras` and also
 * folded into `departureDelays` when `reasonOfDelay` is absent.
 */
export const FLAT_IMPORT_DROP_KEYS = [
  'delay1',
  'delay2',
  'delay3',
  'delaycode2',
  'delaycode3',
  'delaycode31',
] as const;

/** Normalize Sheet1 header aliases before import. */
export function normalizeFlatImportRow(
  raw: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...raw };

  if (out.ETDdate && !out.etdDate) out.etdDate = out.ETDdate;
  if (out.mtow && !out.MTOW) out.MTOW = out.mtow;
  if (out.AircraftBody && !out.aircraftBody) out.aircraftBody = out.AircraftBody;
  if (out.Delay && !out.departureStatus) out.departureStatus = out.Delay;
  if (out.ReasonofDelay && !out.reasonOfDelay) {
    out.reasonOfDelay = out.ReasonofDelay;
  }
  if (out.fltcancelled && !out.flightCancelled) {
    out.flightCancelled = out.fltcancelled;
  }
  if (out.FlightCancelled && !out.flightCancelled) {
    out.flightCancelled = out.FlightCancelled;
  }
  if (out.STATIME && !out.STATime) out.STATime = out.STATIME;
  if (out.Freighter && !out.freighter) out.freighter = out.Freighter;
  if (out['Arrival Flt No'] && !out.ArrivalFltNo) {
    out.ArrivalFltNo = out['Arrival Flt No'];
  }
  if (out['Departure Flt No'] && !out.DepartureFltNo) {
    out.DepartureFltNo = out['Departure Flt No'];
  }
  if (out.transitPax && !out.transit) out.transit = out.transitPax;
  if (out.ArrBelt && !out.beltNo) out.beltNo = out.ArrBelt;
  if (out['System Bag Count'] && !out.SystemBagCount) {
    out.SystemBagCount = out['System Bag Count'];
  }
  if (out.loadgivenat && !out.loadingDiagramGivenAt) {
    out.loadingDiagramGivenAt = out.loadgivenat;
  }
  if (out.loadprint && !out.loadingSheetPrintedAt) {
    out.loadingSheetPrintedAt = out.loadprint;
  }
  if (out.loaddelat && !out.loadingSheetDeliveredAt) {
    out.loadingSheetDeliveredAt = out.loaddelat;
  }
  if (out.fltfiled && !out.flightPlanFieldAt) {
    out.flightPlanFieldAt = out.fltfiled;
  }
  if (out.XRay && !out.xRay) out.xRay = out.XRay;
  if (out['One-Sided Belt'] && !out.oneSidedBelt) {
    out.oneSidedBelt = out['One-Sided Belt'];
  }
  if (out['Custom Checked'] && !out.customChecked) {
    out.customChecked = out['Custom Checked'];
  }
  if (out.Return_To_Ramp && !out.returnToRamp) {
    out.returnToRamp = out.Return_To_Ramp;
  }
  if (out.Medical_Passenger && !out.medicalPassenger) {
    out.medicalPassenger = out.Medical_Passenger;
  }
  if (out.IsStationBased && !out.stationBaseNightHalt) {
    out.stationBaseNightHalt = out.IsStationBased;
  }
  if (out.IsSplit && !out.ifOperationSplit) {
    out.ifOperationSplit = out.IsSplit;
  }
  if (out.CALRem && !out.ghRemarks) out.ghRemarks = out.CALRem;
  if (out.Pax_GHRemarks && !out.ghRemarks) out.ghRemarks = out.Pax_GHRemarks;
  if (out.Pax_AirlineRemarks && !out.AirRepRem) {
    out.AirRepRem = out.Pax_AirlineRemarks;
  }
  if (out.PaxGHRep_Name && !out.ghRep) out.ghRep = out.PaxGHRep_Name;

  splitCombinedDateTimeOnRow(out);

  return out;
}

/** `dd/MM/yyyy HH:mm` (or `HH:mm:ss`) from Excel datetime serials / export cells. */
const COMBINED_DMY_TIME_RE =
  /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/;

/**
 * Schema stores schedule (and a few audit) stamps as separate Date + Time.
 * Combined workbook cells are split so STADate stays `dd/MM/yyyy` and STATime `HH:mm`.
 */
const FLAT_DATE_TIME_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['STADate', 'STATime'],
  ['STDDate', 'STDTime'],
  ['ATADate', 'ATATime'],
  ['ATDDate', 'ATDTime'],
  ['staDate', 'sta'],
  ['stdDate', 'std'],
  ['ataDate', 'ata'],
  ['atdDate', 'atd'],
  ['ETDdate', 'ETDtime'],
  ['etdDate', 'etd'],
  ['IPosDate', 'IPosTime'],
  ['iposDate', 'iposTime'],
  ['Cancelled_Date', 'Cancelled_Time'],
  ['RESKD_STADate', 'RESKD_STA'],
  ['RESKD_STDDate', 'RESKD_STD'],
];

function hhmmFromCombinedTime(raw: string): string {
  const parts = raw.split(':');
  const h = (parts[0] ?? '00').padStart(2, '0');
  const m = (parts[1] ?? '00').padStart(2, '0');
  return `${h}:${m}`;
}

export function splitCombinedDateTimeOnRow(
  out: Record<string, string>,
): Record<string, string> {
  for (const [dateKey, timeKey] of FLAT_DATE_TIME_PAIRS) {
    const dateVal = String(out[dateKey] ?? '').trim();
    const timeVal = String(out[timeKey] ?? '').trim();
    const fromDate = COMBINED_DMY_TIME_RE.exec(dateVal);
    if (fromDate) {
      out[dateKey] = fromDate[1];
      if (!timeVal) out[timeKey] = hhmmFromCombinedTime(fromDate[2]);
    }
    const fromTime = COMBINED_DMY_TIME_RE.exec(timeVal);
    if (fromTime) {
      if (!out[dateKey]) out[dateKey] = fromTime[1];
      out[timeKey] = hhmmFromCombinedTime(fromTime[2]);
    }
  }
  return out;
}

/** Residual + dropped delay columns so the SKD workbook is not truncated. */
export function collectFlatWorkbookExtras(
  raw: Record<string, string>,
  unmappedHeaders: string[],
  peeledDropped: Record<string, string> = {},
): Record<string, string> {
  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(peeledDropped)) {
    const s = String(v ?? '').trim();
    if (s) extras[k] = s;
  }
  for (const h of unmappedHeaders) {
    const s = String(raw[h] ?? '').trim();
    if (s) extras[h] = s;
  }
  return extras;
}

export function peelDroppedFlatKeys(
  raw: Record<string, string>,
): Record<string, string> {
  const peeled: Record<string, string> = {};
  for (const key of FLAT_IMPORT_DROP_KEYS) {
    const s = String(raw[key] ?? '').trim();
    if (s) peeled[key] = s;
  }
  return peeled;
}

/** Parse Yes/No / Y/N / True/False spreadsheet cells. */
export function parseFlatYesNo(raw: string): boolean {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  return s === 'y' || s === 'yes' || s === 'true' || s === '1';
}

const FLAT_IMPORT_SERIAL_KEYS = ['slNo', 'SlNo', 'SerialNo', 'SNO'] as const;

/**
 * Read flight serial from a spreadsheet row without running `normalizeCell` date
 * heuristics — MAA July rows use numeric `SerialNo` values in 20k–99k that would
 * otherwise be misread as Excel date serials.
 */
export function parseFlatImportSerial(
  rowObj: Record<string, unknown>,
): number | null {
  for (const [k, v] of Object.entries(rowObj)) {
    const key = String(k ?? '').trim();
    if (
      !FLAT_IMPORT_SERIAL_KEYS.includes(
        key as (typeof FLAT_IMPORT_SERIAL_KEYS)[number],
      )
    ) {
      continue;
    }
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      return Math.trunc(v);
    }
    const s = String(v ?? '')
      .trim()
      .replace(/,/g, '');
    if (!s) continue;
    const n = Number(s);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return null;
}

export type MultiHeaderFlatSheetOpts = {
  /** 0-based row with canonical schema keys (`slNo`, `staDate`, …). */
  schemaKeyRowIndex: number;
  /** 0-based first data row. */
  dataStartRowIndex: number;
  /**
   * Optional 0-based display-header row (e.g. `ETDdate`) used when the schema
   * key cell is blank for that column.
   */
  displayHeaderRowIndex?: number;
};

/**
 * Parse a workbook sheet that has mapping/header rows above the data
 * (e.g. Chandigarh Sheet1: schema keys in row 3, display headers in row 5,
 * data from row 6).
 */
export function matrixToFlatImportRows(
  matrix: unknown[][],
  opts: MultiHeaderFlatSheetOpts,
): { headers: string[]; rows: Record<string, unknown>[] } {
  const schemaRow = matrix[opts.schemaKeyRowIndex] ?? [];
  const displayRow =
    opts.displayHeaderRowIndex != null
      ? (matrix[opts.displayHeaderRowIndex] ?? [])
      : [];
  const colCount = Math.max(schemaRow.length, displayRow.length);

  const headers: string[] = [];
  const colKeys: string[] = [];
  for (let c = 0; c < colCount; c++) {
    const schemaKey = String(schemaRow[c] ?? '').trim();
    const displayKey = String(displayRow[c] ?? '').trim();
    const key = schemaKey || displayKey;
    if (!key) {
      colKeys.push('');
      continue;
    }
    colKeys.push(key);
    if (!headers.includes(key)) headers.push(key);
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = opts.dataStartRowIndex; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const hasAny = line.some((cell) => {
      if (cell === null || cell === undefined) return false;
      return String(cell).trim() !== '';
    });
    if (!hasAny) continue;

    const obj: Record<string, unknown> = {};
    for (let c = 0; c < colKeys.length; c++) {
      const key = colKeys[c];
      if (!key) continue;
      // Prefer first non-empty value when duplicate headers appear.
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
        continue;
      }
      obj[key] = line[c] ?? '';
    }
    rows.push(obj);
  }

  return { headers, rows };
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Delay model for flat MAA seed workbooks:
 * - `reasonOfDelay` — single column with delay code + reason text combined
 * - `arrivalDelay` / `departureDelay` — duration values for `Delay` sub-field
 * - `delay` — departure status label (handled in `buildMainDto`)
 */
export function applyDelayFieldsFromFlatRow(
  dto: CreateMainDetailsDto,
  raw: Record<string, string>,
): void {
  const reasonOfDelay = cell(raw.reasonOfDelay);
  const arrivalDelay = cell(raw.arrivalDelay) || cell(raw.ActualDelay);
  const departureDelay = cell(raw.departureDelay);

  if (arrivalDelay) dto.ActualDelay = arrivalDelay;
  if (departureDelay) dto.departureDelay = departureDelay;

  if (reasonOfDelay || arrivalDelay) {
    dto.arrivalDelays = [
      {
        Delay: arrivalDelay,
        ReasonofDelay: reasonOfDelay,
        gh: false,
        oth: false,
      },
    ];
  }

  const codedDelays = codedDepartureDelaysFromFlatRow(raw);
  if (codedDelays.length > 0 && !reasonOfDelay) {
    dto.departureDelays = codedDelays;
    if (!dto.departureDelay) {
      const firstDuration = codedDelays.find((entry) => entry.Delay)?.Delay;
      if (firstDuration) dto.departureDelay = firstDuration;
    }
  } else if (reasonOfDelay || departureDelay) {
    dto.departureDelays = [
      {
        Delay: departureDelay,
        ReasonofDelay: reasonOfDelay,
        gh: false,
        oth: false,
      },
    ];
  }
}

function codedDepartureDelaysFromFlatRow(raw: Record<string, string>): Array<{
  Delay: string;
  ReasonofDelay: string;
  gh: boolean;
  oth: boolean;
}> {
  const pairs: Array<[string, string]> = [
    [cell(raw.delay1), ''],
    [cell(raw.delay2), cell(raw.delaycode2)],
    [cell(raw.delay3), cell(raw.delaycode3)],
  ];
  const thirdReason = cell(raw.delaycode31);
  const secondReason = cell(raw.delaycode3);
  if (thirdReason && thirdReason !== secondReason) {
    pairs.push(['', thirdReason]);
  }
  return pairs
    .filter(([duration, reason]) => duration || reason)
    .map(([Delay, ReasonofDelay]) => ({
      Delay,
      ReasonofDelay,
      gh: false,
      oth: false,
    }));
}

/** Fields that `buildMainDto` does not set but flat seed sheets include. */
export function enrichMainDtoFromFlatRow(
  dto: CreateMainDetailsDto,
  raw: Record<string, string>,
): void {
  const mtow = cell(raw.MTOW) || cell(raw.mtow);
  if (mtow) dto.MTOW = mtow;

  const handling = cell(raw.TypeofHandling) || cell(raw.typeOfHandling);
  if (handling) dto.TypeofHandling = handling;

  const body = cell(raw.aircraftBody) || cell(raw.AircraftBody);
  if (body) dto.aircraftBody = body;

  const cgo = cell(raw.Cgo) || cell(raw.freighter);
  if (cgo) dto.freighter = parseFlatYesNo(cgo);

  const rtr = cell(raw.returnToRamp) || cell(raw.Return_To_Ramp);
  if (rtr) dto.returnToRamp = parseFlatYesNo(rtr);

  const cancelled = cell(raw.flightCancelled) || cell(raw.fltcancelled);
  if (cancelled) dto.flightCancelled = parseFlatYesNo(cancelled);

  const medical = cell(raw.medicalPassenger) || cell(raw.Medical_Passenger);
  if (medical) dto.medicalPassenger = parseFlatYesNo(medical);

  const nightHalt =
    cell(raw.stationBaseNightHalt) || cell(raw.IsStationBased);
  if (nightHalt) dto.stationBaseNightHalt = parseFlatYesNo(nightHalt);

  const split = cell(raw.ifOperationSplit) || cell(raw.IsSplit);
  if (split) dto.ifOperationSplit = parseFlatYesNo(split);

  const flightNo = resolveFlatRowFlightNo(raw);
  if (flightNo) dto.FlightNo = flightNo;

  const explicitCode = cell(raw.Arline_Code) || cell(raw.flightCode);
  const derivedCode = airlineCodeFromCompactFlightNo(flightNo);
  if (!explicitCode && derivedCode) dto.Arline_Code = derivedCode;

  if (!cell(raw.ArrivalFltNo) && !cell(raw.DepartureFltNo) && flightNo) {
    const legs = splitCompactFlightNo(flightNo);
    if (legs.arrival) dto.ArrivalFltNo = legs.arrival;
    if (legs.departure) dto.DepartureFltNo = legs.departure;
    const explicitSplit = cell(raw.ifOperationSplit) || cell(raw.IsSplit);
    if (!explicitSplit && legs.split) dto.ifOperationSplit = true;
  }

  if (!cell(raw.TypeofHandling) && !cell(raw.Typeofflight) && !dto.TypeofHandling) {
    dto.TypeofHandling = 'Scheduled';
  }
  if (!cell(raw.Typeofflight) && !dto.Typeofflight) {
    dto.Typeofflight = 'Scheduled';
  }
  if (!cell(raw.Cate_of_Flight) && !dto.Cate_of_Flight) {
    dto.Cate_of_Flight = 'SCH';
  }
}

/** IATA prefix from `IX418/427` or `CANC-IX1797/1798` (skips the CANC token). */
export function airlineCodeFromCompactFlightNo(flightNo: string): string {
  const body = stripCancelledFlightPrefix(flightNo);
  const leg = body.split('/')[0] ?? '';
  const match = /^([A-Z0-9]{2})/i.exec(leg.trim());
  return match?.[1]?.toUpperCase() ?? '';
}

function stripCancelledFlightPrefix(flightNo: string): string {
  return flightNo.replace(/^(?:CANC|CANCELLED|XXLD)-/i, '').trim();
}

function splitCompactFlightNo(flightNo: string): {
  arrival: string;
  departure: string;
  split: boolean;
} {
  const body = stripCancelledFlightPrefix(flightNo);
  const slash = body.indexOf('/');
  if (slash < 0) {
    return { arrival: body, departure: body, split: false };
  }
  const left = body.slice(0, slash).trim();
  const right = body.slice(slash + 1).trim();
  const prefix = /^([A-Z0-9]{2})/i.exec(left)?.[1]?.toUpperCase() ?? '';
  const arrival = /\d/.test(left) ? left : '';
  let departure = '';
  if (right && /\d/.test(right)) {
    departure = /^\d+$/.test(right) && prefix ? `${prefix}${right}` : right;
  }
  return {
    arrival,
    departure,
    split: Boolean(arrival && departure && arrival !== departure),
  };
}

function flatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Resolve airline from flat seed row headers (Sheet1 schema keys). */
export function resolveFlatRowAirline(raw: Record<string, string>): string {
  return (
    flatCell(raw.airline) ||
    flatCell(raw.airlineName) ||
    flatCell(raw.Airline) ||
    ''
  );
}

/**
 * Resolve operating flight number when `flightNo` is absent but arrival/departure legs exist.
 */
/** Drop spaces inside flight numbers (`SG 9112` → `SG9112`, `O3 239/160` → `O3239/160`). */
export function compactFlightNo(value: string): string {
  return value.replace(/\s+/g, '');
}

export function resolveFlatRowFlightNo(raw: Record<string, string>): string {
  const direct = flatCell(raw.flightNo) || flatCell(raw.flightNumber);
  if (direct) return compactFlightNo(direct);

  const arr = compactFlightNo(
    flatCell(raw.arrivalFlightNo) ||
      flatCell(raw.ArrivalFltNo) ||
      flatCell(raw.arrivalFltNo),
  );
  const dep = compactFlightNo(
    flatCell(raw.departureFlightNo) ||
      flatCell(raw.DepartureFltNo) ||
      flatCell(raw.departureFltNo),
  );

  if (arr && dep && arr !== dep) return `${arr}/${dep}`;
  return arr || dep || compactFlightNo(flatCell(raw.flightCode) || flatCell(raw.FlightNo));
}

/** Parse dd/MM/yyyy or yyyy-MM-dd to comparable yyyy-MM-dd (or null). */
export function staDateToIsoYmd(raw: string): string | null {
  const s = cell(raw);
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(
    s,
  );
  if (!dmy) return null;
  const day = dmy[1].padStart(2, '0');
  const month = dmy[2].padStart(2, '0');
  return `${dmy[3]}-${month}-${day}`;
}

/** Map canonical workbook keys to Mongoose embed field names (strict schemas drop camelCase). */
export function applyEmbedScheduleAliases(
  dto: {
    STADate?: string;
    STDDate?: string;
    STATime?: string;
    STDTime?: string;
    ATADate?: string;
    ATATime?: string;
  },
  raw: Record<string, string>,
  picked: Record<string, string> = {},
): void {
  const cell = (key: string) =>
    String(picked[key] ?? raw[key] ?? '').trim();

  if (!dto.STADate) {
    const v = cell('staDate') || cell('STADate');
    if (v) dto.STADate = COMBINED_DMY_TIME_RE.exec(v)?.[1] ?? v;
  }
  if (!dto.STDDate) {
    const v = cell('stdDate') || cell('STDDate');
    if (v) dto.STDDate = COMBINED_DMY_TIME_RE.exec(v)?.[1] ?? v;
  }
  if (!dto.STATime) {
    const v = cell('sta') || cell('STATime');
    if (v) dto.STATime = v;
  }
  if (!dto.STDTime) {
    const v = cell('std') || cell('STDTime');
    if (v) dto.STDTime = v;
  }
  if (!dto.ATADate) {
    const v = cell('ataDate') || cell('ATADate');
    if (v) dto.ATADate = COMBINED_DMY_TIME_RE.exec(v)?.[1] ?? v;
  }
  if (!dto.ATATime) {
    const v = cell('ata') || cell('ATATime') || cell('ataTime');
    if (v) dto.ATATime = v;
  }
}

export type FlatEmbedTarget = 'terminal' | 'ramp' | 'loadControl';

/** Sheet1 header → Mongoose field (strict embeds drop unmapped keys). */
const FLAT_TERMINAL_KEY_REMAP: Record<string, string> = {
  cabinBreakupF: 'CabincnfF',
  cabinBreakupC: 'CabincnfC',
  cabinBreakupY: 'CabincnfY',
  gatePlanned: 'GatePlanned',
  gateFinal: 'GateFinal',
  igm: 'IGMNo',
  egm: 'EGMNo',
  counterOpen: 'cntopen',
  counterClose: 'cntclose',
  boardingOpen: 'brdopen',
  boardingClose: 'brdclose',
  passengerArrived: 'arrivalpax',
  departed: 'deppax',
  transitPax: 'transit',
  ArrBelt: 'beltNo',
  'System Bag Count': 'SystemBagCount',
  systemBagCount: 'SystemBagCount',
  arrivalWheelChairR: 'wcr',
  arrivalWheelChairS: 'wcs',
  arrivalWheelChairC: 'wcc',
  departureWheelChairR: 'Departure_wcr',
  departureWheelChairS: 'Departure_wcs',
  departureWheelChairC: 'Departure_wcc',
  acType: 'TypeCraft',
};

const FLAT_RAMP_KEY_REMAP: Record<string, string> = {
  bayPlanned: 'BayPlanned',
  bayFinal: 'BayFinal',
  ldc: 'HoldCnfLDC',
  ldp: 'HoldCnfLDP',
  mdp: 'HoldCnfMDP',
  arrivalBag: 'airlinecount',
  departureBag: 'arrivalBaggageCount',
  cleaningStartedDate: 'CleaningFr',
  cleaningClosedDate: 'CleaningTo',
  holdOpenFrontDate: 'Frontopen',
  holdOpenRearDate: 'Rearopen',
  holdOpenBulkDate: 'Bulkopen',
  holdOpenMainDeckDate: 'MDopen',
  holdCloseFrontDate: 'Frontclose',
  holdCloseRearDate: 'Rearclose',
  holdCloseBulkDate: 'Bulkclose',
  holdCloseMainDeckDate: 'MDclose',
  lastActivityHoldDate: 'LasteActivityOnHold',
  cgoPcsIn: 'cgopcsin',
  cgoPcsOut: 'cgopcout',
  courierPcsIn: 'Courierin',
  courierPcsOut: 'Courierout',
  arrivalUldCount: 'uldarr',
  depPlannedUldCount: 'uldplan',
  depActualUldCount: 'uldatcdep',
  arrivalCargoWeight: 'cgoarr',
  depPlannedCargoWeight: 'cgoactdep',
  depActualCargoWeight: 'cgoplan',
  arrivalMailWeight: 'mailarr',
  depPlannedMailWeight: 'mailplan',
  depActualMailWeight: 'mailactdep',
  transitCargoUld: 'transitcgo',
  acType: 'TypeCraft',
  ETDdate: 'etdDate',
  ETDtime: 'etd',
  XRay: 'xRay',
  'One-Sided Belt': 'oneSidedBelt',
  'Custom Checked': 'customChecked',
};

const FLAT_LOAD_KEY_REMAP: Record<string, string> = {
  adc: 'ADCNO',
  fic: 'FICNO',
  acType: 'TypeCraft',
  Route: 'routing',
  loadgivenat: 'loadingDiagramGivenAt',
  loadprint: 'loadingSheetPrintedAt',
  loaddelat: 'loadingSheetDeliveredAt',
  fltfiled: 'flightPlanFieldAt',
};

function flatKeyRemapForTarget(
  target: FlatEmbedTarget,
): Record<string, string> {
  switch (target) {
    case 'terminal':
      return FLAT_TERMINAL_KEY_REMAP;
    case 'ramp':
      return FLAT_RAMP_KEY_REMAP;
    case 'loadControl':
      return FLAT_LOAD_KEY_REMAP;
    default:
      return {};
  }
}

const FLAT_BOOLEAN_EMBED_KEYS = new Set([
  'xRay',
  'oneSidedBelt',
  'customChecked',
  'ifNightHalt',
]);

/** Rename picked flat-sheet keys to Mongoose embed property names before spread. */
export function remapFlatPickedFields(
  picked: Record<string, string>,
  target: FlatEmbedTarget,
): Record<string, string | boolean> {
  const remap = flatKeyRemapForTarget(target);
  const out: Record<string, string | boolean> = {};

  for (const [key, val] of Object.entries(picked)) {
    if (!val) continue;
    const mongoKey = remap[key] ?? key;
    if (FLAT_BOOLEAN_EMBED_KEYS.has(mongoKey)) {
      out[mongoKey] = parseFlatYesNo(val);
      continue;
    }
    out[mongoKey] = val;
  }

  return out;
}

export function rowStaDateInRange(
  raw: Record<string, string>,
  fromYmd: string | null,
  toYmd: string | null,
): boolean {
  if (!fromYmd && !toYmd) return true;
  const ymd =
    staDateToIsoYmd(raw.staDate) ||
    staDateToIsoYmd(raw.STADate) ||
    staDateToIsoYmd(raw.stdDate) ||
    staDateToIsoYmd(raw.STDDate);
  if (!ymd) return false;
  if (fromYmd && ymd < fromYmd) return false;
  if (toYmd && ymd > toYmd) return false;
  return true;
}
