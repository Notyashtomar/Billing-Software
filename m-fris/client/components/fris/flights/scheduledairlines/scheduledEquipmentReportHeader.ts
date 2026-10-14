import type { FlightData, MainDetailsData } from '@/utils/dataProcessor';
import { getRawFlightScheduleBySerialUrl, getApiBase } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import {
  dedupeRepeatedFlightNoSegments,
  flightNoFromArrivalDeparture,
  flightNoFromMainDetails,
} from './flightNoDisplay';
import {
  buildScheduledEquipmentReportSearchParams,
  scheduleStaDateDisplay,
  scheduleStdDateDisplay,
  scheduleStaTimeRawDisplay,
  scheduleStdTimeRawDisplay,
} from './scheduledRowSchedule';

export type EquipmentReportHeaderPrefill = {
  flightSlNo?: string;
  tableSerial?: string;
  flightNo?: string;
  airline?: string;
  aircraft?: string;
  staDate?: string;
  stdDate?: string;
  staTime?: string;
  stdTime?: string;
};

export const EQUIPMENT_REPORT_PREFILL_STORAGE_KEY =
  'fris.scheduledEquipmentReportPrefill';

function pickStr(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

/** Build header fields from the scheduled airlines table row (+ optional main details). */
export function buildEquipmentReportHeaderFromFlight(
  flight: FlightData,
  mainDetails?: MainDetailsData | null,
): EquipmentReportHeaderPrefill {
  const flightNoFromMain = flightNoFromMainDetails(
    mainDetails,
    flight.flightNo || '',
  );
  return {
    flightNo: dedupeRepeatedFlightNoSegments(pickStr(flightNoFromMain)),
    airline: pickStr(mainDetails?.airlineName, flight.airline),
    aircraft: pickStr(mainDetails?.aircraftType, flight.aircraft),
    staDate: scheduleStaDateDisplay(flight, null),
    stdDate: scheduleStdDateDisplay(flight, null),
    staTime: scheduleStaTimeRawDisplay(flight, null),
    stdTime: scheduleStdTimeRawDisplay(flight, null),
  };
}

export function mergeEquipmentReportHeaders(
  ...sources: Array<EquipmentReportHeaderPrefill | null | undefined>
): EquipmentReportHeaderPrefill {
  const out: EquipmentReportHeaderPrefill = {};
  const fields = [
    'flightNo',
    'airline',
    'aircraft',
    'staDate',
    'stdDate',
    'staTime',
    'stdTime',
  ] as const;
  for (const field of fields) {
    for (const src of sources) {
      const v = String(src?.[field] ?? '').trim();
      if (v) {
        out[field] = v;
        break;
      }
    }
  }
  return out;
}

/** Pull flight header fields from `fhr_collection` embeds (terminal, main, equipment). */
export function extractEquipmentReportHeaderFromFhrDoc(
  fhrDoc: unknown,
): EquipmentReportHeaderPrefill {
  if (!fhrDoc || typeof fhrDoc !== 'object') return {};
  const doc = fhrDoc as Record<string, unknown>;
  const md = (doc.mainDetails ?? null) as Record<string, unknown> | null;
  const td = (doc.terminalDetails ?? null) as Record<string, unknown> | null;
  const eq = (doc.equipmentManpower ?? null) as Record<string, unknown> | null;
  const r1 = (doc.rampDetails1 ?? null) as Record<string, unknown> | null;
  const r3 = (doc.rampDetails3 ?? null) as Record<string, unknown> | null;

  const arr = pickStr(md?.ArrivalFltNo, md?.arrivalFlightNo);
  const dep = pickStr(md?.DepartureFltNo, md?.departureFlightNo);
  const flightNoFromMain = flightNoFromArrivalDeparture(arr, dep);

  return {
    flightNo: dedupeRepeatedFlightNoSegments(
      pickStr(
        eq?.flightNo,
        md?.flightCode,
        td?.FlightNo,
        td?.flightNo,
        r1?.FlightNo,
        r1?.flightNo,
        flightNoFromMain,
      ),
    ),
    airline: pickStr(
      eq?.airlinesOperator,
      md?.Airline,
      md?.airlineName,
      td?.Airline,
      td?.airlineName,
    ),
    aircraft: pickStr(
      eq?.acType,
      md?.TypeCraft,
      md?.aircraftType,
      td?.TypeCraft,
      td?.aircraftType,
    ),
    staDate: pickStr(
      eq?.staDate,
      td?.STADate,
      td?.staDate,
      r1?.STADate,
      r1?.staDate,
      r3?.STADate,
      r3?.staDate,
      md?.STADate,
      md?.staDate,
    ),
    staTime: pickStr(
      eq?.sta,
      td?.STATime,
      td?.staTime,
      r1?.STATime,
      r1?.staTime,
      r3?.STATime,
      r3?.staTime,
      md?.STATime,
      md?.staTime,
    ),
    stdDate: pickStr(
      eq?.stdDate,
      td?.STDDate,
      td?.stdDate,
      r1?.STDDate,
      r1?.stdDate,
      r3?.STDDate,
      r3?.stdDate,
      md?.STDDate,
      md?.stdDate,
    ),
    stdTime: pickStr(
      eq?.std,
      td?.STDTime,
      td?.stdTime,
      r1?.STDTime,
      r1?.stdTime,
      r3?.STDTime,
      r3?.stdTime,
      md?.STDTime,
      md?.stdTime,
    ),
  };
}

function serialKeysMatch(a: string, b: string): boolean {
  const x = String(a ?? '').trim();
  const y = String(b ?? '').trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const dx = x.replace(/^FL-/i, '').replace(/\D/g, '');
  const dy = y.replace(/^FL-/i, '').replace(/\D/g, '');
  return Boolean(dx && dy && dx === dy);
}

export function readStoredEquipmentReportHeaderPrefill(
  flightSlNo: string,
  tableSerial: string,
): EquipmentReportHeaderPrefill | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(EQUIPMENT_REPORT_PREFILL_STORAGE_KEY);
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as EquipmentReportHeaderPrefill;
    const keys = [flightSlNo, tableSerial]
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);
    const storedKeys = [parsed.flightSlNo, parsed.tableSerial]
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);
    const matches = keys.some((k) =>
      storedKeys.some((sk) => serialKeysMatch(k, sk)),
    );
    return matches ? parsed : null;
  } catch {
    return null;
  }
}

