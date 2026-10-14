import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import { normalizeStationCode } from '../../common/station/station.constants';
import type {
  DashboardEquipmentMode,
  DashboardSummaryLean,
  DashboardSummaryShardKey,
  DashboardSummaryUpsertInput,
} from '../interfaces';
import { enumerateYmdInclusive } from '../utils/daily-aggregate-merge.util';
import {
  composeDashboardSummaryLean,
  shardsAreLogicallyFresh,
} from '../utils/compose-dashboard-daily-shards.util';
import {
  DASHBOARD_FLIGHT_SCOPES,
  isNonScheduledDashboardScope,
  type DashboardFlightScope,
} from '../constants/dashboard-flight-scope';
import {
  DASHBOARD_SUMMARY_CARDS_ONLY_PROJECTION,
  DASHBOARD_SUMMARY_DRILLDOWN_PROJECTION,
  DASHBOARD_SUMMARY_LEAN_PROJECTION,
  DashboardSummary,
  DashboardSummaryDocument,
} from '../schemas/dashboard-summary.schema';
import {
  NsDashboardSummary,
  NsDashboardSummaryDocument,
} from '../schemas/ns-dashboard-summary.schema';

export type DailyShardProjectionKind = 'cards' | 'drill' | 'full';

@Injectable()
export class DashboardSummaryService {
  private readonly logger = new Logger(DashboardSummaryService.name);

  constructor(
    @InjectModel(DashboardSummary.name)
    private readonly model: Model<DashboardSummaryDocument>,
    @InjectModel(NsDashboardSummary.name)
    private readonly nsModel: Model<NsDashboardSummaryDocument>,
  ) {}

  private modelFor(
    flightScope?: DashboardFlightScope | null,
  ): Model<DashboardSummaryDocument | NsDashboardSummaryDocument> {
    return isNonScheduledDashboardScope(flightScope) ? this.nsModel : this.model;
  }

  private static assertRangeOrder(fromDate: string, tillDate: string): void {
    if (fromDate > tillDate) {
      throw new BadRequestException('fromDate must be on or before tillDate');
    }
  }

  private static normalizeMode(
    mode?: DashboardEquipmentMode,
  ): DashboardEquipmentMode {
    return mode === '4h' ? '4h' : '6h';
  }

  private projectionFor(kind: DailyShardProjectionKind) {
    if (kind === 'cards') return DASHBOARD_SUMMARY_CARDS_ONLY_PROJECTION;
    if (kind === 'drill') return DASHBOARD_SUMMARY_DRILLDOWN_PROJECTION;
    return DASHBOARD_SUMMARY_LEAN_PROJECTION;
  }

  private toLean(doc: Record<string, unknown> | null): DashboardSummaryLean | null {
    if (!doc) return null;
    const summaryDate = String(doc.summaryDate ?? '').trim();
    return {
      _id: String(doc._id ?? ''),
      stationCode:
        doc.stationCode != null ? String(doc.stationCode) : undefined,
      summaryDate: summaryDate || undefined,
      fromDate: summaryDate,
      tillDate: summaryDate,
      equipmentMode: doc.equipmentMode as DashboardEquipmentMode,
      generatedAt: doc.generatedAt as Date,
      cards: (doc.cards ?? {}) as DashboardSummaryLean['cards'],
      drilldowns: (doc.drilldowns ?? undefined) as
        | Record<string, unknown>
        | undefined,
      perf: (doc.perf ?? {}) as DashboardSummaryLean['perf'],
      isStale: doc.isStale === true,
      sourceSnapshotAt: doc.sourceSnapshotAt as Date | undefined,
      sourceVersion:
        doc.sourceVersion != null ? String(doc.sourceVersion) : undefined,
      lastInvalidatedAt: doc.lastInvalidatedAt as Date | undefined,
      refreshInProgress: doc.refreshInProgress === true,
      refreshFailedAt: doc.refreshFailedAt as Date | undefined,
      createdAt: doc.createdAt as Date | undefined,
      updatedAt: doc.updatedAt as Date | undefined,
    };
  }

  isLogicallyFresh(doc: DashboardSummaryLean | null, ttlMs: number): boolean {
    if (!doc) return false;
    if (doc.isStale === true) return false;
    const ts = new Date(doc.generatedAt).getTime();
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < ttlMs;
  }

