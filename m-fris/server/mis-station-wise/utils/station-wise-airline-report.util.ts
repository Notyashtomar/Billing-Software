import { evaluateStationWiseRow } from './station-wise-evaluate.util';
import {
  resolveStationWiseAirlineCode,
  type StationWiseInputRow,
} from './station-wise-map-fhr.util';

/** Excel FLIGHT REPORT columns EM–FA (same SUMIF sources as the MAA sheet). */
export const AIRLINE_REPORT_METRIC_KEYS = [
  'xxld',
  'lateSta',
  'depOnOrBeforeStd',
  'depPostStdAgtLeSgt',
  'agtGtSgtNonGha',
  'agtGtSgtGha',
  'arrivedOnOrBeforeSta',
  'onTime',
  'beforeSta',
  'depBeforeStdAgtLtSgt',
  'depBeforeStdAgtEqSgt',
  'exceedingSgtBeforeStd',
  'agtGtSgtPostStdNonGha',
  'agtGtSgtPostStdGha',
  'total',
] as const;

export type AirlineReportMetricKey = (typeof AIRLINE_REPORT_METRIC_KEYS)[number];

export const AIRLINE_REPORT_COLUMNS: Array<{
  key: AirlineReportMetricKey;
  label: string;
  /** Highlight like MAA (XXLD red, GHA pink group). */
  tone?: 'xxld' | 'gha' | 'timing' | 'otp' | 'total';
}> = [
  { key: 'xxld', label: 'XXLD Flight', tone: 'xxld' },
  { key: 'lateSta', label: 'Flight Arrived Later Than STA' },
  { key: 'depOnOrBeforeStd', label: 'Departed On Or Before STD', tone: 'timing' },
  {
    key: 'depPostStdAgtLeSgt',
    label: 'Departed Post STD but AGT < = SGT',
    tone: 'timing',
  },
  {
    key: 'agtGtSgtNonGha',
    label: 'AGT > SGT (Reasons Not Attributable to GHA)',
  },
  {
    key: 'agtGtSgtGha',
    label: 'AGT > SGT (Reasons Attributable to GHA)',
    tone: 'gha',
  },
  { key: 'arrivedOnOrBeforeSta', label: 'Flights Arrived On Or Before STA' },
  { key: 'onTime', label: 'On Time Flights', tone: 'otp' },
  { key: 'beforeSta', label: 'Before STA Flights', tone: 'otp' },
  {
    key: 'depBeforeStdAgtLtSgt',
    label: 'Departed Before STD & AGT < SGT',
    tone: 'timing',
  },
  {
    key: 'depBeforeStdAgtEqSgt',
    label: 'Departed Before STD & AGT = SGT',
    tone: 'timing',
  },
  { key: 'exceedingSgtBeforeStd', label: 'Exceeding SGT But Before STD' },
  {
    key: 'agtGtSgtPostStdNonGha',
    label: 'AGT > SGT Departed Post STD (Reasons Not Attributable to GHA)',
  },
  {
    key: 'agtGtSgtPostStdGha',
    label: 'AGT > SGT Departed Post STD (Reasons Attributable to GHA)',
    tone: 'gha',
  },
  { key: 'total', label: 'TOTAL', tone: 'total' },
];

export type AirlineFlightReportRow = {
  name: string;
  /** IATA / FHR code for sheet tabs (EK, LH). Empty for COMBINED. */
  code: string;
  /** Raw flight rows for this airline (Excel row count). */
  flights: number;
  metrics: Record<AirlineReportMetricKey, number>;
};

