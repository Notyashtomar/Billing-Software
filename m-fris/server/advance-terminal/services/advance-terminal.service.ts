import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceTerminal,
  AdvanceTerminalDocument,
} from '../schema/advance-terminal.schema';
import { CreateAdvanceTerminalDto } from '../dto/create-advance-terminal.dto';
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
export class AdvanceTerminalService {
  constructor(
    @InjectModel(AdvanceTerminal.name)
    private advanceTerminalModel: Model<AdvanceTerminalDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  async create(
    dto: CreateAdvanceTerminalDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = new this.advanceTerminalModel({
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
        $or: [{ name: regex }, { terminalCode: regex }, { location: regex }],
      };
    }
    return this.advanceTerminalModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceTerminalModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Advance terminal not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceTerminalDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.advanceTerminalModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Advance terminal not found');
    }
    const updated = await this.advanceTerminalModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Advance terminal not found');
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.advanceTerminalModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Advance terminal not found');
    }
    return { message: 'Deleted successfully' };
  }
}
