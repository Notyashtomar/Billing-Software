export type AirlineWiseColumn = {
  letter: string;
  key: string;
  label: string;
  tone?: string;
  fillArgb?: string;
  fontArgb?: string;
};

export type AirlineWisePerformance = {
  onTime: number;
  cancelled: number;
  offSked: number;
  gtSaved: number;
  beforeStd: number;
  nonGha: number;
  gha: number;
  total: number;
};

export type AirlineWiseStationBlock = {
  stationCode: string;
  stationLabel: string;
  sheetName: string;
  flights: number;
  months: Array<{
    key: string;
    label: string;
    from: string;
    to: string;
    metrics: Record<string, number>;
  }>;
  totals: Record<string, number>;
  performance: AirlineWisePerformance;
};

export type AirlineWiseAirlineBlock = {
  code: string;
  name: string;
  fromCatalog: boolean;
  atHomeStation?: boolean;
  priorYear?: AirlineWiseAirlineBlock;
  flights: number;
  stations: AirlineWiseStationBlock[];
  performance: AirlineWisePerformance;
  totals: Record<string, number>;
};

export type AirlineWisePreviewFlight = {
  stationCode: string;
  airlineCode: string;
  airline: string;
  flightNo: string;
  typeCraft: string;
  staYmd: string;
  staTime: string;
  staDate: string;
  stdTime: string;
  stdDate: string;
  ataTime: string;
  ataDate: string;
  atdTime: string;
  atdDate: string;
  delay: string;
};

export type AirlineWiseStatusPayload = {
  scope: 'all-stations';
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  rangeLabel: string;
  flightScope: 'scheduled' | 'nonScheduled';
  flightScopeLabel: string;
  readyForExport: boolean;
  columns: AirlineWiseColumn[];
  preview: Array<{ key: string; label: string; count: number; percent: number }>;
  airlines: AirlineWiseAirlineBlock[];
  flights: AirlineWisePreviewFlight[];
  flightsTruncated: boolean;
  summary: { flights: number; months: number; airlines: number; stations: number };
};
