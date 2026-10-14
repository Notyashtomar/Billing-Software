// import { Injectable } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import {
//   RampDetails3,
//   RampDetails3Document,
// } from '../schema/ramp-details-3.schema';
// import { CreateRampDetails3Dto } from '../dto/create-ramp-details-3.dto';

// @Injectable()
// export class RampDetails3Service {
//   constructor(
//     @InjectModel(RampDetails3.name)
//     private rampDetails3Model: Model<RampDetails3Document>,
//   ) {}

//   async create(dto: CreateRampDetails3Dto) {
//     const doc = new this.rampDetails3Model(dto);
//     return doc.save();
//   }

//   async findAll() {
//     return this.rampDetails3Model.find().sort({ createdAt: -1 }).exec();
//   }

//   async findOne(id: string) {
//     return this.rampDetails3Model.findById(id).exec();
//   }

//   async findByFhrNo(fhrNo: string) {
//     return this.rampDetails3Model.find({ fhrNo }).sort({ createdAt: -1 }).exec();
//   }

//   async update(id: string, dto: Partial<CreateRampDetails3Dto>) {
//     return this.rampDetails3Model
//       .findByIdAndUpdate(id, dto, { new: true })
//       .exec();
//   }

//   async remove(id: string) {
//     return this.rampDetails3Model.findByIdAndDelete(id).exec();
//   }
// }

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RampDetails3,
  RampDetails3Document,
} from '../schema/ramp-details-3.schema';
import { CreateRampDetails3Dto } from '../dto/create-ramp-details-3.dto';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';

@Injectable()
export class RampDetails3Service {
  constructor(
    @InjectModel(RampDetails3.name)
    private rampDetails3Model: Model<RampDetails3Document>,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  // CREATE (one per flight)
  async create(
    serial: number,
    dto: CreateRampDetails3Dto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const existing = await this.rampDetails3Model.findOne(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (existing) {
      throw new Error('RampDetails3 already exists for this flight');
    }

    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const doc = new this.rampDetails3Model({
      ...payload,
      serialNo: serial,
      stationCode,
    });

    const saved = await doc.save();
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'rampDetails3',
      saved,
      'ramp_details_3_form_save',
      station,
    );
    return saved;
  }

  // GET BY SERIAL
  async findBySerial(serial: number, station: StationScopeContext) {
    const doc = await this.rampDetails3Model
      .findOne(StationScope.filter({ serialNo: serial }, station))
      .exec();
    if (doc) return doc;
    const fhr = await this.fhrCollectionService.getLeanFhrBySerial(
      serial,
      station,
    );
    const embed = fhr?.rampDetails3;
    if (embed && typeof embed === 'object' && !Array.isArray(embed)) {
      return embed as RampDetails3Document;
    }
    return null;
  }

  // GET BY FHR NO
  async findByFhrNo(fhrNo: string, station: StationScopeContext) {
    if (!fhrNo || String(fhrNo).trim() === '') return null;
    return this.rampDetails3Model
      .findOne(
        StationScope.filter({ fhrNo: String(fhrNo).trim() }, station),
      )
      .exec();
  }

  // CREATE BY FHR NO (serialNo stored as 0 when not provided)
  async createByFhrNo(
    fhrNo: string,
    dto: CreateRampDetails3Dto,
    station: StationScopeContext,
  ) {
    const fhr = String(fhrNo).trim();
    if (!fhr) throw new BadRequestException('Invalid fhrNo');
    const stationCode = StationScope.require(station);
    const existing = await this.rampDetails3Model
      .findOne(StationScope.filter({ fhrNo: fhr }, station))
      .exec();
    if (existing) {
      throw new BadRequestException(
        'RampDetails3 already exists for this fhrNo',
      );
    }
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const doc = new this.rampDetails3Model({
      ...payload,
      serialNo: 0,
      fhrNo: fhr,
      stationCode,
    });
    return doc.save();
  }

  // UPDATE BY FHR NO
  async updateByFhrNo(
    fhrNo: string,
    dto: Partial<CreateRampDetails3Dto>,
    station: StationScopeContext,
  ) {
    const fhr = String(fhrNo).trim();
    if (!fhr) throw new BadRequestException('Invalid fhrNo');
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.rampDetails3Model.findOneAndUpdate(
      StationScope.filter({ fhrNo: fhr }, station),
      payload,
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('RampDetails3 not found for this fhrNo');
    }
    return updated;
  }

  // DELETE BY FHR NO
  async deleteByFhrNo(fhrNo: string, station: StationScopeContext) {
    const fhr = String(fhrNo).trim();
    if (!fhr) throw new BadRequestException('Invalid fhrNo');
    const deleted = await this.rampDetails3Model.findOneAndDelete(
      StationScope.filter({ fhrNo: fhr }, station),
    );
    if (!deleted) {
      throw new NotFoundException('RampDetails3 not found for this fhrNo');
    }
    return { success: true, message: 'Deleted successfully' };
  }

  // UPDATE BY SERIAL
  async updateBySerial(
    serial: number,
    dto: Partial<CreateRampDetails3Dto>,
    station: StationScopeContext,
  ) {
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.rampDetails3Model.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      payload,
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('RampDetails3 not found');
    }

    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'rampDetails3',
      updated,
      'ramp_details_3_form_save',
      station,
    );
    return updated;
  }

  /** Upsert by flight serial (create or update). Used by non-scheduled save flow. */
  async upsertBySerial(
    serial: number,
    dto: CreateRampDetails3Dto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.rampDetails3Model.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      { $set: { ...payload, serialNo: serial }, $setOnInsert: { stationCode } },
      { new: true, upsert: true },
    );
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'rampDetails3',
      updated,
      'ramp_details_3_form_save',
      station,
    );
    return updated;
  }

  // DELETE BY SERIAL
  async deleteBySerial(serial: number, station: StationScopeContext) {
    const deleted = await this.rampDetails3Model.findOneAndDelete(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (!deleted) {
      throw new NotFoundException('RampDetails3 not found');
    }

    return {
      success: true,
      message: 'Deleted successfully',
    };
  }

  async findAll(station: StationScopeContext) {
    return this.rampDetails3Model.find(StationScope.filter({}, station)).exec();
  }
}
