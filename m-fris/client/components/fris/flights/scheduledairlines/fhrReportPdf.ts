import type { jsPDF } from 'jspdf';
import { getJsPDFConstructor } from '@/lib/dynamic-imports';
import {
  FlightData,
  MainDetailsData,
  type EmployeeAllocationRowData,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import { getApiBase } from '@/lib/api';
import {
  resolveSignaturesForPdf,
  formatSignedAt,
  placeSignatureImage as placeSignatureInBox,
} from './signatures/signaturePdf';
import { frisFetch } from '@/lib/fris-auth-fetch';

function flightReportUrl(flightSlNo: string): string {
  const base = getApiBase().replace(/\/$/, '');
  return `${base}/reports/flight-report/${encodeURIComponent(flightSlNo)}`;
}
import {
  adcFicForFhrReport,
  formatDisplayDate,
  formatTime,
  formatDurationBetween,
  resolveCleaningDurationForReport,
  loadLogoAsBase64,
  formatReportSerialNo,
  formatReportSerialNoLabel,
  formatReportMtow,
  formatNsAirlineWithOperator,
  drawPdfRightAlignedBlock,
  resolveFhrTotalDelay,
  formatGroundTimeBetween,
  type NonScheduledReportHeaderData,
} from './reportPdfUtils';
import {
  flightNoFromMainDetails,
  dedupeRepeatedFlightNoSegments,
} from './flightNoDisplay';
import {
  FHR_EMPTY_DASH,
  fhrDisplayValue,
  isFhrFieldEmpty,
} from './fhrEmptyDisplay';

const fetch = frisFetch;

/** Split a combined date-time string into date and time for Front/Rear/Bulk/Main columns. Handles "date time", "dateTtime" (ISO), date-only, time-only. */
function splitDateTime(s: string | undefined): { date: string; time: string } {
  if (!s?.trim()) return { date: '', time: '' };
  const t = s.trim();
  if (t.includes('T')) {
    const idx = t.indexOf('T');
    const datePart = t.slice(0, idx);
    const timePart = t.slice(idx + 1);
    return { date: formatDisplayDate(datePart), time: formatTime(timePart) };
  }
  // Prefer splitting on the first space after a date-like token (dd/mm/yyyy or dd-mm-yyyy).
  const dated = t.match(
    /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})(?:\s+(.+))?$/,
  );
  if (dated) {
    return {
      date: formatDisplayDate(dated[1] ?? ''),
      time: dated[2] ? formatTime(dated[2]) : '',
    };
  }
  if (/[\d-/\\.]/.test(t) && (t.includes('/') || t.includes('-')) && !t.includes(':')) {
    return { date: formatDisplayDate(t), time: '' };
  }
  return { date: '', time: formatTime(t) };
}

function drawCellText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, align: 'left' | 'center' | 'right' = 'center') {
  doc.setFontSize(10);
  const display = fhrDisplayValue(text);
  if (display === FHR_EMPTY_DASH) {
    doc.text(FHR_EMPTY_DASH, x, y, { align: 'center' });
    return;
  }
  const lines = doc.splitTextToSize(display, maxWidth - 2);
  doc.text(lines[0] || FHR_EMPTY_DASH, x, y, { align });
}

/**
 * jsPDF may not wrap very long unbroken tokens well.
 * Insert soft spaces inside long non-whitespace runs before splitTextToSize.
 */
function hardWrapForPdf(text: string, chunkSize = 18): string {
  if (!text) return '';
  const normalized = String(text).replace(/\r\n/g, '\n');
  const rx = new RegExp(`(\\S{${chunkSize}})(?=\\S)`, 'g');
  return normalized.replace(rx, '$1 ');
}

