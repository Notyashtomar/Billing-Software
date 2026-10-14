import { normalizeBillingCustomerCode } from './billing-customer-code.util';
import {
  mergeFhrMainEmbeds,
  resolveAircraftBodyLabel,
  resolveTurnaroundStatusLabel,
  resolveScheduledFlightCancelled,
} from './scheduled-flight-display.util';

/**
 * Same rule as Scheduled Airlines: a stored CANC flight number keeps every character except spaces.
 * Otherwise keep the arrival/departure pair.
 */
function resolveBillingFlightNo(
  m: Record<string, unknown>,
  t: Record<string, unknown>,
  r: Record<string, unknown>,
  l: Record<string, unknown>,
  dailyData?: Record<string, unknown>,
): string {
  for (const raw of [
    m.FlightNo,
    m.flightNo,
    t.FlightNo,
    t.flightNo,
    r.FlightNo,
    l.FlightNo,
    dailyData?.flightNo,
    dailyData?.FlightNo,
  ]) {
    const compact = String(raw ?? '').replace(/\s+/g, '');
    if (/^CANC/i.test(compact)) return compact;
  }
  if (m.DepartureFltNo && m.ArrivalFltNo) {
    return `${m.ArrivalFltNo}/${m.DepartureFltNo}`;
  }
  return pick(m.DepartureFltNo, m.ArrivalFltNo, t.FlightNo, dailyData?.flightNo);
}

