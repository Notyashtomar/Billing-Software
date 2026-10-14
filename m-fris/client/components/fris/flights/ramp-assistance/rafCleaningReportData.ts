import type { FlightData, MainDetailsData } from '@/utils/dataProcessor';
import type { ResolvedFhrSignatures } from '@/lib/api';

export type RafCleaningReportKind = 'deep' | 'night-halt' | 'exterior';

export type RafCleaningReportSignature = {
  name: string;
  signatureUrl: string;
  signedAt: string;
};

export type RafCleaningReportData = {
  kind: RafCleaningReportKind;
  title: string;
  airline: string;
  airlineCode: string;
  flightNo: string;
  aircraftType: string;
  registration: string;
  route: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  ataDate: string;
  ataTime: string;
  atdDate: string;
  atdTime: string;
  startedFrom: string;
  cleaningEnded: string;
  duration: string;
  cleaningSupervisor: string;
  remarks: string;
  serialNo: string;
  ghRepName: string;
  airlineRepName: string;
  ghSignature: RafCleaningReportSignature | null;
  airlineSignature: RafCleaningReportSignature | null;
};

export const RAF_CLEANING_REPORT_TITLES: Record<RafCleaningReportKind, string> = {
  deep: 'Deep Cleaning',
  'night-halt': 'Night Halt Cleaning',
  exterior: 'Exterior Cleaning',
};

const KIND_PAYLOAD_KEY: Record<RafCleaningReportKind, 'deep' | 'nightHalt' | 'exterior'> = {
  deep: 'deep',
  'night-halt': 'nightHalt',
  exterior: 'exterior',
};

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function combineDateTime(date: string, time: string): string {
  const d = str(date);
  const t = str(time);
  if (d && t) return `${d} ${t}`;
  return d || t;
}

function calcDurationHhMm(fromTime: string, toTime: string): string {
  const parse = (t: string): number | null => {
    const parts = str(t).split(':').map(Number);
    if (parts.length < 2) return null;
    const [h, m] = parts;
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return null;
    }
    return h * 60 + m;
  };
  const fromMins = parse(fromTime);
  const toMins = parse(toTime);
  if (fromMins == null || toMins == null) return '';
  let diff = toMins - fromMins;
  if (diff < 0) diff += 24 * 60;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Build RAF View-column cleaning report model from flight row + optional FHR lean doc.
 */
