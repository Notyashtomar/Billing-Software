import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceManpower,
  AdvanceManpowerDocument,
} from '../schema/advance-manpower.schema';
import { CreateAdvanceManpowerDto } from '../dto/create-advance-manpower.dto';
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
export class AdvanceManpowerService {
  constructor(
    @InjectModel(AdvanceManpower.name)
    private advanceManpowerModel: Model<AdvanceManpowerDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  private normalizeName(raw: string | undefined): string {
    return String(raw ?? '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private async assertUniqueName(
    name: string,
    station: StationScopeContext,
    excludeId?: string,
  ): Promise<void> {
    if (!name) return;
    const pattern = name.split(/\s+/).map(escapeRegex).join('\\s+');
    const existing = await this.advanceManpowerModel
      .findOne(
        StationScope.filter(
          { manpower: new RegExp(`^${pattern}$`, 'i') },
          scopeForGatewayRead(station),
        ),
      )
      .select('_id')
      .exec();
    if (!existing) return;
    if (excludeId && String(existing._id) === excludeId) return;
    throw new ConflictException(
      'This manpower name already exists. Enter a different name.',
    );
  }

  async create(
    dto: CreateAdvanceManpowerDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const manpower = this.normalizeName(dto.manpower);
    await this.assertUniqueName(manpower, station);
    const doc = new this.advanceManpowerModel({
      ...dto,
      manpower,
      stationCode: this.stampStationCode(station),
    });
    return doc.save();
  }

  /**
   * Upserts by `code` when non-empty; inserts rows with no code.
   * Safe to call repeatedly with the same seed list.
   */
  async createBulk(
    dtos: CreateAdvanceManpowerDto[],
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
      manpower: d.manpower ?? '',
      code: d.code ?? '',
      active: d.active ?? true,
      stationCode,
    }));
    const withCode = normalized.filter((n) => n.code.trim());
    const withoutCode = normalized.filter((n) => !n.code.trim());

    let matchedCount = 0;
    let modifiedCount = 0;
    let upsertedCount = 0;
    if (withCode.length) {
      const res = await this.advanceManpowerModel.bulkWrite(
        withCode.map((doc) => ({
          updateOne: {
            filter: { code: doc.code, stationCode: doc.stationCode },
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
      const inserted = await this.advanceManpowerModel.insertMany(withoutCode);
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
      query = { $or: [{ manpower: regex }, { code: regex }] };
    }
    return this.advanceManpowerModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceManpowerModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Advance manpower not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceManpowerDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.advanceManpowerModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Advance manpower not found');
    }
    const patch: Partial<CreateAdvanceManpowerDto> = { ...dto };
    if (dto.manpower !== undefined) {
      patch.manpower = this.normalizeName(dto.manpower);
      await this.assertUniqueName(patch.manpower, station, id);
    }
    const updated = await this.advanceManpowerModel
      .findByIdAndUpdate(id, patch, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Advance manpower not found');
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.advanceManpowerModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Advance manpower not found');
    }
    return { message: 'Deleted successfully' };
  }
}
