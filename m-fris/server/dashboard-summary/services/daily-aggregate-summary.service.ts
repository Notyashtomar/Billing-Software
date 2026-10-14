import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { AnyBulkWriteOperation } from 'mongoose';
import { Model } from 'mongoose';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import { normalizeStationCode } from '../../common/station/station.constants';
import type { DashboardAggregateType } from '../constants/dashboard-aggregate-types';
import {
  DASHBOARD_FLIGHT_SCOPES,
  isNonScheduledDashboardScope,
  type DashboardFlightScope,
} from '../constants/dashboard-flight-scope';
import type {
  DashboardDailyAggregateLean,
  DashboardDailyAggregateUpsertInput,
} from '../interfaces/dashboard-daily-aggregate.interface';
import type { DashboardEquipmentMode } from '../interfaces';
import {
  DASHBOARD_DAILY_AGGREGATE_LEAN_PROJECTION,
  DashboardDailyAggregate,
  DashboardDailyAggregateDocument,
} from '../schemas/dashboard-daily-aggregate.schema';
import {
  NsDashboardDailyAggregate,
  NsDashboardDailyAggregateDocument,
} from '../schemas/ns-dashboard-daily-aggregate.schema';

@Injectable()
export class DailyAggregateSummaryService {
  private readonly logger = new Logger(DailyAggregateSummaryService.name);

  constructor(
    @InjectModel(DashboardDailyAggregate.name)
    private readonly model: Model<DashboardDailyAggregateDocument>,
    @InjectModel(NsDashboardDailyAggregate.name)
    private readonly nsModel: Model<NsDashboardDailyAggregateDocument>,
  ) {}

  private modelFor(
    flightScope?: DashboardFlightScope | null,
  ): Model<DashboardDailyAggregateDocument | NsDashboardDailyAggregateDocument> {
    return isNonScheduledDashboardScope(flightScope) ? this.nsModel : this.model;
  }

  private static normalizeEquipmentMode(
    aggregateType: DashboardAggregateType,
    equipmentMode?: DashboardEquipmentMode,
  ): '' | DashboardEquipmentMode {
    if (aggregateType === 'equipmentUtilization') {
      return equipmentMode === '4h' ? '4h' : '6h';
    }
    return '';
  }

