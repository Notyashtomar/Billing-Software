import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceNonScheduledAirline,
  AdvanceNonScheduledAirlineDocument,
} from '../schema/advance-non-scheduled-airline.schema';
import { CreateAdvanceNonScheduledAirlineDto } from '../dto/create-advance-non-scheduled-airline.dto';
import { escapeRegex } from '../../common/escape-regex.util';
import {
  normalizeAirlineCode,
  normalizeAirlineName,
} from '../utils/airline-code.util';
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
export class AdvanceNonScheduledAirlineService {
  constructor(
    @InjectModel(AdvanceNonScheduledAirline.name)
    private advanceNonScheduledAirlineModel: Model<AdvanceNonScheduledAirlineDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  private normalizeDto(
    dto: CreateAdvanceNonScheduledAirlineDto,
  ): { airline: string; airlineCode: string } {
    return {
      airline: normalizeAirlineName(dto.airline),
      airlineCode: normalizeAirlineCode(dto.airlineCode),
    };
  }

  async create(
    dto: CreateAdvanceNonScheduledAirlineDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const normalized = this.normalizeDto(dto);
    const doc = new this.advanceNonScheduledAirlineModel({
      ...normalized,
      stationCode: this.stampStationCode(station),
    });
    return doc.save();
  }

  /**
   * Upserts by station + airline name. Safe to re-run with the same seed list.
   */
  async createBulk(
    dtos: CreateAdvanceNonScheduledAirlineDto[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }

    const stationCode = this.stampStationCode(station);
    const normalized = dtos
      .map((dto) => ({
        ...this.normalizeDto(dto),
        stationCode,
      }))
      .filter((row) => row.airline.length > 0);

    if (!normalized.length) {
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }

    const res = await this.advanceNonScheduledAirlineModel.bulkWrite(
      normalized.map((doc) => ({
        updateOne: {
          filter: { stationCode: doc.stationCode, airline: doc.airline },
          update: { $set: doc },
          upsert: true,
        },
      })),
    );

    return {
      matchedCount: res.matchedCount,
      modifiedCount: res.modifiedCount,
      upsertedCount: res.upsertedCount,
    };
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
    return this.advanceNonScheduledAirlineModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceNonScheduledAirlineModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Advance non-scheduled airline not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceNonScheduledAirlineDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.advanceNonScheduledAirlineModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Advance non-scheduled airline not found');
    }
    const patch: Partial<{ airline: string; airlineCode: string }> = {};
    if (dto.airline !== undefined) {
      patch.airline = normalizeAirlineName(dto.airline);
    }
    if (dto.airlineCode !== undefined) {
      patch.airlineCode = normalizeAirlineCode(dto.airlineCode);
    }
    const updated = await this.advanceNonScheduledAirlineModel
      .findByIdAndUpdate(id, patch, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Advance non-scheduled airline not found');
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.advanceNonScheduledAirlineModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Advance non-scheduled airline not found');
    }
    return { message: 'Deleted successfully' };
  }
}
