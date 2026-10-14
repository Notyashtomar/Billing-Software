import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { enumerateYmdInclusive } from '../../dashboard-summary/utils/daily-aggregate-merge.util';
import { FhrCollectionService } from '../../fhr-collection/services/fhr-collection.service';
import { extractDelayEntriesFromMain } from '../utils/delay-code-parse.util';
import {
  DelayReportSummary,
  DelayReportSummaryDocument,
  type DelayReportPairBucket,
} from '../schema/delay-report-summary.schema';

type DelayFlightFact = {
  serialNo: number;
  airline: string;
  airlineCode: string;
  station: string;
  hour: number | null;
  totalDelayMinutes: number;
  codes: Array<{ code: string; minutes: number }>;
};

type DelayReportTopCardAggregate = {
  name: string;
  flightCount: number;
  totalMinutes: number;
};

type DelayReportSeverity = 'High' | 'Watch' | 'Alert';
type DelayCategory = 'Aircraft Rotation' | 'ATFM' | 'Operational';

type DelayReportMonthlyTrendPoint = {
  month: string;
  label: string;
  delayedFlights: number;
  avgDuration: number;
  trendFlights: number;
};

type DelayReportTopCodeRow = {
  code: string;
  flightCount: number;
  totalMinutes: number;
  avgMinutes: number;
  pctOfDelay: number;
  severity: DelayReportSeverity;
};

type DelayReportSummaryShard = {
  summaryDate: string;
  generatedAt?: Date | string;
  pairBuckets?: DelayReportPairBucket[];
};

export type DelayReportTopCardsResponse = {
  kpis: {
    totalDelayedFlights: number;
    totalDelayMinutes: number;
    avgDelayPerFlight: number;
    topCodeByFlights: {
      code: string;
      flightCount: number;
      totalMinutes: number;
    } | null;
    worstAirline: DelayReportTopCardAggregate | null;
    worstStation: DelayReportTopCardAggregate | null;
  };
  meta: {
    fromYmd: string;
    toYmd: string;
    airline: string;
    station: string;
    shardCount: number;
    latestGeneratedAt: string | null;
  };
  _perf: {
    totalMs: number;
    materializedDays: number;
    recomputedDays: number;
  };
  panels: {
    monthlyTrend: DelayReportMonthlyTrendPoint[];
    allCodes: DelayReportTopCodeRow[];
    topCodes: DelayReportTopCodeRow[];
    severitySplit: {
      high: number;
      low: number;
    };
    hourlyDistribution: Array<{
      hour: string;
      delays: number;
    }>;
    weeklyDistribution: Array<{
      week: string;
      rotation: number;
      atfm: number;
      operational: number;
    }>;
  };
};

@Injectable()
export class DelayReportSummaryService {
  private readonly logger = new Logger(DelayReportSummaryService.name);