export function persistEquipmentReportHeaderPrefill(
  flight: FlightData,
  options?: {
    reportType?: 'summary' | 'detailed';
    mainDetails?: MainDetailsData | null;
  },
): URLSearchParams {
  const params = buildScheduledEquipmentReportSearchParams(flight, options);
  const header: EquipmentReportHeaderPrefill = {
    flightSlNo: params.get('flightSlNo') ?? undefined,
    tableSerial: params.get('tableSerial') ?? undefined,
    ...buildEquipmentReportHeaderFromFlight(flight, options?.mainDetails),
  };
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(
        EQUIPMENT_REPORT_PREFILL_STORAGE_KEY,
        JSON.stringify(header),
      );
    } catch {
      // quota / private mode
    }
  }
  return params;
}

export function equipmentReportHeaderFromSearchParams(
  params: URLSearchParams,
): EquipmentReportHeaderPrefill {
  return {
    flightSlNo: params.get('flightSlNo') ?? undefined,
    tableSerial: params.get('tableSerial') ?? undefined,
    flightNo: params.get('flightNo') ?? undefined,
    airline: params.get('airline') ?? undefined,
    aircraft: params.get('aircraft') ?? undefined,
    staDate: params.get('staDate') ?? undefined,
    stdDate: params.get('stdDate') ?? undefined,
    staTime: params.get('staTime') ?? undefined,
    stdTime: params.get('stdTime') ?? undefined,
  };
}

export async function fetchScheduleHeaderBySerial(
  serial: string,
): Promise<EquipmentReportHeaderPrefill | null> {
  const s = String(serial ?? '').trim();
  if (!s) return null;
  try {
    const res = await frisFetch(getRawFlightScheduleBySerialUrl(s));
    if (!res.ok) return null;
    const row = (await res.json()) as Record<string, unknown> | null;
    if (!row || typeof row !== 'object') return null;
    return {
      flightNo: pickStr(row.flightNo),
      airline: pickStr(row.airline),
      aircraft: pickStr(row.aircraft),
      staDate: pickStr(row.staDate),
      stdDate: pickStr(row.stdDate),
      staTime: pickStr(row.staTime),
      stdTime: pickStr(row.stdTime),
    };
  } catch {
    return null;
  }
}

/** Merge schedule / FHR / row sources into a `FlightData` copy for GSE & Team PDFs. */
export async function enrichFlightForEquipmentReport(
  flight: FlightData,
  mainDetails?: MainDetailsData | null,
  serialCandidates: string[] = [],
): Promise<FlightData> {
  const rowHeader = buildEquipmentReportHeaderFromFlight(flight, mainDetails);
  let scheduleHeader: EquipmentReportHeaderPrefill | null = null;
  let fhrHeader: EquipmentReportHeaderPrefill | null = null;

  for (const serial of serialCandidates) {
    if (!scheduleHeader) {
      scheduleHeader = await fetchScheduleHeaderBySerial(serial);
    }
    if (!fhrHeader) {
      try {
        const apiBase = getApiBase().replace(/\/$/, '');
        const res = await frisFetch(
          `${apiBase}/fhr-collection/flight/${encodeURIComponent(serial)}`,
        );
        if (res.ok) {
          fhrHeader = extractEquipmentReportHeaderFromFhrDoc(await res.json());
        }
      } catch {
        // ignore
      }
    }
    if (scheduleHeader && fhrHeader) break;
  }

  const merged = mergeEquipmentReportHeaders(
    rowHeader,
    scheduleHeader,
    fhrHeader,
  );
  const flightNoFromMain = flightNoFromMainDetails(
    mainDetails,
    flight.flightNo || '',
  );

  return {
    ...flight,
    flightNo: dedupeRepeatedFlightNoSegments(
      pickStr(merged.flightNo, flightNoFromMain),
    ),
    airline: pickStr(merged.airline, mainDetails?.airlineName, flight.airline),
    aircraft: pickStr(
      merged.aircraft,
      mainDetails?.aircraftType,
      flight.aircraft,
    ),
    staDate: pickStr(merged.staDate, flight.staDate),
    stdDate: pickStr(merged.stdDate, flight.stdDate),
    staTime: pickStr(merged.staTime, flight.staTime),
    stdTime: pickStr(merged.stdTime, flight.stdTime),
  };
}