function pick(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function embed(doc: Record<string, unknown> | null | undefined, key: string) {
  const v = doc?.[key];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

function hasObjectPayload(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length > 0;
}

function hasEquipmentManpowerPayload(eq: Record<string, unknown>): boolean {
  if (!hasObjectPayload(eq)) return false;
  const entries = Array.isArray(eq.entries) ? eq.entries : [];
  if (entries.length > 0) return true;
  return Boolean(
    pick(eq.fromTime, eq.toTime, eq.equipmentFromTime, eq.equipmentToTime, eq.verifiedBy),
  );
}

function isCancelledDailyRow(
  dailyData: Record<string, unknown> | undefined,
  flightNo: string,
): boolean {
  return resolveScheduledFlightCancelled(dailyData, flightNo);
}

function resolvePaxFreightLabel(
  aircraftType: string,
  categoryOfFlight: string,
): string {
  const cat = categoryOfFlight.toLowerCase();
  if (
    cat.includes('cargo') ||
    cat.includes('freight') ||
    cat.includes('freighter')
  ) {
    return 'Freighter';
  }
  const ac = aircraftType.trim();
  if (!ac) return '';
  if (/f/i.test(ac)) return 'Freighter';
  return 'Passenger';
}

function looksLikeFlightToken(value: string): boolean {
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return false;
  if (s.startsWith('CANC')) return true;
  if (/\b[A-Z]{2,3}\d{2,5}(?:\/[A-Z]{2,3}\d{2,5})?\b/.test(s)) return true;
  return false;
}

/** True when value is only an IATA/ICAO-style airline code (e.g. BS, SG, IX). */
function looksLikeAirlineCodeOnly(value: string): boolean {
  return /^[A-Z0-9]{2,3}$/i.test(String(value ?? '').trim());
}

function isUsableCustomerName(value: string, customerCode?: string): boolean {
  const name = String(value ?? '').trim();
  if (!name) return false;
  if (looksLikeFlightToken(name)) return false;
  if (looksLikeAirlineCodeOnly(name)) return false;
  if (customerCode && name.toUpperCase() === customerCode.trim().toUpperCase()) {
    return false;
  }
  return true;
}

function resolveCustomerCode(
  merged: Record<string, unknown>,
  dailyData?: Record<string, unknown>,
  flightNo?: string,
): string {
  const candidates = [
    merged.Arline_Code,
    merged.airlineCode,
    merged.AirlineCode,
    merged.customerCode,
    dailyData?.customerCode,
    dailyData?.airlineCode,
    dailyData?.AirlineCode,
    dailyData?.['Airline Code'],
    dailyData?.['Arline Code'],
    flightNo,
  ];
  for (const candidate of candidates) {
    // Shared util also handles spaced FHR tokens (e.g. "IX 1498/ IX 1604").
    const code = normalizeBillingCustomerCode(candidate);
    if (code) return code;
  }
  return '';
}

function resolveCustomerName(
  merged: Record<string, unknown>,
  dailyData?: Record<string, unknown>,
  extras: unknown[] = [],
  customerCode = '',
): string {
  const candidates = [
    merged.Airline,
    merged.airline,
    merged.customerName,
    dailyData?.airline,
    dailyData?.Airline,
    ...extras,
    merged.customerName,
  ];
  for (const candidate of candidates) {
    const name = String(candidate ?? '').trim();
    if (isUsableCustomerName(name, customerCode)) return name;
  }
  return '';
}

/** Copied from server/src/advance-invoicing/utils/invoicing-flight-report.mapper.ts */
export function mapFhrToInvoicingFlightReportRow(
  serialNo: number,
  fhr: Record<string, unknown> | object | null | undefined,
  dailyData?: Record<string, unknown>,
): Record<string, string | boolean> {
  const fhrDoc = fhr as Record<string, unknown> | null | undefined;
  const m = embed(fhrDoc, 'mainDetails');
  const t = embed(fhrDoc, 'terminalDetails');
  const r = embed(fhrDoc, 'rampDetails1');
  const l = embed(fhrDoc, 'loadControlDetails');
  const rem = embed(fhrDoc, 'remarks');
  const eq = embed(fhrDoc, 'equipmentManpower');

  const flightNo = resolveBillingFlightNo(m, t, r, l, dailyData);

  const resolvedSerial = pick(
    serialNo > 0 ? serialNo : '',
    fhrDoc?.SerialNo,
    fhrDoc?.flightSerialNumber,
    m.SerialNo,
    m.serialNo,
    t.serialNo,
    dailyData?.SlNo,
    dailyData?.slNo,
    dailyData?.['Serial No'],
    dailyData?.serialNo,
  );

  const merged = mergeFhrMainEmbeds(m, t, r, l);
  const aircraftType = pick(
    merged.TypeCraft,
    merged.typeCraft,
    merged.aircraftType,
    dailyData?.aircraft,
  );
  const categoryOfFlight = pick(merged.Cate_of_Flight, merged.flightCategory);
  const ops = pick(merged.ops, merged.opsType, merged.Typeofflight);
  const turnaroundStatus = resolveTurnaroundStatusLabel(merged, categoryOfFlight);
  const aircraftBody = resolveAircraftBodyLabel(merged, aircraftType, null);
  const customerCode = resolveCustomerCode(merged, dailyData, flightNo);
  const customerName = resolveCustomerName(
    merged,
    dailyData,
    [t.airlinesOperator, rem.Airline, dailyData?.airline],
    customerCode,
  );

  return {
    selectData: false,
    type: 'Flight',
    flightNoEquipmentNo: flightNo,
    aircraftType,
    customerCode,
    customerName,
    categoryOfFlight,
    typeOfHandling: pick(merged.TypeofHandling, merged.typeOfHandling),
    typeOfFlight: pick(merged.Typeofflight, t.Typeofflight, r.Typeofflight, l.Typeofflight),
    ops,
    turnaroundStatus,
    paxFreight: resolvePaxFreightLabel(aircraftType, categoryOfFlight),
    staDate: pick(t.STADate, t.staDate, dailyData?.staDate),
    staTime: pick(t.STATime, t.sta, dailyData?.staTime),
    ataDate: pick(m.ATADate, m.ataDate),
    ataTime: pick(m.ATATime, m.ataTime),
    stdDate: pick(t.STDDate, t.stdDate, dailyData?.stdDate),
    stdTime: pick(t.STDTime, t.std, dailyData?.stdTime),
    atdDate: pick(m.ATDDate, m.atdDate, dailyData?.atdDate),
    atdTime: pick(m.ATDTime, m.atdTime, dailyData?.atdTime),
    groundRoundTime: '',
    delayOnStd: pick(m.departureDelay, m.ActualDelay),
    flightQuantity: '1',
    serialNumber: resolvedSerial,
    equipmentFromTime: pick(eq.fromTime, eq.equipmentFromTime),
    equipmentToTime: pick(eq.toTime, eq.equipmentToTime),
    equipmentUsesTime: pick(eq.usageTime, eq.equipmentUsesTime),
    delayOnSta: pick(m.arrivalDelay, m.ActualDelay),
    aircraftBody,
    terminal: pick(m.Terminal, m.terminalCode, t.Terminal),
    mtow: pick(m.mtow, m.MTOW),
    route: pick(m.Route, m.route, dailyData?.route),
    regn: pick(m.Regn, m.regnNo, dailyData?.regnNo),
    entryNo: pick(l.ADCNO, l.adc, t.IGMNo),
    bwfsRepRemarksI: pick(rem.GHRepRemarks, rem.ghRepRemarks),
    airlineRepRemarksI: pick(rem.AirlineRepRemarks, rem.airlineRepRemarks),
    hasMainDetails: hasObjectPayload(m),
    hasTerminalDetails: hasObjectPayload(t),
    hasRampDetails: hasObjectPayload(r),
    hasLoadControlDetails: hasObjectPayload(l),
    hasEquipmentManpowerDetails: hasEquipmentManpowerPayload(eq),
    rampLocked: pick(m.rampLocked, m.RampLocked, dailyData?.rampLocked),
    paxLocked: pick(m.paxLocked, m.PaxLocked, dailyData?.paxLocked),
    gsdLocked: pick(m.gsdLocked, m.GsdLocked, dailyData?.gsdLocked),
    baseFlight: pick(m.baseFlight, m.BaseFlight),
    flightStatus: pick(dailyData?.flightStatus, m.flightStatus),
    isCancelled: isCancelledDailyRow(dailyData, flightNo),
  };
}

export function reportDateYmd(raw: unknown): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }
  const dash = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    return `${dash[3]}-${dash[2].padStart(2, '0')}-${dash[1].padStart(2, '0')}`;
  }
  return null;
}
