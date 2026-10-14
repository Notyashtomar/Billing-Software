/**
 * Compose an arbitrary STA date-range view by merging precomputed daily
 * `dashboard_summaries` shards (legacy card mirror / drilldown storage).
 * Bird HTTP **card** reads use `dashboard_daily_aggregates` instead.
 */
import type { DashboardDailyAggregateLean } from '../interfaces/dashboard-daily-aggregate.interface';
import type {
  DashboardEquipmentMode,
  DashboardSummaryCards,
  DashboardSummaryLean,
  DashboardSummaryPerf,
} from '../interfaces/dashboard-summary.interface';
import {
  DASHBOARD_AGGREGATE_TYPES,
  type DashboardAggregateType,
} from '../constants/dashboard-aggregate-types';
import {
  mergeAirlineRemarkAggregates,
  mergeAircraftAnalysisAggregates,
  mergeEquipmentUtilAggregates,
  mergeGhaImprovementAggregates,
  mergeKpiStripAggregates,
  mergeOnTimePerformanceAggregates,
  mergePerformanceReportAggregates,
} from './daily-aggregate-merge.util';

function shardDay(s: DashboardSummaryLean): string {
  return (s.summaryDate ?? s.fromDate ?? '').trim();
}

function asMergeShards(
  summaries: DashboardSummaryLean[],
  aggregateType: DashboardAggregateType,
  dataPicker: (c: DashboardSummaryCards) => Record<string, unknown>,
): DashboardDailyAggregateLean[] {
  return summaries.map((s) => ({
    _id: s._id,
    date: shardDay(s),
    aggregateType,
    equipmentMode:
      aggregateType === DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION
        ? s.equipmentMode
        : '',
    generatedAt: s.generatedAt,
    data: dataPicker(s.cards ?? ({} as DashboardSummaryCards)),
    perf: {
      sourceRows: Number(s.perf?.sourceRows ?? 0),
      aggregationMs: Number(s.perf?.aggregationMs ?? 0),
      mongoWallMs: Number(s.perf?.mongoWallMs ?? 0),
      staWindowCacheHit: Boolean(s.perf?.staWindowCacheHit),
    },
    isStale: s.isStale,
  }));
}

type PartitionMetaAgg = {
  row3bCond1Count: number;
  row3bCond2Count: number;
  row3cGhaCount: number;
  row3cNonGhaCount: number;
  row3cTotalCount: number;
};

function mergePartitionMeta(
  parts: Array<Record<string, unknown> | undefined>,
): PartitionMetaAgg {
  const out: PartitionMetaAgg = {
    row3bCond1Count: 0,
    row3bCond2Count: 0,
    row3cGhaCount: 0,
    row3cNonGhaCount: 0,
    row3cTotalCount: 0,
  };
  for (const p of parts) {
    if (!p) continue;
    out.row3bCond1Count += Number(p.row3bCond1Count ?? 0);
    out.row3bCond2Count += Number(p.row3bCond2Count ?? 0);
    out.row3cGhaCount += Number(p.row3cGhaCount ?? 0);
    out.row3cNonGhaCount += Number(p.row3cNonGhaCount ?? 0);
    out.row3cTotalCount += Number(p.row3cTotalCount ?? 0);
  }
  return out;
}

export function composeDashboardSummaryLean(
  orderedShards: DashboardSummaryLean[],
  requestFromYmd: string,
  requestTillYmd: string,
  equipmentMode: DashboardEquipmentMode,
): DashboardSummaryLean {
  const cards = composeCardsFromDailySummaries(
    orderedShards,
    requestFromYmd,
    requestTillYmd,
  );
  const generatedAt = maxGeneratedAt(orderedShards);
  return {
    _id: 'composed',
    fromDate: requestFromYmd,
    tillDate: requestTillYmd,
    equipmentMode,
    generatedAt,
    cards,
    perf: aggregatePerfAcrossShards(orderedShards),
    isStale: anyShardStale(orderedShards),
    sourceSnapshotAt: generatedAt,
  };
}

