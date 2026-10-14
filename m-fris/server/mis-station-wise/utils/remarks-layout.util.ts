import { AIRLINE_REMARKS_BLANK_LABEL } from 'src/remarks/remarks-rating.constants';
import type { CalendarMonthSlice } from './station-wise-months.util';
import {
  REMARKS_EXCEL_RATING_LABELS,
  remarksMonthSheetName,
  type RemarksExcelRatingLabel,
  type RemarksFlightRow,
  type RemarksPreviewFlight,
  toRemarksPreviewFlight,
} from './remarks-map-fhr.util';

export type RemarksFlightColumn = {
  letter: string;
  key: string;
  label: string;
};

/** A–I flight detail columns (AirRep = name, AirRepRem = remarks). */
export const REMARKS_FLIGHT_COLUMNS: RemarksFlightColumn[] = [
  { letter: 'A', key: 'serialNo', label: 'SerialNo' },
  { letter: 'B', key: 'airline', label: 'Airline' },
  { letter: 'C', key: 'flightNo', label: 'FlightNo' },
  { letter: 'D', key: 'typeCraft', label: 'TypeCraft' },
  { letter: 'E', key: 'ataTime', label: 'ATATime' },
  { letter: 'F', key: 'ataDate', label: 'ATADate' },
  { letter: 'G', key: 'airRep', label: 'AirRep' },
  { letter: 'H', key: 'airRepRem', label: 'AirRepRem' },
  { letter: 'I', key: 'ratingValue', label: 'RateingValue' },
];

export type RemarksSummaryColumn = {
  letter: string;
  key: string;
  label: string;
  fillArgb: string;
};

/** J–S airline summary (template yellow + rating colors). */
export const REMARKS_SUMMARY_COLUMNS: RemarksSummaryColumn[] = [
  { letter: 'J', key: 'airline', label: 'Airline', fillArgb: 'FFFFF2CC' },
  { letter: 'K', key: 'fltCount', label: 'Flt. Count', fillArgb: 'FFFFF2CC' },
  { letter: 'L', key: 'arlComnt', label: 'Arl. Comnt', fillArgb: 'FFFFF2CC' },
  { letter: 'M', key: 'comntPct', label: 'Comnt %', fillArgb: 'FFFFFFFF' },
  {
    letter: 'N',
    key: 'notSatisfactory',
    label: 'Not satisfactory',
    fillArgb: 'FFFF5B5B',
  },
  {
    letter: 'O',
    key: 'belowAverage',
    label: 'Below Average',
    fillArgb: 'FFF8D142',
  },
  {
    letter: 'P',
    key: 'satisfactory',
    label: 'Satisfactory',
    fillArgb: 'FFFFF2CC',
  },
  { letter: 'Q', key: 'good', label: 'Good', fillArgb: 'FFCCFFCC' },
  { letter: 'R', key: 'excellent', label: 'Excellent', fillArgb: 'FF66FF99' },
  { letter: 'S', key: 'blanks', label: 'Blanks', fillArgb: 'FFFFFFFF' },
];

export type RemarksAirlineSummary = {
  airline: string;
  fltCount: number;
  arlComnt: number;
  comntPct: number;
  notSatisfactory: number;
  belowAverage: number;
  satisfactory: number;
  good: number;
  excellent: number;
  blanks: number;
};

export type RemarksRatingPreview = {
  key: string;
  label: string;
  count: number;
  percent: number;
  fillArgb?: string;
};

export type RemarksMonthBlock = {
  id: string;
  sheetName: string;
  label: string;
  from: string;
  to: string;
  flightCount: number;
  commentCount: number;
  status: 'complete' | 'partial' | 'missing';
  message: string;
  airlines: RemarksAirlineSummary[];
  totals: RemarksAirlineSummary;
  flights: RemarksFlightRow[];
};

export type RemarksModel = {
  months: RemarksMonthBlock[];
  allFlights: RemarksFlightRow[];
  sampleFlights: RemarksPreviewFlight[];
  combinedAirlines: RemarksAirlineSummary[];
  combinedTotals: RemarksAirlineSummary;
  ratingPreview: RemarksRatingPreview[];
};

const PREVIEW_CAP = 5000;

function emptyTotals(airline = 'TOTAL'): RemarksAirlineSummary {
  return {
    airline,
    fltCount: 0,
    arlComnt: 0,
    comntPct: 0,
    notSatisfactory: 0,
    belowAverage: 0,
    satisfactory: 0,
    good: 0,
    excellent: 0,
    blanks: 0,
  };
}

function ratingField(
  label: RemarksExcelRatingLabel | typeof AIRLINE_REMARKS_BLANK_LABEL,
):
  | 'notSatisfactory'
  | 'belowAverage'
  | 'satisfactory'
  | 'good'
  | 'excellent'
  | 'blanks' {
  switch (label) {
    case 'Not satisfactory':
      return 'notSatisfactory';
    case 'Below Average':
      return 'belowAverage';
    case 'Satisfactory':
      return 'satisfactory';
    case 'Good':
      return 'good';
    case 'Excellent':
      return 'excellent';
    default:
      return 'blanks';
  }
}