  /** True when every daily shard in the inclusive range is within TTL and not flagged stale. */
  isComposedLogicallyFresh(
    shards: DashboardSummaryLean[],
    ttlMs: number,
  ): boolean {
    return shardsAreLogicallyFresh(shards, ttlMs);
  }

  async markStaleForSummaryDates(
    summaryDates: readonly string[],
    at: Date = new Date(),
    stationCode?: string,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<{ modifiedCount: number }> {
    const days = [
      ...new Set(
        summaryDates
          .map((d) => d.trim())
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      ),
    ];
    if (!days.length) return { modifiedCount: 0 };
    const code = normalizeStationCode(stationCode);
    const stationFilter = code ? { stationCode: code } : {};
    const ops = days.flatMap((summaryDate) =>
      (['4h', '6h'] as const).map((equipmentMode) => ({
        updateOne: {
          filter: { ...stationFilter, summaryDate, equipmentMode },
          update: {
            $set: { isStale: true, lastInvalidatedAt: at },
          },
        },
      })),
    );
    const result = await this.modelFor(flightScope).bulkWrite(ops, {
      ordered: false,
    });
    return { modifiedCount: result.modifiedCount ?? 0 };
  }

  /** @deprecated Arbitrary-range documents are removed — use {@link markStaleForSummaryDates}. */
  async markStaleForRanges(
    ranges: Array<{ fromDate: string; tillDate: string }>,
    at?: Date,
  ): Promise<{ modifiedCount: number }> {
    const dates = new Set<string>();
    for (const r of ranges) {
      for (const d of enumerateYmdInclusive(
        r.fromDate.trim(),
        r.tillDate.trim(),
      )) {
        dates.add(d);
      }
    }
    return this.markStaleForSummaryDates([...dates], at);
  }

  async setRefreshState(
    key: DashboardSummaryShardKey,
    patch: {
      refreshInProgress?: boolean;
      refreshFailedAt?: Date | null;
      isStale?: boolean;
    },
    stationCode?: string,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<void> {
    const $set: Record<string, unknown> = {};
    if (patch.refreshInProgress != null) {
      $set.refreshInProgress = patch.refreshInProgress;
    }
    if (patch.refreshFailedAt !== undefined) {
      $set.refreshFailedAt = patch.refreshFailedAt;
    }
    if (patch.isStale != null) {
      $set.isStale = patch.isStale;
    }
    if (!Object.keys($set).length) return;
    const code = normalizeStationCode(stationCode);
    await this.modelFor(flightScope).updateOne(
      {
        ...(code ? { stationCode: code } : {}),
        summaryDate: key.summaryDate.trim(),
        equipmentMode: DashboardSummaryService.normalizeMode(key.equipmentMode),
      },
      { $set },
    );
  }

  async findStaleSummariesLimited(
    limit = 48,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardSummaryLean[]> {
    const cap = Math.max(1, Math.min(limit, 200));
    const docs = await this.modelFor(flightScope)
      .find({ isStale: true })
      .select(DASHBOARD_SUMMARY_LEAN_PROJECTION)
      .sort({ generatedAt: 1 })
      .limit(cap)
      .lean()
      .exec();
    return docs
      .map((d) => this.toLean(d as unknown as Record<string, unknown>))
      .filter((d): d is DashboardSummaryLean => d != null);
  }

  async findDailyShard(
    summaryDate: string,
    equipmentMode?: DashboardEquipmentMode,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardSummaryLean | null> {
    const day = summaryDate.trim();
    const mode = DashboardSummaryService.normalizeMode(equipmentMode);
    const doc = await this.modelFor(flightScope)
      .findOne(
        StationScope.filter({ summaryDate: day, equipmentMode: mode }, station),
      )
      .select(DASHBOARD_SUMMARY_LEAN_PROJECTION)
      .lean()
      .exec();
    return doc ? this.toLean(doc as unknown as Record<string, unknown>) : null;
  }

  /**
   * Load daily shards for an inclusive YMD window in order.
   * Returns `null` when any calendar day in the window has no shard document.
   */
  async findOrderedDailyShards(
    fromDate: string,
    tillDate: string,
    equipmentMode: DashboardEquipmentMode | undefined,
    kind: DailyShardProjectionKind,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardSummaryLean[] | null> {
    const from = fromDate.trim();
    const till = tillDate.trim();
    DashboardSummaryService.assertRangeOrder(from, till);
    const mode = DashboardSummaryService.normalizeMode(equipmentMode);
    const days = enumerateYmdInclusive(from, till);
    const proj = this.projectionFor(kind);
    const docs = await this.modelFor(flightScope)
      .find(
        StationScope.filter(
          { summaryDate: { $gte: from, $lte: till }, equipmentMode: mode },
          station,
        ),
      )
      .select(proj)
      .sort({ summaryDate: 1 })
      .lean()
      .exec();
    const byDate = new Map(
      docs.map((d) => [String((d as { summaryDate: string }).summaryDate), d]),
    );
    const ordered: DashboardSummaryLean[] = [];
    for (const d of days) {
      const raw = byDate.get(d);
      if (!raw) return null;
      const lean = this.toLean(raw as unknown as Record<string, unknown>);
      if (!lean) return null;
      ordered.push(lean);
    }
    return ordered;
  }

  /** Existing summaryDate values in range (partial coverage OK). */
  async listExistingSummaryDates(
    fromDate: string,
    tillDate: string,
    equipmentMode: DashboardEquipmentMode | undefined,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<string[]> {
    const from = fromDate.trim();
    const till = tillDate.trim();
    DashboardSummaryService.assertRangeOrder(from, till);
    const mode = DashboardSummaryService.normalizeMode(equipmentMode);
    const docs = await this.modelFor(flightScope)
      .find(
        StationScope.filter(
          { summaryDate: { $gte: from, $lte: till }, equipmentMode: mode },
          station,
        ),
        { summaryDate: 1, _id: 0 },
      )
      .lean()
      .exec();
    return docs
      .map((d) => String((d as { summaryDate?: string }).summaryDate ?? '').trim())
      .filter(Boolean);
  }

  /**
   * Merge daily summary shards for an arbitrary inclusive range (HTTP read path).
   */
  async findCardsComposedForRange(
    fromDate: string,
    tillDate: string,
    equipmentMode?: DashboardEquipmentMode,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardSummaryLean | null> {
    const from = fromDate.trim();
    const till = tillDate.trim();
    DashboardSummaryService.assertRangeOrder(from, till);
    const mode = DashboardSummaryService.normalizeMode(equipmentMode);
    const shards = await this.findOrderedDailyShards(
      from,
      till,
      mode,
      'cards',
      station,
      flightScope,
    );
    if (!shards) {
      this.logger.debug(
        `[dashboard_summary] composed_cards_miss from=${from} till=${till} mode=${mode} scope=${flightScope}`,
      );
      return null;
    }
    this.logger.debug(
      `[dashboard_summary] composed_cards_hit from=${from} till=${till} mode=${mode} scope=${flightScope} shards=${shards.length}`,
    );
    return composeDashboardSummaryLean(shards, from, till, mode);
  }

  /**
   * @deprecated Use {@link findCardsComposedForRange}.
   */
  async findCardsByRange(
    fromDate: string,
    tillDate: string,
    equipmentMode?: DashboardEquipmentMode,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardSummaryLean | null> {
    return this.findCardsComposedForRange(
      fromDate,
      tillDate,
      equipmentMode,
      station,
      flightScope,
    );
  }

  async findDrillShardsOrdered(
    fromDate: string,
    tillDate: string,
    equipmentMode?: DashboardEquipmentMode,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardSummaryLean[] | null> {
    return this.findOrderedDailyShards(
      fromDate,
      tillDate,
      equipmentMode,
      'drill',
      station,
      flightScope,
    );
  }

  /**
   * Primary read for GET `/dashboard-summaries` — composed from daily shards (full projection).
   */
  async findByRange(
    fromDate: string,
    tillDate: string,
    equipmentMode?: DashboardEquipmentMode,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardSummaryLean | null> {
    const from = fromDate.trim();
    const till = tillDate.trim();
    DashboardSummaryService.assertRangeOrder(from, till);
    const mode = DashboardSummaryService.normalizeMode(equipmentMode);
    const shards = await this.findOrderedDailyShards(
      from,
      till,
      mode,
      'full',
      station,
      flightScope,
    );
    if (!shards) {
      this.logger.debug(
        `[dashboard_summary] composed_full_miss from=${from} till=${till} mode=${mode} scope=${flightScope}`,
      );
      return null;
    }
    return composeDashboardSummaryLean(shards, from, till, mode);
  }

  /** Upsert one daily shard (`stationCode` + `summaryDate` + `equipmentMode`). */
  async upsert(input: DashboardSummaryUpsertInput): Promise<DashboardSummaryLean> {
    const summaryDate = input.summaryDate.trim();
    const mode = DashboardSummaryService.normalizeMode(input.equipmentMode);
    const generatedAt = input.generatedAt ?? new Date();
    const stationCode = normalizeStationCode(input.stationCode);
    const flightScope =
      input.flightScope ?? DASHBOARD_FLIGHT_SCOPES.SCHEDULED;
    const shardKey = {
      stationCode: stationCode ?? null,
      summaryDate,
      equipmentMode: mode,
    };

    const prev = await this.modelFor(flightScope)
      .findOne(shardKey)
      .select({ sourceVersion: 1 })
      .lean()
      .exec();
    const prevVer = Number(prev?.sourceVersion ?? 0);
    const nextVersion = String(
      input.sourceVersion != null ? input.sourceVersion : prevVer + 1,
    );

    const $set: Record<string, unknown> = {
      summaryDate,
      equipmentMode: mode,
      generatedAt,
      cards: input.cards,
      perf: input.perf,
      isStale: input.isStale === true,
      sourceSnapshotAt: input.sourceSnapshotAt ?? generatedAt,
      sourceVersion: nextVersion,
      lastInvalidatedAt: input.lastInvalidatedAt,
      refreshInProgress: input.refreshInProgress === true,
      refreshFailedAt: input.refreshFailedAt,
    };
    if (input.drilldowns !== undefined) {
      $set.drilldowns = input.drilldowns;
    }

    const doc = await this.modelFor(flightScope)
      .findOneAndUpdate(
        shardKey,
        { $set },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      )
      .select(DASHBOARD_SUMMARY_LEAN_PROJECTION)
      .lean()
      .exec();

    this.logger.log(
      `[dashboard_summary] upsert summaryDate=${summaryDate} mode=${mode} scope=${flightScope} sourceRows=${input.perf.sourceRows}`,
    );

    return this.toLean(doc as unknown as Record<string, unknown>)!;
  }

  /** Latest snapshots across all shards (admin / diagnostics). */
  async findLatest(
    limit = 20,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardSummaryLean[]> {
    const cap = Math.max(1, Math.min(limit, 100));
    const docs = await this.modelFor(flightScope)
      .find()
      .select(DASHBOARD_SUMMARY_LEAN_PROJECTION)
      .sort({ generatedAt: -1 })
      .limit(cap)
      .lean()
      .exec();

    return docs
      .map((d) => this.toLean(d as unknown as Record<string, unknown>))
      .filter((d): d is DashboardSummaryLean => d != null);
  }

  async deleteShard(
    key: DashboardSummaryShardKey,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<{ deleted: boolean }> {
    const result = await this.modelFor(flightScope).deleteOne({
      summaryDate: key.summaryDate.trim(),
      equipmentMode: DashboardSummaryService.normalizeMode(key.equipmentMode),
    });
    return { deleted: (result.deletedCount ?? 0) > 0 };
  }

  /** Deletes all daily shards with `summaryDate` in the inclusive YMD window. */
  async deleteByRange(
    key: {
      fromDate: string;
      tillDate: string;
      equipmentMode: DashboardEquipmentMode;
    },
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<{ deletedCount: number }> {
    const from = key.fromDate.trim();
    const till = key.tillDate.trim();
    DashboardSummaryService.assertRangeOrder(from, till);
    const mode = DashboardSummaryService.normalizeMode(key.equipmentMode);
    const result = await this.modelFor(flightScope).deleteMany({
      summaryDate: { $gte: from, $lte: till },
      equipmentMode: mode,
    });
    return { deletedCount: result.deletedCount ?? 0 };
  }

  async deleteAll(
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<{ deletedCount: number }> {
    const result = await this.modelFor(flightScope).deleteMany({}).exec();
    return { deletedCount: result.deletedCount ?? 0 };
  }

  async requireByRange(
    fromDate: string,
    tillDate: string,
    equipmentMode?: DashboardEquipmentMode,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardSummaryLean> {
    const found = await this.findByRange(
      fromDate,
      tillDate,
      equipmentMode,
      station,
      flightScope,
    );
    if (!found) {
      throw new NotFoundException(
        `No dashboard summary shards covering ${fromDate} → ${tillDate} (${DashboardSummaryService.normalizeMode(equipmentMode)}, ${flightScope})`,
      );
    }
    return found;
  }
}