  constructor(
    @InjectModel(DelayReportSummary.name)
    private readonly model: Model<DelayReportSummaryDocument>,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  async getTopCards(
    fromYmd: string,
    toYmd: string,
    airlineFilter?: string,
    stationFilter?: string,
  ): Promise<DelayReportTopCardsResponse> {
    const wallStart = Date.now();
    const from = fromYmd.trim();
    const to = toYmd.trim();
    const airline = String(airlineFilter ?? '').trim();
    const station = String(stationFilter ?? '').trim();

    // Auto-store any missing/incomplete daily shards for the requested range,
    // then aggregate only from `delay_reports` (no full FHR scan for warm days).
    const recomputedDays = await this.ensureRangeMaterialized(from, to);
    if (recomputedDays > 0) {
      this.logger.log(
        `[delay_report_summary] range materialize from=${from} to=${to} recomputedDays=${recomputedDays}`,
      );
    }
    const days = enumerateYmdInclusive(from, to);
    const docs = (await this.model
      .find({ summaryDate: { $gte: from, $lte: to } })
      .sort({ summaryDate: 1 })
      .lean()
      .exec()) as DelayReportSummaryShard[];

    const byDate = new Map(
      docs.map((doc) => [String(doc.summaryDate ?? '').trim(), doc]),
    );
    const ordered = days
      .map((day) => byDate.get(day))
      .filter((doc): doc is DelayReportSummaryShard => doc != null);

    const codeTotals = new Map<string, { flightCount: number; totalMinutes: number }>();
    const airlineTotals = new Map<string, DelayReportTopCardAggregate>();
    const stationTotals = new Map<string, DelayReportTopCardAggregate>();
    const monthlyTotals = new Map<
      string,
      { delayedFlights: number; totalDelayMinutes: number }
    >();
    const hourTotals = new Array<number>(24).fill(0);
    const dailyCategoryTotals = new Map<
      string,
      { rotation: number; atfm: number; operational: number }
    >();

    let totalDelayedFlights = 0;
    let totalDelayMinutes = 0;
    let latestGeneratedAt: Date | null = null;

    for (const doc of ordered) {
      const generatedAt = doc.generatedAt ? new Date(doc.generatedAt) : null;
      if (
        generatedAt &&
        Number.isFinite(generatedAt.getTime()) &&
        (!latestGeneratedAt || generatedAt.getTime() > latestGeneratedAt.getTime())
      ) {
        latestGeneratedAt = generatedAt;
      }

      for (const bucket of doc.pairBuckets ?? []) {
        if (!this.matchesAirline(bucket, airline)) continue;
        if (!this.matchesStation(bucket, station)) continue;

        const bucketDelayedFlights = Number(bucket.delayedFlights ?? 0);
        const bucketTotalDelayMinutes = Number(bucket.totalDelayMinutes ?? 0);

        totalDelayedFlights += bucketDelayedFlights;
        totalDelayMinutes += bucketTotalDelayMinutes;

        const monthKey = String(doc.summaryDate ?? '').slice(0, 7);
        const monthAgg = monthlyTotals.get(monthKey) ?? {
          delayedFlights: 0,
          totalDelayMinutes: 0,
        };
        monthAgg.delayedFlights += bucketDelayedFlights;
        monthAgg.totalDelayMinutes += bucketTotalDelayMinutes;
        monthlyTotals.set(monthKey, monthAgg);

        const airlineName = String(
          bucket.airline || bucket.airlineCode || 'Unknown',
        ).trim();
        const stationName = String(bucket.station || '—').trim() || '—';

        this.bumpNamedAggregate(
          airlineTotals,
          airlineName,
          Number(bucket.delayedFlights ?? 0),
          Number(bucket.totalDelayMinutes ?? 0),
        );
        this.bumpNamedAggregate(
          stationTotals,
          stationName,
          Number(bucket.delayedFlights ?? 0),
          Number(bucket.totalDelayMinutes ?? 0),
        );

        const dayCategory = dailyCategoryTotals.get(doc.summaryDate) ?? {
          rotation: 0,
          atfm: 0,
          operational: 0,
        };
        const bucketHourCounts = this.normalizeHourCounts(bucket.hourCounts);
        for (let hour = 0; hour < 24; hour += 1) {
          hourTotals[hour] += bucketHourCounts[hour] ?? 0;
        }

        for (const code of bucket.codes ?? []) {
          const codeKey = String(code.code ?? '').trim();
          if (!codeKey) continue;
          const flightCount = Number(code.flightCount ?? 0);
          const existing = codeTotals.get(codeKey) ?? {
            flightCount: 0,
            totalMinutes: 0,
          };
          existing.flightCount += flightCount;
          existing.totalMinutes += Number(code.totalMinutes ?? 0);
          codeTotals.set(codeKey, existing);

          const category = this.categoryForCode(codeKey);
          if (category === 'Aircraft Rotation') dayCategory.rotation += flightCount;
          else if (category === 'ATFM') dayCategory.atfm += flightCount;
          else dayCategory.operational += flightCount;
        }
        dailyCategoryTotals.set(doc.summaryDate, dayCategory);
      }
    }

    const topCodeByFlights = [...codeTotals.entries()]
      .map(([code, agg]) => ({ code, ...agg }))
      .sort(
        (a, b) =>
          b.flightCount - a.flightCount ||
          b.totalMinutes - a.totalMinutes ||
          a.code.localeCompare(b.code),
      )[0] ?? null;

    const allCodeRows: DelayReportTopCodeRow[] = [...codeTotals.entries()]
      .map(([code, agg]) => {
        const avgMinutes =
          agg.flightCount > 0
            ? Math.round((agg.totalMinutes / agg.flightCount) * 10) / 10
            : 0;
        const pctOfDelay =
          totalDelayMinutes > 0
            ? Math.round((agg.totalMinutes / totalDelayMinutes) * 1000) / 10
            : 0;
        return {
          code,
          flightCount: agg.flightCount,
          totalMinutes: agg.totalMinutes,
          avgMinutes,
          pctOfDelay,
          severity: this.severityForCode({
            flightCount: agg.flightCount,
            avgMinutes,
            pctOfDelay,
          }),
        };
      })
      .sort(
        (a, b) =>
          b.flightCount - a.flightCount ||
          b.totalMinutes - a.totalMinutes ||
          a.code.localeCompare(b.code),
      );

    const severitySplit = allCodeRows.reduce(
      (acc, row) => {
        if (this.severityRank(row.severity) >= 2) acc.high += row.flightCount;
        else acc.low += row.flightCount;
        return acc;
      },
      { high: 0, low: 0 },
    );

    const monthlyTrendBase = this.enumerateMonthKeysInclusive(from, to).map(
      (month) => {
        const agg = monthlyTotals.get(month) ?? {
          delayedFlights: 0,
          totalDelayMinutes: 0,
        };
        return {
          month,
          label: this.monthLabel(month),
          delayedFlights: agg.delayedFlights,
          avgDuration:
            agg.delayedFlights > 0
              ? Math.round((agg.totalDelayMinutes / agg.delayedFlights) * 10) / 10
              : 0,
        };
      },
    );
    const trendFlights = this.movingAverage(
      monthlyTrendBase.map((row) => row.delayedFlights),
    );
    const monthlyTrend: DelayReportMonthlyTrendPoint[] = monthlyTrendBase.map(
      (row, index) => ({
        ...row,
        trendFlights: trendFlights[index] ?? row.delayedFlights,
      }),
    );
    const hourlyDistribution = hourTotals.map((count, hour) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      delays: count,
    }));
    const weeklyDistribution = this.buildWeeklyDistribution(
      from,
      to,
      dailyCategoryTotals,
    );