export function composeCardsFromDailySummaries(
  shards: DashboardSummaryLean[],
  requestFromYmd: string,
  requestTillYmd: string,
): DashboardSummaryCards {
  const sorted = [...shards].sort((a, b) =>
    shardDay(a).localeCompare(shardDay(b)),
  );

  return {
    kpiStrip: mergeKpiStripAggregates(
      asMergeShards(sorted, DASHBOARD_AGGREGATE_TYPES.KPI_STRIP, (c) =>
        c.kpiStrip as Record<string, unknown>,
      ),
    ) as unknown as DashboardSummaryCards['kpiStrip'],
    performanceReport: mergePerformanceReportAggregates(
      asMergeShards(sorted, DASHBOARD_AGGREGATE_TYPES.PERFORMANCE_REPORT, (c) =>
        c.performanceReport as Record<string, unknown>,
      ),
    ) as unknown as DashboardSummaryCards['performanceReport'],
    ghaImprovement: mergeGhaImprovementAggregates(
      asMergeShards(sorted, DASHBOARD_AGGREGATE_TYPES.GHA_IMPROVEMENT, (c) =>
        c.ghaImprovement as Record<string, unknown>,
      ),
    ) as unknown as DashboardSummaryCards['ghaImprovement'],
    onTimePerformance: mergeOnTimePerformanceAggregates(
      asMergeShards(sorted, DASHBOARD_AGGREGATE_TYPES.ON_TIME_PERFORMANCE, (c) =>
        c.onTimePerformance as Record<string, unknown>,
      ),
    ) as unknown as DashboardSummaryCards['onTimePerformance'],
    airlineRemarks: mergeAirlineRemarkAggregates(
      asMergeShards(sorted, DASHBOARD_AGGREGATE_TYPES.AIRLINE_REMARKS, (c) =>
        c.airlineRemarks as Record<string, unknown>,
      ),
      requestFromYmd,
      requestTillYmd,
    ) as unknown as DashboardSummaryCards['airlineRemarks'],
    aircraftAnalysis: mergeAircraftAnalysisAggregates(
      asMergeShards(sorted, DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS, (c) =>
        c.aircraftAnalysis as Record<string, unknown>,
      ),
    ) as unknown as DashboardSummaryCards['aircraftAnalysis'],
    equipmentUtilization: mergeEquipmentUtilAggregates(
      asMergeShards(
        sorted,
        DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION,
        (c) => c.equipmentUtilization as Record<string, unknown>,
      ),
    ) as unknown as DashboardSummaryCards['equipmentUtilization'],
  };
}

export function aggregatePerfAcrossShards(shards: DashboardSummaryLean[]): DashboardSummaryPerf {
  let sourceRows = 0;
  let aggregationMs = 0;
  let mongoWallMs = 0;
  let staHit = true;
  for (const s of shards) {
    sourceRows += Number(s.perf?.sourceRows ?? 0);
    aggregationMs += Number(s.perf?.aggregationMs ?? 0);
    mongoWallMs = Math.max(mongoWallMs, Number(s.perf?.mongoWallMs ?? 0));
    staHit &&= Boolean(s.perf?.staWindowCacheHit);
  }
  return {
    sourceRows,
    aggregationMs,
    mongoWallMs,
    staWindowCacheHit: staHit,
  };
}

/** newest generatedAt among shards */
export function maxGeneratedAt(shards: DashboardSummaryLean[]): Date {
  let maxTs = 0;
  let d = new Date(0);
  for (const s of shards) {
    const ts = new Date(s.generatedAt).getTime();
    if (Number.isFinite(ts) && ts >= maxTs) {
      maxTs = ts;
      d = s.generatedAt;
    }
  }
  return d;
}

/** True if logical freshness TTL applies to composite (all shards fresh vs wall clock). */
export function shardsAreLogicallyFresh(
  shards: DashboardSummaryLean[],
  ttlMs: number,
): boolean {
  if (!shards.length) return false;
  return shards.every(
    (s) =>
      s.isStale !== true &&
      Number.isFinite(new Date(s.generatedAt).getTime()) &&
      Date.now() - new Date(s.generatedAt).getTime() < ttlMs,
  );
}

export function anyShardStale(shards: DashboardSummaryLean[]): boolean {
  return shards.some((s) => s.isStale === true);
}

