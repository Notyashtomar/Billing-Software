import { persistEquipmentReportHeaderPrefill } from '../scheduledairlines/scheduledEquipmentReportHeader';
import { adaptNonScheduledFlight } from './adaptNonScheduledFlight';
import type { NonScheduledFlightData } from './types';
import type { NonScheduledReportType } from './nonScheduledReportDownloads';

/** Session key so preview Download can rebuild the NS flight + header extras. */
export const NS_REPORT_FLIGHT_PREFILL_KEY = 'fris.nsReportFlightPrefill';

export function persistNsReportFlightPrefill(flight: NonScheduledFlightData): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(NS_REPORT_FLIGHT_PREFILL_KEY, JSON.stringify(flight));
  } catch {
    // quota / private mode
  }
}

export function readNsReportFlightPrefill(
  serialHint?: string,
): NonScheduledFlightData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(NS_REPORT_FLIGHT_PREFILL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NonScheduledFlightData;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!serialHint) return parsed;
    const stored = String(parsed.flightSerialNo ?? parsed.sNo ?? '').trim();
    const wanted = String(serialHint).trim();
    if (!wanted || !stored || stored === wanted) return parsed;
    return null;
  } catch {
    return null;
  }
}

function buildNsFhrPreviewParams(flight: NonScheduledFlightData): URLSearchParams {
  const serial = String(flight.flightSerialNo ?? flight.sNo).trim();
  const params = new URLSearchParams({
    flightSlNo: serial,
    tableSerial: serial,
    source: 'non-scheduled',
  });
  if (flight.staDate) params.set('staDate', flight.staDate);
  if (flight.staTime) params.set('staTime', flight.staTime);
  if (flight.stdDate) params.set('stdDate', flight.stdDate);
  if (flight.stdTime) params.set('stdTime', flight.stdTime);
  if (flight.routing) params.set('routing', flight.routing);
  if (flight.airline) params.set('airline', flight.airline);
  if (flight.flightNo) params.set('flightNo', flight.flightNo);
  if (flight.aircraft) params.set('aircraft', flight.aircraft);
  if (flight.challanNo) params.set('challanNo', flight.challanNo);
  if (flight.bookingNo) params.set('bookingNo', flight.bookingNo);
  if (flight.operator) params.set('operator', flight.operator);
  return params;
}

/**
 * Open the same FHR / GSE / Team preview pages used by Scheduled Airlines
 * (under Non-Scheduled-Airlines routes that reuse those screens).
 */
export function openNonScheduledReportPreview(
  flight: NonScheduledFlightData,
  reportType: NonScheduledReportType,
): void {
  persistNsReportFlightPrefill(flight);

  if (reportType === 'fhr') {
    const params = buildNsFhrPreviewParams(flight);
    window.open(
      `/fris/flights/Non-Scheduled-Airlines/fhr-report?${params.toString()}`,
      '_blank',
    );
    return;
  }

  const adapted = adaptNonScheduledFlight(flight);
  const params = persistEquipmentReportHeaderPrefill(adapted, {
    reportType: reportType === 'gse' ? 'summary' : 'detailed',
  });
  params.set('source', 'non-scheduled');
  if (flight.challanNo) params.set('challanNo', flight.challanNo);
  if (flight.bookingNo) params.set('bookingNo', flight.bookingNo);
  if (flight.operator) params.set('operator', flight.operator);
  window.open(
    `/fris/flights/Non-Scheduled-Airlines/equipment-report?${params.toString()}`,
    '_blank',
  );
}

/** Reconstruct a minimal NS flight from preview query params when session prefill is missing. */
export function nsFlightFromSearchParams(
  params: URLSearchParams,
): NonScheduledFlightData {
  const serialRaw = String(
    params.get('flightSlNo') || params.get('tableSerial') || '',
  ).trim();
  const serialNum = Number(serialRaw.replace(/\D/g, '')) || 0;
  return {
    sNo: serialNum,
    flightSerialNo: serialNum || undefined,
    flightNo: params.get('flightNo') || '',
    airline: params.get('airline') || '',
    aircraft: params.get('aircraft') || '',
    routing: params.get('routing') || '',
    ops: '',
    staDate: params.get('staDate') || '',
    staTime: params.get('staTime') || '',
    stdDate: params.get('stdDate') || '',
    stdTime: params.get('stdTime') || '',
    exportedNAV: '',
    challanNo: params.get('challanNo') || '',
    bookingNo: params.get('bookingNo') || '',
    operator: params.get('operator') || '',
    dataOf: '',
  };
}
