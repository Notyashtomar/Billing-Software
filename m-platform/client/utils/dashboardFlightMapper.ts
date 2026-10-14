import type { Flight } from '@/types/flight';

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return '';
}

function numSerial(d: Record<string, unknown>): number {
  const v =
    d.SerialNo ??
    d.serialNo ??
    d['Sl No'] ??
    d['Sl. No'] ??
    d['Serial No'] ??
    d['Serial Number'] ??
    d.SlNo ??
    0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Map `raw_flight_data` (`{ data }`) or `ns_raw_flight_data` row → `Flight` for `processFlightData`. */
export function normalizeMongoRowToFlight(row: unknown): Flight {
  const r = row as Record<string, unknown>;
  const d = (r?.data ?? r) as Record<string, unknown>;
  const delayRaw = d['Delay flight'] ?? d['Delay flight '] ?? 0;
  const delayNum =
    typeof delayRaw === 'number' ? delayRaw : Number(delayRaw) || 0;

  return {
    ...d,
    SerialNo: numSerial(d),
    Airline: firstNonEmpty(d.Airline, d.airline),
    FlightNo: firstNonEmpty(d.FlightNo, d.flightNo, d['Flight No']),
    Typeofflight: firstNonEmpty(
      d.Typeofflight,
      d.flightType,
      d['Type of flight'],
      d.FlightType,
      d.flight,
      d.Flight,
    ),
    TypeCraft: firstNonEmpty(d.TypeCraft, d.aircraft, d.Aircraft),
    STATime: firstNonEmpty(d.STATime, d.staTime, d['STA Time']),
    STADate: firstNonEmpty(
      d.STADate,
      d.staDate,
      d['STA Date'],
      d['Valid From'],
    ),
    STDTime: firstNonEmpty(d.STDTime, d.stdTime, d['STD Time']),
    STDDate: firstNonEmpty(
      d.STDDate,
      d.stdDate,
      d['STD Date'],
      d['Valid To'],
    ),
    ATATime: firstNonEmpty(d.ATATime, d.ataTime, d['ATA Time']),
    ATADate: firstNonEmpty(d.ATADate, d.ataDate, d['ATA Date']),
    ATDTime: firstNonEmpty(d.ATDTime, d.atdTime, d['ATD Time']),
    ATDDate: firstNonEmpty(d.ATDDate, d.atdDate, d['ATD Date']),
    ETDtime: firstNonEmpty(d.ETDtime, d.etdTime, d['ETD time']),
    ETDdate: firstNonEmpty(d.ETDdate, d.etdDate, d['ETD date']),
    Delay: firstNonEmpty(d.Delay, d.delay) || undefined,
    RateingValue: firstNonEmpty(
      d.RateingValue,
      d.RatingValue,
      d.rating,
      d['Rating Value'],
    ),
    'Cancelled data':
      firstNonEmpty(d['Cancelled data'], d.cancelledData) || '',
    'Count Cancelled FLIGHT':
      Number(d['Count Cancelled FLIGHT'] ?? 0) || 0,
    'Delay flight': delayNum,
    'Delay flight ': delayNum,
  };
}