export function buildAirlineSummaries(
  rows: RemarksFlightRow[],
): { airlines: RemarksAirlineSummary[]; totals: RemarksAirlineSummary } {
  const byAirline = new Map<string, RemarksFlightRow[]>();
  for (const row of rows) {
    const key = row.airline || 'Unknown';
    const list = byAirline.get(key) ?? [];
    list.push(row);
    byAirline.set(key, list);
  }

  const airlines: RemarksAirlineSummary[] = [];
  for (const [airline, list] of [...byAirline.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    airlines.push(summarizeAirline(airline, list));
  }

  const totals = summarizeAirline('TOTAL', rows);
  return { airlines, totals };
}

export function summarizeAirline(
  airline: string,
  rows: RemarksFlightRow[],
): RemarksAirlineSummary {
  const out = emptyTotals(airline);
  out.fltCount = rows.length;
  for (const row of rows) {
    if (row.airRepRem.trim()) out.arlComnt += 1;
    const field = ratingField(row.ratingValue || AIRLINE_REMARKS_BLANK_LABEL);
    out[field] += 1;
  }
  out.comntPct = out.fltCount > 0 ? out.arlComnt / out.fltCount : 0;
  return out;
}

function ratingPreviewFromTotals(
  totals: RemarksAirlineSummary,
): RemarksRatingPreview[] {
  const total = totals.fltCount;
  const pct = (n: number) => (total > 0 ? n / total : 0);
  const cols = REMARKS_SUMMARY_COLUMNS.filter((c) =>
    [
      'notSatisfactory',
      'belowAverage',
      'satisfactory',
      'good',
      'excellent',
      'blanks',
      'arlComnt',
      'fltCount',
    ].includes(c.key),
  );

  const items: RemarksRatingPreview[] = [
    {
      key: 'fltCount',
      label: 'Total flights',
      count: totals.fltCount,
      percent: total > 0 ? 1 : 0,
      fillArgb: 'FFFFF2CC',
    },
    {
      key: 'arlComnt',
      label: 'Airline comments',
      count: totals.arlComnt,
      percent: pct(totals.arlComnt),
      fillArgb: 'FFFFF2CC',
    },
  ];

  for (const label of REMARKS_EXCEL_RATING_LABELS) {
    const col = REMARKS_SUMMARY_COLUMNS.find((c) => c.label === label);
    const key = ratingField(label);
    items.push({
      key,
      label,
      count: totals[key] as number,
      percent: pct(totals[key] as number),
      fillArgb: col?.fillArgb,
    });
  }

  items.push({
    key: 'blanks',
    label: AIRLINE_REMARKS_BLANK_LABEL,
    count: totals.blanks,
    percent: pct(totals.blanks),
    fillArgb: 'FFFFFFFF',
  });

  // silence unused when tree-shaken differently
  void cols;
  return items;
}

function monthStatus(
  count: number,
  slice: CalendarMonthSlice,
  sheetName: string,
): Pick<RemarksMonthBlock, 'status' | 'message'> {
  if (count === 0) {
    return {
      status: 'missing',
      message: `No scheduled FHR flights on STA dates in ${sheetName}.`,
    };
  }
  return {
    status: 'complete',
    message: `${count} flight row${count === 1 ? '' : 's'} · airline summary formulas ready.`,
  };
}

export function buildRemarksModel(
  months: CalendarMonthSlice[],
  rowsByMonth: Map<string, RemarksFlightRow[]>,
  allFlights: RemarksFlightRow[],
): RemarksModel {
  const monthBlocks: RemarksMonthBlock[] = months.map((slice) => {
    const [y, m] = slice.key.split('-').map(Number);
    const sheetName = remarksMonthSheetName(y, (m || 1) - 1);
    const flights = rowsByMonth.get(slice.key) ?? [];
    const { airlines, totals } = buildAirlineSummaries(flights);
    const commentCount = totals.arlComnt;
    const st = monthStatus(flights.length, slice, sheetName);
    return {
      id: slice.key,
      sheetName,
      label: slice.label,
      from: slice.from,
      to: slice.to,
      flightCount: flights.length,
      commentCount,
      status: st.status,
      message: st.message,
      airlines,
      totals,
      flights,
    };
  });

  const { airlines: combinedAirlines, totals: combinedTotals } =
    buildAirlineSummaries(allFlights);

  const sampleFlights = allFlights
    .slice(0, PREVIEW_CAP)
    .map((row) => toRemarksPreviewFlight(row));

  return {
    months: monthBlocks,
    allFlights,
    sampleFlights,
    combinedAirlines,
    combinedTotals,
    ratingPreview: ratingPreviewFromTotals(combinedTotals),
  };
}
