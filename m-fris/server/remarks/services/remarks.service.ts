// import { Injectable } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import { Remarks, RemarksDocument } from '../schema/remarks.schema';
// import { CreateRemarksDto } from '../dto/create-remarks.dto';

// @Injectable()
// export class RemarksService {
//   constructor(
//     @InjectModel(Remarks.name) private remarksModel: Model<RemarksDocument>,
//   ) {}

//   async create(dto: CreateRemarksDto) {
//     const doc = new this.remarksModel(dto);
//     return doc.save();
//   }

//   async findAll() {
//     return this.remarksModel.find().sort({ serialNo: 1, createdAt: -1 }).exec();
//   }

//   async findOne(id: string) {
//     return this.remarksModel.findById(id).exec();
//   }

//   async findBySerialNo(serialNo: number) {
//     return this.remarksModel.findOne({ serialNo }).exec();
//   }

//   async update(id: string, dto: Partial<CreateRemarksDto>) {
//     return this.remarksModel
//       .findByIdAndUpdate(id, dto, { new: true })
//       .exec();
//   }

//   async remove(id: string) {
//     return this.remarksModel.findByIdAndDelete(id).exec();
//   }
// }

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Remarks, RemarksDocument } from '../schema/remarks.schema';
import { CreateRemarksDto } from '../dto/create-remarks.dto';
import {
  AIRLINE_REMARKS_RATING_VALUES,
  isAirlineRemarksRating,
} from '../remarks-rating.constants';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';

@Injectable()
export class RemarksService {
  constructor(
    @InjectModel(Remarks.name)
    private remarksModel: Model<RemarksDocument>,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  /** Unify new (`ghRemarks` / `ghRep`) and legacy remark field names before persist. */
  private coalesceRemarksCanonicalFields(
    dto: CreateRemarksDto | Partial<CreateRemarksDto>,
  ): Partial<CreateRemarksDto> {
    const ghText = String(
      dto.ghRemarks ?? dto.PaxGHAirlineRep_Name ?? '',
    ).trim();
    const repText = String(
      dto.ghRep ?? dto.PAX_Airline_SignByDate ?? '',
    ).trim();
    const airlineText = String(
      dto.airlineRemarks ?? dto.AirRepRem ?? '',
    ).trim();
    const airlineRepText = String(dto.airlineRep ?? dto.airrep ?? '').trim();
    return {
      ...dto,
      Airline: String(dto.Airline ?? dto.airline ?? '').trim() || dto.Airline,
      FlightNo: String(dto.FlightNo ?? dto.flightNo ?? '').trim() || dto.FlightNo,
      ghRemarks: ghText,
      ghRep: repText,
      PaxGHAirlineRep_Name: ghText,
      PAX_Airline_SignByDate: repText,
      airlineRemarks: airlineText,
      AirRepRem: airlineText,
      airrep: airlineRepText,
    };
  }

  private requireValidRating(dto: CreateRemarksDto): string {
    const raw = String(dto.airlineRemarksRating ?? '').trim();
    if (!raw || !isAirlineRemarksRating(raw)) {
      throw new BadRequestException(
        `airlineRemarksRating is required and must be one of: ${AIRLINE_REMARKS_RATING_VALUES.join(', ')}`,
      );
    }
    return raw;
  }

  private requireFlightStaDateIso(dto: CreateRemarksDto): string {
    const flightStaDateIso = String(dto.flightStaDateIso ?? '').trim();
    if (!flightStaDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(flightStaDateIso)) {
      throw new BadRequestException(
        'flightStaDateIso is required and must be YYYY-MM-DD (STA date of the flight)',
      );
    }
    return flightStaDateIso;
  }

  /** ATA / TypeCraft / identifiers from `fhr_collection.mainDetails` embed (mixed key casings). */
  private static ataAndTypeFromFhrLean(
    fhr: Record<string, unknown> | undefined,
  ): {
    ataDate: string;
    ataTime: string;
    aircraftType: string;
    airline: string;
    flightNo: string;
  } {
    const empty = {
      ataDate: '',
      ataTime: '',
      aircraftType: '',
      airline: '',
      flightNo: '',
    };
    if (!fhr) return empty;
    const mdRaw = fhr.mainDetails;
    const md =
      mdRaw && typeof mdRaw === 'object' && !Array.isArray(mdRaw)
        ? (mdRaw as Record<string, unknown>)
        : null;
    if (!md) return empty;
    const s = (v: unknown) => String(v ?? '').trim();
    return {
      ataDate: s(md.ATADate ?? md.ataDate),
      ataTime: s(md.ATATime ?? md.ataTime),
      aircraftType: s(md.TypeCraft ?? md.typeCraft),
      airline: s(md.Airline ?? md.airline),
      flightNo:
        s(md.ArrivalFltNo) ||
        s(md.DepartureFltNo) ||
        s(md.FlightNo ?? md.flightNo),
    };
  }

  /** Counts by rating for remarks with STA date in [fromIso, toIso] (YYYY-MM-DD). */
  async aggregateAirlineRatingsByStaDateRange(
    fromIso: string,
    toIso: string,
    station?: StationScopeContext,
  ): Promise<{
    from: string;
    to: string;
    total: number;
    buckets: { rating: string; count: number }[];
  }> {
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    const from = String(fromIso ?? '').trim();
    const to = String(toIso ?? '').trim();
    if (!ymd.test(from) || !ymd.test(to)) {
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    }
    if (from > to) {
      throw new BadRequestException('from must be on or before to');
    }
    const stationMatch = station ? StationScope.filter({}, station) : {};
    const grouped = await this.remarksModel
      .aggregate<{ _id: string; count: number }>([
        {
          $match: {
            ...stationMatch,
            airlineRemarksRating: { $in: [...AIRLINE_REMARKS_RATING_VALUES] },
            flightStaDateIso: { $gte: from, $lte: to },
          },
        },
        { $group: { _id: '$airlineRemarksRating', count: { $sum: 1 } } },
      ])
      .exec();
    const byRating = new Map(grouped.map((g) => [g._id, g.count]));
    const buckets = AIRLINE_REMARKS_RATING_VALUES.map((rating) => ({
      rating,
      count: byRating.get(rating) ?? 0,
    }));
    const total = buckets.reduce((s, b) => s + b.count, 0);
    return { from, to, total, buckets };
  }

  /**
   * Rows with non-empty airline rep remarks for STA date in [fromIso, toIso].
   * `AirRepRem` is the canonical airline-remarks text field on `remarks`.
   */
  async listAirlineRemarkRowsWithTextByStaDateRange(
    fromIso: string,
    toIso: string,
    opts?: { limit?: number },
    station?: StationScopeContext,
  ): Promise<{
    from: string;
    to: string;
    rows: {
      serialNo: number;
      airline: string;
      flightNo: string;
      aircraftType: string;
      ataDate: string;
      ataTime: string;
      airlineRepRem: string;
      airlineRemarksRating: string;
    }[];
  }> {
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    const from = String(fromIso ?? '').trim();
    const to = String(toIso ?? '').trim();
    if (!ymd.test(from) || !ymd.test(to)) {
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    }
    if (from > to) {
      throw new BadRequestException('from must be on or before to');
    }
    const limitRaw = opts?.limit ?? 5000;
    const limit =
      typeof limitRaw === 'number' && Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), 10000)
        : 5000;

