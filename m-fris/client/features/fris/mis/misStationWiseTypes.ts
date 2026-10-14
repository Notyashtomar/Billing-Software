export type StationWiseAirlineReportColumn = {
  key: string;
  label: string;
  tone?: 'xxld' | 'gha' | 'timing' | 'otp' | 'total';
};

/** FLIGHT REPORT row — same metrics as Excel EM–FA. */
export type StationWiseAirlinePreview = {
  name: string;
  flights: number;
  metrics: Record<string, number>;
};

export type StationWiseMonthStatus = {
  id: string;
  sheetName: string;
  label: string;
  from: string;
  to: string;
  flightCount: number;
  status: 'complete' | 'partial' | 'missing';
  message: string;
  /** FLIGHT REPORT for this month sheet (COMBINED + airlines). */
  airlines?: StationWiseAirlinePreview[];
};

export type StationWisePreviewMetric = {
  key: string;
  label: string;
  count: number;
  percent: number;
};

export type StationWiseSheetColumn = {
  letter: string;
  key: string;
  label: string;
  kind: 'input' | 'formula';
  group: string;
  formulaSample?: string;
};

export type StationWisePreviewFlight = {
  serialNo: string;
  airline: string;
  flightNo: string;
  typeCraft: string;
  staTime: string;
  staDate: string;
  stdTime: string;
  stdDate: string;
  ataTime: string;
  ataDate: string;
  atdTime: string;
  atdDate: string;
  delay: string;
  actualDelay: string;
  delay1: string;
  reasonOfDelay: string;
  delay2: string;
  delaycode2: string;
  delay3: string;
  delaycode3: string;
  /** Operating-day key for month-chip filtering. */
  staYmd?: string;
  /** Excel column letter → display value (A–T + evaluated formulas). */
  cells?: Record<string, string>;
  /** MAA conditional formatting styles keyed by Excel column letter. */
  cellStyles?: Record<string, { backgroundColor: string; color: string; ruleId: string }>;
};

export type StationWiseConditionalFormat = {
  id: string;
  label: string;
  fromCol: string;
  toCol: string;
  operator: 'equal' | 'greaterThan' | 'containsText';
  value: number | string;
  fill: string;
  color: string;
};

export type StationWiseStatusPayload = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  rangeLabel: string;
  flightScope?: 'scheduled' | 'nonScheduled';
  flightScopeLabel?: string;
  readyForExport: boolean;
  months: StationWiseMonthStatus[];
  preview: StationWisePreviewMetric[];
  airlines: StationWiseAirlinePreview[];
  airlineReportColumns?: StationWiseAirlineReportColumn[];
  sampleFlights: StationWisePreviewFlight[];
  sheetColumns: StationWiseSheetColumn[];
  formulaColumns: StationWiseSheetColumn[];
  conditionalFormats?: StationWiseConditionalFormat[];
  coverage?: {
    earliestStaYmd: string | null;
    latestStaYmd: string | null;
    latestMonthFrom: string | null;
    latestMonthTo: string | null;
    latestMonthLabel: string | null;
  } | null;
  summary: {
    flights: number;
    months: number;
    airlines: number;
    inputColumns: number;
    formulaColumns: number;
  };
};

/** Keys on the flight preview row that map 1:1 to Excel A–T. */
export const PREVIEW_INPUT_KEYS: Array<{
  key: keyof StationWisePreviewFlight;
  label: string;
  letter: string;
}> = [
  { key: 'serialNo', label: 'SerialNo', letter: 'A' },
  { key: 'airline', label: 'Airline', letter: 'B' },
  { key: 'flightNo', label: 'FlightNo', letter: 'C' },
  { key: 'typeCraft', label: 'TypeCraft', letter: 'D' },
  { key: 'staTime', label: 'STATime', letter: 'E' },
  { key: 'staDate', label: 'STADate', letter: 'F' },
  { key: 'stdTime', label: 'STDTime', letter: 'G' },
  { key: 'stdDate', label: 'STDDate', letter: 'H' },
  { key: 'ataTime', label: 'ATATime', letter: 'I' },
  { key: 'ataDate', label: 'ATADate', letter: 'J' },
  { key: 'atdTime', label: 'ATDTime', letter: 'K' },
  { key: 'atdDate', label: 'ATDDate', letter: 'L' },
  { key: 'delay', label: 'Delay', letter: 'M' },
  { key: 'actualDelay', label: 'ActualDelay', letter: 'N' },
  { key: 'delay1', label: 'delay1', letter: 'O' },
  { key: 'reasonOfDelay', label: 'ReasonofDelay', letter: 'P' },
  { key: 'delay2', label: 'delay2', letter: 'Q' },
  { key: 'delaycode2', label: 'delaycode2', letter: 'R' },
  { key: 'delay3', label: 'delay3', letter: 'S' },
  { key: 'delaycode3', label: 'delaycode3', letter: 'T' },
];
