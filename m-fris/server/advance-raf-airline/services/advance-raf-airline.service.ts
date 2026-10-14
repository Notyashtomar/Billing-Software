import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceRafAirline,
  AdvanceRafAirlineDocument,
} from '../schema/advance-raf-airline.schema';
import { CreateAdvanceRafAirlineDto } from '../dto/create-advance-raf-airline.dto';
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
export class AdvanceRafAirlineService {
  constructor(
    @InjectModel(AdvanceRafAirline.name)
    private advanceRafAirlineModel: Model<AdvanceRafAirlineDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  async ensureAirline(
    airline: string,
    airlineCode: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const name = String(airline ?? '').trim();
    const code = String(airlineCode ?? '')
      .trim()
      .toUpperCase();
    if (!name && !code) return null;

    const stationCode = this.stampStationCode(station);
    const or: Record<string, unknown>[] = [];
    if (code) or.push({ airlineCode: new RegExp(`^${escapeRegex(code)}$`, 'i') });
    if (name) or.push({ airline: new RegExp(`^${escapeRegex(name)}$`, 'i') });

    const existing = await this.advanceRafAirlineModel
      .findOne(
        StationScope.filter(
          {
            $or: or,
          },
          station,
        ),
      )
      .exec();
    if (existing) return existing;

    return this.create(
      {
        airline: name || code,
        airlineCode: code || name.slice(0, 10).toUpperCase(),
        deepCleaning: false,
        nightHaltCleaning: false,
        exteriorCleaning: false,
      },
      { stationCode, crossStation: false },
    );
  }

  async create(
    dto: CreateAdvanceRafAirlineDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = new this.advanceRafAirlineModel({
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
    if (filter && filter.trim()) {
      const regex = new RegExp(escapeRegex(filter.trim()), 'i');
      query = {
        $or: [{ airline: regex }, { airlineCode: regex }],
      };
    }
    return this.advanceRafAirlineModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceRafAirlineModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Advance RAF airline not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceRafAirlineDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.advanceRafAirlineModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Advance RAF airline not found');
    }
    const updated = await this.advanceRafAirlineModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Advance RAF airline not found');
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.advanceRafAirlineModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Advance RAF airline not found');
    }
    return { message: 'Deleted successfully' };
  }
}
