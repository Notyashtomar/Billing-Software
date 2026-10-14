import {
  buildMonthWiseModel,
  emptyMonthWiseMetrics,
  excelSheetName,
  monthWiseRowTotal,
  performanceFromMetrics,
  type MonthWiseAirlineBlock,
  type MonthWisePerformance,
} from './month-wise-layout.util';
import {
  resolveStationWiseAirlineCode,
  type StationWiseInputRow,
} from './station-wise-map-fhr.util';
import { stationWiseLabel, type CalendarMonthSlice } from './station-wise-months.util';

/**
 * Airlines from the Bird Airline Report folder (screenshot). Any other FHR
 * carrier in the window is appended automatically.
 */
export const AIRLINE_WISE_CATALOG: ReadonlyArray<{ code: string; name: string }> = [
  { code: '6E', name: 'INDIGO' },
  { code: 'AF', name: 'AIR FRANCE' },
  { code: 'EK', name: 'EMIRATES' },
  { code: 'EY', name: 'ETIHAD AIRWAYS' },
  { code: 'G9', name: 'AIR ARABIA' },
  { code: 'GF', name: 'GULF AIR' },
  { code: 'KL', name: 'KLM' },
  { code: 'LH', name: 'LUFTHANSA' },
  { code: 'LX', name: 'SWISS' },
  { code: 'SG', name: 'SPICEJET' },
  { code: 'TG', name: 'THAI AIRWAYS' },
  { code: 'UA', name: 'UNITED AIRLINES' },
  { code: 'UL', name: 'SRILANKAN AIRLINES' },
  { code: 'WY', name: 'OMAN AIR' },
];

const CATALOG_NAME = new Map(
  AIRLINE_WISE_CATALOG.map((a) => [a.code, a.name]),
);

export type AirlineWiseStationBlock = {
  stationCode: string;
  stationLabel: string;
  sheetName: string;
  flights: number;
  months: MonthWiseAirlineBlock['months'];
  totals: MonthWiseAirlineBlock['totals'];
  performance: MonthWisePerformance;
};

export type AirlineWiseAirlineBlock = {
  code: string;
  name: string;
  fromCatalog: boolean;
  /** True when this airline has FHR at the login station. */
  atHomeStation?: boolean;
  /** Same window one year earlier — omitted when last year has 0 FHR. */
  priorYear?: AirlineWiseAirlineBlock;
  flights: number;
  stations: AirlineWiseStationBlock[];
  performance: MonthWisePerformance;
  totals: MonthWiseAirlineBlock['totals'];
};

export function airlineCodeFromRow(row: StationWiseInputRow): string {
  return (
    resolveStationWiseAirlineCode(row.airlineCode, row.flightNo, row.airline) ||
    String(row.airlineCode ?? '').trim().toUpperCase()
  );
}

export function stationCodeFromRow(row: StationWiseInputRow): string {
  const code = String(row.stationCode ?? '')
    .trim()
    .toUpperCase();
  return code || 'UNK';
}

export function sortAirlineCodes(codes: Iterable<string>): string[] {
  const order = new Map(AIRLINE_WISE_CATALOG.map((a, i) => [a.code, i]));
  return [...new Set(codes)].sort((a, b) => {
    const ia = order.get(a) ?? 1000;
    const ib = order.get(b) ?? 1000;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

function yearToken(fromYmd: string): string {
  return (fromYmd.slice(0, 4) || '00').slice(-2);
}

function mostCommonName(rows: StationWiseInputRow[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = String(row.airline ?? '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best = '';
  let n = 0;
  for (const [name, count] of counts) {
    if (count > n) {
      best = name;
      n = count;
    }
  }
  return best;
}

function addTotals(
  target: MonthWiseAirlineBlock['totals'],
  add: MonthWiseAirlineBlock['totals'],
) {
  for (const key of Object.keys(add) as Array<keyof typeof add>) {
    target[key] += add[key];
  }
}

/** Stamp last-year block onto current airlines only when that carrier has FHR. */
export function attachPriorYear(
  current: AirlineWiseAirlineBlock[],
  prior: AirlineWiseAirlineBlock[],
): AirlineWiseAirlineBlock[] {
  const byCode = new Map(prior.map((a) => [a.code, a]));
  return current.map((airline) => {
    const last = byCode.get(airline.code);
    if (!last || last.flights <= 0) return airline;
    return { ...airline, priorYear: last };
  });
}

export function airlineWiseExportFileName(
  airlineCode: string,
  fromYmd: string,
  flightScope: 'scheduled' | 'nonScheduled' = 'scheduled',
): string {
  const code = String(airlineCode ?? '').trim().toUpperCase() || 'AIRLINE';
  const year = fromYmd.slice(0, 4) || 'YEAR';
  if (flightScope === 'nonScheduled') {
    return `${code}_NON-SKED_MONTHWISE_${year}.xlsx`;
  }
  return `${code}_MONTHWISE_${year}.xlsx`;
}

/**
 * Catalog codes always present; extra FHR codes from the collected rows only
 * (login station). New flights/airlines at that station appear automatically.
 */
export function buildAirlineWiseModel(
  months: CalendarMonthSlice[],
  allRows: StationWiseInputRow[],
): AirlineWiseAirlineBlock[] {
  const byAirline = new Map<string, StationWiseInputRow[]>();
  for (const row of allRows) {
    const code = airlineCodeFromRow(row);
    if (!code) continue;
    const list = byAirline.get(code) ?? [];
    list.push(row);
    byAirline.set(code, list);
  }

  const codes = sortAirlineCodes([
    ...AIRLINE_WISE_CATALOG.map((a) => a.code),
    ...byAirline.keys(),
  ]);

  const usedSheets = new Set<string>(['summary']);
  const yy = yearToken(months[0]?.from ?? '');

  return codes.map((code) => {
    const rows = byAirline.get(code) ?? [];
    const name =
      CATALOG_NAME.get(code) ??
      (mostCommonName(rows).toUpperCase() || code);
    const stationsSeen = new Set<string>();
    for (const row of rows) stationsSeen.add(stationCodeFromRow(row));
    const stationCodes = [...stationsSeen].sort((a, b) => a.localeCompare(b));

    const stations: AirlineWiseStationBlock[] = stationCodes.map((stn) => {
      const stationRows = rows.filter((r) => stationCodeFromRow(r) === stn);
      const rowsByMonth = new Map<string, StationWiseInputRow[]>();
      for (const month of months) rowsByMonth.set(month.key, []);
      for (const row of stationRows) {
        const bucket = rowsByMonth.get(row.staYmd.slice(0, 7));
        bucket?.push(row);
      }
      const model = buildMonthWiseModel(months, rowsByMonth);
      const block = model.combined;
      return {
        stationCode: stn,
        stationLabel: stationWiseLabel(stn),
        sheetName: excelSheetName(`${stn}_${code}_${yy}`, usedSheets),
        flights: block.totals.total,
        months: block.months,
        totals: block.totals,
        performance: block.performance,
      };
    });

    const totals = emptyMonthWiseMetrics();
    for (const stn of stations) addTotals(totals, stn.totals);
    totals.total = monthWiseRowTotal(totals);

    return {
      code,
      name,
      fromCatalog: CATALOG_NAME.has(code),
      flights: totals.total,
      stations,
      totals,
      performance: performanceFromMetrics(totals),
    };
  });
}
