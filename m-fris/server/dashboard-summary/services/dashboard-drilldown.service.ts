import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ProjectionType } from 'mongoose';
import {
  DASHBOARD_FLIGHT_SCOPES,
  isNonScheduledDashboardScope,
  type DashboardFlightScope,
} from '../constants/dashboard-flight-scope';
import type { DashboardEquipmentMode } from '../interfaces';
import type { DashboardDrillType } from '../schemas/dashboard-drilldown.schema';
import {
  DashboardDrilldown,
  DashboardDrilldownDocument,
} from '../schemas/dashboard-drilldown.schema';
import {
  NsDashboardDrilldown,
  NsDashboardDrilldownDocument,
} from '../schemas/ns-dashboard-drilldown.schema';

export interface DashboardDrilldownUpsertInput {
  fromDate: string;
  tillDate: string;
  equipmentMode: DashboardEquipmentMode;
  drillType: DashboardDrillType;
  flightScope?: DashboardFlightScope;
  generatedAt?: Date;
  sourceVersion?: string;
  isStale?: boolean;
  sourceSnapshotAt?: Date;
  payload: Record<string, unknown>;
  entryCount: number;
}

@Injectable()
export class DashboardDrilldownService {
  private readonly logger = new Logger(DashboardDrilldownService.name);

  constructor(
    @InjectModel(DashboardDrilldown.name)
    private readonly model: Model<DashboardDrilldownDocument>,
    @InjectModel(NsDashboardDrilldown.name)
    private readonly nsModel: Model<NsDashboardDrilldownDocument>,
  ) {}

