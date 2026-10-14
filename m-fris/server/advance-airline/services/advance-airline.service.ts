import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceAirline,
  AdvanceAirlineDocument,
} from '../schema/advance-airline.schema';
import { CreateAdvanceAirlineDto } from '../dto/create-advance-airline.dto';
import { UpdateAdvanceAirlineDto } from '../dto/update-advance-airline.dto';
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
export class AdvanceAirlineService {
  constructor(
    @InjectModel(AdvanceAirline.name)
    private advanceAirlineModel: Model<AdvanceAirlineDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  private toProperCase(s: string): string {
    return s
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private trimText(value: string | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private profileFromDto(
    dto: Pick<
      CreateAdvanceAirlineDto,
      | 'parentCompanyName'
      | 'address'
      | 'address2'
      | 'address3'
      | 'stateCode'
      | 'gstRegistrationNo'
    >,
    existing?: AdvanceAirlineDocument,
  ) {
    const pick = (key: keyof typeof dto, current: string | undefined) =>
      dto[key] !== undefined ? this.trimText(dto[key]) : (current ?? '');
    return {
      parentCompanyName: pick('parentCompanyName', existing?.parentCompanyName),
      address: pick('address', existing?.address),
      address2: pick('address2', existing?.address2),
      address3: pick('address3', existing?.address3),
      stateCode: pick('stateCode', existing?.stateCode).toUpperCase(),
      gstRegistrationNo: pick('gstRegistrationNo', existing?.gstRegistrationNo).toUpperCase(),
    };
  }

  private normalize(dto: CreateAdvanceAirlineDto) {
    return {
      name: this.toProperCase(dto.name),
      code: dto.code.trim().toUpperCase(),
      ...this.profileFromDto(dto),
    };
  }

  private isValidCode(code: string): boolean {
    return /^[A-Z0-9]{1,5}$/.test(code);
  }

  async create(
    dto: CreateAdvanceAirlineDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const { name, code, ...profile } = this.normalize(dto);
    if (!name || !code) {
      throw new ConflictException('Airline name and code are required');
    }
    if (!this.isValidCode(code)) {
      throw new ConflictException(
        'Airline code must be 1 to 5 characters (A-Z, 0-9).',
      );
    }
    const nameRe = new RegExp(`^${escapeRegex(name)}$`, 'i');
    const nameDup = await this.advanceAirlineModel.findOne(
      StationScope.filter({ name: nameRe }, station),
    );
    if (nameDup) {
      throw new ConflictException(
        'This airline name already exists. Name must be unique.',
      );
    }
    const codeDup = await this.advanceAirlineModel.findOne(
      StationScope.filter({ code }, station),
    );
    if (codeDup) {
      throw new ConflictException(
        'This airline code already exists. Code must be unique.',
      );
    }
    const doc = new this.advanceAirlineModel({
      name,
      code,
      ...profile,
      stationCode: this.stampStationCode(station),
    });
    try {
      return await doc.save();
    } catch (err: unknown) {
      const mongoCode =
        typeof err === 'object' && err !== null ? (err as { code?: number }).code : undefined;
      if (mongoCode === 11000) {
        throw new ConflictException(
          'This airline name or code already exists for this station.',
        );
      }
      throw err;
    }
  }

  async findAll(
    filter?: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    let query: Record<string, unknown> = {};
    if (filter && filter.trim()) {
      const regex = new RegExp(escapeRegex(filter.trim()), 'i');
      query = {
        $or: [
          { name: regex },
          { code: regex },
          { parentCompanyName: regex },
        ],
      };
    }
    return this.advanceAirlineModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceAirlineModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Advance airline not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: UpdateAdvanceAirlineDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.advanceAirlineModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Advance airline not found');
    }
    const nextName =
      dto.name !== undefined ? this.toProperCase(dto.name) : existing.name;
    const nextCode =
      dto.code !== undefined ? dto.code.trim().toUpperCase() : existing.code;
    if (!nextName || !nextCode) {
      throw new ConflictException('Airline name and code are required');
    }
    if (!this.isValidCode(nextCode)) {
      throw new ConflictException(
        'Airline code must be 1 to 5 characters (A-Z, 0-9).',
      );
    }
    const nameRe = new RegExp(`^${escapeRegex(nextName)}$`, 'i');
    const nameDup = await this.advanceAirlineModel.findOne(
      StationScope.filter({ _id: { $ne: id }, name: nameRe }, station),
    );
    if (nameDup) {
      throw new ConflictException(
        'This airline name already exists. Name must be unique.',
      );
    }
    const codeDup = await this.advanceAirlineModel.findOne(
      StationScope.filter({ _id: { $ne: id }, code: nextCode }, station),
    );
    if (codeDup) {
      throw new ConflictException(
        'This airline code already exists. Code must be unique.',
      );
    }
    const profile = this.profileFromDto(dto, existing);
    const updated = await this.advanceAirlineModel
      .findByIdAndUpdate(
        id,
        { name: nextName, code: nextCode, ...profile },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new NotFoundException('Advance airline not found');
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.advanceAirlineModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Advance airline not found');
    }
    return { message: 'Deleted successfully' };
  }
}
