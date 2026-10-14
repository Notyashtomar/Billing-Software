import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceGatewayScheduledAirline,
  AdvanceGatewayScheduledAirlineDocument,
} from '../schema/advance-gateway-scheduled-airline.schema';
import { CreateAdvanceGatewayScheduledAirlineDto } from '../dto/create-advance-gateway-scheduled-airline.dto';
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
export class AdvanceGatewayScheduledAirlineService {
  constructor(
    @InjectModel(AdvanceGatewayScheduledAirline.name)
    private readonly model: Model<AdvanceGatewayScheduledAirlineDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  async create(
    dto: CreateAdvanceGatewayScheduledAirlineDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = new this.model({
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
        $or: [{ airlines: regex }, { code: regex }],
      };
    }
    return this.model
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.model
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Gateway scheduled airline not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceGatewayScheduledAirlineDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.model
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Gateway scheduled airline not found');
    }
    const updated = await this.model
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Gateway scheduled airline not found');
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.model
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Gateway scheduled airline not found');
    }
    return { message: 'Deleted successfully' };
  }

  /** Resolve airline email from Advance → Gateway scheduled airline master. */
  async findActiveEmailByAirlineCodeOrName(
    airlineCode: string,
    airlineName: string,
  ): Promise<string | null> {
    const code = String(airlineCode ?? '').trim();
    const name = String(airlineName ?? '').trim();
    const activeFilter = { type: { $nin: ['Inactive', 'inactive'] } };

    if (code) {
      const byCode = await this.model
        .findOne({
          ...activeFilter,
          code: new RegExp(`^${escapeRegex(code)}$`, 'i'),
        })
        .lean()
        .exec();
      const email = String(byCode?.emailId ?? '')
        .trim()
        .toLowerCase();
      if (email) return email;
    }

    if (name) {
      const byName = await this.model
        .findOne({
          ...activeFilter,
          airlines: new RegExp(`^${escapeRegex(name)}$`, 'i'),
        })
        .lean()
        .exec();
      const email = String(byName?.emailId ?? '')
        .trim()
        .toLowerCase();
      if (email) return email;
    }

    return null;
  }
}
