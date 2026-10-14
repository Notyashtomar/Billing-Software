import type { DashboardCardKey } from '../constants/dashboard-card-keys';
import type { DashboardAggregateType } from '../constants/dashboard-aggregate-types';
import type { DashboardFlightScope } from '../constants/dashboard-flight-scope';

export type DashboardRangeYmd = { fromDate: string; tillDate: string };

/**
 * Normalized payload for {@link DASHBOARD_SOURCE_CHANGED}.
 * `affectedDateKeys`: optional YYYYMMDD integers for audit / metrics.
 */
export interface DashboardSourceChangedPayload {
  serialNo?: string;
  affectedDateKeys?: number[];
  affectedRanges?: DashboardRangeYmd[];
  affectedDatesYmd?: string[];
  sourceType: string;
  updatedAt: Date;
  /** FHR slice / sub-domain hint (e.g. equipmentManpower). */
  slice?: string;
  /** Optional cards to invalidate — when set, skip dependency registry card resolution. */
  explicitCardKeys?: readonly DashboardCardKey[];
  /** Optional aggregates — when set, skip registry aggregate resolution. */
  explicitAggregateTypes?: readonly DashboardAggregateType[];
  equipmentMode?: string;
  airline?: string;
  station?: string;
  /** scheduled vs nonScheduled aggregate collections. */
  flightScope?: DashboardFlightScope;
}

export class DashboardSourceChangedEvent {
  constructor(public readonly payload: DashboardSourceChangedPayload) {}

  get sourceType(): string {
    return this.payload.sourceType;
  }
}
