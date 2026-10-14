import type { DashboardSummaryLean } from '../interfaces/dashboard-summary.interface';
import { composeDashboardSummaryLean } from './compose-dashboard-daily-shards.util';
import { enumerateYmdInclusive } from './daily-aggregate-merge.util';

export type DashboardSummaryIssueCode =
  | 'missing_shard'
  | 'kpi_zeroed_sch_addl'
  | 'kpi_missing_sch_addl_fields'
  | 'performance_zeroed'
  | 'performance_missing_fields'
  | 'aircraft_mix_zeroed'
  | 'stale_shard'
  | 'refresh_failed'
  | 'zero_source_rows';

export type DashboardSummaryIssue = {
  code: DashboardSummaryIssueCode;
  summaryDate: string;
  equipmentMode: string;
  message: string;
  metrics?: Record<string, number>;
};

export type DashboardSummaryValidationReport = {
  fromDate: string;
  tillDate: string;
  equipmentMode: '4h' | '6h';
  expectedDays: number;
  shardCount: number;
  issues: DashboardSummaryIssue[];
  composed: {
    kpiStrip: Record<string, number>;
    performanceReport: Record<string, number>;
    aircraftScheduledTotal: number;
    aircraftAdditionalTotal: number;
  } | null;
  needsRecompute: boolean;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function cardRecord(raw: unknown): Record<string, unknown> {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function validateDashboardSummaryShard(
  shard: DashboardSummaryLean,
): DashboardSummaryIssue[] {
  const issues: DashboardSummaryIssue[] = [];
  const day = (shard.summaryDate ?? shard.fromDate ?? '').trim();
  const mode = shard.equipmentMode;
  const kpi = cardRecord(shard.cards?.kpiStrip);
  const perf = cardRecord(shard.cards?.performanceReport);
  const aircraft = cardRecord(shard.cards?.aircraftAnalysis);
  const scheduledMix = cardRecord(aircraft.scheduled);
  const additionalMix = cardRecord(aircraft.additional);

  const totalFlights = num(kpi.totalFlights);
  const scheduledFlights = num(kpi.scheduledFlights);
  const additionalFlights = num(kpi.additionalFlights);
  const sourceRows = num(shard.perf?.sourceRows);

  if (shard.isStale === true) {
    issues.push({
      code: 'stale_shard',
      summaryDate: day,
      equipmentMode: mode,
      message: 'Shard is marked stale',
    });
  }
  if (shard.refreshFailedAt) {
    issues.push({
      code: 'refresh_failed',
      summaryDate: day,
      equipmentMode: mode,
      message: `Last refresh failed at ${shard.refreshFailedAt}`,
    });
  }
  if (sourceRows === 0) {
    issues.push({
      code: 'zero_source_rows',
      summaryDate: day,
      equipmentMode: mode,
      message: 'perf.sourceRows is 0 (empty FHR window for this day)',
    });
  }

  if (totalFlights > 0) {
    const missingSch = !hasOwn(kpi, 'scheduledFlights');
    const missingAddl = !hasOwn(kpi, 'additionalFlights');
    if (missingSch || missingAddl) {
      issues.push({
        code: 'kpi_missing_sch_addl_fields',
        summaryDate: day,
        equipmentMode: mode,
        message: 'kpiStrip missing scheduledFlights and/or additionalFlights',
        metrics: { totalFlights, scheduledFlights, additionalFlights },
      });
    } else if (scheduledFlights === 0 && additionalFlights === 0) {
      issues.push({
        code: 'kpi_zeroed_sch_addl',
        summaryDate: day,
        equipmentMode: mode,
        message:
          'kpiStrip has flights but scheduledFlights and additionalFlights are both 0',
        metrics: { totalFlights, scheduledFlights, additionalFlights },
      });
    }
  }

  const perfTotal = num(perf.totalFlights);
  const onTime = num(perf.onTimeCount);
  const offSkd = num(perf.offSkdCount);
  const aCount = num(perf.aCount);
  const bCount = num(perf.bCount);
  const cCount = num(perf.cCount);
  const gha = num(perf.ghaImprovement);

  if (perfTotal > 0) {
    const perfSum = onTime + offSkd + aCount + bCount + cCount + gha;
    if (perfSum === 0) {
      issues.push({
        code: 'performance_zeroed',
        summaryDate: day,
        equipmentMode: mode,
        message:
          'performanceReport has totalFlights but all KPI counts are 0 (likely missing STA/STD timings in shard)',
        metrics: { perfTotal, onTime, offSkd, aCount, bCount, cCount, gha },
      });
    }
  } else if (totalFlights > 0 && sourceRows > 0) {
    issues.push({
      code: 'performance_missing_fields',
      summaryDate: day,
      equipmentMode: mode,
      message: 'kpiStrip has flights but performanceReport.totalFlights is 0',
      metrics: { totalFlights, perfTotal },
    });
  }

  const schMixTotal = num(scheduledMix.total);
  const addlMixTotal = num(additionalMix.total);
  if (
    totalFlights > 0 &&
    scheduledFlights + additionalFlights > 0 &&
    schMixTotal === 0 &&
    addlMixTotal === 0
  ) {
    issues.push({
      code: 'aircraft_mix_zeroed',
      summaryDate: day,
      equipmentMode: mode,
      message:
        'aircraftAnalysis scheduled/additional totals are 0 while kpiStrip has SCH/ADDL flights',
      metrics: { scheduledFlights, additionalFlights, schMixTotal, addlMixTotal },
    });
  }

  return issues;
}

export function validateComposedRange(
  composed: DashboardSummaryLean,
): DashboardSummaryIssue[] {
  const issues: DashboardSummaryIssue[] = [];
  const day = `${composed.fromDate}..${composed.tillDate}`;
  const mode = composed.equipmentMode;
  const kpi = cardRecord(composed.cards?.kpiStrip);
  const perf = cardRecord(composed.cards?.performanceReport);

  const totalFlights = num(kpi.totalFlights);
  const scheduledFlights = num(kpi.scheduledFlights);
  const additionalFlights = num(kpi.additionalFlights);

  if (totalFlights > 0 && scheduledFlights === 0 && additionalFlights === 0) {
    issues.push({
      code: 'kpi_zeroed_sch_addl',
      summaryDate: day,
      equipmentMode: mode,
      message: 'Composed range: SCH and ADDL are both 0 while totalFlights > 0',
      metrics: { totalFlights, scheduledFlights, additionalFlights },
    });
  }

  const perfTotal = num(perf.totalFlights);
  const perfSum =
    num(perf.onTimeCount) +
    num(perf.offSkdCount) +
    num(perf.aCount) +
    num(perf.bCount) +
    num(perf.cCount) +
    num(perf.ghaImprovement);
  if (perfTotal > 0 && perfSum === 0) {
    issues.push({
      code: 'performance_zeroed',
      summaryDate: day,
      equipmentMode: mode,
      message: 'Composed range: performance report metrics are all 0',
      metrics: { perfTotal },
    });
  }

  return issues;
}

const RECOMPUTE_CODES = new Set<DashboardSummaryIssueCode>([
  'missing_shard',
  'kpi_zeroed_sch_addl',
  'kpi_missing_sch_addl_fields',
  'performance_zeroed',
  'performance_missing_fields',
  'zero_source_rows',
]);

export function issueRequiresRecompute(issue: DashboardSummaryIssue): boolean {
  return RECOMPUTE_CODES.has(issue.code);
}

export function buildDashboardSummaryValidationReport(params: {
  fromDate: string;
  tillDate: string;
  equipmentMode: '4h' | '6h';
  shards: DashboardSummaryLean[] | null;
}): DashboardSummaryValidationReport {
  const { fromDate, tillDate, equipmentMode } = params;
  const expectedDays = enumerateYmdInclusive(fromDate, tillDate).length;
  const issues: DashboardSummaryIssue[] = [];

  if (!params.shards) {
    for (const d of enumerateYmdInclusive(fromDate, tillDate)) {
      issues.push({
        code: 'missing_shard',
        summaryDate: d,
        equipmentMode,
        message: 'No dashboard_summaries document for this calendar day',
      });
    }
    return {
      fromDate,
      tillDate,
      equipmentMode,
      expectedDays,
      shardCount: 0,
      issues,
      composed: null,
      needsRecompute: true,
    };
  }

  const shardByDay = new Map(
    params.shards.map((s) => [(s.summaryDate ?? s.fromDate ?? '').trim(), s]),
  );
  for (const d of enumerateYmdInclusive(fromDate, tillDate)) {
    const shard = shardByDay.get(d);
    if (!shard) {
      issues.push({
        code: 'missing_shard',
        summaryDate: d,
        equipmentMode,
        message: 'No dashboard_summaries document for this calendar day',
      });
      continue;
    }
    issues.push(...validateDashboardSummaryShard(shard));
  }

  const composed = composeDashboardSummaryLean(
    params.shards,
    fromDate,
    tillDate,
    equipmentMode,
  );
  issues.push(...validateComposedRange(composed));

  const kpi = cardRecord(composed.cards?.kpiStrip);
  const perf = cardRecord(composed.cards?.performanceReport);
  const aircraft = cardRecord(composed.cards?.aircraftAnalysis);
  const scheduledMix = cardRecord(aircraft.scheduled);
  const additionalMix = cardRecord(aircraft.additional);

  const needsRecompute = issues.some(issueRequiresRecompute);

  return {
    fromDate,
    tillDate,
    equipmentMode,
    expectedDays,
    shardCount: params.shards.length,
    issues,
    composed: {
      kpiStrip: {
        totalFlights: num(kpi.totalFlights),
        cancelledFlights: num(kpi.cancelledFlights),
        didFlyFlights: num(kpi.didFlyFlights),
        scheduledFlights: num(kpi.scheduledFlights),
        additionalFlights: num(kpi.additionalFlights),
      },
      performanceReport: {
        totalFlights: num(perf.totalFlights),
        onTimeCount: num(perf.onTimeCount),
        offSkdCount: num(perf.offSkdCount),
        aCount: num(perf.aCount),
        bCount: num(perf.bCount),
        cCount: num(perf.cCount),
        ghaImprovement: num(perf.ghaImprovement),
      },
      aircraftScheduledTotal: num(scheduledMix.total),
      aircraftAdditionalTotal: num(additionalMix.total),
    },
    needsRecompute,
  };
}

export function uniqueRecomputeDates(
  issues: DashboardSummaryIssue[],
): string[] {
  const days = new Set<string>();
  for (const i of issues) {
    if (!issueRequiresRecompute(i)) continue;
    const d = i.summaryDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) days.add(d);
  }
  return [...days].sort();
}
