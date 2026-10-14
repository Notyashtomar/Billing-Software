import type { DashboardEquipmentMode } from '../interfaces';
import type { DashboardFlightScope } from '../constants/dashboard-flight-scope';
import type { DashboardSummaryWorkerService } from '../services/dashboard-summary-worker.service';
import { mapPool } from './async-pool.util';

export type RebuildShardScope = 'full' | 'equipment-only';

export type RebuildShardOptions = {
  equipmentMode: DashboardEquipmentMode;
  /**
   * `equipment-only` — only `equipmentUtilization` daily aggregates for `equipmentMode`.
   * Default for `6h` rebuilds so airline/aircraft/primary shards are untouched.
   */
  scope?: RebuildShardScope;
  /** When true, busts STA-window cache before each day's FHR read. Default false for backfills. */
  invalidateFhrCache?: boolean;
  concurrency?: number;
  /** Concrete station to rebuild for (e.g. `MAA`, `AGR`). Default legacy MAA. */
  stationCode?: string;
  /** `nonScheduled` rebuilds `ns_dashboard_*` from `ns_fhr_collection`. */
  flightScope?: DashboardFlightScope;
};

export type RebuildShardResult = {
  summaryDate: string;
  ms: number;
};

/**
 * Materializes daily dashboard summary shards via the worker only (no HTTP side effects).
 */
export async function rebuildDashboardShards(
  worker: DashboardSummaryWorkerService,
  summaryDates: string[],
  options: RebuildShardOptions,
): Promise<RebuildShardResult[]> {
  const equipmentMode: DashboardEquipmentMode =
    options.equipmentMode === '4h' ? '4h' : '6h';
  const scope: RebuildShardScope =
    options.scope ??
    (equipmentMode === '6h' ? 'equipment-only' : 'full');
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
  const invalidateFhrCache = options.invalidateFhrCache === true;
  const stationCode = options.stationCode;
  const flightScope = options.flightScope;

  return mapPool(summaryDates, concurrency, async (summaryDate) => {
    const t0 = Date.now();
    if (scope === 'equipment-only') {
      await worker.recomputeEquipmentUtilizationOnly({
        summaryDate,
        equipmentMode,
        stationCode,
        invalidateFhrCache,
        flightScope,
      });
    } else {
      await worker.recomputeAndStore({
        summaryDate,
        equipmentMode,
        stationCode,
        invalidateFhrCache,
        flightScope,
      });
    }
    return { summaryDate, ms: Date.now() - t0 };
  });
}
