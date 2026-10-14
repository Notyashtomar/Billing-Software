import type { BillingSourceRow } from '@/lib/billing-shared/billing-sources';
import { stripCancelledFlightPrefix } from '@/lib/billing-shared/preparation-flight-display';

function pickOperationalField(
  op: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const v = String(op[key] ?? '').trim();
    if (v) return v;
  }
  return '';
}

export function resolveBillingPaxFreight(op: Record<string, unknown>): string {
  const explicit = pickOperationalField(op, 'paxFreight', 'paxFreightLabel');
  if (explicit) return explicit;

  const cat = pickOperationalField(op, 'categoryOfFlight', 'Cate_of_Flight').toLowerCase();
  if (
    cat.includes('cargo') ||
    cat.includes('freight') ||
    cat.includes('freighter')
  ) {
    return 'Freighter';
  }

  const ac = pickOperationalField(op, 'aircraftType', 'TypeCraft');
  if (!ac) return '';
  if (/f/i.test(ac)) return 'Freighter';
  return 'Passenger';
}

export function scheduledFlightOperationalCell(
  row: BillingSourceRow,
  ...keys: string[]
): string {
  const value = pickOperationalField(row.operationalData, ...keys);
  return value || '—';
}

export function scheduledFlightCategory(row: BillingSourceRow): string {
  return scheduledFlightOperationalCell(
    row,
    'categoryOfFlight',
    'Cate_of_Flight',
    'flightCategory',
  );
}

export function scheduledFlightTypeOfHandling(row: BillingSourceRow): string {
  return scheduledFlightOperationalCell(row, 'typeOfHandling', 'TypeofHandling');
}

export function scheduledFlightOps(row: BillingSourceRow): string {
  return scheduledFlightOperationalCell(
    row,
    'ops',
    'opsType',
    'typeOfFlight',
    'Typeofflight',
  );
}

export function scheduledFlightAircraftType(row: BillingSourceRow): string {
  return scheduledFlightOperationalCell(row, 'aircraftType', 'TypeCraft', 'typeCraft');
}

function normalizeStoredAircraftBody(value: string): 'NB' | 'WB' | '' {
  const embedded = value.trim().toUpperCase();
  if (!embedded) return '';
  if (embedded === 'WB' || embedded.includes('WIDE')) return 'WB';
  if (embedded === 'NB' || embedded.includes('NARROW')) return 'NB';
  return '';
}

/** Same wide-body families as the server label. ICAO forms (B77W, B788, A333) count. */
export function inferWideBodyFromAircraftType(aircraftType: string): boolean {
  const tc = aircraftType.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!tc) return false;
  return /(?:777|787|767|747|MD11|DC10|B77[23WL]|B78[89X]|B76[234]|B74[0-8]|A3(?:00|10|3[2389]|4[2356]|5[09]|5K|8[08])|380|350|340|330|310|300|359)/.test(
    tc,
  );
}

export function scheduledFlightAircraftBody(row: BillingSourceRow): string {
  const op = row.operationalData;
  const explicit = pickOperationalField(op, 'aircraftBody', 'AircraftBody');
  const stored = normalizeStoredAircraftBody(explicit);
  if (stored) return stored;
  if (explicit) return explicit;

  const aircraftType = pickOperationalField(op, 'aircraftType', 'TypeCraft');
  if (!aircraftType) return '—';
  return inferWideBodyFromAircraftType(aircraftType) ? 'WB' : 'NB';
}

export function scheduledFlightTurnaroundStatus(row: BillingSourceRow): string {
  const op = row.operationalData;
  const explicit = pickOperationalField(
    op,
    'turnaroundStatus',
    'turnaround_status',
    'TurnaroundStatus',
  );
  if (explicit) return explicit;

  const category = pickOperationalField(
    op,
    'categoryOfFlight',
    'Cate_of_Flight',
    'flightCategory',
  );
  if (category) return category;

  return 'Scheduled';
}

