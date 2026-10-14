// import { Injectable } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import {
//   TerminalDetails,
//   TerminalDetailsDocument,
// } from '../schema/terminal-details.schema';
// import { CreateTerminalDetailsDto } from '../dto/create-terminal-details.dto';

// @Injectable()
// export class TerminalDetailsService {
//   constructor(
//     @InjectModel(TerminalDetails.name)
//     private terminalDetailsModel: Model<TerminalDetailsDocument>,
//   ) {}

//   async create(dto: CreateTerminalDetailsDto) {
//     const doc = new this.terminalDetailsModel(dto);
//     return doc.save();
//   }

//   async findAll() {
//     return this.terminalDetailsModel.find().sort({ serialNo: 1 }).exec();
//   }

//   async findOne(id: string) {
//     return this.terminalDetailsModel.findById(id).exec();
//   }

//   async findBySerialNo(serialNo: number) {
//     return this.terminalDetailsModel.findOne({ serialNo }).exec();
//   }

//   async update(id: string, dto: Partial<CreateTerminalDetailsDto>) {
//     return this.terminalDetailsModel
//       .findByIdAndUpdate(id, dto, { new: true })
//       .exec();
//   }

//   async remove(id: string) {
//     return this.terminalDetailsModel.findByIdAndDelete(id).exec();
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
  TerminalDetails,
  TerminalDetailsDocument,
} from '../schema/terminal-details.schema';
import { CreateTerminalDetailsDto } from '../dto/create-terminal-details.dto';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';

@Injectable()
export class TerminalDetailsService {
  constructor(
    @InjectModel(TerminalDetails.name)
    private terminalDetailsModel: Model<TerminalDetailsDocument>,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  // CREATE (Only one per flight)
  async create(
    serial: number,
    dto: CreateTerminalDetailsDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const existing = await this.terminalDetailsModel.findOne(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (existing) {
      throw new ConflictException(
        'Terminal details already exist for this flight',
      );
    }

    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const doc = new this.terminalDetailsModel({
      ...payload,
      serialNo: serial,
      stationCode,
    });

    const saved = await doc.save();
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'terminalDetails',
      saved,
      'terminal_details_form_save',
      station,
    );
    return saved;
  }

  // GET
  async findBySerial(serial: number, station: StationScopeContext) {
    const record = await this.terminalDetailsModel.findOne(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (record) return record;

    const fhr = await this.fhrCollectionService.getLeanFhrBySerial(
      serial,
      station,
    );
    const embed = fhr?.terminalDetails;
    if (embed && typeof embed === 'object' && !Array.isArray(embed)) {
      return embed as TerminalDetailsDocument;
    }

    throw new NotFoundException('Terminal details not found');
  }

  // UPDATE (upsert: hydration may come from `fhr_collection` only)
  async updateBySerial(
    serial: number,
    dto: Partial<CreateTerminalDetailsDto>,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.terminalDetailsModel.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      { $set: { ...payload, serialNo: serial }, $setOnInsert: { stationCode } },
      { new: true, upsert: true },
    );

    if (!updated) {
      throw new NotFoundException('Terminal details not found');
    }

    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'terminalDetails',
      updated,
      'terminal_details_form_save',
      station,
    );
    return updated;
  }

  /** Upsert by flight serial (create or update). Used by non-scheduled save flow. */
  async upsertBySerial(
    serial: number,
    dto: CreateTerminalDetailsDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.terminalDetailsModel.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      { $set: { ...payload, serialNo: serial }, $setOnInsert: { stationCode } },
      { new: true, upsert: true },
    );
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'terminalDetails',
      updated,
      'terminal_details_form_save',
      station,
    );
    return updated;
  }

  // DELETE
  async deleteBySerial(serial: number, station: StationScopeContext) {
    const deleted = await this.terminalDetailsModel.findOneAndDelete(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (!deleted) {
      throw new NotFoundException('Terminal details not found');
    }

    return {
      success: true,
      message: 'Deleted successfully',
    };
  }

  // OPTIONAL (for reports listing)
  async findAll(station: StationScopeContext) {
    return this.terminalDetailsModel
      .find(StationScope.filter({}, station))
      .exec();
  }
}