    const stationMatch = station ? StationScope.filter({}, station) : {};
    const rows = await this.remarksModel
      .find({
        ...stationMatch,
        flightStaDateIso: { $gte: from, $lte: to },
        $expr: {
          $gt: [
            {
              $strLenCP: {
                $trim: { input: { $ifNull: ['$AirRepRem', ''] } },
              },
            },
            0,
          ],
        },
      })
      .select({
        serialNo: 1,
        Airline: 1,
        FlightNo: 1,
        AirRepRem: 1,
        airlineRemarksRating: 1,
        flightStaDateIso: 1,
        _id: 0,
      })
      .sort({ flightStaDateIso: 1, serialNo: 1 })
      .limit(limit)
      .lean()
      .exec();

    const fhrMap = await this.fhrCollectionService.getLeanFhrBySerialsMap(
      rows.map((r) => r.serialNo),
    );

    return {
      from,
      to,
      rows: rows.map((d) => {
        const fhr = fhrMap.get(d.serialNo);
        const ex = RemarksService.ataAndTypeFromFhrLean(fhr);
        const airline = String(d.Airline ?? '').trim() || ex.airline;
        const flightNo = String(d.FlightNo ?? '').trim() || ex.flightNo;
        return {
          serialNo: d.serialNo,
          airline,
          flightNo,
          aircraftType: ex.aircraftType,
          ataDate: ex.ataDate,
          ataTime: ex.ataTime,
          airlineRepRem: String(d.AirRepRem ?? ''),
          airlineRemarksRating: String(d.airlineRemarksRating ?? ''),
        };
      }),
    };
  }

  // CREATE (One per flight)
  async create(
    serial: number,
    dto: CreateRemarksDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const existing = await this.remarksModel.findOne(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (existing) {
      throw new Error('Remarks already exist for this flight');
    }

    const rating = this.requireValidRating(dto);
    const flightStaDateIso = this.requireFlightStaDateIso(dto);
    const merged = this.coalesceRemarksCanonicalFields(dto);
    const doc = new this.remarksModel({
      ...merged,
      airlineRemarksRating: rating,
      flightStaDateIso,
      serialNo: serial,
      stationCode,
    });

    const saved = await doc.save();
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'remarks',
      saved,
      'remarks_form_save',
      station,
    );
    return saved;
  }

  // GET
  async findBySerial(serial: number, station: StationScopeContext) {
    const doc = await this.remarksModel
      .findOne(StationScope.filter({ serialNo: serial }, station))
      .exec();
    if (doc) return doc;
    const fhr = await this.fhrCollectionService.getLeanFhrBySerial(
      serial,
      station,
    );
    const embed = fhr?.remarks;
    if (embed && typeof embed === 'object' && !Array.isArray(embed)) {
      return embed as RemarksDocument;
    }
    return null;
  }

  // UPDATE
  async updateBySerial(
    serial: number,
    dto: Partial<CreateRemarksDto>,
    station: StationScopeContext,
  ) {
    const merged = this.coalesceRemarksCanonicalFields(dto);
    delete (merged as Record<string, unknown>).stationCode;
    const updated = await this.remarksModel.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      merged,
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Remarks not found');
    }

    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'remarks',
      updated,
      'remarks_form_save',
      station,
    );
    return updated;
  }

  /** Upsert by flight serial (create or update). Used by non-scheduled save flow. */
  async upsertBySerial(
    serial: number,
    dto: CreateRemarksDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const rating = this.requireValidRating(dto);
    const flightStaDateIso = this.requireFlightStaDateIso(dto);
    const merged = this.coalesceRemarksCanonicalFields(dto);
    delete (merged as Record<string, unknown>).stationCode;
    const updated = await this.remarksModel.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      {
        $set: {
          ...merged,
          airlineRemarksRating: rating,
          flightStaDateIso,
          serialNo: serial,
        },
        $setOnInsert: { stationCode },
      },
      { new: true, upsert: true },
    );
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'remarks',
      updated,
      'remarks_form_save',
      station,
    );
    return updated;
  }

  // DELETE
  async deleteBySerial(serial: number, station: StationScopeContext) {
    const deleted = await this.remarksModel.findOneAndDelete(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (!deleted) {
      throw new NotFoundException('Remarks not found');
    }

    return {
      success: true,
      message: 'Deleted successfully',
    };
  }

  // ADMIN
  async findAll(station: StationScopeContext) {
    return this.remarksModel.find(StationScope.filter({}, station)).exec();
  }

  /**
   * Spreadsheet / bulk import: merge remark fields without forcing UI-only validators.
   * On insert, sets default rating and STA ISO so schema-required fields exist.
   */
  async mergeForSpreadsheetImport(
    serial: number,
    patch: Partial<{
      Airline: string;
      FlightNo: string;
      PaxGHAirlineRep_Name: string;
      ghRemarks: string;
      ghRep: string;
      AirRepRem: string;
      airrep: string;
      airlineRemarksRating: string;
      PAX_Airline_SignByDate: string;
    }>,
    opts: { flightStaDateIso?: string },
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const isoRaw = String(opts.flightStaDateIso ?? '').trim();
    const flightStaDateIso = /^\d{4}-\d{2}-\d{2}$/.test(isoRaw)
      ? isoRaw
      : '1970-01-01';

    const $set: Record<string, unknown> = { serialNo: serial };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null) continue;
      const s = typeof v === 'string' ? v : String(v);
      $set[k] = s;
    }
    const ghText = String(
      $set['ghRemarks'] ?? $set['PaxGHAirlineRep_Name'] ?? '',
    ).trim();
    const repText = String(
      $set['ghRep'] ?? $set['PAX_Airline_SignByDate'] ?? '',
    ).trim();
    if (ghText) {
      $set['ghRemarks'] = ghText;
      $set['PaxGHAirlineRep_Name'] = ghText;
    }
    if (repText) {
      $set['ghRep'] = repText;
      $set['PAX_Airline_SignByDate'] = repText;
    }

    /** Same path cannot appear in both `$set` and `$setOnInsert` (MongoDB conflict). */
    const $setOnInsert: Record<string, unknown> = {
      flightStaDateIso,
      stationCode,
    };
    if (!Object.prototype.hasOwnProperty.call($set, 'airlineRemarksRating')) {
      $setOnInsert.airlineRemarksRating = 'Satisfactory';
    }

    const doc = await this.remarksModel
      .findOneAndUpdate(
        StationScope.filter({ serialNo: serial }, station),
        {
          $set,
          $setOnInsert,
        },
        { upsert: true, new: true },
      )
      .exec();
    if (doc) {
      await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
        serial,
        'remarks',
        doc,
        'remarks_spreadsheet_import',
        station,
      );
    }
    return doc;
  }
}