export function scheduledFlightPaxFreight(row: BillingSourceRow): string {
  const label = resolveBillingPaxFreight(row.operationalData);
  return label || '—';
}

/** Extract airline code from FHR tokens (IX2718, CANC - IX100, IX 1498/ IX 1604). */
function normalizeAirlineCodeToken(raw: unknown): string {
  const text = String(stripCancelledFlightPrefix(raw) || raw || '')
    .trim()
    .toUpperCase();
  if (!text) return '';

  const fromCancelled = text.match(/(?:CANC\s*-\s*)?([A-Z]{2,3})\d{2,5}/);
  if (fromCancelled?.[1]) return fromCancelled[1];

  const fromSpacedFlight = text.match(/\b([A-Z]{2,3})\s+\d{2,5}\b/);
  if (fromSpacedFlight?.[1]) return fromSpacedFlight[1];

  const fromFlight = text.match(/\b([A-Z]{2,3})\d{2,5}\b/);
  if (fromFlight?.[1]) return fromFlight[1];

  if (/^[A-Z0-9]{2,10}$/.test(text)) return text;
  return '';
}

function stripCodePrefixFromName(name: string, code: string): string {
  const trimmed = name.trim();
  if (!trimmed || !code) return trimmed;
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return trimmed
    .replace(new RegExp(`^${escaped}\\s*[—–\\-]\\s*`, 'i'), '')
    .trim();
}

function isUsableAirlineName(value: string, code: string): boolean {
  const name = stripCodePrefixFromName(value, code);
  if (!name) return false;
  if (/^[A-Z0-9]{2,3}$/i.test(name)) return false;
  if (code && name.toUpperCase() === code) return false;
  if (/\b[A-Z]{2,3}\s*\d{2,5}\b/i.test(name)) return false;
  return true;
}

/**
 * BHS Customer column: always `[Code] — [Full Name]` when both resolve
 * (all customers / stations / date ranges).
 */
export function scheduledFlightCustomer(
  row: BillingSourceRow,
  customerDirectory?: ReadonlyMap<string, string> | ReadonlyArray<{ customerCode: string; name: string }>,
): string {
  const op = row.operationalData;
  const code =
    normalizeAirlineCodeToken(
      pickOperationalField(op, 'customerCode', 'airlineCode', 'AirlineCode', 'Arline_Code'),
    ) ||
    normalizeAirlineCodeToken(
      pickOperationalField(op, 'flightNoEquipmentNo', 'ArrivalFltNo', 'DepartureFltNo'),
    ) ||
    normalizeAirlineCodeToken(row.sourceRef?.flightNo);

  const directoryName = (() => {
    if (!code || !customerDirectory) return '';
    if (customerDirectory instanceof Map) {
      return String(customerDirectory.get(code) ?? '').trim();
    }
    if (!Array.isArray(customerDirectory)) return '';
    const hit = customerDirectory.find(
      (c: { customerCode: string; name: string }) =>
        String(c.customerCode ?? '').trim().toUpperCase() === code,
    );
    return String(hit?.name ?? '').trim();
  })();

  const rawName = pickOperationalField(
    op,
    'customerName',
    'Airline',
    'airline',
    'airlineName',
    'airlinesOperator',
  );

  const resolvedName =
    (directoryName && isUsableAirlineName(directoryName, code)
      ? stripCodePrefixFromName(directoryName, code)
      : '') ||
    (isUsableAirlineName(rawName, code) ? stripCodePrefixFromName(rawName, code) : '');

  if (code && resolvedName) return `${code} — ${resolvedName}`;
  if (code) return code;
  if (resolvedName) return resolvedName;
  return '—';
}

export function scheduledFlightEligibleLabel(row: BillingSourceRow): 'Yes' | 'No' {
  return row.billingEligibility.eligible ? 'Yes' : 'No';
}