export function buildRafCleaningReportData(input: {
  flight: FlightData;
  kind: RafCleaningReportKind;
  mainDetails?: MainDetailsData | null;
  fhr?: Record<string, unknown> | null;
  signatures?: ResolvedFhrSignatures | null;
}): RafCleaningReportData {
  const { flight, kind, mainDetails, fhr, signatures } = input;
  const md =
    fhr?.mainDetails && typeof fhr.mainDetails === 'object' && !Array.isArray(fhr.mainDetails)
      ? (fhr.mainDetails as Record<string, unknown>)
      : null;
  const ramp =
    fhr?.rampDetails1 && typeof fhr.rampDetails1 === 'object' && !Array.isArray(fhr.rampDetails1)
      ? (fhr.rampDetails1 as Record<string, unknown>)
      : null;
  const adhoc =
    fhr?.rafAdhocDetails &&
    typeof fhr.rafAdhocDetails === 'object' &&
    !Array.isArray(fhr.rafAdhocDetails)
      ? (fhr.rafAdhocDetails as Record<string, unknown>)
      : null;
  const cleaningStore =
    fhr?.rafCleaningServices &&
    typeof fhr.rafCleaningServices === 'object' &&
    !Array.isArray(fhr.rafCleaningServices)
      ? (fhr.rafCleaningServices as Record<string, unknown>)
      : null;
  const entryRaw = cleaningStore?.[KIND_PAYLOAD_KEY[kind]];
  const entry =
    entryRaw && typeof entryRaw === 'object' && !Array.isArray(entryRaw)
      ? (entryRaw as Record<string, unknown>)
      : null;

  const fromDate = str(entry?.fromDate ?? ramp?.CleaningFr ?? ramp?.cleaningStartedDate);
  const fromTime = str(entry?.fromTime ?? ramp?.cleaningStartedTime);
  const toDate = str(entry?.toDate ?? ramp?.CleaningTo ?? ramp?.cleaningClosedDate);
  const toTime = str(entry?.toTime ?? ramp?.cleaningClosedTime);
  const duration =
    str(entry?.duration) ||
    str(ramp?.cleaningDuration) ||
    calcDurationHhMm(fromTime, toTime);

  const airline =
    str(mainDetails?.airlineName) ||
    str(md?.Airline) ||
    str(md?.airlineName) ||
    str(adhoc?.airline) ||
    str(flight.airline);
  const airlineCode =
    str(flight.airlineCode) ||
    str(md?.Arline_Code) ||
    str(adhoc?.airlineCode);
  const flightNo =
    str(mainDetails?.flightCode) ||
    str(md?.FlightNo) ||
    str(md?.flightCode) ||
    str(adhoc?.flightNo) ||
    str(flight.flightNo);
  const aircraftType =
    str(mainDetails?.aircraftType) ||
    str(md?.TypeCraft) ||
    str(md?.aircraftType) ||
    str(adhoc?.aircraft) ||
    str(flight.aircraft);
  const registration = str(md?.Regn) || str(adhoc?.registration);
  const route =
    str(md?.Route) || str(adhoc?.routing) || str(flight.route);

  const ghRepName =
    str(signatures?.gh.name) ||
    str(adhoc?.ghRep) ||
    str(md?.PAX_Airline_SignByDate) ||
    str(md?.ghRep);
  const airlineRepName =
    str(signatures?.airline.name) ||
    str(adhoc?.airlineRep) ||
    str(md?.airrep) ||
    str(md?.airlineRep);

  const ghSignatureUrl = str(signatures?.gh.signatureUrl);
  const airlineSignatureUrl = str(signatures?.airline.signatureUrl);

  return {
    kind,
    title: RAF_CLEANING_REPORT_TITLES[kind],
    airline,
    airlineCode,
    flightNo,
    aircraftType,
    registration,
    route,
    staDate: str(md?.STADate ?? adhoc?.staDate ?? flight.staDate),
    staTime: str(md?.STATime ?? adhoc?.staTime ?? flight.staTime),
    stdDate: str(md?.STDDate ?? adhoc?.stdDate ?? flight.stdDate),
    stdTime: str(md?.STDTime ?? adhoc?.stdTime ?? flight.stdTime),
    ataDate: str(md?.ATADate ?? adhoc?.ataDate ?? flight.staDate),
    ataTime: str(md?.ATATime ?? adhoc?.ataTime ?? flight.staTime),
    atdDate: str(md?.ATDDate ?? adhoc?.atdDate ?? flight.stdDate),
    atdTime: str(md?.ATDTime ?? adhoc?.atdTime ?? flight.stdTime),
    startedFrom: combineDateTime(fromDate, fromTime),
    cleaningEnded: combineDateTime(toDate, toTime),
    duration,
    cleaningSupervisor: str(
      entry?.supervisor ?? ramp?.cleaningSupervisor ?? ramp?.supervisor,
    ),
    remarks: str(entry?.remarks ?? ramp?.cleaningRemarks ?? adhoc?.ghRemarks),
    serialNo: str(flight.slNo),
    ghRepName,
    airlineRepName,
    ghSignature: ghSignatureUrl
      ? {
          name: ghRepName,
          signatureUrl: ghSignatureUrl,
          signedAt: str(signatures?.gh.signedAt),
        }
      : null,
    airlineSignature: airlineSignatureUrl
      ? {
          name: airlineRepName,
          signatureUrl: airlineSignatureUrl,
          signedAt: str(signatures?.airline.signedAt),
        }
      : null,
  };
}

export const RAF_CLEANING_SOP_STATEMENT =
  'has been carried out in accordance with the Airline-approved Standard Operating Procedures (SOP), and the SOP form has been duly completed and signed by our authorized staff.';