function asCount(v: string | number | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function emptyMetrics(): Record<AirlineReportMetricKey, number> {
  return {
    xxld: 0,
    lateSta: 0,
    depOnOrBeforeStd: 0,
    depPostStdAgtLeSgt: 0,
    agtGtSgtNonGha: 0,
    agtGtSgtGha: 0,
    arrivedOnOrBeforeSta: 0,
    onTime: 0,
    beforeSta: 0,
    depBeforeStdAgtLtSgt: 0,
    depBeforeStdAgtEqSgt: 0,
    exceedingSgtBeforeStd: 0,
    agtGtSgtPostStdNonGha: 0,
    agtGtSgtPostStdGha: 0,
    total: 0,
  };
}

function addMetrics(
  target: Record<AirlineReportMetricKey, number>,
  add: Record<AirlineReportMetricKey, number>,
) {
  for (const key of AIRLINE_REPORT_METRIC_KEYS) {
    target[key] += add[key];
  }
}

/** One flight → EM–EZ contributions (FA = EM+EN+ES). */
function metricsFromRow(row: StationWiseInputRow): Record<AirlineReportMetricKey, number> {
  const ev = evaluateStationWiseRow(row);
  const xxld = asCount(ev.BE);
  const lateSta = asCount(ev.DW);
  const arrivedOnOrBeforeSta = asCount(ev.EB);
  const metrics: Record<AirlineReportMetricKey, number> = {
    xxld,
    lateSta,
    depOnOrBeforeStd: asCount(ev.DX),
    depPostStdAgtLeSgt: asCount(ev.DY),
    agtGtSgtNonGha: asCount(ev.DZ),
    agtGtSgtGha: asCount(ev.EA),
    arrivedOnOrBeforeSta,
    onTime: asCount(ev.EC),
    beforeSta: asCount(ev.ED),
    depBeforeStdAgtLtSgt: asCount(ev.EE),
    depBeforeStdAgtEqSgt: asCount(ev.EF),
    exceedingSgtBeforeStd: asCount(ev.EG),
    // EY ← EI, EZ ← EJ (same as Excel COMBINED / airline SUMIF map)
    agtGtSgtPostStdNonGha: asCount(ev.EI),
    agtGtSgtPostStdGha: asCount(ev.EJ),
    total: xxld + lateSta + arrivedOnOrBeforeSta,
  };
  return metrics;
}

/** A–Z airline names for preview + Excel (case-insensitive). */
export function compareAirlineName(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
}

/**
 * Build FLIGHT REPORT rows: COMBINED first, then airlines A–Z.
 */
export function buildAirlineFlightReport(
  rows: StationWiseInputRow[],
): AirlineFlightReportRow[] {
  const byAirline = new Map<
    string,
    {
      flights: number;
      metrics: Record<AirlineReportMetricKey, number>;
      codeVotes: Map<string, number>;
    }
  >();
  const combined = emptyMetrics();
  let combinedFlights = 0;

  for (const row of rows) {
    const name = row.airline.trim() || 'Unknown';
    const metrics = metricsFromRow(row);
    combinedFlights += 1;
    addMetrics(combined, metrics);

    const code =
      String(row.airlineCode ?? '').trim().toUpperCase() ||
      resolveStationWiseAirlineCode('', row.flightNo, name);

    const bucket = byAirline.get(name) ?? {
      flights: 0,
      metrics: emptyMetrics(),
      codeVotes: new Map<string, number>(),
    };
    bucket.flights += 1;
    addMetrics(bucket.metrics, metrics);
    if (code) {
      bucket.codeVotes.set(code, (bucket.codeVotes.get(code) ?? 0) + 1);
    }
    byAirline.set(name, bucket);
  }

  const pickCode = (votes: Map<string, number>, name: string): string => {
    let best = '';
    let bestN = 0;
    for (const [code, n] of votes) {
      if (n > bestN || (n === bestN && code < best)) {
        best = code;
        bestN = n;
      }
    }
    return best || resolveStationWiseAirlineCode('', '', name);
  };

  const airlines = [...byAirline.entries()]
    .map(([name, value]) => ({
      name,
      code: pickCode(value.codeVotes, name),
      flights: value.flights,
      metrics: value.metrics,
    }))
    .sort((a, b) => compareAirlineName(a.name, b.name));

  return [
    { name: 'COMBINED', code: '', flights: combinedFlights, metrics: combined },
    ...airlines,
  ];
}
