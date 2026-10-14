import {
  AIRLINE_REPORT_METRIC_KEYS,
  buildAirlineFlightReport,
  compareAirlineName,
  type AirlineReportMetricKey,
} from './station-wise-airline-report.util';
import type { StationWiseInputRow } from './station-wise-map-fhr.util';
import type { CalendarMonthSlice } from './station-wise-months.util';

/** LH_MONTHWISE columns B–P = Station Wise EM–FA. */
export const MONTH_WISE_COLUMNS: Array<{
  letter: string;
  key: AirlineReportMetricKey;
  label: string;
  tone?: 'xxld' | 'gha' | 'timing' | 'otp' | 'total';
  fillArgb?: string;
  fontArgb?: string;
}> = [
  {
    letter: 'B',
    key: 'xxld',
    label: 'Cancelled flight',
    tone: 'xxld',
    fontArgb: 'FFFF0000',
  },
  { letter: 'C', key: 'lateSta', label: 'Flight Arrived Later Than STA' },
  {
    letter: 'D',
    key: 'depOnOrBeforeStd',
    label: 'Departed On or Before STD',
    tone: 'timing',
    fillArgb: 'FFC6EFCE',
  },
  {
    letter: 'E',
    key: 'depPostStdAgtLeSgt',
    label: 'Departed Post STD but AGT <= SGT',
    tone: 'timing',
    fillArgb: 'FFA9D08E',
  },
  {
    letter: 'F',
    key: 'agtGtSgtNonGha',
    label: 'AGT > SGT (Reasons Not Attributable to GHA)',
  },
  {
    letter: 'G',
    key: 'agtGtSgtGha',
    label: 'AGT > SGT (Reasons Attributable to GHA)',
    tone: 'gha',
    fillArgb: 'FFF8CBAD',
  },
  { letter: 'H', key: 'arrivedOnOrBeforeSta', label: 'Flights Arrived Before STA' },
  { letter: 'I', key: 'onTime', label: 'On Time Flights', tone: 'otp' },
  { letter: 'J', key: 'beforeSta', label: 'Before STA Flights', tone: 'otp' },
  {
    letter: 'K',
    key: 'depBeforeStdAgtLtSgt',
    label: 'Departed Before STD & AGT < SGT',
    tone: 'timing',
    fillArgb: 'FFC6EFCE',
  },
  {
    letter: 'L',
    key: 'depBeforeStdAgtEqSgt',
    label: 'Departed Before STD & AGT = SGT',
    tone: 'timing',
    fillArgb: 'FFA9D08E',
  },
  {
    letter: 'M',
    key: 'exceedingSgtBeforeStd',
    label: 'Exceeding SGT but Before STD',
    tone: 'timing',
    fillArgb: 'FFA9D08E',
  },
  {
    letter: 'N',
    key: 'agtGtSgtPostStdNonGha',
    label: 'AGT > SGT Departed post STD (Reasons Not Attributable to GHA)',
  },
  {
    letter: 'O',
    key: 'agtGtSgtPostStdGha',
    label: 'AGT > SGT Departed post STD (Reasons Attributable to GHA)',
    tone: 'gha',
    fillArgb: 'FFF8CBAD',
  },
  { letter: 'P', key: 'total', label: 'TOTAL', tone: 'total' },
];

export type MonthWisePerformance = {
  onTime: number;
  cancelled: number;
  offSked: number;
  gtSaved: number;
  beforeStd: number;
  nonGha: number;
  gha: number;
  total: number;
};

export const MONTH_WISE_PERFORMANCE_LABELS = [
  '1. Flight Operated ON TIME',
  '2. Cancelled Flight',
  '3. Flight Operated Off - Sked :',
  'a. Ground Time Saved',
  'b. Departed on or before STD',
  'c. AGT > SGT (Reasons not attributable to GHA)',
  'Improvement for GHA',
  'Total Flights',
] as const;

