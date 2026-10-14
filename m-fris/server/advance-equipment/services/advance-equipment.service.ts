import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceEquipment,
  AdvanceEquipmentDocument,
} from '../schema/advance-equipment.schema';
import { CreateAdvanceEquipmentDto } from '../dto/create-advance-equipment.dto';
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
export class AdvanceEquipmentService {
  constructor(
    @InjectModel(AdvanceEquipment.name)
    private advanceEquipmentModel: Model<AdvanceEquipmentDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  private sanitizeCategory(raw: unknown): string {
    const s = String(raw ?? '')
      .trim()
      .toUpperCase();
    if (s === 'M' || s === 'NM' || s === 'T') return s;
    return '';
  }

  private normalizeDto(dto: CreateAdvanceEquipmentDto) {
    return {
      equipmentName: String(dto.equipmentName ?? '').trim(),
      equipmentCode: String(dto.equipmentCode ?? '')
        .trim()
        .toUpperCase(),
      category: this.sanitizeCategory(dto.category),
      active: dto.active !== false,
    };
  }

  async create(
    dto: CreateAdvanceEquipmentDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const body = this.normalizeDto(dto);
    const doc = new this.advanceEquipmentModel({
      ...body,
      stationCode: this.stampStationCode(station),
    });
    return doc.save();
  }

  /**
   * Upserts by equipmentCode when code is non-empty; inserts rows with no code.
   * Safe to call repeatedly with the same seed list.
   */
  async createBulk(
    dtos: CreateAdvanceEquipmentDto[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      return {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        insertedWithoutCode: 0,
      };
    }
    const stationCode = this.stampStationCode(station);
    const normalized = dtos.map((d) => ({
      equipmentName: d.equipmentName ?? '',
      equipmentCode: d.equipmentCode ?? '',
      category: this.sanitizeCategory(d.category),
      active: d.active ?? true,
      stationCode,
    }));
    const withCode = normalized.filter((n) => n.equipmentCode.trim());
    const withoutCode = normalized.filter((n) => !n.equipmentCode.trim());

    let matchedCount = 0;
    let modifiedCount = 0;
    let upsertedCount = 0;
    if (withCode.length) {
      const res = await this.advanceEquipmentModel.bulkWrite(
        withCode.map((doc) => ({
          updateOne: {
            filter: {
              equipmentCode: doc.equipmentCode,
              stationCode: doc.stationCode,
            },
            update: { $set: doc },
            upsert: true,
          },
        })),
      );
      matchedCount = res.matchedCount;
      modifiedCount = res.modifiedCount;
      upsertedCount = res.upsertedCount;
    }

    let insertedWithoutCode = 0;
    if (withoutCode.length) {
      const inserted = await this.advanceEquipmentModel.insertMany(withoutCode);
      insertedWithoutCode = inserted.length;
    }

    return {
      matchedCount,
      modifiedCount,
      upsertedCount,
      insertedWithoutCode,
    };
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
          { equipmentName: regex },
          { equipmentCode: regex },
          { category: regex },
        ],
      };
    }
    return this.advanceEquipmentModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceEquipmentModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Advance equipment not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceEquipmentDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.advanceEquipmentModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Advance equipment not found');
    }
    const merged: CreateAdvanceEquipmentDto = {
      equipmentName: dto.equipmentName ?? existing.equipmentName,
      equipmentCode: dto.equipmentCode ?? existing.equipmentCode,
      category: dto.category ?? existing.category,
      active: dto.active ?? existing.active,
    };
    const updated = await this.advanceEquipmentModel
      .findByIdAndUpdate(id, this.normalizeDto(merged), { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Advance equipment not found');
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.advanceEquipmentModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Advance equipment not found');
    }
    return { message: 'Deleted successfully' };
  }

  async removeAll(station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE) {
    const res = await this.advanceEquipmentModel
      .deleteMany(StationScope.filter({}, station))
      .exec();
    return {
      message: 'All equipment removed',
      deletedCount: res.deletedCount ?? 0,
    };
  }
}
