import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceAmsService,
  AdvanceAmsServiceDocument,
} from '../schema/advance-ams-services.schema';
import { CreateAdvanceAmsServiceDto } from '../dto/create-advance-ams-services.dto';
import { escapeRegex } from '../../common/escape-regex.util';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  scopeForGatewayRead,
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from '../../common/station/station.constants';

@Injectable()
export class AdvanceAmsServicesService {
  constructor(
    @InjectModel(AdvanceAmsService.name)
    private advanceAmsServicesModel: Model<AdvanceAmsServiceDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  async create(
    dto: CreateAdvanceAmsServiceDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = new this.advanceAmsServicesModel({
      ...dto,
      stationCode: this.stampStationCode(station),
    });
    return doc.save();
  }

  async findAll(
    filter?: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    let query: Record<string, unknown> = {};
    if (filter?.trim()) {
      const regex = new RegExp(escapeRegex(filter.trim()), 'i');
      query = { serviceName: regex };
    }
    return this.advanceAmsServicesModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceAmsServicesModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Advance AMS service not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceAmsServiceDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.advanceAmsServicesModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Advance AMS service not found');
    }
    const updated = await this.advanceAmsServicesModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Advance AMS service not found');
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.advanceAmsServicesModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Advance AMS service not found');
    }
    return { message: 'Deleted successfully' };
  }
}
