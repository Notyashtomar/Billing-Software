import {
  ALL_DASHBOARD_AGGREGATE_TYPES,
  DASHBOARD_AGGREGATE_TYPES,
  type DashboardAggregateType,
} from '../constants/dashboard-aggregate-types';
import {
  ALL_DASHBOARD_CARD_KEYS,
  DASHBOARD_CARD_KEYS,
  type DashboardCardKey,
} from '../constants/dashboard-card-keys';

/** Registry: logical source keys used in {@link DashboardSourceChangedPayload.sourceType}. */
export const DASHBOARD_SOURCE_TYPES = {
  FHR_COLLECTION: 'fhr_collection',
  NS_FHR_COLLECTION: 'ns_fhr_collection',
  RAW_FLIGHT_DATA: 'raw_flight_data',
  MAIN_DETAILS: 'main_details',
  TERMINAL_DETAILS: 'terminal_details',
  RAMP_DETAILS: 'ramp_details',
  REMARKS: 'remarks',
  EQUIPMENT_MANPOWER: 'equipment_manpower',
  ATTACHMENTS: 'attachments',
  MIS_IMPORT: 'mis_import',
  IMPORT_COMPLETED: 'import_completed',
  UNKNOWN_SLICE: 'unknown_slice',
} as const;

export type FhrMutateSlice =
  | 'mainDetails'
  | 'terminalDetails'
  | 'loadControlDetails'
  | 'rampDetails1'
  | 'rampDetails3'
  | 'rampDetails2'
  | 'remarks'
  | 'equipmentManpower'
  | 'attachments'
  | 'equipmentDetails'
  | 'reports';

const PRIMARY_PERFORMANCE_AGGREGATE_TYPES: DashboardAggregateType[] = [
  DASHBOARD_AGGREGATE_TYPES.KPI_STRIP,
  DASHBOARD_AGGREGATE_TYPES.PERFORMANCE_REPORT,
  DASHBOARD_AGGREGATE_TYPES.GHA_IMPROVEMENT,
  DASHBOARD_AGGREGATE_TYPES.ON_TIME_PERFORMANCE,
];

const PRIMARY_PERFORMANCE_CARD_KEYS: DashboardCardKey[] = [
  DASHBOARD_CARD_KEYS.KPI_STRIP,
  DASHBOARD_CARD_KEYS.PERFORMANCE_REPORT,
  DASHBOARD_CARD_KEYS.GHA_IMPROVEMENT,
  DASHBOARD_CARD_KEYS.ON_TIME_PERFORMANCE,
];

const FHR_SLICE_TO_CARD_KEYS: Partial<
  Record<FhrMutateSlice, DashboardCardKey[]>
> = {
  remarks: [DASHBOARD_CARD_KEYS.AIRLINE_REMARKS],
  mainDetails: [
    DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_CARD_KEYS,
  ],
  terminalDetails: [
    DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_CARD_KEYS,
  ],
  loadControlDetails: [
    DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_CARD_KEYS,
  ],
  rampDetails1: [
    DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_CARD_KEYS,
  ],
  rampDetails3: [
    DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_CARD_KEYS,
  ],
  rampDetails2: [
    DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_CARD_KEYS,
  ],
  equipmentManpower: [DASHBOARD_CARD_KEYS.EQUIPMENT_UTILIZATION],
  equipmentDetails: [DASHBOARD_CARD_KEYS.EQUIPMENT_UTILIZATION],
  attachments: [
    DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_CARD_KEYS,
  ],
  reports: [...PRIMARY_PERFORMANCE_CARD_KEYS],
};

const FHR_SLICE_TO_AGGREGATES: Partial<
  Record<FhrMutateSlice, DashboardAggregateType[]>
