/** Parse schedule-setup master rows (Advance → Gateway → Scheduled Airlines). */

function getStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function parseBoolLike(value: unknown): boolean {
  if (value === true) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
}

export function isScheduleSetupRowEnabled(
  data: Record<string, unknown>,
): boolean {
  const activeValue = data.active ?? data.Active;
  const hasActiveValue =
    activeValue !== undefined &&
    activeValue !== null &&
    String(activeValue).trim() !== '';
  if (hasActiveValue && !parseBoolLike(activeValue)) return false;

  const status = getStr(data, 'flightStatus', 'Flight Status', 'status').toLowerCase();
  const cancelled =
    parseBoolLike(data.flightCancelled ?? data.isCancelled) ||
    status === 'cancelled' ||
    status === 'canceled';
  return !cancelled;
}

export function getScheduleMasterFlightNo(data: Record<string, unknown>): string {
  const split = parseBoolLike(data.ifOperationSplit ?? data['Operation Split']);
  const arr = getStr(
    data,
    'arrivalFlightNo',
    'Arrival Flight No',
    'ArrivalFltNo',
    'arrivalFltNo',
  );
  const dep = getStr(
    data,
    'departureFlightNo',
    'Departure Flight No',
    'DepartureFltNo',
    'departureFltNo',
  );
  const single = getStr(data, 'flightNo', 'Flight No', 'FlightNo');
  if (split && arr && dep) return `${arr}/${dep}`;
  if (split && (arr || dep)) return [arr, dep].filter(Boolean).join('/');
  if (single) return single;
  if (arr && dep) return `${arr}/${dep}`;
  return arr || dep;
}

export type ScheduledAirlineCustomerExtract = {
  customerCode: string;
  name: string;
  flightNo: string;
  aircraftType: string;
};

export function extractScheduledAirlineCustomer(
  data: Record<string, unknown>,
): ScheduledAirlineCustomerExtract | null {
  const customerCode = getStr(data, 'Airline Code', 'airlineCode', 'code').toUpperCase();
  const name = getStr(data, 'airline', 'Airline');
  if (!customerCode && !name) return null;

  const flightNo = getScheduleMasterFlightNo(data);
  const aircraftType = getStr(data, 'aircraft', 'Aircraft', 'TypeCraft');

  return {
    customerCode,
    name,
    flightNo,
    aircraftType,
  };
}

export function joinUniqueValues(values: Iterable<string>): string | undefined {
  const unique = [
    ...new Set(
      [...values].map((v) => v.trim()).filter(Boolean),
    ),
  ];
  return unique.length > 0 ? unique.join(', ') : undefined;
}
