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

export type RemarksPreviewFlight = {
  serialNo: string;
  airline: string;
  flightNo: string;
  typeCraft: string;
  ataTime: string;
  ataDate: string;
  airRep: string;
  airRepRem: string;
  ratingValue: string;
  staYmd: string;
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
};

export type RemarksStatusPayload = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  rangeLabel: string;
  flightScope: 'scheduled' | 'nonScheduled';
  flightScopeLabel: string;
  readyForExport: boolean;
  coverage: {
    earliestYmd?: string | null;
    latestYmd?: string | null;
    latestMonthFrom?: string | null;
    latestMonthTo?: string | null;
  } | null;
  months: RemarksMonthBlock[];
  airlines: RemarksAirlineSummary[];
  totals: RemarksAirlineSummary;
  ratingPreview: RemarksRatingPreview[];
  sampleFlights: RemarksPreviewFlight[];
  flightColumns: Array<{ letter: string; key: string; label: string }>;
  summaryColumns: Array<{
    letter: string;
    key: string;
    label: string;
    fillArgb: string;
  }>;
  summary: {
    flights: number;
    months: number;
    airlines: number;
    comments: number;
  };
};
