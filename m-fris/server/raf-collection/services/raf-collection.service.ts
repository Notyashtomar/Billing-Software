import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from '../../common/station/station.constants';
import { AdvanceRafAirlineService } from '../../advance-raf-airline/services/advance-raf-airline.service';
import {
  RafCollection,
  RafCollectionDocument,
} from '../schema/raf-collection.schema';

export type UpsertRafCollectionDto = {
  mainDetails?: Record<string, unknown>;
  rafAdhocDetails?: Record<string, unknown> | null;
  rafCleaningServices?: Record<string, unknown> | null;
};

@Injectable()
export class RafCollectionService {
  private readonly logger = new Logger(RafCollectionService.name);

  constructor(
    @InjectModel(RafCollection.name)
    private readonly rafModel: Model<RafCollectionDocument>,
    private readonly advanceRafAirlineService: AdvanceRafAirlineService,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  async upsertMerge(
    SerialNo: number,
    dto: UpsertRafCollectionDto,
    reason: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<RafCollectionDocument> {
    const set: Record<string, unknown> = {
      SerialNo,
      flightSerialNumber: SerialNo,
      lastSnapshotAt: new Date(),
      lastSnapshotReason: reason,
      stationCode: this.stampStationCode(station),
    };
    if (dto.mainDetails !== undefined) {
      set.mainDetails = {
        ...dto.mainDetails,
        SerialNo: (dto.mainDetails as { SerialNo?: number }).SerialNo ?? SerialNo,
        flightSerialNumber:
          (dto.mainDetails as { flightSerialNumber?: number }).flightSerialNumber ??
          SerialNo,
      };
    }
    if (dto.rafAdhocDetails !== undefined) {
      set.rafAdhocDetails = dto.rafAdhocDetails;
    }
    if (dto.rafCleaningServices !== undefined) {
      set.rafCleaningServices = dto.rafCleaningServices;
    }

    const updated = await this.rafModel
      .findOneAndUpdate(
        { SerialNo },
        { $set: set },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    await this.syncAdvanceRafAirline(updated, station);
    return updated;
  }

  async getLeanBySerial(
    SerialNo: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Record<string, unknown> | null> {
    if (!Number.isFinite(SerialNo)) return null;
    const doc = await this.rafModel
      .findOne(
        StationScope.filter(
          { $or: [{ SerialNo }, { flightSerialNumber: SerialNo }] },
          station,
        ),
      )
      .lean()
      .exec();
    return doc != null ? (doc as unknown as Record<string, unknown>) : null;
  }

  async getLeanBySerialsMap(
    serials: number[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Map<string, Record<string, unknown>>> {
    const unique = [
      ...new Set(serials.filter((n) => Number.isFinite(n) && n > 0)),
    ];
    const out = new Map<string, Record<string, unknown>>();
    if (unique.length === 0) return out;
    const docs = await this.rafModel
      .find(
        StationScope.filter(
          {
            $or: [
              { SerialNo: { $in: unique } },
              { flightSerialNumber: { $in: unique } },
            ],
          },
          station,
        ),
      )
      .lean()
      .exec();
    for (const doc of docs) {
      const serial = String(
        (doc as { SerialNo?: number }).SerialNo ??
          (doc as { flightSerialNumber?: number }).flightSerialNumber ??
          '',
      ).trim();
      if (serial) out.set(serial, doc as unknown as Record<string, unknown>);
    }
    return out;
  }

  /**
   * Copy RAF payloads off `fhr_collection` into `raf_collection`, then unset on FHR.
   */
  async migrateFromFhrDocuments(
    fhrModel: Model<{
      SerialNo?: number;
      flightSerialNumber?: number;
      stationCode?: string;
      mainDetails?: Record<string, unknown> | null;
      rafAdhocDetails?: Record<string, unknown> | null;
      rafCleaningServices?: Record<string, unknown> | null;
    }>,
    opts: { dryRun?: boolean; stationCode?: string } = {},
  ): Promise<{
    dryRun: boolean;
    scanned: number;
    upserted: number;
    clearedFromFhr: number;
  }> {
    const dryRun = !!opts.dryRun;
    const filter: Record<string, unknown> = {
      $or: [
        { rafAdhocDetails: { $exists: true, $ne: null } },
        { rafCleaningServices: { $exists: true, $ne: null } },
      ],
    };
    if (opts.stationCode) {
      const code = opts.stationCode.trim().toUpperCase();
      filter.$and = [
        {
          $or: [
            { stationCode: code },
            { stationCode: { $exists: false } },
            { stationCode: null },
            { stationCode: '' },
          ],
        },
      ];
    }

    const docs = await fhrModel.find(filter).lean().exec();
    let upserted = 0;
    let clearedFromFhr = 0;

    for (const doc of docs) {
      const serial = Number(doc.SerialNo ?? doc.flightSerialNumber);
      if (!Number.isFinite(serial) || serial <= 0) continue;
      upserted += 1;
      if (dryRun) continue;

      const stationCode =
        normalizeStationCode(doc.stationCode) ?? LEGACY_STATION_CODE;
      const station = {
        stationCode,
        crossStation: false,
      } satisfies StationScopeContext;

      await this.upsertMerge(
        serial,
        {
          mainDetails: (doc.mainDetails as Record<string, unknown>) ?? undefined,
          rafAdhocDetails: doc.rafAdhocDetails ?? null,
          rafCleaningServices: doc.rafCleaningServices ?? null,
        },
        'migrate_fhr_raf_to_raf_collection',
        station,
      );

      await fhrModel
        .updateOne(
          { SerialNo: serial },
          { $unset: { rafAdhocDetails: 1, rafCleaningServices: 1 } },
        )
        .exec();
      clearedFromFhr += 1;

      // Drop FHR shells that only existed for RAF seeding (no other form payloads).
      const leftover = await fhrModel
        .findOne({ SerialNo: serial })
        .select({
          terminalDetails: 1,
          loadControlDetails: 1,
          rampDetails1: 1,
          rampDetails2: 1,
          rampDetails3: 1,
          remarks: 1,
          equipmentManpower: 1,
          equipmentDetails: 1,
          attachments: 1,
          reports: 1,
          lastSnapshotReason: 1,
        })
        .lean()
        .exec();
      if (leftover && !fhrDocHasNonRafForms(leftover as Record<string, unknown>)) {
        await fhrModel.deleteOne({ SerialNo: serial }).exec();
      }
    }

    this.logger.log(
      `[raf_collection migrate] dryRun=${dryRun} scanned=${docs.length} upserted=${upserted} cleared=${clearedFromFhr}`,
    );
    return {
      dryRun,
      scanned: docs.length,
      upserted,
      clearedFromFhr,
    };
  }

  private async syncAdvanceRafAirline(
    doc: RafCollectionDocument | null,
    station: StationScopeContext,
  ): Promise<void> {
    if (!doc) return;
    const adhoc =
      doc.rafAdhocDetails && typeof doc.rafAdhocDetails === 'object'
        ? (doc.rafAdhocDetails as Record<string, unknown>)
        : {};
    const main =
      doc.mainDetails && typeof doc.mainDetails === 'object'
        ? (doc.mainDetails as Record<string, unknown>)
        : {};
    const airline = String(
      adhoc.airline ?? main.Airline ?? main.airlineName ?? '',
    ).trim();
    const airlineCode = String(
      adhoc.airlineCode ?? main.Arline_Code ?? main.airlineCode ?? '',
    )
      .trim()
      .toUpperCase();
    if (!airline && !airlineCode) return;
    await this.advanceRafAirlineService.ensureAirline(
      airline || airlineCode,
      airlineCode,
      station,
    );
  }
}

function fhrDocHasNonRafForms(doc: Record<string, unknown>): boolean {
  const keys = [
    'terminalDetails',
    'loadControlDetails',
    'rampDetails1',
    'rampDetails2',
    'rampDetails3',
    'remarks',
    'equipmentManpower',
    'equipmentDetails',
    'attachments',
    'reports',
  ] as const;
  for (const key of keys) {
    const value = doc[key];
    if (value == null) continue;
    if (Array.isArray(value) && value.length > 0) return true;
    if (typeof value === 'object' && Object.keys(value as object).length > 0) {
      return true;
    }
  }
  return false;
}
