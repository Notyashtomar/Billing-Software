import { getApiBase } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { ymdToDdMmYyyy } from '@/components/fris/reports/rampShiftTime';

export type AdvanceCargoSection =
  | 'cargoAirline'
  | 'cargoScheduled'
  | 'flightCreation';

export type AdvanceCargoServiceItem = {
  id: string;
  serviceName: string;
  serviceCode: string;
  unitType: string;
  quantityNecessary: string;
  savedAt: string;
};

export type AdvanceCargoUnitMasterItem = {
  id: string;
  unitName: string;
  unitCode: string;
  unitFormat: string;
  savedAt: string;
};

export type AdvanceCargoRecord = {
  _id?: string;
  entryKey: string;
  sections?: Partial<Record<AdvanceCargoSection, unknown>>;
  services?: AdvanceCargoServiceItem[];
  unitMaster?: AdvanceCargoUnitMasterItem[];
  flights?: Array<{
    serialNo: string;
    cargoScheduled?: Record<string, unknown>;
    flightCreation?: Record<string, unknown>;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

const WEEK_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function cargoBase(): string {
  return `${getApiBase().replace(/\/$/, '')}/advance-cargo`;
}

async function cargoError(res: Response, fallback: string): Promise<never> {
  const text = await res.text();
  let msg = fallback;
  try {
    const j = JSON.parse(text);
    if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
  } catch {
    if (text) msg = text.slice(0, 200);
  }
  throw new Error(msg);
}

export async function listAdvanceCargo(): Promise<AdvanceCargoRecord[]> {
  const res = await frisFetch(cargoBase(), { credentials: 'include' });
  if (!res.ok) await cargoError(res, 'Failed to load advance cargo');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getAdvanceCargo(entryKey: string): Promise<AdvanceCargoRecord> {
  const res = await frisFetch(
    `${cargoBase()}/${encodeURIComponent(entryKey.trim().toUpperCase())}`,
    { credentials: 'include' },
  );
  if (!res.ok) await cargoError(res, 'Failed to load cargo entry');
  return res.json();
}

export async function deleteAdvanceCargo(entryKey: string): Promise<{ success: boolean; entryKey: string }> {
  const res = await frisFetch(
    `${cargoBase()}/${encodeURIComponent(entryKey.trim().toUpperCase())}`,
    { method: 'DELETE', credentials: 'include' },
  );
  if (!res.ok) await cargoError(res, 'Failed to delete cargo entry');
  return res.json();
}

export async function listAdvanceCargoServices(): Promise<AdvanceCargoServiceItem[]> {
  const res = await frisFetch(`${cargoBase()}/services`, { credentials: 'include' });
  if (!res.ok) await cargoError(res, 'Failed to load cargo services');
  const data = await res.json();
  if (data && typeof data === 'object' && Array.isArray((data as { services?: unknown }).services)) {
    return (data as { services: AdvanceCargoServiceItem[] }).services;
  }
  return [];
}

export async function appendAdvanceCargoService(body: {
  serviceName: string;
  serviceCode?: string;
  unitType?: string;
  quantityNecessary?: string;
}): Promise<{ success: boolean; services: AdvanceCargoServiceItem[] }> {
  const res = await frisFetch(`${cargoBase()}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) await cargoError(res, 'Failed to save cargo service');
  return res.json();
}

export async function listAdvanceCargoUnitMaster(): Promise<AdvanceCargoUnitMasterItem[]> {
  const res = await frisFetch(`${cargoBase()}/unit-master`, { credentials: 'include' });
  if (!res.ok) await cargoError(res, 'Failed to load unit master');
  const data = await res.json();
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { unitMaster?: unknown }).unitMaster)
  ) {
    return (data as { unitMaster: AdvanceCargoUnitMasterItem[] }).unitMaster;
  }
  return [];
}

export async function appendAdvanceCargoUnitMaster(body: {
  unitName: string;
  unitCode?: string;
  unitFormat?: string;
}): Promise<{ success: boolean; unitMaster: AdvanceCargoUnitMasterItem[] }> {
  const res = await frisFetch(`${cargoBase()}/unit-master`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) await cargoError(res, 'Failed to save unit master');
  return res.json();
}

export async function upsertAdvanceCargoSection(body: {
  entryKey: string;
  section: AdvanceCargoSection;
  data: Record<string, unknown>;
}): Promise<{
  success: boolean;
  entryKey: string;
  sections: Record<string, unknown>;
  flights: AdvanceCargoRecord['flights'];
}> {
  const res = await frisFetch(`${cargoBase()}/section`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) await cargoError(res, 'Failed to save cargo section');
  return res.json();
}

export async function saveAdvanceCargoFlight(body: {
  entryKey: string;
  section: 'cargoScheduled' | 'flightCreation';
  data: Record<string, unknown>;
  flightPayload: Record<string, unknown>;
  serialNo?: string;
}): Promise<{
  success: boolean;
  entryKey: string;
  serialNo: string;
  fhrStaDatesCount: number;
}> {
  const res = await frisFetch(`${cargoBase()}/flight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) await cargoError(res, 'Failed to save cargo flight');
  return res.json();
}

export function normalizeCargoScheduleDays(
  operateOn: Record<string, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const day of WEEK_KEYS) {
    out[day] = operateOn[day] === true;
  }
  return out;
}

/** Map cargo schedule / flight form values into pipeline payload (Scheduled Airlines indexing). */
export function buildCargoFlightPipelinePayload(args: {
  airlineName: string;
  airlineCode: string;
  flightNo: string;
  aircraft: string;
  aircraftBody: string;
  staTime: string;
  stdTime: string;
  validFromYmd: string;
  validToYmd: string;
  route: string;
  handling?: string;
  category?: string;
  nextDay?: string;
  scheduleDays?: Record<string, boolean>;
  flightCategory?: string;
}): Record<string, unknown> {
  const validFrom = ymdToDdMmYyyy(args.validFromYmd);
  const validTo = ymdToDdMmYyyy(args.validToYmd || args.validFromYmd);
  const flightType =
    args.flightCategory || args.category || 'International-Cargo';
  return {
    Airline: args.airlineName,
    airline: args.airlineName,
    'Airline Code': args.airlineCode,
    airlineCode: args.airlineCode,
    'Flight No': args.flightNo.trim(),
    flightNo: args.flightNo.trim(),
    'Flight Type': flightType,
    'Type of flight': flightType,
    flight: flightType,
    Cate_of_Flight: flightType,
    cate_of_flight: flightType,
    'STA Time': args.staTime || '00:00',
    'STD Time': args.stdTime || '00:00',
    staTime: args.staTime || '00:00',
    stdTime: args.stdTime || '00:00',
    'Valid From': validFrom,
    'Valid To': validTo,
    validFrom,
    validTo,
    Routing: args.route,
    route: args.route,
    Aircraft: args.aircraft,
    TypeCraft: args.aircraft,
    aircraft: args.aircraft,
    'Aircraft Body': args.aircraftBody,
    aircraftBody: args.aircraftBody,
    'Type of Handling': args.handling || 'Turnaround',
    typeOfHandling: args.handling || 'Turnaround',
    'Next Day': args.nextDay === 'yes' ? 'True' : 'False',
    nextDay: args.nextDay === 'yes' ? 'true' : 'false',
    scheduleDays: args.scheduleDays ?? normalizeCargoScheduleDays({}),
    scheduleSource: 'advance_cargo',
    Active: 'Yes',
    active: true,
    exportedNAV: 'No',
    rampLocked: 'No',
    paxLocked: 'No',
    gsdLocked: 'No',
  };
}
