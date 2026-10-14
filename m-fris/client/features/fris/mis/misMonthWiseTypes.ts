export type MonthWiseColumn = {
  letter: string;
  key: string;
  label: string;
  tone?: string;
  fillArgb?: string;
  fontArgb?: string;
};

export type MonthWiseMetrics = Record<string, number>;

export type MonthWiseMonthRow = {
  key: string;
  label: string;
  from: string;
  to: string;
  metrics: MonthWiseMetrics;
};

export type MonthWiseAirlineBlock = {
  name: string;
  code: string;
  sheetName: string;
  months: MonthWiseMonthRow[];
  totals: MonthWiseMetrics;
  performance: {
    onTime: number;
    cancelled: number;
    offSked: number;
    gtSaved: number;
    beforeStd: number;
    nonGha: number;
    gha: number;
    total: number;
  };
};

export type MonthWiseStatusPayload = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  rangeLabel: string;
  flightScope: 'scheduled' | 'nonScheduled';
  flightScopeLabel: string;
  readyForExport: boolean;
  coverage: {
    latestMonthFrom?: string | null;
    latestMonthTo?: string | null;
  } | null;
  columns: MonthWiseColumn[];
  preview: Array<{ key: string; label: string; count: number; percent: number }>;
  airlines: MonthWiseAirlineBlock[];
  combined: MonthWiseAirlineBlock;
  summary: { flights: number; months: number; airlines: number };
};