export function mergePerformanceDrilldownShards(
  shards: DashboardSummaryLean[],
): {
  schemaVersion: number;
  flights: unknown[];
  partitionMeta: PartitionMetaAgg;
} | null {
  const metas: Array<Record<string, unknown>> = [];
  const flights: unknown[] = [];
  let schemaVersion = 2;
  for (const s of [...shards].sort((a, b) =>
    shardDay(a).localeCompare(shardDay(b)),
  )) {
    const raw = s.drilldowns as { performance?: Record<string, unknown> } | undefined;
    const p = raw?.performance;
    if (!p || typeof p !== 'object') continue;
    const v = Number((p as { schemaVersion?: unknown }).schemaVersion ?? 0);
    if (!Number.isFinite(v) || v < 2) schemaVersion = 1;
    const fl = Array.isArray(p.flights) ? p.flights : [];
    flights.push(...fl);
    metas.push(
      typeof p.partitionMeta === 'object' && p.partitionMeta !== null
        ? (p.partitionMeta as Record<string, unknown>)
        : {},
    );
  }
  if (flights.length === 0 && metas.every((m) => !m)) return null;
  return {
    schemaVersion,
    flights,
    partitionMeta: mergePartitionMeta(metas),
  };
}

/** Merge drill airline payloads from daily shards (rows concat + rollup KPI + merged chart map). */
export function mergeAirlineRemarksDrillShards(
  shards: DashboardSummaryLean[],
  requestFromYmd: string,
  requestTillYmd: string,
): {
  ratingsSummary: Record<string, unknown>;
  chartTopAirlinesByRating: Record<string, { airline: string; count: number }[]>;
  rows: unknown[];
} | null {
  const rows: unknown[] = [];
  const summariesForBuckets: DashboardDailyAggregateLean[] = [];

  const sorted = [...shards].sort((a, b) =>
    shardDay(a).localeCompare(shardDay(b)),
  );

  for (const s of sorted) {
    const raw = s.drilldowns as { airlineRemarks?: Record<string, unknown> } | undefined;
    const ar = raw?.airlineRemarks;
    if (!ar || typeof ar !== 'object') continue;
    const rs = ar.ratingsSummary as Record<string, unknown> | undefined;
    summariesForBuckets.push({
      _id: s._id,
      date: shardDay(s),
      aggregateType: DASHBOARD_AGGREGATE_TYPES.AIRLINE_REMARKS,
      equipmentMode: '',
      generatedAt: s.generatedAt,
      data:
        rs && typeof rs === 'object'
          ? rs
          : {
              total: 0,
              blanks: 0,
              buckets: [],
            },
      perf: { sourceRows: 0, aggregationMs: 0 },
    });
    const r = Array.isArray(ar.rows) ? ar.rows : [];
    rows.push(...r);
  }

  if (summariesForBuckets.length === 0) return null;

  const ratingsSummary = mergeAirlineRemarkAggregates(
    summariesForBuckets,
    requestFromYmd,
    requestTillYmd,
  );

  /** Merge `{ [rating]: { airline, count }[] }` across shards (sum airline counts within each rating bucket). */
  const chartMerged: Record<string, Map<string, number>> = {};
  for (const s of sorted) {
    const raw = s.drilldowns as { airlineRemarks?: Record<string, unknown> } | undefined;
    const ct = raw?.airlineRemarks?.chartTopAirlinesByRating as Record<
      string,
      { airline: string; count: number }[]
    > | null;
    if (!ct || typeof ct !== 'object') continue;
    for (const [rating, list] of Object.entries(ct)) {
      if (!Array.isArray(list)) continue;
      if (!chartMerged[rating]) chartMerged[rating] = new Map();
      const mp = chartMerged[rating];
      for (const item of list) {
        const a = String(item?.airline ?? '');
        mp.set(a, (mp.get(a) ?? 0) + Number(item?.count ?? 0));
      }
    }
  }
  const chartTopAirlinesByRating: Record<
    string,
    { airline: string; count: number }[]
  > = {};
  for (const [rating, mp] of Object.entries(chartMerged)) {
    chartTopAirlinesByRating[rating] = [...mp.entries()]
      .map(([airline, count]) => ({ airline, count }))
      .sort((x, y) => y.count - x.count || x.airline.localeCompare(y.airline));
  }

  return {
    ratingsSummary: ratingsSummary as unknown as Record<string, unknown>,
    chartTopAirlinesByRating,
    rows,
  };
}

export function applyDrillPaging<T>(
  items: T[],
  skip: number,
  limit: number,
): { slice: T[]; total: number } {
  const total = items.length;
  const s = Math.max(0, Math.floor(skip));
  const lim = Math.max(0, Math.floor(limit));
  if (lim <= 0) return { slice: items, total };
  return {
    slice: items.slice(s, s + lim),
    total,
  };
}
