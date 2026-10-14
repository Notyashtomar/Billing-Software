// import { Injectable } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import {
//   RampDetails1,
//   RampDetails1Document,
// } from '../schema/ramp-details-1.schema';
// import { CreateRampDetails1Dto } from '../dto/create-ramp-details-1.dto';

// @Injectable()
// export class RampDetails1Service {
//   constructor(
//     @InjectModel(RampDetails1.name)
//     private rampDetails1Model: Model<RampDetails1Document>,
//   ) {}

//   async create(dto: CreateRampDetails1Dto) {
//     const doc = new this.rampDetails1Model(dto);
//     return doc.save();
//   }

//   async findAll() {
//     return this.rampDetails1Model.find().sort({ serialNo: 1 }).exec();
//   }

//   async findOne(id: string) {
//     return this.rampDetails1Model.findById(id).exec();
//   }

//   async findBySerialNo(serialNo: number) {
//     return this.rampDetails1Model.findOne({ serialNo }).exec();
//   }

//   async update(id: string, dto: Partial<CreateRampDetails1Dto>) {
//     return this.rampDetails1Model
//       .findByIdAndUpdate(id, dto, { new: true })
//       .exec();
//   }

//   async remove(id: string) {
//     return this.rampDetails1Model.findByIdAndDelete(id).exec();
//   }
// }

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RampDetails1,
  RampDetails1Document,
} from '../schema/ramp-details-1.schema';
import { CreateRampDetails1Dto } from '../dto/create-ramp-details-1.dto';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';

@Injectable()
export class RampDetails1Service {
  constructor(
    @InjectModel(RampDetails1.name)
    private rampDetails1Model: Model<RampDetails1Document>,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  // CREATE (Only one per flight)
  async create(
    serial: number,
    dto: CreateRampDetails1Dto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const existing = await this.rampDetails1Model.findOne(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (existing) {
      throw new ConflictException('Ramp details already exist for this flight');
    }

    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const doc = new this.rampDetails1Model({
      ...payload,
      serialNo: serial,
      stationCode,
    });

    const saved = await doc.save();
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'rampDetails1',
      saved,
      'ramp_details_1_form_save',
      station,
    );
    return saved;
  }

  // GET
  async findBySerial(serial: number, station: StationScopeContext) {
    const record = await this.rampDetails1Model.findOne(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (record) return record;

    const fhr = await this.fhrCollectionService.getLeanFhrBySerial(
      serial,
      station,
    );
    const embed = fhr?.rampDetails1;
    if (embed && typeof embed === 'object' && !Array.isArray(embed)) {
      return embed as RampDetails1Document;
    }

    throw new NotFoundException('Ramp details not found');
  }

  // UPDATE
  async updateBySerial(
    serial: number,
    dto: Partial<CreateRampDetails1Dto>,
    station: StationScopeContext,
  ) {
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.rampDetails1Model.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      { $set: { ...payload, serialNo: serial } },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Ramp details not found');
    }

    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'rampDetails1',
      updated,
      'ramp_details_1_form_save',
      station,
    );
    return updated;
  }

  /** Upsert by flight serial (create or update). Used by non-scheduled save flow. */
  async upsertBySerial(
    serial: number,
    dto: CreateRampDetails1Dto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.rampDetails1Model.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      { $set: { ...payload, serialNo: serial }, $setOnInsert: { stationCode } },
      { new: true, upsert: true },
    );
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'rampDetails1',
      updated,
      'ramp_details_1_form_save',
      station,
    );
    return updated;
  }

  // DELETE
  async deleteBySerial(serial: number, station: StationScopeContext) {
    const deleted = await this.rampDetails1Model.findOneAndDelete(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (!deleted) {
      throw new NotFoundException('Ramp details not found');
    }

    return {
      success: true,
      message: 'Deleted successfully',
    };
  }

  // OPTIONAL
  async findAll(station: StationScopeContext) {
    return this.rampDetails1Model.find(StationScope.filter({}, station)).exec();
  }
}