> = {
  remarks: [DASHBOARD_AGGREGATE_TYPES.AIRLINE_REMARKS],
  mainDetails: [
    DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_AGGREGATE_TYPES,
  ],
  terminalDetails: [
    DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_AGGREGATE_TYPES,
  ],
  loadControlDetails: [
    DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_AGGREGATE_TYPES,
  ],
  rampDetails1: [
    DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_AGGREGATE_TYPES,
  ],
  rampDetails3: [
    DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_AGGREGATE_TYPES,
  ],
  rampDetails2: [
    DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_AGGREGATE_TYPES,
  ],
  equipmentManpower: [DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION],
  equipmentDetails: [DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION],
  attachments: [
    DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS,
    ...PRIMARY_PERFORMANCE_AGGREGATE_TYPES,
  ],
  reports: [...PRIMARY_PERFORMANCE_AGGREGATE_TYPES],
};

/**
 * Declares which dashboard cards logically depend on each persisted domain.
 * Used for incremental invalidation when `slice` / `sourceType` is known.
 */
export const DASHBOARD_CARD_DEPENDENCIES: Record<string, readonly DashboardCardKey[]> =
  {
    [DASHBOARD_SOURCE_TYPES.FHR_COLLECTION]: ALL_DASHBOARD_CARD_KEYS,
    [DASHBOARD_SOURCE_TYPES.NS_FHR_COLLECTION]: ALL_DASHBOARD_CARD_KEYS,
    [DASHBOARD_SOURCE_TYPES.RAW_FLIGHT_DATA]: [
      DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
      ...PRIMARY_PERFORMANCE_CARD_KEYS,
    ],
    [DASHBOARD_SOURCE_TYPES.MAIN_DETAILS]: [
      DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
      ...PRIMARY_PERFORMANCE_CARD_KEYS,
    ],
    [DASHBOARD_SOURCE_TYPES.TERMINAL_DETAILS]: [
      DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
      ...PRIMARY_PERFORMANCE_CARD_KEYS,
    ],
    [DASHBOARD_SOURCE_TYPES.RAMP_DETAILS]: [
      DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
      ...PRIMARY_PERFORMANCE_CARD_KEYS,
    ],
    [DASHBOARD_SOURCE_TYPES.REMARKS]: [DASHBOARD_CARD_KEYS.AIRLINE_REMARKS],
    [DASHBOARD_SOURCE_TYPES.EQUIPMENT_MANPOWER]: [
      DASHBOARD_CARD_KEYS.EQUIPMENT_UTILIZATION,
    ],
    [DASHBOARD_SOURCE_TYPES.ATTACHMENTS]: [
      DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
      ...PRIMARY_PERFORMANCE_CARD_KEYS,
    ],
    [DASHBOARD_SOURCE_TYPES.MIS_IMPORT]: ALL_DASHBOARD_CARD_KEYS,
    [DASHBOARD_SOURCE_TYPES.IMPORT_COMPLETED]: ALL_DASHBOARD_CARD_KEYS,
  };

export function resolveCardsForFhrSlice(
  slice: string | undefined,
): DashboardCardKey[] {
  if (!slice) return [...ALL_DASHBOARD_CARD_KEYS];
  const keys = FHR_SLICE_TO_CARD_KEYS[slice as FhrMutateSlice];
  return keys ? [...keys] : [...ALL_DASHBOARD_CARD_KEYS];
}

export function resolveAggregatesForFhrSlice(
  slice: string | undefined,
): DashboardAggregateType[] {
  if (!slice) return [...ALL_DASHBOARD_AGGREGATE_TYPES];
  const types = FHR_SLICE_TO_AGGREGATES[slice as FhrMutateSlice];
  return types ? [...types] : [...ALL_DASHBOARD_AGGREGATE_TYPES];
}

export function resolveCardsForSourceType(sourceType: string): DashboardCardKey[] {
  const dep = DASHBOARD_CARD_DEPENDENCIES[sourceType];
  return dep ? [...dep] : [...ALL_DASHBOARD_CARD_KEYS];
}
