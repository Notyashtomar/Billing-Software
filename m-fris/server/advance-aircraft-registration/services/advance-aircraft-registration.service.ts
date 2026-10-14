import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceAircraftRegistration,
  AdvanceAircraftRegistrationDocument,
} from '../schema/advance-aircraft-registration.schema';
import { CreateAdvanceAircraftRegistrationDto } from '../dto/create-advance-aircraft-registration.dto';
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
export class AdvanceAircraftRegistrationService {
  constructor(
    @InjectModel(AdvanceAircraftRegistration.name)
    private advanceAircraftRegistrationModel: Model<AdvanceAircraftRegistrationDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  async create(
    dto: CreateAdvanceAircraftRegistrationDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = new this.advanceAircraftRegistrationModel({
      ...dto,
      stationCode: this.stampStationCode(station),
    });
    return doc.save();
  }

  async createBulk(
    dtos: CreateAdvanceAircraftRegistrationDto[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      return { inserted: 0, docs: [] };
    }
    const stationCode = this.stampStationCode(station);
    const payload = dtos.map((dto) => ({ ...dto, stationCode }));
    const docs =
      await this.advanceAircraftRegistrationModel.insertMany(payload);
    return { inserted: docs.length, docs };
  }

  async findAll(
    filter?: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    let query: Record<string, unknown> = {};
    if (filter?.trim()) {
      const regex = new RegExp(escapeRegex(filter.trim()), 'i');
      query = {
        $or: [
          { airline: regex },
          { regnNo: regex },
          { aircraft: regex },
          { mtow: regex },
        ],
      };
    }
    return this.advanceAircraftRegistrationModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceAircraftRegistrationModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Advance aircraft registration not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceAircraftRegistrationDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.advanceAircraftRegistrationModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Advance aircraft registration not found');
    }
    const updated = await this.advanceAircraftRegistrationModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Advance aircraft registration not found');
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.advanceAircraftRegistrationModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Advance aircraft registration not found');
    }
    return { message: 'Deleted successfully' };
  }
}
