import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceAirlineLogo,
  AdvanceAirlineLogoDocument,
} from '../schema/advance-airline-logo.schema';
import { CreateAdvanceAirlineLogoDto } from '../dto/create-advance-airline-logo.dto';
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
export class AdvanceAirlineLogoService {
  constructor(
    @InjectModel(AdvanceAirlineLogo.name)
    private advanceAirlineLogoModel: Model<AdvanceAirlineLogoDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  async create(
    dto: CreateAdvanceAirlineLogoDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = new this.advanceAirlineLogoModel({
      ...dto,
      stationCode: this.stampStationCode(station),
    });
    return doc.save();
  }

  /** Logo data URL for cancellation emails — exact name match, then partial. */
  async findLogoDataUrlByAirlineName(
    airlineName: string,
  ): Promise<string | null> {
    const name = String(airlineName ?? '').trim();
    if (!name) return null;

    const exact = await this.advanceAirlineLogoModel
      .findOne({
        airlineName: new RegExp(`^${escapeRegex(name)}$`, 'i'),
        logoDataUrl: { $exists: true, $ne: '' },
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const exactUrl = String(exact?.logoDataUrl ?? '').trim();
    if (exactUrl.startsWith('data:image/')) return exactUrl;

    const partial = await this.advanceAirlineLogoModel
      .findOne({
        airlineName: new RegExp(escapeRegex(name), 'i'),
        logoDataUrl: { $exists: true, $ne: '' },
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const partialUrl = String(partial?.logoDataUrl ?? '').trim();
    return partialUrl.startsWith('data:image/') ? partialUrl : null;
  }

  async findAll(
    filter?: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    let query: Record<string, unknown> = {};
    if (filter?.trim()) {
      const regex = new RegExp(escapeRegex(filter.trim()), 'i');
      query = { airlineName: regex };
    }
    return this.advanceAirlineLogoModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceAirlineLogoModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Advance airline logo not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceAirlineLogoDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.advanceAirlineLogoModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Advance airline logo not found');
    }
    const updated = await this.advanceAirlineLogoModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Advance airline logo not found');
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.advanceAirlineLogoModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Advance airline logo not found');
    }
    return { message: 'Deleted successfully' };
  }
}