    const worstAirline =
      [...airlineTotals.values()].sort(
        (a, b) =>
          b.flightCount - a.flightCount ||
          b.totalMinutes - a.totalMinutes ||
          a.name.localeCompare(b.name),
      )[0] ?? null;

    const worstStation =
      [...stationTotals.values()].sort(
        (a, b) =>
          b.flightCount - a.flightCount ||
          b.totalMinutes - a.totalMinutes ||
          a.name.localeCompare(b.name),
      )[0] ?? null;

    return {
      kpis: {
        totalDelayedFlights,
        totalDelayMinutes,
        avgDelayPerFlight:
          totalDelayedFlights > 0
            ? Math.round((totalDelayMinutes / totalDelayedFlights) * 10) / 10
            : 0,
        topCodeByFlights,
        worstAirline,
        worstStation,
      },
      meta: {
        fromYmd: from,
        toYmd: to,
        airline,
        station,
        shardCount: ordered.length,
        latestGeneratedAt: latestGeneratedAt?.toISOString() ?? null,
      },
      _perf: {
        totalMs: Date.now() - wallStart,
        materializedDays: ordered.length,
        recomputedDays,
      },
      panels: {
        monthlyTrend,
        allCodes: allCodeRows,
        topCodes: allCodeRows.slice(0, 10),
        severitySplit,
        hourlyDistribution,
        weeklyDistribution,
      },
    };
  }

  /**
   * Ensure each day in [fromYmd, toYmd] has a complete shard in `delay_reports`.
   * Missing or incomplete days are recomputed from FHR and upserted once;
   * subsequent reads for that day are collection-only.
   */
  async ensureRangeMaterialized(fromYmd: string, toYmd: string): Promise<number> {
    const days = enumerateYmdInclusive(fromYmd.trim(), toYmd.trim());
    if (!days.length) return 0;

    const docs = await this.model
      .find({ summaryDate: { $gte: days[0], $lte: days[days.length - 1] } })
      .select({ summaryDate: 1, pairBuckets: 1 })
      .lean()
      .exec();

    const existingByDay = new Map(
      docs.map((doc) => [String(doc.summaryDate ?? '').trim(), doc]),
    );
    const missingDays = days.filter((day) => {
      const existing = existingByDay.get(day) as
        | { pairBuckets?: Array<{ hourCounts?: unknown }> }
        | undefined;
      if (!existing) return true;
      return (existing.pairBuckets ?? []).some(
        (bucket) => !this.hasCompleteHourCounts(bucket.hourCounts),
      );
    });
    if (!missingDays.length) return 0;

    const concurrency = Math.min(4, missingDays.length);
    const queue = [...missingDays];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        await this.recomputeAndStore(next);
      }
    });
    await Promise.all(workers);
    return missingDays.length;
  }

  async recomputeAndStore(summaryDate: string): Promise<void> {
    const day = summaryDate.trim();
    const wallStart = Date.now();
    const rows = await this.fhrCollectionService.findAllLeanForScheduledTableMerge([
      this.ymdToDdMmYyyy(day),
    ]);
    const facts = this.extractFlightFacts(rows);
    const pairBuckets = this.buildPairBuckets(facts);

    const generatedAt = new Date();
    await this.model.findOneAndUpdate(
      { summaryDate: day },
      {
        $set: {
          summaryDate: day,
          generatedAt,
          pairBuckets,
          perf: {
            sourceRows: rows.length,
            delayedFlights: facts.length,
            pairBucketCount: pairBuckets.length,
            aggregationMs: Date.now() - wallStart,
          },
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      },
    );

    this.logger.log(
      `[delay_report_summary] stored day=${day} sourceRows=${rows.length} delayedFlights=${facts.length} pairBuckets=${pairBuckets.length}`,
    );
  }

  private buildPairBuckets(facts: DelayFlightFact[]): DelayReportPairBucket[] {
    const pairs = new Map<
      string,
      {
        airline: string;
        airlineCode: string;
        station: string;
        delayedFlights: number;
        totalDelayMinutes: number;
        hourCounts: number[];
        codes: Map<string, { flightCount: number; totalMinutes: number }>;
      }
    >();

    for (const fact of facts) {
      const key = `${fact.airline}\u0000${fact.airlineCode}\u0000${fact.station}`;
      let pair = pairs.get(key);
      if (!pair) {
        pair = {
          airline: fact.airline,
          airlineCode: fact.airlineCode,
          station: fact.station,
          delayedFlights: 0,
          totalDelayMinutes: 0,
          hourCounts: new Array<number>(24).fill(0),
          codes: new Map(),
        };
        pairs.set(key, pair);
      }

      pair.delayedFlights += 1;
      pair.totalDelayMinutes += fact.totalDelayMinutes;
      if (fact.hour != null && fact.hour >= 0 && fact.hour <= 23) {
        pair.hourCounts[fact.hour] = (pair.hourCounts[fact.hour] ?? 0) + 1;
      }
      for (const code of fact.codes) {
        const current = pair.codes.get(code.code) ?? {
          flightCount: 0,
          totalMinutes: 0,
        };
        current.flightCount += 1;
        current.totalMinutes += code.minutes;
        pair.codes.set(code.code, current);
      }
    }

    return [...pairs.values()]
      .map((pair) => ({
        airline: pair.airline,
        airlineCode: pair.airlineCode,
        station: pair.station,
        delayedFlights: pair.delayedFlights,
        totalDelayMinutes: pair.totalDelayMinutes,
        hourCounts: pair.hourCounts,
        codes: [...pair.codes.entries()]
          .map(([code, agg]) => ({
            code,
            flightCount: agg.flightCount,
            totalMinutes: agg.totalMinutes,
          }))
          .sort(
            (a, b) =>
              b.flightCount - a.flightCount ||
              b.totalMinutes - a.totalMinutes ||
              a.code.localeCompare(b.code),
          ),
      }))
      .sort(
        (a, b) =>
          b.delayedFlights - a.delayedFlights ||
          b.totalDelayMinutes - a.totalDelayMinutes ||
          a.airline.localeCompare(b.airline) ||
          a.station.localeCompare(b.station),
      );
  }

  private extractFlightFacts(
    rows: Array<{
      SerialNo?: number;
      flightSerialNumber?: number;
      isCancelled?: boolean;
      mainDetails?: Record<string, unknown> | null;
    }>,
  ): DelayFlightFact[] {
    const facts: DelayFlightFact[] = [];

    for (const row of rows) {
      if (row.isCancelled === true) continue;
      const m = (row.mainDetails ?? {}) as Record<string, unknown>;
      if (this.isFlightCancelledEmbed(m)) continue;

      const serial =
        Number(row.flightSerialNumber ?? row.SerialNo ?? 0) || 0;
      if (!serial) continue;

      const rawEntries = extractDelayEntriesFromMain(m);
      if (rawEntries.length === 0) continue;

      const codeMap = new Map<string, number>();
      for (const entry of rawEntries) {
        const code = String(entry.code).padStart(2, '0');
        const minutes = Math.max(0, Number(entry.minutes ?? 0));
        codeMap.set(code, (codeMap.get(code) ?? 0) + minutes);
      }

      const codes = [...codeMap.entries()].map(([code, minutes]) => ({
        code,
        minutes,
      }));
      if (!codes.length) continue;

      facts.push({
        serialNo: serial,
        airline: String(m.Airline ?? m.airline ?? '').trim(),
        airlineCode: String(m.Arline_Code ?? m.airlineCode ?? '').trim(),
        station:
          String(
            m.Terminal ?? m.terminal ?? m.Route ?? m.route ?? '—',
          ).trim() || '—',
        hour: this.parseHourFromTime(String(m.ATDTime ?? m.ATATime ?? '')),
        totalDelayMinutes: codes.reduce((sum, code) => sum + code.minutes, 0),
        codes,
      });
    }

    return facts;
  }

  private bumpNamedAggregate(
    map: Map<string, DelayReportTopCardAggregate>,
    name: string,
    flightCount: number,
    totalMinutes: number,
  ): void {
    const key = name.trim() || '—';
    const current = map.get(key) ?? {
      name: key,
      flightCount: 0,
      totalMinutes: 0,
    };
    current.flightCount += flightCount;
    current.totalMinutes += totalMinutes;
    map.set(key, current);
  }

  private matchesAirline(bucket: DelayReportPairBucket, airlineFilter: string): boolean {
    const needle = airlineFilter.trim().toLowerCase();
    if (!needle || needle === 'all') return true;
    const airline = String(bucket.airline ?? '').trim().toLowerCase();
    const airlineCode = String(bucket.airlineCode ?? '').trim().toLowerCase();
    return (
      airline === needle ||
      airlineCode === needle ||
      airline.includes(needle)
    );
  }

  private matchesStation(bucket: DelayReportPairBucket, stationFilter: string): boolean {
    const needle = stationFilter.trim().toLowerCase();
    if (!needle || needle === 'all') return true;
    const station = String(bucket.station ?? '').trim().toLowerCase();
    return station === needle || station.includes(needle);
  }

  private isFlightCancelledEmbed(m: Record<string, unknown>): boolean {
    if (m.flightCancelled === true) return true;
    if (
      String(m.departureStatus ?? '')
        .trim()
        .toLowerCase() === 'cancelled'
    ) {
      return true;
    }
    const arr = String(m.ArrivalFltNo ?? m.arrivalFltNo ?? '').toUpperCase();
    const dep = String(m.DepartureFltNo ?? m.departureFltNo ?? '').toUpperCase();
    return arr.includes('CANC') || dep.includes('CANC');
  }

  private ymdToDdMmYyyy(ymd: string): string {
    const [y, m, d] = ymd.trim().split('-');
    return `${d}/${m}/${y}`;
  }

  private normalizeHourCounts(hourCounts: unknown): number[] {
    const out = new Array<number>(24).fill(0);
    if (!Array.isArray(hourCounts)) return out;
    for (let i = 0; i < 24; i += 1) {
      out[i] = Math.max(0, Number(hourCounts[i] ?? 0) || 0);
    }
    return out;
  }

  private hasCompleteHourCounts(hourCounts: unknown): boolean {
    return Array.isArray(hourCounts) && hourCounts.length >= 24;
  }

  private buildWeeklyDistribution(
    fromYmd: string,
    toYmd: string,
    dailyCategoryTotals: Map<
      string,
      { rotation: number; atfm: number; operational: number }
    >,
  ): Array<{
    week: string;
    rotation: number;
    atfm: number;
    operational: number;
  }> {
    const days = enumerateYmdInclusive(fromYmd, toYmd);
    const out: Array<{
      week: string;
      rotation: number;
      atfm: number;
      operational: number;
    }> = [];
    for (let index = 0; index < days.length; index += 7) {
      const slice = days.slice(index, index + 7);
      const agg = {
        week: `W${out.length + 1}`,
        rotation: 0,
        atfm: 0,
        operational: 0,
      };
      for (const day of slice) {
        const daily = dailyCategoryTotals.get(day);
        if (!daily) continue;
        agg.rotation += daily.rotation;
        agg.atfm += daily.atfm;
        agg.operational += daily.operational;
      }
      out.push(agg);
    }
    return out;
  }

  private enumerateMonthKeysInclusive(fromYmd: string, toYmd: string): string[] {
    const out: string[] = [];
    const start = new Date(`${fromYmd.trim()}T00:00:00Z`);
    const end = new Date(`${toYmd.trim()}T00:00:00Z`);
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    const endKey = `${end.getUTCFullYear()}-${String(
      end.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    while (true) {
      const key = `${cursor.getUTCFullYear()}-${String(
        cursor.getUTCMonth() + 1,
      ).padStart(2, '0')}`;
      out.push(key);
      if (key === endKey) break;
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return out;
  }

  private monthLabel(monthKey: string): string {
    const [yRaw, mRaw] = monthKey.split('-');
    const y = Number(yRaw);
    const m = Number(mRaw);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
      return monthKey;
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, 1)));
  }

  private movingAverage(values: number[], windowSize = 3): number[] {
    return values.map((_, index) => {
      const start = Math.max(0, index - windowSize + 1);
      const slice = values.slice(start, index + 1);
      if (!slice.length) return 0;
      return Math.round(slice.reduce((sum, value) => sum + value, 0) / slice.length);
    });
  }

  private severityForCode(row: {
    flightCount: number;
    avgMinutes: number;
    pctOfDelay: number;
  }): DelayReportSeverity {
    if (row.pctOfDelay >= 45 || row.flightCount >= 30 || row.avgMinutes >= 55) {
      return 'Alert';
    }
    if (row.pctOfDelay >= 8 || row.flightCount >= 5 || row.avgMinutes >= 25) {
      return 'Watch';
    }
    return 'High';
  }

  private severityRank(severity: DelayReportSeverity): number {
    if (severity === 'Alert') return 3;
    if (severity === 'Watch') return 2;
    return 1;
  }

  private categoryForCode(code: string): DelayCategory {
    if (code === '93') return 'Aircraft Rotation';
    if (code === '81' || code === '83' || code === '84') return 'ATFM';
    return 'Operational';
  }

  private parseHourFromTime(t: string): number | null {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim());
    if (!match) return null;
    const hour = Number(match[1]);
    return hour >= 0 && hour <= 23 ? hour : null;
  }
}
