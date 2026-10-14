import { getSessionStationCode } from '@/lib/station-company-logo';

export const NS_ADVANCE_INVOICE_PREFILL_KEY = 'fris.nsAdvanceInvoicePrefill';

export type NonScheduledAdvanceInvoiceData = {
  invoiceNo: string;
  invoiceDate: string;
  amount: string;
  currency: string;
  bookingNo: string;
  challanNo: string;
  airlineBillTo: string;
  airlineCode: string;
  companyName: string;
  operator: string;
  flightNo: string;
  registrationNo: string;
  routing: string;
  aircraftType: string;
  aircraftBody: string;
  mtow: string;
  terminalCode: string;
  opsType: string;
  categoryOfFlight: string;
  bookingDate: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  serviceDescription: string;
  stationCode: string;
  /** Optional airline contact for Send. */
  airlineEmail?: string;
};

const STATION_LABELS: Record<string, string> = {
  MAA: 'CHENNAI',
  HYD: 'HYDERABAD',
  BLR: 'BENGALURU',
  DEL: 'DELHI',
  BOM: 'MUMBAI',
  CCU: 'KOLKATA',
  IXC: 'CHANDIGARH',
  TRV: 'TRIVANDRUM',
};

export function stationDisplayLabel(stationCode: string): string {
  const code = stationCode.trim().toUpperCase();
  return STATION_LABELS[code] ?? code;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatInvoiceDisplayDate(date = new Date()): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** e.g. IXC/ADV/30072026/143052 */
export function buildAdvanceInvoiceNo(stationCode?: string): string {
  const station = (stationCode || getSessionStationCode()).trim().toUpperCase() || 'MAA';
  const now = new Date();
  const stamp = `${pad2(now.getDate())}${pad2(now.getMonth() + 1)}${now.getFullYear()}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  return `${station}/ADV/${stamp}/${time}`;
}

export function parseAdvanceAmount(raw: string | number | null | undefined): number {
  const n = Number(String(raw ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

export function formatInrAmount(raw: string | number | null | undefined): string {
  const n = parseAdvanceAmount(raw);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function persistNsAdvanceInvoicePrefill(
  data: NonScheduledAdvanceInvoiceData,
): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(NS_ADVANCE_INVOICE_PREFILL_KEY, JSON.stringify(data));
  } catch {
    // quota / private mode
  }
}

export function readNsAdvanceInvoicePrefill(
  invoiceHint?: string,
): NonScheduledAdvanceInvoiceData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(NS_ADVANCE_INVOICE_PREFILL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NonScheduledAdvanceInvoiceData;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!invoiceHint) return parsed;
    const wanted = String(invoiceHint).trim();
    if (!wanted || parsed.invoiceNo === wanted) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function buildAdvanceInvoiceFromForm(input: {
  amount: string;
  bookingNo?: string;
  challanNo?: string;
  airlineBillTo: string;
  airlineCode?: string;
  companyName?: string;
  operator?: string;
  flightNo?: string;
  registrationNo?: string;
  routing?: string;
  aircraftType?: string;
  aircraftBody?: string;
  mtow?: string;
  terminalCode?: string;
  opsType?: string;
  categoryOfFlight?: string;
  bookingDate?: string;
  staDate?: string;
  staTime?: string;
  stdDate?: string;
  stdTime?: string;
  airlineEmail?: string;
}): NonScheduledAdvanceInvoiceData {
  const stationCode = getSessionStationCode();
  return {
    invoiceNo: buildAdvanceInvoiceNo(stationCode),
    invoiceDate: formatInvoiceDisplayDate(),
    amount: String(input.amount ?? '').trim(),
    currency: 'INR',
    bookingNo: String(input.bookingNo ?? '').trim(),
    challanNo: String(input.challanNo ?? '').trim(),
    airlineBillTo: String(input.airlineBillTo ?? '').trim(),
    airlineCode: String(input.airlineCode ?? '').trim(),
    companyName: String(input.companyName ?? '').trim(),
    operator: String(input.operator ?? '').trim(),
    flightNo: String(input.flightNo ?? '').trim(),
    registrationNo: String(input.registrationNo ?? '').trim(),
    routing: String(input.routing ?? '').trim(),
    aircraftType: String(input.aircraftType ?? '').trim(),
    aircraftBody: String(input.aircraftBody ?? '').trim(),
    mtow: String(input.mtow ?? '').trim(),
    terminalCode: String(input.terminalCode ?? '').trim(),
    opsType: String(input.opsType ?? '').trim(),
    categoryOfFlight: String(input.categoryOfFlight ?? '').trim(),
    bookingDate: String(input.bookingDate ?? '').trim(),
    staDate: String(input.staDate ?? '').trim(),
    staTime: String(input.staTime ?? '').trim(),
    stdDate: String(input.stdDate ?? '').trim(),
    stdTime: String(input.stdTime ?? '').trim(),
    serviceDescription: 'Advance — Comprehensive Handling (Flight)',
    stationCode,
    airlineEmail: String(input.airlineEmail ?? '').trim() || undefined,
  };
}

export function openNonScheduledAdvanceInvoice(
  data: NonScheduledAdvanceInvoiceData,
): void {
  persistNsAdvanceInvoicePrefill(data);
  const params = new URLSearchParams({
    invoiceNo: data.invoiceNo,
    source: 'non-scheduled-booking',
  });
  if (data.bookingNo) params.set('bookingNo', data.bookingNo);
  window.open(
    `/fris/flights/Non-Scheduled-Airlines/invoice?${params.toString()}`,
    '_blank',
  );
}
