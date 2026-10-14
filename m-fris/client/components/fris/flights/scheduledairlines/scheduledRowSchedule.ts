import type { FlightData, MainDetailsData } from '@/utils/dataProcessor';
import {
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import { displayFlightNoFromScheduleData } from '@/lib/schedule-flight-no-display';

/** GET `/raw-flight-data/by-serial/:serialNo` response shape. */
export type ScheduleFieldsFromRawApi = {
  staDate?: string;
  stdDate?: string;
  staTime?: string;
  stdTime?: string;
  scheduleSource?: string;
};

/**
 * STA / STD date strings exactly as shown on the scheduled airlines table (raw row).
 */
export function scheduleStaDateFromRow(flight: FlightData): string {
  return (flight.staDate ?? '').trim();
}

export function scheduleStdDateFromRow(flight: FlightData): string {
  return (flight.stdDate ?? '').trim();
}

/** STA time as on the table (raw). */
export function scheduleStaTimeRawFromRow(flight: FlightData): string {
  return (flight.staTime ?? '').trim();
}

/** STD time as on the table (raw). */
export function scheduleStdTimeRawFromRow(flight: FlightData): string {
  return (flight.stdTime ?? '').trim();
}

/** Prefer currently visible table row; fallback to API schedule when row value is missing. */
export function scheduleStaDateDisplay(
  flight: FlightData,
  raw: ScheduleFieldsFromRawApi | null,
): string {
  const row = scheduleStaDateFromRow(flight);
  if (row) return row;
  const r = raw?.staDate?.trim();
  if (r) return r;
  return '';
}

export function scheduleStdDateDisplay(
  flight: FlightData,
  raw: ScheduleFieldsFromRawApi | null,
): string {
  const row = scheduleStdDateFromRow(flight);
  if (row) return row;
  const r = raw?.stdDate?.trim();
  if (r) return r;
  return '';
}

/** HH:mm for TimeSelect24 from row time (falls back 00:00). */
export function scheduleStaTimeNormalized(flight: FlightData): string {
  return normalizeTimeToHHmm(flight.staTime);
}

export function scheduleStdTimeNormalized(flight: FlightData): string {
  return normalizeTimeToHHmm(flight.stdTime);
}

export function scheduleStaTimeNormalizedDisplay(
  flight: FlightData,
  raw: ScheduleFieldsFromRawApi | null,
): string {
  const row = scheduleStaTimeRawFromRow(flight);
  if (row) return normalizeTimeToHHmm(row);
  const r = raw?.staTime?.trim();
  if (r) return normalizeTimeToHHmm(r);
  return '00:00';
}

export function scheduleStdTimeNormalizedDisplay(
  flight: FlightData,
  raw: ScheduleFieldsFromRawApi | null,
): string {
  const row = scheduleStdTimeRawFromRow(flight);
  if (row) return normalizeTimeToHHmm(row);
  const r = raw?.stdTime?.trim();
  if (r) return normalizeTimeToHHmm(r);
  return '00:00';
}

export function scheduleStaTimeRawDisplay(
  flight: FlightData,
  raw: ScheduleFieldsFromRawApi | null,
): string {
  const row = scheduleStaTimeRawFromRow(flight);
  if (row) return row;
  const r = raw?.staTime?.trim();
  if (r) return r;
  return '';
}

export function scheduleStdTimeRawDisplay(
  flight: FlightData,
  raw: ScheduleFieldsFromRawApi | null,
): string {
  const row = scheduleStdTimeRawFromRow(flight);
  if (row) return row;
  const r = raw?.stdTime?.trim();
  if (r) return r;
  return '';
}

export function normalizeTimeToHHmm(t: string | undefined): string {
  if (!t?.trim()) return '00:00';
  const normalized = t.trim().replace(/\./g, ':');
  const parts = normalized.split(':').map((p) => p.trim());
  if (parts.length >= 2) {
    const h = parts[0].padStart(2, '0').slice(0, 2);
    const m = parts[1].padStart(2, '0').slice(0, 2);
    return `${h}:${m}`;
  }
  return '00:00';
}

/** Query params for equipment/GSE report pages (serial + visible schedule row fields). */
export function buildScheduledEquipmentReportSearchParams(
  flight: FlightData,
  options?: { reportType?: 'summary' | 'detailed'; mainDetails?: MainDetailsData | null },
): URLSearchParams {
  const instanceSl = String(flight.slNo ?? '').trim();
  const apiSerial = String(nsFormSerialForFlight(flight) ?? '').trim() || instanceSl;
  const mainDetails = options?.mainDetails;
  const flightNo = (
    displayFlightNoFromScheduleData({
      flightNo: mainDetails?.flightCode ?? flight.flightNo,
      ArrivalFltNo: mainDetails?.arrivalFlightNo,
      DepartureFltNo: mainDetails?.departureFlightNo,
      airlineCode: flight.airlineCode,
      ifOperationSplit: mainDetails?.ifOperationSplit,
    }) ||
    flight.flightNo ||
    ''
  ).trim();
  const airline = (mainDetails?.airlineName ?? flight.airline ?? '').trim();
  const aircraft = (mainDetails?.aircraftType ?? flight.aircraft ?? '').trim();
  const staDate = scheduleStaDateDisplay(flight, null);
  const stdDate = scheduleStdDateDisplay(flight, null);
  const staTime = scheduleStaTimeRawDisplay(flight, null);
  const stdTime = scheduleStdTimeRawDisplay(flight, null);

  const params = new URLSearchParams({
    flightSlNo: apiSerial,
    tableSerial: displayScheduledAirlinesTableSerial(flight),
  });
  if (options?.reportType) params.set('reportType', options.reportType);
  if (instanceSl && apiSerial && instanceSl !== apiSerial) {
    params.set('instanceSlNo', instanceSl);
  }
  if (flightNo) params.set('flightNo', flightNo);
  if (airline) params.set('airline', airline);
  if (aircraft) params.set('aircraft', aircraft);
  if (staDate) params.set('staDate', staDate);
  if (stdDate) params.set('stdDate', stdDate);
  if (staTime) params.set('staTime', staTime);
  if (stdTime) params.set('stdTime', stdTime);
  return params;
}

