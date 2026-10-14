export const SCHEDULED_MIX_BUCKET_KEYS = [
  'SCH-I-P-NB',
  'SCH-I-P-WB',
  'SCH-D-P-NB',
  'SCH-D-P-WB',
  'SCH-I-F-NB',
  'SCH-I-F-WB',
  'SCH-D-F-NB',
  'SCH-D-F-WB',
] as const;

export type ScheduledMixBucket = (typeof SCHEDULED_MIX_BUCKET_KEYS)[number];

/**
 * One `fhr_collection` flight counted in the dashboard “Scheduled mix (fhr_collection)” tile
 * (STA-day window, not cancelled; **TypeofHandling** Scheduled/SCH only — excludes Additional;
 * category → I/D × P/F; NB/WB from advance-aircraft when TypeCraft matches, else main-details heuristics).
 */
export type ScheduledMixCountedFlightRow = {
  serialNo: number | null;
  flightNo: string;
  staYmd: string;
  mixCategory: ScheduledMixBucket;
  typeofHandling: string;
  cateOfFlight: string;
  typeCraftRaw: string;
  segment: 'I' | 'D';
  passengerOrFreighter: 'P' | 'F';
  aircraftBody: 'NB' | 'WB';
};

/** Carrier track used by the dashboard "Aircraft analysis" split tables. */
export type AircraftAnalysisCarrierType = 'scheduled' | 'additional';

/**
 * One flight counted by the dashboard "Aircraft analysis" card, tagged with its
 * carrier track (`scheduled` | `additional`) and category bucket. Flights whose
 * route/category cannot be resolved to an `SCH-*` bucket fall under `'OTHER'`,
 * mirroring the `other` count in {@link getScheduledCategoryBreakdownForStaYmdWindow}.
 */
export type AircraftAnalysisFlightRow = {
  serialNo: number | null;
  flightNo: string;
  staYmd: string;
  carrierType: AircraftAnalysisCarrierType;
  mixCategory: ScheduledMixBucket | 'OTHER';
  typeofHandling: string;
  cateOfFlight: string;
  typeCraftRaw: string;
  airline: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  ataDate: string;
  ataTime: string;
  atdDate: string;
  atdTime: string;
};