  private modelFor(
    flightScope?: DashboardFlightScope | null,
  ): Model<DashboardDrilldownDocument | NsDashboardDrilldownDocument> {
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

  async upsert(input: DashboardDrilldownUpsertInput): Promise<void> {
    const fromDate = input.fromDate.trim();
    const tillDate = input.tillDate.trim();
    DashboardDrilldownService.assertRangeOrder(fromDate, tillDate);
    const equipmentMode = DashboardDrilldownService.normalizeMode(
      input.equipmentMode,
    );
    const generatedAt = input.generatedAt ?? new Date();
    const flightScope =
      input.flightScope ?? DASHBOARD_FLIGHT_SCOPES.SCHEDULED;
    const model = this.modelFor(flightScope);

    const prev = await model
      .findOne({
        fromDate,
        tillDate,
        equipmentMode,
        drillType: input.drillType,
      })
      .select({ sourceVersion: 1 })
      .lean()
      .exec();
    const prevVer = Number(prev?.sourceVersion ?? 0);
    const nextVersion = String(
      input.sourceVersion != null ? input.sourceVersion : prevVer + 1,
    );

    await model.findOneAndUpdate(
      { fromDate, tillDate, equipmentMode, drillType: input.drillType },
      {
        $set: {
          fromDate,
          tillDate,
          equipmentMode,
          drillType: input.drillType,
          generatedAt,
          sourceVersion: nextVersion,
          isStale: input.isStale === true,
          sourceSnapshotAt: input.sourceSnapshotAt ?? generatedAt,
          payload: input.payload,
          entryCount: input.entryCount,
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
      `[dashboard_drilldown] upsert type=${input.drillType} from=${fromDate} till=${tillDate} ` +
        `mode=${equipmentMode} scope=${flightScope} entries=${input.entryCount}`,
    );
  }

  async markStaleForRanges(
    ranges: Array<{ fromDate: string; tillDate: string }>,
    _at: Date = new Date(),
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<{ modifiedCount: number }> {
    if (!ranges.length) return { modifiedCount: 0 };
    const ops = ranges.flatMap((r) =>
      (['4h', '6h'] as const).flatMap((equipmentMode) =>
        (['performance', 'airlineRemarks'] as const).map((drillType) => ({
          updateOne: {
            filter: {
              fromDate: r.fromDate.trim(),
              tillDate: r.tillDate.trim(),
              equipmentMode,
              drillType,
            },
            update: {
              $set: { isStale: true },
            },
          },
        })),
      ),
    );
    const result = await this.modelFor(flightScope).bulkWrite(ops, {
      ordered: false,
    });
    return { modifiedCount: result.modifiedCount ?? 0 };
  }

  async findPerformanceDrill(
    fromDate: string,
    tillDate: string,
    equipmentMode?: DashboardEquipmentMode,
    slice?: { skip: number; limit: number },
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<{
    payload: Record<string, unknown>;
    entryCount: number;
    generatedAt: Date;
    isStale: boolean;
    mongoReadMs: number;
  } | null> {
    const from = fromDate.trim();
    const till = tillDate.trim();
    DashboardDrilldownService.assertRangeOrder(from, till);
    const mode = DashboardDrilldownService.normalizeMode(equipmentMode);
    const t0 = Date.now();
    const proj: Record<string, unknown> = {
      payload: 1,
      entryCount: 1,
      generatedAt: 1,
      isStale: 1,
    };
    if (
      slice &&
      slice.limit > 0 &&
      Number.isFinite(slice.skip) &&
      Number.isFinite(slice.limit)
    ) {
      proj['payload.flights'] = { $slice: [slice.skip, slice.limit] };
    }
    const doc = await this.modelFor(flightScope)
      .findOne({
        fromDate: from,
        tillDate: till,
        equipmentMode: mode,
        drillType: 'performance',
      })
      .select(proj as ProjectionType<DashboardDrilldownDocument>)
      .lean()
      .exec();
    const mongoReadMs = Date.now() - t0;

    if (!doc?.payload || typeof doc.payload !== 'object') {
      this.logger.debug(
        `[dashboard_drilldown] performance_miss from=${from} till=${till} mode=${mode} scope=${flightScope}`,
      );
      return null;
    }

    return {
      payload: doc.payload as Record<string, unknown>,
      entryCount: Number(doc.entryCount ?? 0),
      generatedAt: doc.generatedAt as Date,
      isStale: doc.isStale === true,
      mongoReadMs,
    };
  }

  async findAirlineRemarksDrill(
    fromDate: string,
    tillDate: string,
    equipmentMode?: DashboardEquipmentMode,
    slice?: { skip: number; limit: number },
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<{
    payload: Record<string, unknown>;
    entryCount: number;
    generatedAt: Date;
    isStale: boolean;
    mongoReadMs: number;
  } | null> {
    const from = fromDate.trim();
    const till = tillDate.trim();
    DashboardDrilldownService.assertRangeOrder(from, till);
    const mode = DashboardDrilldownService.normalizeMode(equipmentMode);
    const t0 = Date.now();
    const proj: Record<string, unknown> = {
      payload: 1,
      entryCount: 1,
      generatedAt: 1,
      isStale: 1,
    };
    if (
      slice &&
      slice.limit > 0 &&
      Number.isFinite(slice.skip) &&
      Number.isFinite(slice.limit)
    ) {
      proj['payload.rows'] = { $slice: [slice.skip, slice.limit] };
    }
    const doc = await this.modelFor(flightScope)
      .findOne({
        fromDate: from,
        tillDate: till,
        equipmentMode: mode,
        drillType: 'airlineRemarks',
      })
      .select(proj as ProjectionType<DashboardDrilldownDocument>)
      .lean()
      .exec();
    const mongoReadMs = Date.now() - t0;

    if (!doc?.payload || typeof doc.payload !== 'object') {
      this.logger.debug(
        `[dashboard_drilldown] airline_miss from=${from} till=${till} mode=${mode} scope=${flightScope}`,
      );
      return null;
    }

    return {
      payload: doc.payload as Record<string, unknown>,
      entryCount: Number(doc.entryCount ?? 0),
      generatedAt: doc.generatedAt as Date,
      isStale: doc.isStale === true,
      mongoReadMs,
    };
  }

  async deleteAll(
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<{ deletedCount: number }> {
    const result = await this.modelFor(flightScope).deleteMany({}).exec();
    return { deletedCount: result.deletedCount ?? 0 };
  }
}
