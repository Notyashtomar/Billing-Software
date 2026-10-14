import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceOtherService,
  AdvanceOtherServiceDocument,
} from '../schema/advance-other-services.schema';
import { CreateAdvanceOtherServiceDto } from '../dto/create-advance-other-services.dto';
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
export class AdvanceOtherServicesService {
  constructor(
    @InjectModel(AdvanceOtherService.name)
    private advanceOtherServicesModel: Model<AdvanceOtherServiceDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  async create(
    dto: CreateAdvanceOtherServiceDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = new this.advanceOtherServicesModel({
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
      query = {
        $or: [{ service: regex }, { code: regex }, { unit: regex }],
      };
    }
    return this.advanceOtherServicesModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceOtherServicesModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Advance other service not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceOtherServiceDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.advanceOtherServicesModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Advance other service not found');
    }
    const updated = await this.advanceOtherServicesModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Advance other service not found');
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.advanceOtherServicesModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Advance other service not found');
    }
    return { message: 'Deleted successfully' };
  }
}
