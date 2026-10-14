// import { Injectable } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import { Attachments, AttachmentsDocument } from '../schema/attachments.schema';
// import { CreateAttachmentsDto } from '../dto/create-attachments.dto';

// @Injectable()
// export class AttachmentsService {
//   constructor(
//     @InjectModel(Attachments.name)
//     private attachmentsModel: Model<AttachmentsDocument>,
//   ) {}

//   async create(dto: CreateAttachmentsDto) {
//     const doc = new this.attachmentsModel(dto);
//     return doc.save();
//   }

//   async findAll() {
//     return this.attachmentsModel.find().sort({ fhrNo: 1, createdAt: -1 }).exec();
//   }

//   async findOne(id: string) {
//     return this.attachmentsModel.findById(id).exec();
//   }

//   async findByFhrNo(fhrNo: number) {
//     return this.attachmentsModel.findOne({ fhrNo }).exec();
//   }

//   async update(id: string, dto: Partial<CreateAttachmentsDto>) {
//     return this.attachmentsModel
//       .findByIdAndUpdate(id, dto, { new: true })
//       .exec();
//   }

//   async remove(id: string) {
//     return this.attachmentsModel.findByIdAndDelete(id).exec();
//   }
// }

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Attachments, AttachmentsDocument } from '../schema/attachments.schema';
import { CreateAttachmentsDto } from '../dto/create-attachments.dto';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectModel(Attachments.name)
    private attachmentsModel: Model<AttachmentsDocument>,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  // CREATE (One per flight)
  async create(
    serial: number,
    dto: CreateAttachmentsDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const existing = await this.attachmentsModel.findOne(
      StationScope.filter({ fhrNo: serial }, station),
    );

    if (existing) {
      throw new Error('Attachments already exist for this flight');
    }

    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const doc = new this.attachmentsModel({
      ...payload,
      fhrNo: serial,
      stationCode,
    });

    const saved = await doc.save();
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'attachments',
      saved,
      'attachments_form_save',
      station,
    );
    return saved;
  }

  // GET
  async findBySerial(serial: number, station: StationScopeContext) {
    return this.attachmentsModel
      .findOne(StationScope.filter({ fhrNo: serial }, station))
      .exec();
  }

  // UPDATE
  async updateBySerial(
    serial: number,
    dto: Partial<CreateAttachmentsDto>,
    station: StationScopeContext,
  ) {
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.attachmentsModel.findOneAndUpdate(
      StationScope.filter({ fhrNo: serial }, station),
      payload,
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Attachments not found');
    }

    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'attachments',
      updated,
      'attachments_form_save',
      station,
    );
    return updated;
  }

  /** Upsert by flight serial (create or update). Used by non-scheduled save flow. */
  async upsertBySerial(
    serial: number,
    dto: CreateAttachmentsDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.attachmentsModel.findOneAndUpdate(
      StationScope.filter({ fhrNo: serial }, station),
      { $set: { ...payload, fhrNo: serial }, $setOnInsert: { stationCode } },
      { new: true, upsert: true },
    );
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'attachments',
      updated,
      'attachments_form_save',
      station,
    );
    return updated;
  }

  // DELETE
  async deleteBySerial(serial: number, station: StationScopeContext) {
    const deleted = await this.attachmentsModel.findOneAndDelete(
      StationScope.filter({ fhrNo: serial }, station),
    );

    if (!deleted) {
      throw new NotFoundException('Attachments not found');
    }

    return {
      success: true,
      message: 'Deleted successfully',
    };
  }

  // ADMIN
  async findAll(station: StationScopeContext) {
    return this.attachmentsModel.find(StationScope.filter({}, station)).exec();
  }
}