  private toLean(
    doc: Record<string, unknown> | null,
  ): DashboardDailyAggregateLean | null {
    if (!doc) return null;
    return {
      _id: String(doc._id ?? ''),
      stationCode:
        doc.stationCode != null ? String(doc.stationCode) : undefined,
      date: String(doc.date ?? ''),
      aggregateType: doc.aggregateType as DashboardAggregateType,
      equipmentMode: (doc.equipmentMode ?? '') as '' | DashboardEquipmentMode,
      generatedAt: doc.generatedAt as Date,
      data: (doc.data ?? {}) as Record<string, unknown>,
      perf: (doc.perf ?? {}) as DashboardDailyAggregateLean['perf'],
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

  isFresh(generatedAt: Date | string, ttlMs: number): boolean {
    const ts = new Date(generatedAt).getTime();
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < ttlMs;
  }

  isLogicallyFresh(
    doc: DashboardDailyAggregateLean | null,
    ttlMs: number,
  ): boolean {
    if (!doc) return false;
    if (doc.isStale === true) return false;
    return this.isFresh(doc.generatedAt, ttlMs);
  }

  async findAggregate(
    date: string,
    aggregateType: DashboardAggregateType,
    equipmentMode?: DashboardEquipmentMode,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardDailyAggregateLean | null> {
    const mode = DailyAggregateSummaryService.normalizeEquipmentMode(
      aggregateType,
      equipmentMode,
    );
    const doc = await this.modelFor(flightScope)
      .findOne(
        StationScope.filter(
          { date: date.trim(), aggregateType, equipmentMode: mode },
          station,
        ),
      )
      .select(DASHBOARD_DAILY_AGGREGATE_LEAN_PROJECTION)
      .lean()
      .exec();
    return this.toLean(doc as unknown as Record<string, unknown> | null);
  }

  async findRangeAggregates(
    fromDate: string,
    tillDate: string,
    aggregateType: DashboardAggregateType,
    equipmentMode?: DashboardEquipmentMode,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardDailyAggregateLean[]> {
    const from = fromDate.trim();
    const till = tillDate.trim();
    if (from > till) {
      throw new BadRequestException('fromDate must be on or before tillDate');
    }
    const mode = DailyAggregateSummaryService.normalizeEquipmentMode(
      aggregateType,
      equipmentMode,
    );

    const docs = await this.modelFor(flightScope)
      .find(
        StationScope.filter(
          {
            date: { $gte: from, $lte: till },
            aggregateType,
            equipmentMode: mode,
          },
          station,
        ),
      )
      .select(DASHBOARD_DAILY_AGGREGATE_LEAN_PROJECTION)
      .sort({ date: 1 })
      .lean()
      .exec();

    return docs
      .map((d) => this.toLean(d as unknown as Record<string, unknown>))
      .filter((d): d is DashboardDailyAggregateLean => d != null);
  }

  async upsertAggregate(
    input: DashboardDailyAggregateUpsertInput,
  ): Promise<DashboardDailyAggregateLean> {
    const date = input.date.trim();
    const mode = DailyAggregateSummaryService.normalizeEquipmentMode(
      input.aggregateType,
      input.equipmentMode,
    );
    const generatedAt = input.generatedAt ?? new Date();

    const sourceVersion = input.sourceVersion ?? String(Date.now());
    const snapshotAt = new Date();
    const stationCode = normalizeStationCode(input.stationCode);
    const flightScope =
      input.flightScope ?? DASHBOARD_FLIGHT_SCOPES.SCHEDULED;

    const doc = await this.modelFor(flightScope)
      .findOneAndUpdate(
        {
          stationCode: stationCode ?? null,
          date,
          aggregateType: input.aggregateType,
          equipmentMode: mode,
        },
        {
          $set: {
            date,
            aggregateType: input.aggregateType,
            equipmentMode: mode,
            generatedAt,
            data: input.data,
            perf: input.perf,
            isStale: false,
            refreshInProgress: false,
            refreshFailedAt: null,
            sourceSnapshotAt: snapshotAt,
            sourceVersion,
            lastInvalidatedAt: null,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      )
      .select(DASHBOARD_DAILY_AGGREGATE_LEAN_PROJECTION)
      .lean()
      .exec();

    return this.toLean(doc as unknown as Record<string, unknown>)!;
  }

  async deleteAggregate(
    date: string,
    aggregateType: DashboardAggregateType,
    equipmentMode?: DashboardEquipmentMode,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<{ deleted: boolean }> {
    const mode = DailyAggregateSummaryService.normalizeEquipmentMode(
      aggregateType,
      equipmentMode,
    );
    const result = await this.modelFor(flightScope).deleteOne({
      date: date.trim(),
      aggregateType,
      equipmentMode: mode,
    });
    return { deleted: (result.deletedCount ?? 0) > 0 };
  }

  async deleteByDates(
    dates: readonly string[],
    aggregateTypes?: readonly DashboardAggregateType[],
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<{ deletedCount: number }> {
    if (!dates.length) return { deletedCount: 0 };
    const filter: Record<string, unknown> = {
      date: { $in: dates.map((d) => d.trim()) },
    };
    if (aggregateTypes?.length) {
      filter.aggregateType = { $in: [...aggregateTypes] };
    }
    const result = await this.modelFor(flightScope).deleteMany(filter).exec();
    return { deletedCount: result.deletedCount ?? 0 };
  }

  async deleteAll(
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<{ deletedCount: number }> {
    const result = await this.modelFor(flightScope).deleteMany({}).exec();
    return { deletedCount: result.deletedCount ?? 0 };
  }

  async markStaleForDateTypes(params: {
    dates: readonly string[];
    aggregateTypes: readonly DashboardAggregateType[];
    /** Concrete station to limit the sweep to (omit = all stations / legacy). */
    stationCode?: string;
    flightScope?: DashboardFlightScope;
  }): Promise<{ modified: number }> {
    const now = new Date();
    const code = normalizeStationCode(params.stationCode);
    const stationFilter = code ? { stationCode: code } : {};
    const ops: AnyBulkWriteOperation<
      DashboardDailyAggregateDocument | NsDashboardDailyAggregateDocument
    >[] = [];
    for (const date0 of params.dates) {
      const date = date0.trim();
      for (const aggregateType of params.aggregateTypes) {
        if (aggregateType === 'equipmentUtilization') {
          for (const em of ['4h', '6h'] as const) {
            ops.push({
              updateOne: {
                filter: {
                  ...stationFilter,
                  date,
                  aggregateType,
                  equipmentMode: em,
                },
                update: { $set: { isStale: true, lastInvalidatedAt: now } },
              },
            });
          }
        } else {
          ops.push({
            updateOne: {
              filter: {
                ...stationFilter,
                date,
                aggregateType,
                equipmentMode: '',
              },
              update: { $set: { isStale: true, lastInvalidatedAt: now } },
            },
          });
        }
      }
    }
    if (!ops.length) return { modified: 0 };
    const res = await this.modelFor(params.flightScope).bulkWrite(ops, {
      ordered: false,
    });
    return { modified: res.modifiedCount };
  }

  async findStaleAggregatesLimited(
    limit: number,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardDailyAggregateLean[]> {
    const cap = Math.min(200, Math.max(1, limit));
    const docs = await this.modelFor(flightScope)
      .find({ isStale: true, refreshInProgress: { $ne: true } })
      .select(DASHBOARD_DAILY_AGGREGATE_LEAN_PROJECTION)
      .limit(cap)
      .lean()
      .exec();
    return docs
      .map((d) => this.toLean(d as unknown as Record<string, unknown>))
      .filter((d): d is DashboardDailyAggregateLean => d != null);
  }

  async setAggregateRefreshState(
    date: string,
    aggregateType: DashboardAggregateType,
    equipmentMode: undefined | DashboardEquipmentMode,
    patch: {
      refreshInProgress?: boolean;
      refreshFailedAt?: Date | null;
      isStale?: boolean;
    },
    stationCode?: string,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<void> {
    const mode = DailyAggregateSummaryService.normalizeEquipmentMode(
      aggregateType,
      equipmentMode,
    );
    const code = normalizeStationCode(stationCode);
    await this.modelFor(flightScope)
      .updateOne(
        {
          ...(code ? { stationCode: code } : {}),
          date: date.trim(),
          aggregateType,
          equipmentMode: mode,
        },
        {
          $set: patch,
        },
      )
      .exec();
  }
}