/** Header second token: Scheduled / Non Scheduled / Ramp (not Type of Handling / Ops). */
function resolveFhrFlightKindLabel(
  flight: FlightData,
  typeOfHandlingFallback?: string,
): string {
  const raw = String(
    flight.typeOfHandling ?? typeOfHandlingFallback ?? '',
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (
    raw.includes('non-scheduled') ||
    raw.includes('non scheduled') ||
    raw.includes('non-skd') ||
    raw.includes('nonskd')
  ) {
    return 'Non Scheduled';
  }
  if (raw.includes('ramp')) return 'Ramp';
  return 'Scheduled';
}

function composeDateTimeForReport(
  dateValue: unknown,
  timeValue: unknown,
  combinedPrimary?: unknown,
  combinedFallback?: unknown,
): string {
  const date = String(dateValue ?? '').trim();
  const time = String(timeValue ?? '').trim();
  if (date && time) return `${date} ${time}`;
  const combined1 = String(combinedPrimary ?? '').trim();
  if (combined1) return combined1;
  const combined2 = String(combinedFallback ?? '').trim();
  if (combined2) return combined2;
  return time || date;
}

/** FHR Cleaning From / To: clock time only in the report (full string kept for duration). */
function cleaningTimeOnlyFromComposed(full: string): string {
  if (!full?.trim()) return '';
  const { time } = splitDateTime(full);
  return time;
}

function drawWrappedTextInBox(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  pad: number,
) {
  const wrapped = hardWrapForPdf(text || '');
  const maxWidth = Math.max(8, w - 2 * pad);
  const lines = doc.splitTextToSize(wrapped, maxWidth);
  const lineH = 3.8;
  const maxLines = Math.max(1, Math.floor((h - 2 * pad) / lineH));
  const visible = lines.slice(0, maxLines);
  if (visible.length === 0) return;
  // Ellipsis on truncation to indicate hidden content.
  if (lines.length > maxLines) {
    const last = String(visible[visible.length - 1] ?? '');
    visible[visible.length - 1] = `${last.slice(0, Math.max(0, last.length - 1))}…`;
  }
  doc.text(visible, x + pad, y + pad + 1.5, { align: 'left' });
}

export interface FlightReportData {
  serialNo?: string;
  airlineName?: string;
  flightNo?: string;
  aircraftType?: string;
  aircraftRegnNo?: string;
  terminalCode?: string;
  staDate?: string;
  staTime?: string;
  stdDate?: string;
  stdTime?: string;
  ataDate?: string;
  ataTime?: string;
  atdDate?: string;
  atdTime?: string;
  etdTime?: string;
  bayNo?: string;
  gateNo?: string;
  routing?: string;
  ops?: string;
  bookingNo?: string;
  challanNo?: string;
  mtow?: string;
  baseFlight?: string;
  totalDelay?: string;
  arrivalDelay?: string;
  ActualDelay?: string;
  departureDelay?: string;
  arrivalDelays?: Array<{ delay?: string; Delay?: string; reasonOfDelay?: string; ReasonofDelay?: string }>;
  departureDelays?: Array<{ delay?: string; Delay?: string; reasonOfDelay?: string; ReasonofDelay?: string }>;
  /** FHR header next to Ops — main details Type of Handling (`TypeofHandling`). */
  typeOfHandling?: string;
  status?: string;
  igmNo?: string;
  egmNo?: string;
  adcNo?: string;
  ficNo?: string;
  iposDate?: string;
  iposTime?: string;
  cntOpened?: string;
  cntClosed?: string;
  boardingOpened?: string;
  boardingClosed?: string;
  arrivalPax?: number;
  departurePax?: number;
  arrivalBag?: number;
  departureBag?: number;
  cleaningFrom?: string;
  cleaningTo?: string;
  /** Precomputed on server; client falls back to formatDurationBetween(cleaningFrom, cleaningTo). */
  cleaningDuration?: string;
  frontOpen?: string;
  frontClose?: string;
  rearOpen?: string;
  rearClose?: string;
  bulkOpen?: string;
  bulkClose?: string;
  mainOpen?: string;
  mainClose?: string;
  lastActivityTimeOnHold?: string;
  transitCargo?: string;
  uldArrived?: number;
  uldPlanned?: number;
  uldDeparted?: number;
  cargoArrived?: number;
  cargoPlanned?: number;
  cargoDeparted?: number;
  mailArrived?: number;
  mailPlanned?: number;
  mailDeparted?: number;
  cargoPcsIn?: number;
  cargoPcsOut?: number;
  courierIn?: number;
  courierOut?: number;
  cabinConfigF?: number;
  cabinConfigC?: number;
  cabinConfigY?: number;
  arrHallFirst?: string;
  arrHallLast?: string;
  bmaFirst?: string;
  bmaLast?: string;
  wchcArr?: number;
  wchsArr?: number;
  wchrArr?: number;
  wchcDep?: number;
  wchsDep?: number;
  wchrDep?: number;
  holdConfigLDC?: number;
  holdConfigLDP?: number;
  holdConfigMDP?: number;
  ghRemarks?: string;
  airlineRemarks?: string;
  ghRepName?: string;
  airlineRepName?: string;
  verifiedBy?: string;
  verifiedDate?: string;
  delayReasons?: Array<{ delay: string; reason: string }>;
}

/** Drop identical delay+reason rows (e.g. NS mirrored into arrival+departure). */
function dedupeDelayReasonLines(
  rows: Array<{ delay: string; reason: string }>,
): Array<{ delay: string; reason: string }> {
  const seen = new Set<string>();
  const out: Array<{ delay: string; reason: string }> = [];
  for (const row of rows) {
    const delay = String(row.delay ?? '').trim();
    const reason = String(row.reason ?? '').trim();
    if (!reason) continue;
    const key = `${delay.toLowerCase()}|${reason.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ delay, reason });
  }
  return out;
}

export async function fetchFlightReportFromServer(flightSlNo: string): Promise<FlightReportData | null> {
  try {
    const response = await fetch(flightReportUrl(flightSlNo), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const serverResponse = await response.json();
      return mapServerResponseToFlightReportData(serverResponse, flightSlNo);
    }
    // Missing serial or empty aggregation is not a client error; avoid noisy console.
    if (process.env.NODE_ENV === 'development' && response.status >= 500) {
      console.warn('Flight report API:', response.status);
    }
    return null;
  } catch (error) {
    console.error('Error fetching flight report from server:', error);
    return null;
  }
}

function mapServerResponseToFlightReportData(serverRes: any, flightSlNo: string): FlightReportData {
  if (!serverRes) return { serialNo: flightSlNo };

  const cleaningFromFull =
    String(serverRes.cleaningFromTime ?? '').trim() ||
    composeDateTimeForReport(
      serverRes.cleaningStartedDate,
      serverRes.cleaningStartedTime,
      serverRes.cleaningFrom,
      serverRes.cleaningFromTime,
    );
  const cleaningToFull =
    String(serverRes.cleaningToTime ?? '').trim() ||
    composeDateTimeForReport(
      serverRes.cleaningClosedDate,
      serverRes.cleaningClosedTime,
      serverRes.cleaningTo,
      serverRes.cleaningToTime,
    );
  const cleaningFromFallback = String(serverRes.cleaningFromTime ?? '').trim();
  const cleaningToFallback = String(serverRes.cleaningToTime ?? '').trim();
  const cleaningFrom = cleaningTimeOnlyFromComposed(
    cleaningFromFull || cleaningFromFallback,
  );
  const cleaningTo = cleaningTimeOnlyFromComposed(
    cleaningToFull || cleaningToFallback,
  );

  return {
    serialNo: String(serverRes.serialNo || serverRes.slNo || flightSlNo),
    airlineName: serverRes.airlineName || serverRes.airline,
    flightNo: dedupeRepeatedFlightNoSegments(
      String(serverRes.flightNo || serverRes.flightCode || ''),
    ),
    aircraftType: serverRes.aircraftType || serverRes.aircraft,
    aircraftRegnNo:
      serverRes.aircraftRegnNo ||
      serverRes.regnNo ||
      serverRes.regNo ||
      serverRes.registrationNo,
    terminalCode: serverRes.terminalCode,
    staDate: serverRes.staDate,
    staTime: serverRes.staTime,
    stdDate: serverRes.stdDate,
    stdTime: serverRes.stdTime,
    ataDate: serverRes.ataDate,
    ataTime: serverRes.ataTime,
    atdDate: serverRes.atdDate,
    atdTime: serverRes.atdTime,
    etdTime: serverRes.etdTime,
    bayNo: serverRes.bayNo,
    gateNo: serverRes.gateNo,
    routing: serverRes.routing || serverRes.route,
    ops: serverRes.ops,
    bookingNo: serverRes.bookingNo,
    challanNo: serverRes.challanNo,
    mtow: serverRes.mtow,
    baseFlight: serverRes.baseFlight || (serverRes.stationBaseNightHalt ? 'Y' : 'N'),
    totalDelay: resolveFhrTotalDelay({
      arrivalDelay: serverRes.arrivalDelay,
      actualDelay: serverRes.ActualDelay,
      departureDelay: serverRes.departureDelay,
      arrivalDelays: serverRes.arrivalDelays,
      departureDelays: serverRes.departureDelays,
      fallback: serverRes.totalDelay,
    }),
    arrivalDelay: serverRes.arrivalDelay,
    ActualDelay: serverRes.ActualDelay,
    departureDelay: serverRes.departureDelay,
    arrivalDelays: serverRes.arrivalDelays,
    departureDelays: serverRes.departureDelays,
    typeOfHandling:
      serverRes.typeOfHandling ?? serverRes.TypeofHandling ?? '',
    status: serverRes.status || serverRes.departureStatus,
    igmNo: serverRes.igmNo,
    egmNo: serverRes.egmNo,
    adcNo: serverRes.adcNo,
    ficNo: serverRes.ficNo,
    iposDate: serverRes.iposDate,
    iposTime: serverRes.iposTime,
    cntOpened: serverRes.cntOpenedTime || serverRes.cntOpened,
    cntClosed: serverRes.cntClosedTime || serverRes.cntClosed,
    boardingOpened: serverRes.boardingOpenedTime || serverRes.boardingOpened,
    boardingClosed: serverRes.boardingClosedTime || serverRes.boardingClosed,
    arrivalPax: serverRes.arrivalPax,
    departurePax: serverRes.departurePax,
    arrivalBag: serverRes.arrivalBag,
    departureBag: serverRes.departureBag,
    cleaningFrom,
    cleaningTo,
    cleaningDuration: resolveCleaningDurationForReport(
      serverRes.cleaningDuration ?? serverRes.cleaning_duration,
      cleaningFromFull || cleaningFromFallback,
      cleaningToFull || cleaningToFallback,
    ),
    frontOpen: serverRes.cargoCompartmentFrontOpen || serverRes.frontOpen,
    frontClose: serverRes.cargoCompartmentFrontClose || serverRes.frontClose,
    rearOpen: serverRes.cargoCompartmentRearOpen || serverRes.rearOpen,
    rearClose: serverRes.cargoCompartmentRearClose || serverRes.rearClose,
    bulkOpen: serverRes.cargoCompartmentBulkOpen || serverRes.bulkOpen,
    bulkClose: serverRes.cargoCompartmentBulkClose || serverRes.bulkClose,
    mainOpen: serverRes.cargoCompartmentMainOpen || serverRes.mainOpen,
    mainClose: serverRes.cargoCompartmentMainClose || serverRes.mainClose,
    lastActivityTimeOnHold: serverRes.lastActivityTimeOnHold,
    transitCargo: serverRes.transitCargo,
    uldArrived: serverRes.uldCargoArrived || serverRes.uldArrived,
    uldPlanned: serverRes.uldCargoPlanned || serverRes.uldPlanned,
    uldDeparted: serverRes.uldCargoDeparted || serverRes.uldDeparted,
    cargoArrived: serverRes.cargoArrived,
    cargoPlanned: serverRes.cargoPlanned,
    cargoDeparted: serverRes.cargoDeparted,
    mailArrived: serverRes.mailArrived,
    mailPlanned: serverRes.mailPlanned,
    mailDeparted: serverRes.mailDeparted,
    cargoPcsIn: serverRes.cargoPcsIn,
    cargoPcsOut: serverRes.cargoPcsOut,
    courierIn: serverRes.courierIn,
    courierOut: serverRes.courierOut,
    cabinConfigF: serverRes.cabinConfigF,
    cabinConfigC: serverRes.cabinConfigC,
    cabinConfigY: serverRes.cabinConfigY,
    arrHallFirst: serverRes.firstArrHall || serverRes.arrHallFirst,
    arrHallLast: serverRes.lastArrHall || serverRes.arrHallLast,
    bmaFirst: serverRes.firstBMA || serverRes.bmaFirst,
    bmaLast: serverRes.lastBMA || serverRes.bmaLast,
    wchcArr: serverRes.wheelChairArrivalC || serverRes.wchcArr,
    wchsArr: serverRes.wheelChairArrivalS || serverRes.wchsArr,
    wchrArr: serverRes.wheelChairArrivalR || serverRes.wchrArr,
    wchcDep: serverRes.wheelChairDepartureC || serverRes.wchcDep,
    wchsDep: serverRes.wheelChairDepartureS || serverRes.wchsDep,
    wchrDep: serverRes.wheelChairDepartureR || serverRes.wchrDep,
    holdConfigLDC: serverRes.ldc ?? serverRes.holdConfigLDC,
    holdConfigLDP: serverRes.ldp ?? serverRes.ldpmdp ?? serverRes.holdConfigLDP,
    holdConfigMDP: serverRes.mdp ?? serverRes.holdConfigMDP,
    ghRemarks: serverRes.ghRemarks ?? serverRes.PaxGHAirlineRep_Name,
    airlineRemarks:
      serverRes.airlineRemarks ??
      serverRes.AirRepRem ??
      serverRes.airrep ??
      serverRes.Air_rep,
    ghRepName: serverRes.ghRepresentativeName || serverRes.ghRepName || serverRes.ghRep,
    airlineRepName: serverRes.airlineRepresentativeName || serverRes.airlineRepName || serverRes.airlineRep,
    verifiedBy: serverRes.verifiedBy,
    verifiedDate: serverRes.verifiedDate,
    delayReasons: dedupeDelayReasonLines(
      (serverRes.delayReasons || serverRes.departureDelays || []).map((d: any) => ({
        delay: d.delay || '',
        reason: d.reasonOfDelay ?? d.reason ?? '',
      })),
    ),
  };
}

async function fetchFlightReportData(flightSlNo: string): Promise<FlightReportData> {
  try {
    const serverData = await fetchFlightReportFromServer(flightSlNo);
    if (serverData) {
      return serverData;
    }
    return { serialNo: flightSlNo };
  } catch (error) {
    console.error('Error fetching flight report data:', error);
    return { serialNo: flightSlNo };
  }
}

const PDF_LAYOUT = {
  margin: 10,
  startY: 12,
  tableGap: 3,
  cellPad: 3,
  mainRowH: 14,
  mainCol1: 40,
  mainCol2: 32,
  mainCol3: 22,
  mainCol4: 42,
  mainCol5: 22,
  // Delay row
  delayRowH: 10,
  delayCol1: 60,
  // IGM/EGM/ADC/FIC/IPOS row (height for 2 lines in IPOS column)
  idRowH: 11,
  // Pax/CNT/Boarding row (taller so Cleaning From / To / Cleaning Duration fit)
  paxRowH: 24,
  paxCol1: 30,
  paxCol2: 34,
  paxCol3: 28,
  paxCol4: 28,
  paxCol5: 42,
} as const;

export async function downloadMainReportPdf(
  flight: FlightData,
  mainDetails?: MainDetailsData | null,
  loggedInUserName?: string,
  /** Merge on top of GET flight-report (e.g. cleaningDuration from current screen). */
  reportOverrides?: Partial<FlightReportData> | null,
  nonScheduledHeader?: NonScheduledReportHeaderData,
): Promise<jsPDF> {
  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = PDF_LAYOUT.margin;
  const tableW = pageW - 2 * margin;
  let y = PDF_LAYOUT.startY;

  const fetched = await fetchFlightReportData(flight.slNo);
  const data: FlightReportData = (() => {
    if (!reportOverrides) return fetched;
    const merged: FlightReportData = { ...fetched };
    for (const [key, value] of Object.entries(reportOverrides)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'string' && value.trim() === '') continue;
      (merged as Record<string, unknown>)[key] = value;
    }
    return merged;
  })();
  const logoBase64 = await loadLogoAsBase64();

  // Reusable representative signatures resolved from the repository (best-effort).
  const signatureView = await resolveSignaturesForPdf(flight.slNo, 'fhr');

  // Prefer main details for status and delay reasons (arrival + departure from main details)
  const statusDisplay = mainDetails?.departureStatus != null && mainDetails.departureStatus !== ''
    ? mainDetails.departureStatus
    : (data.status || '');
  const totalDelayDisplay = resolveFhrTotalDelay({
    arrivalDelay: mainDetails?.arrivalDelay || data.arrivalDelay,
    actualDelay:
      (mainDetails as { ActualDelay?: string } | null | undefined)?.ActualDelay ||
      data.ActualDelay,
    departureDelay: mainDetails?.departureDelay || data.departureDelay,
    arrivalDelays:
      mainDetails?.arrivalDelays?.length ? mainDetails.arrivalDelays : data.arrivalDelays,
    departureDelays:
      mainDetails?.departureDelays?.length
        ? mainDetails.departureDelays
        : data.departureDelays,
    fallback: data.totalDelay,
  });
  // Same SGT/AGT formula as on-screen FHR (STD−STA / ATD−ATA).
  const sgtDisplay = formatGroundTimeBetween(
    flight.staDate || data.staDate,
    flight.staTime || data.staTime,
    flight.stdDate || data.stdDate,
    flight.stdTime || data.stdTime,
  );
  const agtDisplay = formatGroundTimeBetween(
    mainDetails?.ataDate || data.ataDate || flight.staDate || data.staDate,
    mainDetails?.ataTime || data.ataTime,
    mainDetails?.atdDate || data.atdDate || flight.stdDate || data.stdDate,
    mainDetails?.atdTime || data.atdTime,
  );
  const delayReasonsFromMain: Array<{ delay: string; reason: string }> = [];
  if (mainDetails?.arrivalDelays?.length) {
    mainDetails.arrivalDelays.forEach((e) => {
      const reason = (e.reasonOfDelay ?? '').trim();
      if (reason) delayReasonsFromMain.push({ delay: e.delay || '', reason });
    });
  }
  if (mainDetails?.departureDelays?.length) {
    mainDetails.departureDelays.forEach((e) => {
      const reason = (e.reasonOfDelay ?? '').trim();
      if (reason) delayReasonsFromMain.push({ delay: e.delay || '', reason });
    });
  }
  // Deduplicate: NS historically mirrored the same rows into arrival+departure.
  const delayReasonsForBox = dedupeDelayReasonLines(
    delayReasonsFromMain.length > 0
      ? delayReasonsFromMain
      : (data.delayReasons || []).filter((r) => (r.reason || '').trim()),
  );

  const typeOfHandlingDisplay =
    String(
      mainDetails?.typeOfHandling ??
        (mainDetails as unknown as { TypeofHandling?: string })?.TypeofHandling ??
        '',
    ).trim() ||
    String(data.typeOfHandling ?? '').trim();
  const opsDisplay = mainDetails?.ops?.trim()
    ? mainDetails.ops
    : data.ops || 'Turnaround';
  // Ops (Turnaround/Transit/…) then flight kind — never repeat Ops as Type of Handling.
  const flightKindDisplay = resolveFhrFlightKindLabel(
    flight,
    typeOfHandlingDisplay,
  );
  const opsAndFlightKind = `${opsDisplay} ${flightKindDisplay}`.trim();
  const baseFlightDisplay =
    mainDetails?.stationBaseNightHalt != null
      ? mainDetails.stationBaseNightHalt
        ? 'Y'
        : 'N'
      : (data.baseFlight || 'N');
  const ghRepDisplay = mainDetails?.ghRep?.trim() ? mainDetails.ghRep : (data.ghRepName || '');
  const airlineRepDisplay = mainDetails?.airlineRep?.trim()
    ? mainDetails.airlineRep
    : (data.airlineRepName || '');
  const iposDateForPdf = mainDetails?.iposDate || data.iposDate || '';
  const iposTimeRaw = mainDetails?.iposTime || data.iposTime || '';
  const iposTimeForPdf =
    iposTimeRaw ||
    (/\d{1,2}:\d{2}/.test(String(iposDateForPdf)) ? String(iposDateForPdf) : '');
  const { adcNo: adcNoForPdf, ficNo: ficNoForPdf } = adcFicForFhrReport(
    data.adcNo,
    data.ficNo,
  );

  // Use aggregated data, then main details, then flight list row.
  // STA/STD must remain exactly as scheduled table row for this flight/day.
  const staDate = formatDisplayDate(flight.staDate || data.staDate || '');
  const stdDate = formatDisplayDate(flight.stdDate || data.stdDate || '');
  // Always prefer Main Details for ATA/ATD/ETD in PDF.
  const ataDate = formatDisplayDate(mainDetails?.ataDate || data.ataDate || '') || staDate;
  const atdDate = formatDisplayDate(mainDetails?.atdDate || data.atdDate || '') || stdDate;
  const staTime = formatTime(flight.staTime || data.staTime || '');
  const stdTime = formatTime(flight.stdTime || data.stdTime || '');
  const ataTime = formatTime(mainDetails?.ataTime || data.ataTime || '');
  const atdTime = formatTime(mainDetails?.atdTime || data.atdTime || '');
  const etdTime = formatTime(mainDetails?.etdTime || data.etdTime || '');
  const routing =
    (mainDetails?.route?.trim() ? mainDetails.route : '') || data.routing || flight.destination || '';
  const airlineName =
    (mainDetails?.airlineName?.trim() ? mainDetails.airlineName : '') ||
    data.airlineName ||
    flight.airline ||
    '';
  const flightNo = flightNoFromMainDetails(mainDetails, data.flightNo || flight.flightNo || '');
  const aircraftType =
    (mainDetails?.aircraftType?.trim() ? mainDetails.aircraftType : '') ||
    data.aircraftType ||
    flight.aircraft ||
    '';
  const mainDetailsRegnNo = String(
    mainDetails?.regnNo ||
    (mainDetails as any)?.regNo ||
    (mainDetails as any)?.registrationNo ||
    (mainDetails as any)?.aircraftRegnNo ||
    '',
  ).trim();
  const aircraftRegnNo = mainDetailsRegnNo || data.aircraftRegnNo || '';
  const terminalCode =
    (mainDetails?.terminalCode?.trim() ? mainDetails.terminalCode : '') || data.terminalCode || '';
  // Serial must match scheduled airlines table row (`flight.slNo`).
  const serialNo = flight.slNo || data.serialNo || '';

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, y - 4, 64, 12);
    } catch {
      doc.setFontSize(11);
      doc.setFont('times', 'bold');
      doc.text('BIRD', margin, y + 2);
      doc.setFontSize(5);
      doc.text('AIRPORT', margin + 11, y);
      doc.text('SERVICES', margin + 11, y + 3);
    }
  } else {
    doc.setFontSize(11);
    doc.setFont('times', 'bold');
    doc.text('BIRD', margin, y + 2);
    doc.setFontSize(5);
    doc.setFont('times', 'normal');
    doc.text('AIRPORT', margin + 11, y);
    doc.text('SERVICES', margin + 11, y + 3);
  }

  // Title centered — scheduled only (NS FHR omits "FLIGHT REPORT")
  if (!nonScheduledHeader) {
    doc.setFontSize(14);
    doc.setFont('times', 'bold');
    doc.text('FLIGHT REPORT', pageW / 2, y + 2, { align: 'center' });
  }

  // Right side info - left-aligned within block, consistent padding
  const pad = PDF_LAYOUT.cellPad;
  doc.setFontSize(10);
  doc.setFont('times', 'normal');
  if (nonScheduledHeader) {
    // Right-side block, shared left edge (Serial/Performa/Booking/MTOW line up).
    const rightX = pageW - margin;
    const rightBlockMaxW = Math.max(40, pageW - 2 * margin - 68);
    const operation = String(nonScheduledHeader.operation || 'Turnaround').trim();
    const handlingType = String(nonScheduledHeader.handlingType || 'Non-Scheduled').trim();
    const challan =
      String(nonScheduledHeader.challanNo || '').trim() ||
      String(data.challanNo || '').trim();
    const booking =
      String(nonScheduledHeader.bookingNo || '').trim() ||
      String(data.bookingNo || '').trim();
    const headerLines = [
      formatReportSerialNoLabel(serialNo),
      `Performa No : ${challan || '—'}`,
      `Booking No : ${booking || '—'}`,
      `${operation}   ${handlingType}`,
      `MTOW : ${formatReportMtow(nonScheduledHeader.mtow ?? mainDetails?.mtow ?? data.mtow)}`,
    ];
    const blockH = drawPdfRightAlignedBlock(doc, headerLines, rightX, y - 2, rightBlockMaxW, {
      fontSize: 10,
      minFontSize: 6.5,
      lineHeight: 4,
    });
    y += Math.max(16, blockH + 2);
  } else {
    const rightBlockLeft = pageW - margin - 48;
    doc.text(formatReportSerialNoLabel(serialNo), rightBlockLeft, y - 2, { align: 'left' });
    doc.text(opsAndFlightKind, rightBlockLeft, y + 2, { align: 'left' });
    doc.text(`MTOW : ${fhrDisplayValue(data.mtow)}`, rightBlockLeft, y + 6, { align: 'left' });
    doc.text(`Base Flight : ${fhrDisplayValue(baseFlightDisplay)}`, rightBlockLeft, y + 10, { align: 'left' });
    y += 16;
  }

  // ==================== AIRLINE & TERMINAL CODE (single rectangle) ====================
  const airlineTerminalRowH = 10;
  doc.rect(margin, y, tableW, airlineTerminalRowH);
  doc.setFontSize(12);
  doc.setFont('times', 'bold');
  const airlineLine = nonScheduledHeader
    ? formatNsAirlineWithOperator(
        airlineName,
        nonScheduledHeader.operator ||
          (mainDetails as { operator?: string } | null | undefined)?.operator,
      )
    : airlineName;
  doc.text(fhrDisplayValue(airlineLine), margin + pad, y + 6, { align: 'left' });
  doc.setFontSize(10);
  doc.setFont('times', 'normal');
  doc.text(`Terminal Code : ${fhrDisplayValue(terminalCode)}`, pageW - margin - pad, y + 6, { align: 'right' });

  y += airlineTerminalRowH + 2;

  // ==================== MAIN INFO TABLE (3 columns) ====================
  const rowH = PDF_LAYOUT.mainRowH;
  const col1 = tableW * 0.25;
  const col2 = tableW * 0.35;
  const col3 = tableW - col1 - col2;

  let x = margin;
  doc.setFontSize(10);

  // Helper: draw "Label : value"; optional labelWidth aligns all values in a column.
  const drawLabelValue = (
    lx: number,
    ly: number,
    label: string,
    value: string,
    opts?: { valueMaxWidth?: number; labelWidth?: number; noWrap?: boolean }
  ) => {
    const prefix = `${label} : `;
    doc.setFontSize(9);
    doc.setFont('times', 'bold');
    doc.text(prefix, lx, ly, { align: 'left' });
    const w = doc.getTextWidth(prefix);
    // Without labelWidth, value starts immediately after ": ".
    const valueStartX = opts?.labelWidth != null ? lx + opts.labelWidth : lx + w;
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    const raw = String(value ?? '').trim();
    const maxW =
      opts?.valueMaxWidth ??
      Math.max(12, tableW - (lx - margin) - (opts?.labelWidth ?? w) - pad * 2);
    // Empty fields: centered dash in the value area.
    if (!raw) {
      doc.text(FHR_EMPTY_DASH, valueStartX + Math.max(8, Math.min(maxW, 18)) / 2, ly, {
        align: 'center',
      });
      return;
    }
    // Flight No: never wrap — keep a single continuous line.
    if (opts?.noWrap) {
      doc.text(raw, valueStartX, ly, { align: 'left' });
      return;
    }
    const line = doc.splitTextToSize(raw, Math.max(5, maxW))[0] || '';
    doc.text(line, valueStartX, ly, { align: 'left' });
  };

  // Precompute label widths so values align in columns (same font as used in drawLabelValue).
  doc.setFontSize(9);
  doc.setFont('times', 'bold');
  const col1LabelW = Math.max(
    doc.getTextWidth('Flight No : '),
    doc.getTextWidth('Aircraft Type : '),
    doc.getTextWidth('Aircraft Regn No. : ')
  );
  const col2LeftLabelW = Math.max(
    doc.getTextWidth('STA Date : '),
    doc.getTextWidth('ATA Date : '),
    doc.getTextWidth('Bay No. : ')
  );
  const col2RightLabelW = Math.max(
    doc.getTextWidth('STA : '),
    doc.getTextWidth('ATA : '),
    doc.getTextWidth('Gate No : ')
  );
  const col3LeftLabelW = Math.max(
    doc.getTextWidth('STD Date : '),
    doc.getTextWidth('ATD Date : '),
    doc.getTextWidth('Routing : ')
  );
  const col3RightLabelW = Math.max(
    doc.getTextWidth('STD : '),
    doc.getTextWidth('ATD : '),
    doc.getTextWidth('ETD : ')
  );

  // Column 1: Flight No / Aircraft Type / Aircraft Regn No
  // Flight No: value starts right after ":", never wraps. Other rows keep aligned values.
  const col1ValueMaxW = Math.max(8, col1 - pad * 2 - col1LabelW);
  const flightNoSingleLine = String(flightNo ?? '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '')
    .trim();
  doc.rect(x, y, col1, rowH);
  drawLabelValue(x + pad, y + 4, 'Flight No', flightNoSingleLine, {
    noWrap: true,
  });
  drawLabelValue(x + pad, y + 8, 'Aircraft Type', aircraftType, {
    labelWidth: col1LabelW,
    valueMaxWidth: col1ValueMaxW,
  });
  drawLabelValue(x + pad, y + 12, 'Aircraft Regn No.', aircraftRegnNo, {
    labelWidth: col1LabelW,
    valueMaxWidth: col1ValueMaxW,
  });
  x += col1;

  // Column 2 (single box): two pairs per line with gap; values aligned in left and right halves
  const col2Mid = x + col2 / 2;
  doc.rect(x, y, col2, rowH);
  drawLabelValue(x + pad, y + 4, 'STA Date', staDate, { labelWidth: col2LeftLabelW });
  drawLabelValue(col2Mid + pad, y + 4, 'STA', staTime, { labelWidth: col2RightLabelW });
  drawLabelValue(x + pad, y + 8, 'ATA Date', ataDate, { labelWidth: col2LeftLabelW });
  drawLabelValue(col2Mid + pad, y + 8, 'ATA', ataTime, { labelWidth: col2RightLabelW });
  drawLabelValue(x + pad, y + 12, 'Bay No.', data.bayNo || '', { labelWidth: col2LeftLabelW });
  drawLabelValue(col2Mid + pad, y + 12, 'Gate No', data.gateNo || '', { labelWidth: col2RightLabelW });
  x += col2;

  // Column 3 (single box): two pairs per line; values aligned
  const col3Gap = 8;
  const col3Right = x + col3 / 2 + pad + col3Gap;
  doc.rect(x, y, col3, rowH);
  drawLabelValue(x + pad, y + 4, 'STD Date', stdDate, { labelWidth: col3LeftLabelW });
  drawLabelValue(col3Right, y + 4, 'STD', stdTime, { labelWidth: col3RightLabelW });
  drawLabelValue(x + pad, y + 8, 'ATD Date', atdDate, { labelWidth: col3LeftLabelW });
  drawLabelValue(col3Right, y + 8, 'ATD', atdTime, { labelWidth: col3RightLabelW });
  drawLabelValue(x + pad, y + 12, 'Routing', routing, { labelWidth: col3LeftLabelW });
  drawLabelValue(col3Right, y + 12, 'ETD', etdTime, { labelWidth: col3RightLabelW });

  y += rowH;

  // ==================== DELAY ROW (Delay Reason, Total Delay, Status, SGT, AGT) ====================
  const delayRowH = PDF_LAYOUT.delayRowH;
  x = margin;
  // Proportions match on-screen FHR: ~0.9 / 1.1 / 1.2 / 0.85 / 0.85
  const delayFrac = 0.9 + 1.1 + 1.2 + 0.85 + 0.85;
  const delayCol0 = (tableW * 0.9) / delayFrac; // Delay Reason label
  const delayCol1 = (tableW * 1.1) / delayFrac; // Total Delay
  const delayCol2 = (tableW * 1.2) / delayFrac; // Status
  const delayCol3 = (tableW * 0.85) / delayFrac; // SGT
  const delayCol4 = tableW - delayCol0 - delayCol1 - delayCol2 - delayCol3; // AGT

  doc.setFontSize(9);
  doc.setFont('times', 'bold');
  doc.rect(x, y, delayCol0, delayRowH);
  doc.text('Delay Reason :', x + pad, y + 6, { align: 'left' });
  x += delayCol0;

  const totalDelayLabelW = doc.getTextWidth('Total Delay : ');
  const statusLabelW = doc.getTextWidth('Status : ');
  const sgtLabelW = doc.getTextWidth('SGT : ');
  const agtLabelW = doc.getTextWidth('AGT : ');
  doc.setFont('times', 'normal');
  doc.rect(x, y, delayCol1, delayRowH);
  drawLabelValue(x + pad, y + 6, 'Total Delay', totalDelayDisplay, { labelWidth: totalDelayLabelW });
  x += delayCol1;

  doc.rect(x, y, delayCol2, delayRowH);
  drawLabelValue(x + pad, y + 6, 'Status', statusDisplay, { labelWidth: statusLabelW });
  x += delayCol2;

  doc.rect(x, y, delayCol3, delayRowH);
  drawLabelValue(x + pad, y + 6, 'SGT', sgtDisplay, { labelWidth: sgtLabelW });
  x += delayCol3;

  doc.rect(x, y, delayCol4, delayRowH);
  drawLabelValue(x + pad, y + 6, 'AGT', agtDisplay, { labelWidth: agtLabelW });

  y += delayRowH;

  // ==================== DELAY REASON (details only; label is in row above) ====================
  const delayReasonBoxH = 20;
  doc.rect(margin, y, tableW, delayReasonBoxH);
  doc.setFontSize(10);
  doc.setFont('times', 'normal');
  if (delayReasonsForBox.length > 0) {
    let lineY = y + 5;
    delayReasonsForBox.slice(0, 4).forEach((r) => {
      const line = [r.delay, r.reason].filter(Boolean).join(' - ');
      if (line && lineY < y + delayReasonBoxH - 4) {
        doc.text(doc.splitTextToSize(line, tableW - 2 * pad)[0] || line, margin + pad, lineY, { align: 'left' });
        lineY += 4;
      }
    });
  } else {
    doc.text(FHR_EMPTY_DASH, margin + tableW / 2, y + delayReasonBoxH / 2 + 1, { align: 'center' });
  }

  y += delayReasonBoxH;

  // ==================== IGM / EGM / ADC / FIC / IPOS ====================
  const idRowH = PDF_LAYOUT.idRowH;
  const idColWidths = [34, 34, 34, 34, 54]; // last column wider for IPOS Date/Time
  x = margin;
  doc.setFontSize(9);
  doc.setFont('times', 'bold');
  const idLabelW = Math.max(
    doc.getTextWidth('IGM No. : '),
    doc.getTextWidth('EGM No. : '),
    doc.getTextWidth('ADC No. : '),
    doc.getTextWidth('FIC No. : '),
    doc.getTextWidth('IPOS Date : '),
    doc.getTextWidth('IPOS Time : ')
  );
  doc.setFont('times', 'normal');
  idColWidths.forEach((idColW, i) => {
    doc.rect(x, y, idColW, idRowH);
    if (i === 0) drawLabelValue(x + pad, y + 5, 'IGM No.', data.igmNo || '', { labelWidth: idLabelW, valueMaxWidth: idColW - pad * 2 - idLabelW });
    else if (i === 1) drawLabelValue(x + pad, y + 5, 'EGM No.', data.egmNo || '', { labelWidth: idLabelW, valueMaxWidth: idColW - pad * 2 - idLabelW });
    else if (i === 2) drawLabelValue(x + pad, y + 5, 'ADC No.', adcNoForPdf, { labelWidth: idLabelW, valueMaxWidth: idColW - pad * 2 - idLabelW });
    else if (i === 3) drawLabelValue(x + pad, y + 5, 'FIC No.', ficNoForPdf, { labelWidth: idLabelW, valueMaxWidth: idColW - pad * 2 - idLabelW });
    else {
      drawLabelValue(x + pad, y + 3, 'IPOS Date', formatDisplayDate(iposDateForPdf), { labelWidth: idLabelW, valueMaxWidth: idColW - pad * 2 - idLabelW });
      drawLabelValue(x + pad, y + 7, 'IPOS Time', formatTime(iposTimeForPdf), { labelWidth: idLabelW, valueMaxWidth: idColW - pad * 2 - idLabelW });
    }
    x += idColW;
  });

  y += idRowH + PDF_LAYOUT.tableGap;

  // ==================== CNT / BOARDING / PAX / BAG / CLEANING ====================
  const paxRowH = PDF_LAYOUT.paxRowH;
  const paxColWidths = [36, 38, 33, 33, 50]; // last column wider for Cleaning From/To and Duration (time values)
  x = margin;

  doc.setFontSize(9);
  doc.setFont('times', 'bold');
  const cntLabelW = Math.max(doc.getTextWidth('Counter Open : '), doc.getTextWidth('Counter Close : '));
  const boardLabelW = Math.max(doc.getTextWidth('Boarding Open : '), doc.getTextWidth('Boarding Close : '));
  const paxLabelW = Math.max(doc.getTextWidth('Arrival Pax : '), doc.getTextWidth('Departure Pax : '));
  const bagLabelW = Math.max(doc.getTextWidth('Arrival Bag : '), doc.getTextWidth('Departure Bag : '));
  const cleanLabelW = Math.max(
    doc.getTextWidth('Cleaning From : '),
    doc.getTextWidth('Cleaning To : '),
    doc.getTextWidth('Cleaning Duration : ')
  );
  doc.setFont('times', 'normal');

  const cleaningDurationLine = resolveCleaningDurationForReport(
    data.cleaningDuration,
    data.cleaningFrom,
    data.cleaningTo,
  );

  const paxColW0 = paxColWidths[0]!;
  const paxColW1 = paxColWidths[1]!;
  const paxColW2 = paxColWidths[2]!;
  const paxColW3 = paxColWidths[3]!;
  const paxColW4 = paxColWidths[4]!;

  // Column 1: Counter (from Terminal Details)
  doc.rect(x, y, paxColW0, paxRowH);
  drawLabelValue(x + pad, y + 5, 'Counter Open', data.cntOpened || '', { labelWidth: cntLabelW, valueMaxWidth: paxColW0 - pad * 2 - cntLabelW });
  drawLabelValue(x + pad, y + 12, 'Counter Close', data.cntClosed || '', { labelWidth: cntLabelW, valueMaxWidth: paxColW0 - pad * 2 - cntLabelW });
  x += paxColW0;

  // Column 2: Boarding (from Terminal Details)
  doc.rect(x, y, paxColW1, paxRowH);
  drawLabelValue(x + pad, y + 5, 'Boarding Open', data.boardingOpened || '', { labelWidth: boardLabelW, valueMaxWidth: paxColW1 - pad * 2 - boardLabelW });
  drawLabelValue(x + pad, y + 12, 'Boarding Close', data.boardingClosed || '', { labelWidth: boardLabelW, valueMaxWidth: paxColW1 - pad * 2 - boardLabelW });
  x += paxColW1;

  // Column 3: Arrival/Departure Pax
  doc.rect(x, y, paxColW2, paxRowH);
  drawLabelValue(x + pad, y + 5, 'Arrival Pax', String(data.arrivalPax ?? ''), { labelWidth: paxLabelW, valueMaxWidth: paxColW2 - pad * 2 - paxLabelW });
  drawLabelValue(x + pad, y + 12, 'Departure Pax', String(data.departurePax ?? ''), { labelWidth: paxLabelW, valueMaxWidth: paxColW2 - pad * 2 - paxLabelW });
  x += paxColW2;

  // Column 4: Arrival/Departure Bag
  doc.rect(x, y, paxColW3, paxRowH);
  drawLabelValue(x + pad, y + 5, 'Arrival Bag', String(data.arrivalBag ?? ''), { labelWidth: bagLabelW, valueMaxWidth: paxColW3 - pad * 2 - bagLabelW });
  drawLabelValue(x + pad, y + 12, 'Departure Bag', String(data.departureBag ?? ''), { labelWidth: bagLabelW, valueMaxWidth: paxColW3 - pad * 2 - bagLabelW });
  x += paxColW3;

  // Column 5: Cleaning From + Cleaning To + Duration (wider so times like 23:59, 00:00 and duration are fully visible)
  doc.rect(x, y, paxColW4, paxRowH);
  drawLabelValue(x + pad, y + 5, 'Cleaning From', data.cleaningFrom || '', { labelWidth: cleanLabelW, valueMaxWidth: paxColW4 - pad * 2 - cleanLabelW });
  drawLabelValue(x + pad, y + 12, 'Cleaning To', data.cleaningTo || '', { labelWidth: cleanLabelW, valueMaxWidth: paxColW4 - pad * 2 - cleanLabelW });
  drawLabelValue(x + pad, y + 19, 'Cleaning Duration', cleaningDurationLine, { labelWidth: cleanLabelW, valueMaxWidth: paxColW4 - pad * 2 - cleanLabelW });

  y += paxRowH + PDF_LAYOUT.tableGap;

  // ==================== HOLD / ULD / CARGO SECTION ====================
  // 6 rows x 11 columns. Time rows (2 and 4) slightly shorter than before.
  const holdRowHeights = [8, 8, 8, 8, 8, 8];
  const holdStartY = y;
  const holdTotalH = holdRowHeights.reduce((a, b) => a + b, 0);
  const rowY = (r: number) => holdStartY + holdRowHeights.slice(0, r).reduce((a, b) => a + b, 0);

  const c0 = 12;
  const rest = tableW - c0;
  const c1 = rest * 0.12;
  const c2 = rest * 0.12;
  const c3 = rest * 0.12;
  const c4 = rest * 0.12;
  const c5 = rest * 0.10;
  const c6 = rest * 0.06;
  const c7 = rest * 0.09;
  const c8 = rest * 0.09;
  const c9 = rest * 0.13;
  const c10 = rest - c1 - c2 - c3 - c4 - c5 - c6 - c7 - c8 - c9;

  const colLeft = (idx: number) => margin + [0, c0, c0 + c1, c0 + c1 + c2, c0 + c1 + c2 + c3, c0 + c1 + c2 + c3 + c4, c0 + c1 + c2 + c3 + c4 + c5, c0 + c1 + c2 + c3 + c4 + c5 + c6, c0 + c1 + c2 + c3 + c4 + c5 + c6 + c7, c0 + c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8, c0 + c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8 + c9][idx];
  const colW = (idx: number) => [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10][idx];
  const cellY = (r: number) => rowY(r) + holdRowHeights[r]! / 2 + 1.2;
  const centerX = (colIdx: number) => colLeft(colIdx) + colW(colIdx) / 2;

  doc.rect(margin, holdStartY, tableW, holdTotalH);
  doc.line(margin, rowY(1), margin + tableW, rowY(1));
  doc.line(colLeft(1), rowY(2), margin + tableW, rowY(2));
  doc.line(margin, rowY(3), margin + tableW, rowY(3));
  doc.line(colLeft(1), rowY(4), margin + tableW, rowY(4));
  doc.line(margin, rowY(5), margin + tableW, rowY(5));
  doc.line(colLeft(1), holdStartY, colLeft(1), rowY(5));
  for (let col = 2; col <= 4; col++) doc.line(colLeft(col), holdStartY, colLeft(col), rowY(5));
  doc.line(colLeft(5), holdStartY, colLeft(5), rowY(6));
  for (let col = 6; col <= 10; col++) doc.line(colLeft(col), holdStartY, colLeft(col), rowY(5));
  const lastRowLeftW = colLeft(5) - margin - pad * 2;
  const lastRowRightStart = colLeft(5);
  const lastRowRightW = margin + tableW - lastRowRightStart - pad * 2;

  const frontOpenDt = splitDateTime(data.frontOpen);
  const frontCloseDt = splitDateTime(data.frontClose);
  const rearOpenDt = splitDateTime(data.rearOpen);
  const rearCloseDt = splitDateTime(data.rearClose);
  const bulkOpenDt = splitDateTime(data.bulkOpen);
  const bulkCloseDt = splitDateTime(data.bulkClose);
  const mainOpenDt = splitDateTime(data.mainOpen);
  const mainCloseDt = splitDateTime(data.mainClose);

  doc.setFontSize(10);

  // Row 0 Ã¢â‚¬â€œ Header: Col1-4 Front,Rear,Bulk,Main; Col5 empty; Col6 ULD; Col7 Cargo(kg); Col8 Mail(kg); Col9-10 empty
  doc.setFont('times', 'bold');
  doc.text('Front', centerX(1), cellY(0), { align: 'center' });
  doc.text('Rear', centerX(2), cellY(0), { align: 'center' });
  doc.text('Bulk', centerX(3), cellY(0), { align: 'center' });
  doc.text('Main', centerX(4), cellY(0), { align: 'center' });
  doc.text('ULD', centerX(6), cellY(0), { align: 'center' });
  doc.text('Cargo(kg)', centerX(7), cellY(0), { align: 'center' });
  doc.text('Mail(kg)', centerX(8), cellY(0), { align: 'center' });

  // Rows 1–2: Open (col0 merged rows 1–2, text vertically centered)
  doc.setFont('times', 'normal');
  doc.text('Open', colLeft(0) + c0 / 2, rowY(1) + holdRowHeights[1] / 2 + holdRowHeights[2] / 2 - 2, { align: 'center' });
  drawCellText(doc, frontOpenDt.date, centerX(1), cellY(1), c1 - 2);
  drawCellText(doc, rearOpenDt.date, centerX(2), cellY(1), c2 - 2);
  drawCellText(doc, bulkOpenDt.date, centerX(3), cellY(1), c3 - 2);
  drawCellText(doc, mainOpenDt.date, centerX(4), cellY(1), c4 - 2);
  doc.text('Arrived', colLeft(5) + pad, cellY(1), { align: 'left' });
  drawCellText(doc, String(data.uldArrived ?? ''), centerX(6), cellY(1), c6 - 2);
  drawCellText(doc, String(data.cargoArrived ?? ''), centerX(7), cellY(1), c7 - 2);
  drawCellText(doc, String(data.mailArrived ?? ''), centerX(8), cellY(1), c8 - 2);
  doc.text('Cargo pcs in', colLeft(9) + pad, cellY(1), { align: 'left' });
  drawCellText(doc, String(data.cargoPcsIn ?? ''), centerX(10), cellY(1), c10 - 2);

  drawCellText(doc, frontOpenDt.time, centerX(1), cellY(2), c1 - 2);
  drawCellText(doc, rearOpenDt.time, centerX(2), cellY(2), c2 - 2);
  drawCellText(doc, bulkOpenDt.time, centerX(3), cellY(2), c3 - 2);
  drawCellText(doc, mainOpenDt.time, centerX(4), cellY(2), c4 - 2);
  doc.text('Planned', colLeft(5) + pad, cellY(2), { align: 'left' });
  drawCellText(doc, String(data.uldPlanned ?? ''), centerX(6), cellY(2), c6 - 2);
  drawCellText(doc, String(data.cargoPlanned ?? ''), centerX(7), cellY(2), c7 - 2);
  drawCellText(doc, String(data.mailPlanned ?? ''), centerX(8), cellY(2), c8 - 2);
  doc.text('Cargo pcs out', colLeft(9) + pad, cellY(2), { align: 'left' });
  drawCellText(doc, String(data.cargoPcsOut ?? ''), centerX(10), cellY(2), c10 - 2);

  // Rows 3–4: Close (col0 merged rows 3–4, text vertically centered)
  doc.text('Close', colLeft(0) + c0 / 2, rowY(3) + holdRowHeights[3] / 2 + holdRowHeights[4] / 2 - 2, { align: 'center' });
  drawCellText(doc, frontCloseDt.date, centerX(1), cellY(3), c1 - 2);
  drawCellText(doc, rearCloseDt.date, centerX(2), cellY(3), c2 - 2);
  drawCellText(doc, bulkCloseDt.date, centerX(3), cellY(3), c3 - 2);
  drawCellText(doc, mainCloseDt.date, centerX(4), cellY(3), c4 - 2);
  doc.text('Departed', colLeft(5) + pad, cellY(3), { align: 'left' });
  drawCellText(doc, String(data.uldDeparted ?? ''), centerX(6), cellY(3), c6 - 2);
  drawCellText(doc, String(data.cargoDeparted ?? ''), centerX(7), cellY(3), c7 - 2);
  drawCellText(doc, String(data.mailDeparted ?? ''), centerX(8), cellY(3), c8 - 2);
  doc.text('Courier in', colLeft(9) + pad, cellY(3), { align: 'left' });
  drawCellText(doc, String(data.courierIn ?? ''), centerX(10), cellY(3), c10 - 2);

  drawCellText(doc, frontCloseDt.time, centerX(1), cellY(4), c1 - 2);
  drawCellText(doc, rearCloseDt.time, centerX(2), cellY(4), c2 - 2);
  drawCellText(doc, bulkCloseDt.time, centerX(3), cellY(4), c3 - 2);
  drawCellText(doc, mainCloseDt.time, centerX(4), cellY(4), c4 - 2);
  // Mail(kg) column has only three values (Arrived, Planned, Departed) - leave row 4 empty
  doc.text('Courier out', colLeft(9) + pad, cellY(4), { align: 'left' });
  drawCellText(doc, String(data.courierOut ?? ''), centerX(10), cellY(4), c10 - 2);

  // Row 5 (last row): left cell = "Last Activity time on Hold:" with date and time spaced
  const lastActivityRaw = (data.lastActivityTimeOnHold || '').trim();
  const lastActivitySpaced = lastActivityRaw.includes(' ')
    ? lastActivityRaw.replace(/\s+/, '   ') // space between date and time
    : lastActivityRaw;
  const lastActivityText = `Last Activity time on Hold: ${fhrDisplayValue(lastActivitySpaced)}`;
  const lastLines = doc.splitTextToSize(lastActivityText, lastRowLeftW);
  doc.text(lastLines[0] || lastActivityText, margin + pad, cellY(5), { align: 'left' });
  doc.text(
    `Transit Cargo: ${fhrDisplayValue(data.transitCargo)}`,
    lastRowRightStart + pad,
    cellY(5),
    { align: 'left' },
  );

  doc.setFont('times', 'normal');
  y = holdStartY + holdTotalH + 4;

  // ==================== CABIN CONFIG SECTION ====================
  // 4 rows x 13 columns. Col0: Cabin Config (rows 0-1 merged), Hold Config (rows 2-3 merged). Col4 not merged. Row0: F, C, Y, empty, Arr Hall(5-6), BMA(7-8), empty, WCH(C/S/R). Row1: Cabin F,C,Y + Date/Time Arr Hall & BMA, col9 Wheel chair(Arr.), col10-12 wchcArr,wchsArr,wchrArr. Row2: LDC,LDP,MDP, col4 First, Arr Hall Last/BMA Last data, col9 Wheel chair(Dep.), col10-12 wchcDep,wchsDep,wchrDep. Row3: Hold LDC,LDP,MDP, col4 last, col5-12 empty.
  const configRowH = 8;
  const configY = y;
  const configRows = 4;
  const configTotalH = configRows * configRowH;

  const cW = tableW / 13;
  const col4Delta = 2;
  const c4W = cW - col4Delta;
  // Arr Hall & BMA: same Date/Time widths so time column fits (Date wider, Time same as Arr Hall time)
  const dateTimeDelta = 3;
  const extraFromWch = 4; // taken from WCH/Arr-Dep column to give to date/time columns
  const c5W = cW + dateTimeDelta + extraFromWch / 4; // Arr Hall Date
  const c6W = cW - dateTimeDelta + extraFromWch / 4; // Arr Hall Time
  const c7W = cW + dateTimeDelta + extraFromWch / 4; // BMA Date
  const c8W = cW - dateTimeDelta + extraFromWch / 4; // BMA Time (same width as Arr Hall Time)
  const c9W = cW - extraFromWch; // WCH / Arr-Dep column narrower so date-time columns fit
  // C / S / R share leftover width equally (old cfgW(12) subtracted an extra cW → R collapsed into border)
  const wchDataStart =
    margin + 4 * cW + c4W + c5W + c6W + c7W + c8W + c9W;
  const wchDataTotalW =
    tableW - (4 * cW + c4W + c5W + c6W + c7W + c8W + c9W);
  const c10W = wchDataTotalW / 3;
  const c11W = wchDataTotalW / 3;
  const c12W = wchDataTotalW - c10W - c11W;
  const cfgX = (i: number) => {
    if (i <= 4) return margin + i * cW;
    if (i === 5) return margin + 4 * cW + c4W;
    if (i === 6) return margin + 4 * cW + c4W + c5W;
    if (i === 7) return margin + 4 * cW + c4W + c5W + c6W;
    if (i === 8) return margin + 4 * cW + c4W + c5W + c6W + c7W;
    if (i === 9) return margin + 4 * cW + c4W + c5W + c6W + c7W + c8W;
    if (i === 10) return wchDataStart;
    if (i === 11) return wchDataStart + c10W;
    if (i === 12) return wchDataStart + c10W + c11W;
    return margin;
  };
  const cfgW = (i: number) => {
    if (i === 4) return c4W;
    if (i === 5) return c5W;
    if (i === 6) return c6W;
    if (i === 7) return c7W;
    if (i === 8) return c8W;
    if (i === 9) return c9W;
    if (i === 10) return c10W;
    if (i === 11) return c11W;
    if (i === 12) return c12W;
    return cW;
  };
  const configRowY = (r: number) => configY + r * configRowH;
  const configCellY = (r: number) => configRowY(r) + 5;

  doc.rect(margin, configY, tableW, configTotalH);
  doc.line(cfgX(1), configRowY(1), margin + tableW, configRowY(1));
  doc.line(margin, configRowY(2), margin + tableW, configRowY(2));
  doc.line(cfgX(1), configRowY(3), margin + tableW, configRowY(3));
  doc.line(cfgX(5), configY, cfgX(5), configRowY(1));
  doc.line(cfgX(7), configY, cfgX(7), configRowY(1));
  for (let col = 1; col <= 12; col++) {
    if (col >= 5 && col <= 8) {
      doc.line(cfgX(col), configRowY(1), cfgX(col), configY + configTotalH);
    } else {
      doc.line(cfgX(col), configY, cfgX(col), configY + configTotalH);
    }
  }

  doc.setFontSize(10);
  doc.setFont('times', 'bold');

  doc.text('F', cfgX(1) + cW / 2, configCellY(0), { align: 'center' });
  doc.text('C', cfgX(2) + cW / 2, configCellY(0), { align: 'center' });
  doc.text('Y', cfgX(3) + cW / 2, configCellY(0), { align: 'center' });
  doc.text('Arr Hall', cfgX(5) + (c5W + c6W) / 2, configCellY(0), { align: 'center' });
  doc.text('BMA', cfgX(7) + (c7W + c8W) / 2, configCellY(0), { align: 'center' });
  doc.text('WCH', cfgX(9) + cfgW(9) / 2, configCellY(0), { align: 'center' });
  doc.text('C', cfgX(10) + cfgW(10) / 2, configCellY(0), { align: 'center' });
  doc.text('S', cfgX(11) + cfgW(11) / 2, configCellY(0), { align: 'center' });
  doc.text('R', cfgX(12) + cfgW(12) / 2, configCellY(0), { align: 'center' });

  const cabinConfigLines = doc.splitTextToSize('Cabin Config', cW - 4);
  const cfgLineH = 4;
  const cabinConfigY = configRowY(0) + configRowH - ((cabinConfigLines.length - 1) * cfgLineH) / 2;
  doc.text(cabinConfigLines, cfgX(0) + cW / 2, cabinConfigY, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.text('Date', cfgX(5) + c5W / 2, configCellY(1), { align: 'center' });
  doc.text('Time', cfgX(6) + c6W / 2, configCellY(1), { align: 'center' });
  doc.text('Date', cfgX(7) + c7W / 2, configCellY(1), { align: 'center' });
  doc.text('Time', cfgX(8) + c8W / 2, configCellY(1), { align: 'center' });
  doc.setFontSize(9);
  const wchArrLines = doc.splitTextToSize('Arr', c9W - 4);
  doc.text(wchArrLines[0] ?? 'Arr', cfgX(9) + c9W / 2, configCellY(1), { align: 'center' });
  doc.setFontSize(10);
  doc.text(fhrDisplayValue(data.cabinConfigF), cfgX(1) + cW / 2, configCellY(1), { align: 'center' });
  doc.text(fhrDisplayValue(data.cabinConfigC), cfgX(2) + cW / 2, configCellY(1), { align: 'center' });
  doc.text(fhrDisplayValue(data.cabinConfigY), cfgX(3) + cW / 2, configCellY(1), { align: 'center' });
  doc.text(fhrDisplayValue(data.wchcArr), cfgX(10) + cfgW(10) / 2, configCellY(1), { align: 'center' });
  doc.text(fhrDisplayValue(data.wchsArr), cfgX(11) + cfgW(11) / 2, configCellY(1), { align: 'center' });
  doc.text(fhrDisplayValue(data.wchrArr), cfgX(12) + cfgW(12) / 2, configCellY(1), { align: 'center' });

  doc.setFont('times', 'bold');
  const holdConfigLines = doc.splitTextToSize('Hold Config', cW - 4);
  const holdConfigY = configRowY(2) + configRowH - ((holdConfigLines.length - 1) * cfgLineH) / 2;
  doc.text(holdConfigLines, cfgX(0) + cW / 2, holdConfigY, { align: 'center' });
  doc.text('LDC', cfgX(1) + pad, configCellY(2));
  doc.text('LDP', cfgX(2) + pad, configCellY(2));
  doc.text('MDP', cfgX(3) + pad, configCellY(2));
  doc.setFont('times', 'normal');
  doc.text('First', cfgX(4) + c4W / 2, configCellY(2), { align: 'center' });
  doc.setFontSize(9);
  const wchDepLines = doc.splitTextToSize('Dep', c9W - 4);
  doc.text(wchDepLines[0] ?? 'Dep', cfgX(9) + c9W / 2, configCellY(2), { align: 'center' });
  doc.setFontSize(10);
  doc.text(fhrDisplayValue(data.wchcDep), cfgX(10) + cfgW(10) / 2, configCellY(2), { align: 'center' });
  doc.text(fhrDisplayValue(data.wchsDep), cfgX(11) + cfgW(11) / 2, configCellY(2), { align: 'center' });
  doc.text(fhrDisplayValue(data.wchrDep), cfgX(12) + cfgW(12) / 2, configCellY(2), { align: 'center' });
  const arrHallFirstDt = splitDateTime(data.arrHallFirst);
  const bmaFirstDt = splitDateTime(data.bmaFirst);
  doc.setFontSize(9);
  const cfgDt = (t: string, cx: number) => {
    const w = cfgW(cx);
    const display = fhrDisplayValue(t);
    doc.text(display, cfgX(cx) + w / 2, configCellY(2), { align: 'center' });
  };
  cfgDt(arrHallFirstDt.date, 5);
  cfgDt(arrHallFirstDt.time, 6);
  cfgDt(bmaFirstDt.date, 7);
  cfgDt(bmaFirstDt.time, 8);
  doc.setFontSize(10);

  doc.text(fhrDisplayValue(data.holdConfigLDC), cfgX(1) + cW / 2, configCellY(3), { align: 'center' });
  doc.text(fhrDisplayValue(data.holdConfigLDP), cfgX(2) + cW / 2, configCellY(3), { align: 'center' });
  doc.text(fhrDisplayValue(data.holdConfigMDP), cfgX(3) + cW / 2, configCellY(3), { align: 'center' });
  doc.text('last', cfgX(4) + c4W / 2, configCellY(3), { align: 'center' });
  const arrHallLastDt = splitDateTime(data.arrHallLast);
  const bmaLastDt = splitDateTime(data.bmaLast);
  doc.setFontSize(9);
  const cfgDt3 = (t: string, cx: number) => {
    const w = cfgW(cx);
    const display = fhrDisplayValue(t);
    doc.text(display, cfgX(cx) + w / 2, configCellY(3), { align: 'center' });
  };
  cfgDt3(arrHallLastDt.date, 5);
  cfgDt3(arrHallLastDt.time, 6);
  cfgDt3(bmaLastDt.date, 7);
  cfgDt3(bmaLastDt.time, 8);
  doc.setFontSize(10);

  y = configY + configTotalH + 5;

  // ==================== REMARKS ====================
  const remarksH = 24;
  const remarksGap = 6;
  const remarksW = (tableW - remarksGap) / 2;

  doc.setFont('times', 'bold');
  doc.setFontSize(9);
  doc.text('GH Remarks :-', margin + pad, y, { align: 'left' });
  doc.text('Airline Remarks :-', margin + remarksW + remarksGap + pad, y, { align: 'left' });
  y += 3;

  doc.rect(margin, y, remarksW, remarksH);
  doc.rect(margin + remarksW + remarksGap, y, remarksW, remarksH);

  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  if (isFhrFieldEmpty(data.ghRemarks)) {
    doc.text(FHR_EMPTY_DASH, margin + remarksW / 2, y + remarksH / 2 + 1, { align: 'center' });
  } else {
    drawWrappedTextInBox(doc, data.ghRemarks || '', margin, y, remarksW, remarksH, pad);
  }
  if (isFhrFieldEmpty(data.airlineRemarks)) {
    doc.text(
      FHR_EMPTY_DASH,
      margin + remarksW + remarksGap + remarksW / 2,
      y + remarksH / 2 + 1,
      { align: 'center' },
    );
  } else {
    drawWrappedTextInBox(
      doc,
      data.airlineRemarks || '',
      margin + remarksW + remarksGap,
      y,
      remarksW,
      remarksH,
      pad,
    );
  }

  y += remarksH + 5;

  // ==================== SIGNATURE ====================
  const sigH = 41;
  const sigBoxW = 50;
  const sigBoxH = 18;

  const ghSignedName = (signatureView?.gh.name ?? '').trim() || ghRepDisplay;
  const airlineSignedName =
    (signatureView?.airline.name ?? '').trim() || airlineRepDisplay;
  const fmtSignedAt = formatSignedAt;
  const placeSignatureImage = (dataUrl: string | undefined, boxX: number) =>
    placeSignatureInBox(doc, dataUrl, boxX + 1, y + 5, sigBoxW - 2, sigBoxH - 2);

  doc.rect(margin, y, remarksW, sigH);
  doc.rect(margin + remarksW + remarksGap, y, remarksW, sigH);

  // GH Signature - labels left-aligned
  const ghCenterX = margin + remarksW / 2;
  const ghBoxX = ghCenterX - sigBoxW / 2;
  doc.rect(ghBoxX, y + 4, sigBoxW, sigBoxH);
  placeSignatureImage(signatureView?.gh.signatureUrl, ghBoxX);
  doc.setFont('times', 'bold');
  doc.setFontSize(9);
  doc.text('Signature', margin + pad, y + sigBoxH + 8, { align: 'left' });
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text(`GH Representative : ${fhrDisplayValue(ghSignedName)}`, margin + pad, y + sigBoxH + 13, { align: 'left' });
  const ghSignedTs = fmtSignedAt(signatureView?.gh.signedAt);
  if (ghSignedTs) {
    doc.setFontSize(7.5);
    doc.text(`Signed: ${ghSignedTs}`, margin + pad, y + sigBoxH + 18, { align: 'left' });
    doc.setFontSize(9);
  }

  // Airline Signature
  const airlineColX = margin + remarksW + remarksGap;
  const airlineBoxX = airlineColX + remarksW / 2 - sigBoxW / 2;
  doc.rect(airlineBoxX, y + 4, sigBoxW, sigBoxH);
  placeSignatureImage(signatureView?.airline.signatureUrl, airlineBoxX);
  doc.setFont('times', 'bold');
  doc.text('Signature', airlineColX + pad, y + sigBoxH + 8, { align: 'left' });
  doc.setFont('times', 'normal');
  doc.text(`Airline Representative : ${fhrDisplayValue(airlineSignedName)}`, airlineColX + pad, y + sigBoxH + 13, { align: 'left' });
  const airlineSignedTs = fmtSignedAt(signatureView?.airline.signedAt);
  if (airlineSignedTs) {
    doc.setFontSize(7.5);
    doc.text(`Signed: ${airlineSignedTs}`, airlineColX + pad, y + sigBoxH + 18, { align: 'left' });
    doc.setFontSize(9);
  }

  y += sigH + 5;

  // ==================== FOOTER ====================
  doc.setDrawColor(0, 0, 0);
  doc.line(margin, y, margin + tableW, y);
  y += 5;

  const now = new Date();
  const printedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
  
  const verifiedByName = loggedInUserName || data.verifiedBy || '';
  const verifiedDate = data.verifiedDate ? formatDisplayDate(data.verifiedDate) : `${now.getDate()} ${now.toLocaleString('en-US', { month: 'short' })} ${now.getFullYear()}`;

  doc.setFontSize(9);
  doc.text(`Verified by : ${verifiedByName} - ${verifiedDate}`, margin + pad, y, { align: 'left' });
  doc.text(`Printed On : Date/Time : ${printedDate}`, pageW / 2, y, { align: 'center' });

  return doc;
}

export async function downloadRampDutyAllocationPdf(
  flight: FlightData,
  allocations: EmployeeAllocationRowData[] = [],
): Promise<void> {
  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 14;
  const lineH = 6;
  const margin = 14;
  const pageH = doc.internal.pageSize.getHeight();

  const fhrNo = formatReportSerialNo(flight.slNo);
  const airline = flight.airline || '';
  const flightNo = flight.flightNo || '';
  const aircraft = flight.aircraft || '';
  const operation = flight.flightType || '';
  const staDate = flight.staDate ? formatDisplayDate(flight.staDate) : '';
  const staTime = flight.staTime || '';
  const stdDate = flight.stdDate ? formatDisplayDate(flight.stdDate) : '';
  const stdTime = flight.stdTime || '';
  const routing = String(flight.destination ?? '');
  // STA, ATA, ETA date same (use STA date)
  const ataDate = staDate;
  const ataTime = staTime;

  doc.setFontSize(16);
  doc.setFont('times', 'bold');
  doc.text('Ramp Duty Allocation', margin, y);
  y += lineH + 4;

  doc.setFontSize(10);
  doc.setFont('times', 'normal');
  const labels = [
    ['FHR No', fhrNo, 'Airline', airline, 'Flight No.', flightNo],
    ['Aircraft', aircraft, 'Operation', operation, 'STA Date', staDate],
    ['STA Time', staTime, 'STD Date', stdDate, 'STD Time', stdTime],
    ['Routing', routing, 'ATA Date', ataDate, 'ATA Time', ataTime],
    ['ATD Date', stdDate, 'ATD Time', stdTime, '', ''],
  ];
  labels.forEach((row) => {
    let x = margin;
    for (let i = 0; i < row.length; i += 2) {
      if (row[i]) {
        doc.setFont('times', 'normal');
        doc.text(`${row[i]} : `, x, y);
        const tw = doc.getTextWidth(`${row[i]} : `);
        doc.setFont('times', 'bold');
        doc.text(String(row[i + 1] ?? ''), x + tw, y);
        doc.setFont('times', 'normal');
        x += (pageW - 2 * margin) / 3;
      }
    }
    y += lineH;
  });
  y += 4;

  const colW = [28, 38, 25, 38, 45];
  const tableX = margin;
  const headers = ['Employee Code', 'Employee Name', 'Area', 'Duty Allocation', 'Remarks'];
  const rowH = 7;

  const drawHeader = () => {
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    headers.forEach((h, i) => {
      const x = tableX + colW.slice(0, i).reduce((a, b) => a + b, 0);
      doc.rect(x, y - 4, colW[i], 8, 'S');
      doc.text(h, x + 2, y + 1);
    });
    y += 8;
    doc.setFont('times', 'normal');
  };

  drawHeader();

  const cellsFor = (row: EmployeeAllocationRowData | null) => [
    row?.employeeCode ?? '',
    row?.employeeName ?? '',
    row?.area ?? '',
    row?.dutyAllocation ?? '',
    row?.remarks ?? '',
  ];

  const drawDataRow = (cells: string[]) => {
    if (y + rowH > pageH - margin) {
      doc.addPage();
      y = margin + 4;
      drawHeader();
    }
    const rowY = y;
    cells.forEach((cell, i) => {
      const x = tableX + colW.slice(0, i).reduce((a, b) => a + b, 0);
      doc.rect(x, rowY - 4, colW[i], rowH, 'S');
      const text = String(cell ?? '');
      if (text) {
        doc.text(text.slice(0, 28), x + 2, rowY + 1);
      }
    });
    y += rowH;
  };

  if (allocations.length === 0) {
    for (let r = 0; r < 3; r++) drawDataRow(cellsFor(null));
  } else {
    for (const row of allocations) drawDataRow(cellsFor(row));
  }

  doc.save(`Ramp-Duty-Allocation-${flight.flightNo}-${flight.slNo}.pdf`);
}

export async function downloadPlaceholderReportPdf(
  flight: FlightData,
  reportTitle: string,
): Promise<void> {
  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  let y = 20;
  doc.setFontSize(16);
  doc.setFont('times', 'bold');
  doc.text(reportTitle, margin, y);
  y += 12;
  doc.setFontSize(10);
  doc.setFont('times', 'normal');
  doc.text(formatReportSerialNoLabel(flight.slNo), margin, y);
  doc.text(`Airline : ${flight.airline}`, margin, y + 6);
  doc.text(`Flight No. : ${flight.flightNo}`, margin, y + 12);
  doc.text('This report format will be available in a future update.', margin, y + 24);
  doc.save(`${reportTitle.replace(/\s+/g, '-')}-${flight.flightNo}-${flight.slNo}.pdf`);
}

export async function sendFlightReportEmail(
  flight: FlightData,
  recipientEmail: string,
  mainDetails?: MainDetailsData | null,
  loggedInUserName?: string
): Promise<boolean> {
  try {
    const serial = nsFormSerialForFlight(flight);
    if (!serial?.trim()) return false;

    const doc = await downloadMainReportPdf(flight, mainDetails, loggedInUserName);
    const dataUri = doc.output('datauristring');
    const pdfBase64 = dataUri.includes(',') ? dataUri.split(',')[1] : '';
    if (!pdfBase64) return false;

    const flightNo = flight.flightNo || '';
    const airline = flight.airline || '';
    const base = getApiBase().replace(/\/$/, '');
    const response = await frisFetch(
      `${base}/fhr-collection/flight/${encodeURIComponent(serial)}/send-report-email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail,
          pdfBase64,
          pdfFilename: `FHR-Report-${flightNo}-${serial}.pdf`,
          flightNo,
          airline,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      let message = 'Failed to send email. Please try again.';
      try {
        const json = JSON.parse(text) as { message?: string | string[] };
        if (Array.isArray(json.message)) message = json.message.join(', ');
        else if (json.message) message = json.message;
      } catch {
        if (text.trim()) message = text.trim().slice(0, 300);
      }
      throw new Error(message);
    }
    return true;
  } catch (error) {
    console.error('Error sending flight report email:', error);
    if (error instanceof Error && error.message && !error.message.startsWith('Failed to fetch')) {
      throw error;
    }
    return false;
  }
}

export async function downloadAndSaveMainReportPdf(
  flight: FlightData, 
  mainDetails?: MainDetailsData | null,
  loggedInUserName?: string
): Promise<void> {
  const doc = await downloadMainReportPdf(flight, mainDetails, loggedInUserName);
  doc.save(`Flight-Report-${flight.flightNo}-${flight.slNo}.pdf`);
}

/** Download and save FHR (Flight Handling Report) as a separate PDF file. */
export async function downloadFhrReportPdf(
  flight: FlightData,
  mainDetails?: MainDetailsData | null,
  loggedInUserName?: string,
  nonScheduledHeader?: NonScheduledReportHeaderData,
  reportOverrides?: Partial<FlightReportData> | null,
): Promise<void> {
  const doc = await downloadMainReportPdf(
    flight,
    mainDetails,
    loggedInUserName,
    reportOverrides ?? null,
    nonScheduledHeader,
  );
  doc.save(`FHR-Report-${flight.flightNo}-${flight.slNo}.pdf`);
}