const EMPTY: Record<AirlineReportMetricKey, number> = {
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

export function emptyMonthWiseMetrics(): Record<AirlineReportMetricKey, number> {
  return { ...EMPTY };
}

/** Same identity as Station Wise FA = EM+EN+ES. */
export function monthWiseRowTotal(
  m: Record<AirlineReportMetricKey, number>,
): number {
  return m.xxld + m.lateSta + m.arrivedOnOrBeforeSta;
}

/**
 * LH performance block (V7–V14) from column totals B/I/D+E+K/L+M/F+N/G+O.
 * Matches Station Wise FG6–FG13.
 */
export function performanceFromMetrics(
  m: Record<AirlineReportMetricKey, number>,
): MonthWisePerformance {
  const onTime = m.onTime;
  const cancelled = m.xxld;
  const gtSaved =
    m.depOnOrBeforeStd + m.depPostStdAgtLeSgt + m.depBeforeStdAgtLtSgt;
  const beforeStd = m.depBeforeStdAgtEqSgt + m.exceedingSgtBeforeStd;
  const nonGha = m.agtGtSgtNonGha + m.agtGtSgtPostStdNonGha;
  const gha = m.agtGtSgtGha + m.agtGtSgtPostStdGha;
  const offSked = gtSaved + beforeStd + nonGha + gha;
  return {
    onTime,
    cancelled,
    offSked,
    gtSaved,
    beforeStd,
    nonGha,
    gha,
    total: onTime + cancelled + offSked,
  };
}

export function performanceRows(perf: MonthWisePerformance): Array<{
  key: keyof MonthWisePerformance;
  label: string;
  count: number;
  percent: number;
}> {
  const denom = perf.total;
  const pct = (n: number) => (denom <= 0 ? 0 : n / denom);
  return [
    { key: 'onTime', label: MONTH_WISE_PERFORMANCE_LABELS[0], count: perf.onTime, percent: pct(perf.onTime) },
    { key: 'cancelled', label: MONTH_WISE_PERFORMANCE_LABELS[1], count: perf.cancelled, percent: pct(perf.cancelled) },
    { key: 'offSked', label: MONTH_WISE_PERFORMANCE_LABELS[2], count: perf.offSked, percent: pct(perf.offSked) },
    { key: 'gtSaved', label: MONTH_WISE_PERFORMANCE_LABELS[3], count: perf.gtSaved, percent: pct(perf.gtSaved) },
    { key: 'beforeStd', label: MONTH_WISE_PERFORMANCE_LABELS[4], count: perf.beforeStd, percent: pct(perf.beforeStd) },
    { key: 'nonGha', label: MONTH_WISE_PERFORMANCE_LABELS[5], count: perf.nonGha, percent: pct(perf.nonGha) },
    { key: 'gha', label: MONTH_WISE_PERFORMANCE_LABELS[6], count: perf.gha, percent: pct(perf.gha) },
    { key: 'total', label: MONTH_WISE_PERFORMANCE_LABELS[7], count: perf.total, percent: denom <= 0 ? 0 : 1 },
  ];
}

export type MonthWiseMonthRow = {
  key: string;
  label: string;
  from: string;
  to: string;
  metrics: Record<AirlineReportMetricKey, number>;
};

export type MonthWiseAirlineBlock = {
  name: string;
  /** Sheet tab label — airline IATA code (EK) or COMBINED. */
  code: string;
  sheetName: string;
  months: MonthWiseMonthRow[];
  totals: Record<AirlineReportMetricKey, number>;
  performance: MonthWisePerformance;
};

export function excelSheetName(raw: string, used: Set<string>): string {
  let base = String(raw ?? '')
    .replace(/[:\\/?*[\]\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) base = 'Airline';
  base = base.slice(0, 31);
  let out = base;
  let i = 2;
  while (used.has(out.toLowerCase())) {
    const suffix = `_${i}`;
    out = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    i += 1;
  }
  used.add(out.toLowerCase());
  return out;
}

function addMetrics(
  target: Record<AirlineReportMetricKey, number>,
  add: Record<AirlineReportMetricKey, number>,
) {
  for (const key of AIRLINE_REPORT_METRIC_KEYS) {
    target[key] += add[key];
  }
}

/**
 * Build Month Wise blocks for the active station.
 * Airlines = only carriers with FHR rows in the selected window (station-scoped
 * collect). No advance-master padding — inactive station airlines stay out.
 */
export function buildMonthWiseModel(
  months: CalendarMonthSlice[],
  rowsByMonth: Map<string, StationWiseInputRow[]>,
): { combined: MonthWiseAirlineBlock; airlines: MonthWiseAirlineBlock[] } {
  const names = new Set<string>();
  const codeByName = new Map<string, string>();

  const perMonth = months.map((slice) => {
    const report = buildAirlineFlightReport(rowsByMonth.get(slice.key) ?? []);
    for (const row of report) {
      if (row.name === 'COMBINED') continue;
      names.add(row.name);
      if (row.code && !codeByName.has(row.name)) {
        codeByName.set(row.name, row.code);
      }
    }
    return { slice, report };
  });

  const used = new Set<string>(['summary']);
  const airlineNames = [...names].sort(compareAirlineName);

  const toBlock = (name: string): MonthWiseAirlineBlock => {
    const totals = emptyMonthWiseMetrics();
    let code = codeByName.get(name) ?? '';
    const monthRows: MonthWiseMonthRow[] = perMonth.map(({ slice, report }) => {
      const hit = report.find((r) => r.name === name);
      if (hit?.code) code = hit.code;
      const metrics = hit ? { ...hit.metrics } : emptyMonthWiseMetrics();
      metrics.total = monthWiseRowTotal(metrics);
      addMetrics(totals, metrics);
      return {
        key: slice.key,
        label: slice.label,
        from: slice.from,
        to: slice.to,
        metrics,
      };
    });
    totals.total = monthWiseRowTotal(totals);
    const sheetLabel =
      name === 'COMBINED' ? 'COMBINED' : code || name;
    return {
      name,
      code: name === 'COMBINED' ? '' : code,
      sheetName: excelSheetName(sheetLabel, used),
      months: monthRows,
      totals,
      performance: performanceFromMetrics(totals),
    };
  };

  return {
    combined: toBlock('COMBINED'),
    airlines: airlineNames.map(toBlock),
  };
}
