// import { Injectable } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import {
//   LoadControlDetails,
//   LoadControlDetailsDocument,
// } from '../schema/load-control-details.schema';
// import { CreateLoadControlDetailsDto } from '../dto/create-load-control-details.dto';

// @Injectable()
// export class LoadControlDetailsService {
//   constructor(
//     @InjectModel(LoadControlDetails.name)
//     private loadControlDetailsModel: Model<LoadControlDetailsDocument>,
//   ) {}

//   async create(dto: CreateLoadControlDetailsDto) {
//     const doc = new this.loadControlDetailsModel(dto);
//     return doc.save();
//   }

//   async findAll() {
//     return this.loadControlDetailsModel.find().sort({ serialNo: 1 }).exec();
//   }

//   async findOne(id: string) {
//     return this.loadControlDetailsModel.findById(id).exec();
//   }

//   async findBySerialNo(serialNo: number) {
//     return this.loadControlDetailsModel.findOne({ serialNo }).exec();
//   }

//   async update(id: string, dto: Partial<CreateLoadControlDetailsDto>) {
//     return this.loadControlDetailsModel
//       .findByIdAndUpdate(id, dto, { new: true })
//       .exec();
//   }

//   async remove(id: string) {
//     return this.loadControlDetailsModel.findByIdAndDelete(id).exec();
//   }
// }

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LoadControlDetails,
  LoadControlDetailsDocument,
} from '../schema/load-control-details.schema';
import { CreateLoadControlDetailsDto } from '../dto/create-load-control-details.dto';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';

@Injectable()
export class LoadControlDetailsService {
  /** Same band as scheduled-airlines global instance serials (`RawFlightDataService.GLOBAL_SERIAL_BASE`). */
  private static readonly SIX_DIGIT_SERIAL_MIN = 100;
  private static readonly SIX_DIGIT_SERIAL_MAX = 999;

  constructor(
    @InjectModel(LoadControlDetails.name)
    private loadControlDetailsModel: Model<LoadControlDetailsDocument>,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  /**
   * Map frontend keys (`adc` / `fic`) onto schema keys (`ADCNO` / `FICNO`) and drop aliases
   * so Mongoose persists the correct fields.
   */
  private normalizePersistPayload(
    dto: CreateLoadControlDetailsDto | Partial<CreateLoadControlDetailsDto>,
  ): Record<string, unknown> {
    const raw = { ...(dto as Record<string, unknown>) };
    const pickMerged = (a: unknown, b: unknown): string => {
      const ta = a != null ? String(a).trim() : '';
      const tb = b != null ? String(b).trim() : '';
      if (ta !== '') return String(a);
      if (tb !== '') return String(b);
      return a != null ? String(a) : b != null ? String(b) : '';
    };
    if ('adc' in raw || 'ADCNO' in raw) {
      raw['ADCNO'] = pickMerged(raw['ADCNO'], raw['adc']);
      delete raw['adc'];
    }
    if ('fic' in raw || 'FICNO' in raw) {
      raw['FICNO'] = pickMerged(raw['FICNO'], raw['fic']);
      delete raw['fic'];
    }
    return raw;
  }

  /**
   * Bulk-delete rows keyed by six-digit flight serials (100000–999999).
   * Legacy operational serials stay below this range.
   */
  async pruneSixDigitSerialRows(
    station: StationScopeContext,
    allStations = false,
    isGlobalAdmin = false,
  ): Promise<{
    success: true;
    deletedCount: number;
    message: string;
  }> {
    // Authorization hardening: an all-stations (cross-station) prune is permitted
    // ONLY for designated Global Admins. A station-scoped admin requesting it is
    // rejected outright — the request is never downgraded to a station prune.
    if (allStations && !isGlobalAdmin) {
      throw new ForbiddenException(
        'Only Global Admins may run all-stations (cross-station) maintenance operations.',
      );
    }
    const range = {
      serialNo: {
        $gte: LoadControlDetailsService.SIX_DIGIT_SERIAL_MIN,
        $lte: LoadControlDetailsService.SIX_DIGIT_SERIAL_MAX,
      },
    };
    // Multi-station safety: station users prune only their own rows; a
    // cross-station admin must explicitly confirm a global prune so MAA (or any
    // other station) is never wiped accidentally.
    let filter: Record<string, unknown>;
    if (station.crossStation) {
      if (!allStations) {
        throw new BadRequestException(
          'Refusing a cross-station prune. Pass { allStations: true } to confirm, or run it as a station-scoped user.',
        );
      }
      filter = range;
    } else {
      filter = StationScope.filter(range, station);
    }
    const res = await this.loadControlDetailsModel.deleteMany(filter);
    return {
      success: true,
      deletedCount: res.deletedCount ?? 0,
      message:
        'Deleted load control details documents with serialNo in the six-digit global range (100000–999999).',
    };
  }

  // CREATE (Only one per flight)
  async create(
    serial: number,
    dto: CreateLoadControlDetailsDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const existing = await this.loadControlDetailsModel.findOne(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (existing) {
      throw new ConflictException(
        'Load control details already exist for this flight',
      );
    }

    const payload = this.normalizePersistPayload(dto);
    delete payload.stationCode;
    const doc = new this.loadControlDetailsModel({
      ...payload,
      serialNo: serial,
      stationCode,
    });

    const saved = await doc.save();
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'loadControlDetails',
      saved,
      'load_control_form_save',
      station,
    );
    return saved;
  }

  // GET — null when never saved (form opens blank; avoid browser 404 noise)
  async findBySerial(serial: number, station: StationScopeContext) {
    const record = await this.loadControlDetailsModel.findOne(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (record) return record;

    const fhr = await this.fhrCollectionService.getLeanFhrBySerial(
      serial,
      station,
    );
    const embed = fhr?.loadControlDetails;
    if (embed && typeof embed === 'object' && !Array.isArray(embed)) {
      return embed as LoadControlDetailsDocument;
    }

    return null;
  }

  // UPDATE
  async updateBySerial(
    serial: number,
    dto: Partial<CreateLoadControlDetailsDto>,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const payload = this.normalizePersistPayload(dto);
    delete payload.stationCode;
    const updated = await this.loadControlDetailsModel.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      { $set: { ...payload, serialNo: serial }, $setOnInsert: { stationCode } },
      { new: true, upsert: true },
    );

    if (!updated) {
      throw new NotFoundException('Load control details not found');
    }

    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'loadControlDetails',
      updated,
      'load_control_form_save',
      station,
    );
    return updated;
  }

  /** Upsert by flight serial (create or update). Used by non-scheduled save flow. */
  async upsertBySerial(
    serial: number,
    dto: CreateLoadControlDetailsDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const payload = this.normalizePersistPayload(dto);
    delete payload.stationCode;
    const updated = await this.loadControlDetailsModel.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      { $set: { ...payload, serialNo: serial }, $setOnInsert: { stationCode } },
      { new: true, upsert: true },
    );
    if (updated) {
      await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
        serial,
        'loadControlDetails',
        updated,
        'load_control_form_save',
        station,
      );
    }
    return updated;
  }

  // DELETE
  async deleteBySerial(serial: number, station: StationScopeContext) {
    const deleted = await this.loadControlDetailsModel.findOneAndDelete(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (!deleted) {
      throw new NotFoundException('Load control details not found');
    }

    return {
      success: true,
      message: 'Deleted successfully',
    };
  }

  // OPTIONAL (for reports)
  async findAll(station: StationScopeContext) {
    return this.loadControlDetailsModel
      .find(StationScope.filter({}, station))
      .exec();
  }
}
