// import { Injectable } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import {
//   RampDetails2,
//   RampDetails2Document,
// } from '../schema/ramp-details-2.schema';
// import { CreateRampDetails2Dto } from '../dto/create-ramp-details-2.dto';

// @Injectable()
// export class RampDetails2Service {
//   constructor(
//     @InjectModel(RampDetails2.name)
//     private rampDetails2Model: Model<RampDetails2Document>,
//   ) {}

//   async create(dto: CreateRampDetails2Dto) {
//     const doc = new this.rampDetails2Model(dto);
//     return doc.save();
//   }

//   async findAll() {
//     return this.rampDetails2Model.find().sort({ serialNo: 1, createdAt: -1 }).exec();
//   }

//   async findOne(id: string) {
//     return this.rampDetails2Model.findById(id).exec();
//   }

//   async findBySerialNo(serialNo: number) {
//     return this.rampDetails2Model.find({ serialNo }).sort({ createdAt: -1 }).exec();
//   }

//   async update(id: string, dto: Partial<CreateRampDetails2Dto>) {
//     return this.rampDetails2Model
//       .findByIdAndUpdate(id, dto, { new: true })
//       .exec();
//   }

//   async remove(id: string) {
//     return this.rampDetails2Model.findByIdAndDelete(id).exec();
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
  RampDetails2,
  RampDetails2Document,
} from '../schema/ramp-details-2.schema';
import { CreateRampDetails2Dto } from '../dto/create-ramp-details-2.dto';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';

@Injectable()
export class RampDetails2Service {
  constructor(
    @InjectModel(RampDetails2.name)
    private rampDetails2Model: Model<RampDetails2Document>,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  // CREATE (Multiple rows allowed per flight)
  async create(
    serial: number,
    dto: CreateRampDetails2Dto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const doc = new this.rampDetails2Model({
      ...payload,
      serialNo: serial,
      stationCode,
    });

    const saved = await doc.save();
    await this.fhrCollectionService.mirrorRampDetails2ToFhrCollection(
      serial,
      'ramp_details_2_form_save',
      station,
    );
    return saved;
  }

  // GET ALL rows for flight
  async findBySerial(serial: number, station: StationScopeContext) {
    return this.rampDetails2Model
      .find(StationScope.filter({ serialNo: serial }, station))
      .sort({ createdAt: -1 })
      .exec();
  }

  // GET ALL rows by fhrNo (e.g. "DEL/198120"). If none found by fhrNo, fallback to serial from fhrNo when format is "XXX/serial"
  async findByFhrNo(fhrNo: string, station: StationScopeContext) {
    const fhr = String(fhrNo ?? '').trim();
    if (!fhr) return [];
    const byFhr = await this.rampDetails2Model
      .find(StationScope.filter({ fhrNo: fhr }, station))
      .sort({ createdAt: -1 })
      .exec();
    if (byFhr.length > 0) return byFhr;
    const slash = fhr.indexOf('/');
    if (slash !== -1) {
      const serialPart = fhr.slice(slash + 1).trim();
      const serial = Number(serialPart);
      if (!Number.isNaN(serial)) {
        return this.rampDetails2Model
          .find(StationScope.filter({ serialNo: serial }, station))
          .sort({ createdAt: -1 })
          .exec();
      }
    }
    return [];
  }

  // CREATE by fhrNo (serialNo stored as 0 when using fhrNo path)
  async createByFhrNo(
    fhrNo: string,
    dto: CreateRampDetails2Dto,
    station: StationScopeContext,
  ) {
    const fhr = String(fhrNo ?? '').trim();
    if (!fhr) throw new BadRequestException('Invalid fhrNo');
    const stationCode = StationScope.require(station);
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const doc = new this.rampDetails2Model({
      ...payload,
      serialNo: 0,
      fhrNo: fhr,
      stationCode,
    });
    return doc.save();
  }

  // UPDATE first document matching fhrNo; fallback to serial when fhrNo is "XXX/serial"
  async updateByFhrNo(
    fhrNo: string,
    dto: Partial<CreateRampDetails2Dto>,
    station: StationScopeContext,
  ) {
    const fhr = String(fhrNo ?? '').trim();
    if (!fhr) throw new BadRequestException('Invalid fhrNo');
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    let updated = await this.rampDetails2Model.findOneAndUpdate(
      StationScope.filter({ fhrNo: fhr }, station),
      { ...payload, fhrNo: fhr },
      { new: true },
    );
    if (!updated) {
      const slash = fhr.indexOf('/');
      if (slash !== -1) {
        const serial = Number(fhr.slice(slash + 1).trim());
        if (!Number.isNaN(serial)) {
          updated = await this.rampDetails2Model.findOneAndUpdate(
            StationScope.filter({ serialNo: serial }, station),
            { ...payload, fhrNo: fhr },
            { new: true },
          );
        }
      }
    }
    if (!updated) {
      throw new NotFoundException('RampDetails2 not found for this fhrNo');
    }
    return updated;
  }

  // DELETE first document matching fhrNo; fallback to serial when fhrNo is "XXX/serial"
  async deleteByFhrNo(fhrNo: string, station: StationScopeContext) {
    const fhr = String(fhrNo ?? '').trim();
    if (!fhr) throw new BadRequestException('Invalid fhrNo');
    let deleted = await this.rampDetails2Model.findOneAndDelete(
      StationScope.filter({ fhrNo: fhr }, station),
    );
    if (!deleted) {
      const slash = fhr.indexOf('/');
      if (slash !== -1) {
        const serial = Number(fhr.slice(slash + 1).trim());
        if (!Number.isNaN(serial)) {
          deleted = await this.rampDetails2Model.findOneAndDelete(
            StationScope.filter({ serialNo: serial }, station),
          );
        }
      }
    }
    if (!deleted) {
      throw new NotFoundException('RampDetails2 not found for this fhrNo');
    }
    return { success: true, message: 'Deleted successfully' };
  }

  // UPDATE single row by ID
  async updateById(
    id: string,
    dto: Partial<CreateRampDetails2Dto>,
    station: StationScopeContext,
  ) {
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.rampDetails2Model.findOneAndUpdate(
      StationScope.filter({ _id: id }, station),
      payload,
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('RampDetails2 row not found');
    }

    const sn = Number(updated.serialNo);
    if (Number.isFinite(sn) && sn > 0) {
      await this.fhrCollectionService.mirrorRampDetails2ToFhrCollection(
        sn,
        'ramp_details_2_form_save',
        station,
      );
    }
    return updated;
  }

  // DELETE single row by ID
  async deleteById(id: string, station: StationScopeContext) {
    const deleted = await this.rampDetails2Model.findOneAndDelete(
      StationScope.filter({ _id: id }, station),
    );

    if (!deleted) {
      throw new NotFoundException('RampDetails2 row not found');
    }

    const sn = Number(deleted.serialNo);
    if (Number.isFinite(sn) && sn > 0) {
      await this.fhrCollectionService.mirrorRampDetails2ToFhrCollection(
        sn,
        'ramp_details_2_delete',
        station,
      );
    }
    return {
      success: true,
      message: 'Deleted successfully',
    };
  }

  // OPTIONAL ADMIN
  async findAll(station: StationScopeContext) {
    return this.rampDetails2Model.find(StationScope.filter({}, station)).exec();
  }
}
