import { fetchNsRawFormData } from '@/lib/api';
import {
  normalizeLoadControlDetailsData,
  normalizeMainDetailsData,
  normalizeRampDetails1Data,
  normalizeRemarksData,
  normalizeTerminalDetailsData,
} from '@/utils/dataProcessor';
import {
  buildEquipmentReportPdfForFlight,
  buildScheduledTeamReportPdfFromFhrEmbed,
  downloadMainReportPdf,
} from '../scheduledairlines/reportsPdf';
import type { NonScheduledReportHeaderData } from '../scheduledairlines/reportPdfUtils';
import type { FlightReportData } from '../scheduledairlines/fhrReportPdf';
import { adaptNonScheduledFlight } from './adaptNonScheduledFlight';
import type { NonScheduledFlightData } from './types';

export type NonScheduledReportType = 'fhr' | 'gse' | 'team';

function pickStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function pickNum(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) {
      const n = Number(s);
      if (!Number.isNaN(n)) return n;
    }
  }
  return undefined;
}

/**
 * Build PDF overrides from NS form collections so FHR report matches Open-form data
 * even when flight-report API is thin (connectivity: forms → PDF).
 */
export function buildReportOverridesFromForms(opts: {
  main: ReturnType<typeof normalizeMainDetailsData>;
  terminal: ReturnType<typeof normalizeTerminalDetailsData>;
  ramp: ReturnType<typeof normalizeRampDetails1Data>;
  load: ReturnType<typeof normalizeLoadControlDetailsData>;
  remarks: ReturnType<typeof normalizeRemarksData>;
}): Partial<FlightReportData> {
  const { main, terminal, ramp, load, remarks } = opts;
  return {
    airlineName: pickStr(main?.airlineName),
    aircraftType: pickStr(main?.aircraftType),
    aircraftRegnNo: pickStr(main?.regnNo),
    terminalCode: pickStr(main?.terminalCode),
    ataDate: pickStr(main?.ataDate),
    ataTime: pickStr(main?.ataTime),
    atdDate: pickStr(main?.atdDate),
    atdTime: pickStr(main?.atdTime),
    etdTime: pickStr(main?.etdTime),
    ops: (() => {
      const raw = pickStr(main?.ops);
      if (raw && !/non[-\s]?scheduled/i.test(raw)) return raw;
      return undefined;
    })(),
    typeOfHandling: pickStr(main?.typeOfHandling),
    status: pickStr(main?.departureStatus),
    totalDelay: pickStr(main?.arrivalDelay),
    mtow: pickStr(main?.mtow),
    igmNo: pickStr(terminal?.igm),
    egmNo: pickStr(terminal?.egm),
    gateNo: pickStr(terminal?.gateFinal, terminal?.gatePlanned),
    cntOpened: pickStr(terminal?.counterOpen),
    cntClosed: pickStr(terminal?.counterClose),
    boardingOpened: pickStr(terminal?.boardingOpen),
    boardingClosed: pickStr(terminal?.boardingClose),
    arrivalPax: pickNum(terminal?.passengerArrived),
    departurePax: pickNum(terminal?.departed),
    cabinConfigF: pickNum(terminal?.cabinBreakupF),
    cabinConfigC: pickNum(terminal?.cabinBreakupC),
    cabinConfigY: pickNum(terminal?.cabinBreakupY),
    wchcArr: pickNum(terminal?.arrivalWheelChairC),
    wchsArr: pickNum(terminal?.arrivalWheelChairS),
    wchrArr: pickNum(terminal?.arrivalWheelChairR),
    wchcDep: pickNum(terminal?.departureWheelChairC),
    wchsDep: pickNum(terminal?.departureWheelChairS),
    wchrDep: pickNum(terminal?.departureWheelChairR),
    adcNo: pickStr(load?.adc),
    ficNo: pickStr(load?.fic),
    bayNo: pickStr(ramp?.bayFinal, ramp?.bayPlanned),
    // Ramp Bay & Baggage: Arrival Bag (airlinecount → arrivalBag), Departure bags (arrivalBaggageCount)
    arrivalBag: pickNum(ramp?.arrivalBag),
    departureBag: pickNum(ramp?.arrivalBaggageCount),
    cleaningFrom: pickStr(ramp?.cleaningStartedDate, ramp?.cleaningStartedTime),
    cleaningTo: pickStr(ramp?.cleaningClosedDate, ramp?.cleaningClosedTime),
    frontOpen: pickStr(ramp?.holdOpenFrontDate, ramp?.holdOpenFrontTime),
    frontClose: pickStr(ramp?.holdCloseFrontDate, ramp?.holdCloseFrontTime),
    rearOpen: pickStr(ramp?.holdOpenRearDate, ramp?.holdOpenRearTime),
    rearClose: pickStr(ramp?.holdCloseRearDate, ramp?.holdCloseRearTime),
    bulkOpen: pickStr(ramp?.holdOpenBulkDate, ramp?.holdOpenBulkTime),
    bulkClose: pickStr(ramp?.holdCloseBulkDate, ramp?.holdCloseBulkTime),
    mainOpen: pickStr(ramp?.holdOpenMainDeckDate, ramp?.holdOpenMainDeckTime),
    mainClose: pickStr(ramp?.holdCloseMainDeckDate, ramp?.holdCloseMainDeckTime),
    uldArrived: pickNum(ramp?.arrivalUldCount),
    uldPlanned: pickNum(ramp?.depPlannedUldCount),
    uldDeparted: pickNum(ramp?.depActualUldCount),
    cargoArrived: pickNum(ramp?.arrivalCargoWeight),
    cargoPlanned: pickNum(ramp?.depPlannedCargoWeight),
    cargoDeparted: pickNum(ramp?.depActualCargoWeight),
    mailArrived: pickNum(ramp?.arrivalMailWeight),
    mailPlanned: pickNum(ramp?.depPlannedMailWeight),
    mailDeparted: pickNum(ramp?.depActualMailWeight),
    cargoPcsIn: pickNum(ramp?.cgoPcsIn),
    cargoPcsOut: pickNum(ramp?.cgoPcsOut),
    courierIn: pickNum(ramp?.courierPcsIn),
    courierOut: pickNum(ramp?.courierPcsOut),
    holdConfigLDC: pickNum(ramp?.ldc),
    holdConfigLDP: pickNum(ramp?.ldp),
    holdConfigMDP: pickNum(ramp?.mdp),
    ghRemarks: pickStr(remarks?.ghRemarks),
    airlineRemarks: pickStr(remarks?.airlineRemarks, remarks?.airrep),
    ghRepName: pickStr(remarks?.ghRep),
    airlineRepName: pickStr(remarks?.airlineRep, remarks?.airrep),
  };
}

/** Load NS Open-form slices (hydrate from ns_fhr when form collections empty). */
export async function fetchNsFormReportPayload(serial: string): Promise<{
  main: ReturnType<typeof normalizeMainDetailsData>;
  reportOverrides: Partial<FlightReportData>;
  reportHeaderExtras: Pick<
    NonScheduledReportHeaderData,
    'challanNo' | 'bookingNo' | 'operation' | 'mtow' | 'operator'
  >;
}> {
  const [mainRaw, terminalRaw, rampRaw, loadRaw, remarksRaw] = await Promise.all([
    fetchNsRawFormData('main-details', serial),
    fetchNsRawFormData('terminal-details', serial),
    fetchNsRawFormData('ramp-details', serial),
    fetchNsRawFormData('load-control-details', serial),
    fetchNsRawFormData('remarks-details', serial),
  ]);

  const main = normalizeMainDetailsData(mainRaw);
  const terminal = normalizeTerminalDetailsData(terminalRaw);
  const ramp = normalizeRampDetails1Data(rampRaw);
  const load = normalizeLoadControlDetailsData(loadRaw);
  const remarks = normalizeRemarksData(remarksRaw);
  const savedOps = String(main?.ops ?? '').trim();
  const operation =
    savedOps && !/non[-\s]?scheduled/i.test(savedOps) ? savedOps : 'Turnaround';

  return {
    main,
    reportOverrides: buildReportOverridesFromForms({
      main,
      terminal,
      ramp,
      load,
      remarks,
    }),
    reportHeaderExtras: {
      challanNo: pickStr(main?.challanNo),
      bookingNo: pickStr(main?.bookingNo),
      operation,
      mtow: main?.mtow,
      operator: pickStr(main?.operator),
    },
  };
}

/** Same FHR PDF as download — no save (used by on-screen preview). */
export async function buildNonScheduledFhrPdf(flight: NonScheduledFlightData) {
  const serial = String(flight.flightSerialNo ?? flight.sNo);
  const { main: savedMainDetails, reportOverrides, reportHeaderExtras } =
    await fetchNsFormReportPayload(serial);

  const adaptedFlight = adaptNonScheduledFlight(flight);
  const reportHeader: NonScheduledReportHeaderData = {
    challanNo: reportHeaderExtras.challanNo || flight.challanNo,
    bookingNo: reportHeaderExtras.bookingNo || flight.bookingNo,
    operation: reportHeaderExtras.operation,
    handlingType: 'Non-Scheduled',
    mtow: reportHeaderExtras.mtow,
    operator: reportHeaderExtras.operator || flight.operator,
  };

  return downloadMainReportPdf(
    adaptedFlight,
    savedMainDetails,
    undefined,
    reportOverrides,
    reportHeader,
  );
}

export async function downloadNonScheduledReport(
  flight: NonScheduledFlightData,
  reportType: NonScheduledReportType,
): Promise<void> {
  const serial = String(flight.flightSerialNo ?? flight.sNo);
  const { main: savedMainDetails, reportOverrides, reportHeaderExtras } =
    await fetchNsFormReportPayload(serial);

  const adaptedFlight = adaptNonScheduledFlight(flight);
  const reportHeader: NonScheduledReportHeaderData = {
    challanNo: reportHeaderExtras.challanNo || flight.challanNo,
    bookingNo: reportHeaderExtras.bookingNo || flight.bookingNo,
    operation: reportHeaderExtras.operation,
    handlingType: 'Non-Scheduled',
    mtow: reportHeaderExtras.mtow,
    operator: reportHeaderExtras.operator || flight.operator,
  };

  if (reportType === 'fhr') {
    const doc = await downloadMainReportPdf(
      adaptedFlight,
      savedMainDetails,
      undefined,
      reportOverrides,
      reportHeader,
    );
    doc.save(`FHR-Report-${flight.flightNo}-${serial}.pdf`);
    return;
  }

  if (reportType === 'gse') {
    const doc = await buildEquipmentReportPdfForFlight(
      adaptedFlight,
      savedMainDetails,
      undefined,
      reportHeader,
    );
    if (!doc) {
      throw new Error('No equipment or manpower data is available for this flight.');
    }
    doc.save(`GSE-Report-${flight.flightNo}-${serial}.pdf`);
    return;
  }

  const doc = await buildScheduledTeamReportPdfFromFhrEmbed(
    adaptedFlight,
    serial,
    savedMainDetails,
    reportHeader,
  );
  if (!doc) {
    throw new Error('No team allocation data is available for this flight.');
  }
  doc.save(`Team-Report-${flight.flightNo}-${serial}.pdf`);
}
