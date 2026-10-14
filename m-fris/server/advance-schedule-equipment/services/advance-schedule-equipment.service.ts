import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceScheduleEquipment,
  AdvanceScheduleEquipmentDocument,
} from '../schema/advance-schedule-equipment.schema';
import { CreateAdvanceScheduleEquipmentDto } from '../dto/create-advance-schedule-equipment.dto';
import { UpdateAdvanceScheduleEquipmentDto } from '../dto/update-advance-schedule-equipment.dto';
import { escapeRegex } from '../../common/escape-regex.util';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from '../../common/station/station.constants';

function buildRemarks(
  option1Basis: string,
  option1Sign: string,
  option2Basis: string,
  option2Sign: string,
): string {
  return `${option1Basis}${option1Sign}${option2Basis}${option2Sign}`;
}

@Injectable()
export class AdvanceScheduleEquipmentService {
  private readonly logger = new Logger(AdvanceScheduleEquipmentService.name);

  constructor(
    @InjectModel(AdvanceScheduleEquipment.name)
    private readonly model: Model<AdvanceScheduleEquipmentDocument>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    const code = normalizeStationCode(station?.stationCode);
    return code || LEGACY_STATION_CODE;
  }

  private normalize(dto: Partial<CreateAdvanceScheduleEquipmentDto>) {
    const out: Partial<CreateAdvanceScheduleEquipmentDto> = {};
    if (dto.airlineName !== undefined) {
      out.airlineName = String(dto.airlineName).trim();
    }
    if (dto.airlineCode !== undefined) {
      out.airlineCode = String(dto.airlineCode).trim().toUpperCase();
    }
    if (dto.aircraftBody !== undefined) {
      out.aircraftBody = String(dto.aircraftBody).trim().toUpperCase();
    }
    if (dto.splitOperation !== undefined) {
      out.splitOperation = dto.splitOperation === true;
    }
    if (dto.equipmentName !== undefined) {
      out.equipmentName = String(dto.equipmentName).trim();
    }
    if (dto.equipmentCode !== undefined) {
      out.equipmentCode = String(dto.equipmentCode).trim().toUpperCase();
    }
    if (dto.timeRequired !== undefined) {
      out.timeRequired = dto.timeRequired === true;
    }
    if (dto.option1Basis !== undefined) {
      out.option1Basis = String(dto.option1Basis).trim().toUpperCase();
    }
    if (dto.option1Sign !== undefined) {
      const sign = String(dto.option1Sign).trim();
      out.option1Sign = sign === 'Plus' || sign === 'Minus' ? sign : 'Minus';
    }
    if (dto.option1Minutes !== undefined) {
      out.option1Minutes = Math.max(0, Number(dto.option1Minutes) || 0);
    }
    if (dto.option2Basis !== undefined) {
      out.option2Basis = String(dto.option2Basis).trim().toUpperCase();
    }
    if (dto.option2Sign !== undefined) {
      const sign = String(dto.option2Sign).trim();
      out.option2Sign = sign === 'Plus' || sign === 'Minus' ? sign : 'Plus';
    }
    if (dto.option2Minutes !== undefined) {
      out.option2Minutes = Math.max(0, Number(dto.option2Minutes) || 0);
    }
    if (dto.remarks !== undefined) {
      out.remarks = String(dto.remarks).trim();
    }
    if (dto.active !== undefined) {
      out.active = dto.active === true;
    }
    return out;
  }

  private toPayload(
    dto: CreateAdvanceScheduleEquipmentDto,
    station: StationScopeContext,
  ) {
    const body = this.normalize(dto) as CreateAdvanceScheduleEquipmentDto;
    const option1Basis = body.option1Basis ?? 'ATA';
    const option1Sign = body.option1Sign ?? 'Minus';
    const option2Basis = body.option2Basis ?? 'ATD';
    const option2Sign = body.option2Sign ?? 'Plus';
    const remarks =
      body.remarks?.trim() ||
      buildRemarks(option1Basis, option1Sign, option2Basis, option2Sign);

    return {
      airlineName: body.airlineName,
      airlineCode: body.airlineCode,
      aircraftBody: body.aircraftBody,
      splitOperation: body.splitOperation === true,
      equipmentName: body.equipmentName,
      equipmentCode: body.equipmentCode,
      timeRequired: body.timeRequired === true,
      option1Basis,
      option1Sign,
      option1Minutes: body.option1Minutes ?? 0,
      option2Basis,
      option2Sign,
      option2Minutes: body.option2Minutes ?? 0,
      remarks,
      active: body.active !== false,
      stationCode: this.stampStationCode(station),
    };
  }

  async create(
    dto: CreateAdvanceScheduleEquipmentDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const payload = this.toPayload(dto, station);
    this.logger.debug(`Create payload: ${JSON.stringify(payload)}`);
    
    if (
      !payload.airlineName ||
      !payload.airlineCode ||
      !payload.equipmentName ||
      !payload.equipmentCode
    ) {
      this.logger.error(
        `Missing required fields. Payload: ${JSON.stringify(payload)}`,
      );
      throw new ConflictException(
        'Airline, equipment name, and equipment code are required',
      );
    }

    // Ensure station context has a valid stationCode for duplicate check
    const effectiveStation: StationScopeContext = {
      crossStation: station?.crossStation ?? false,
      stationCode: station?.stationCode || LEGACY_STATION_CODE,
    };

    const dupQuery = StationScope.filter(
      {
        airlineCode: payload.airlineCode,
        aircraftBody: payload.aircraftBody,
        equipmentCode: payload.equipmentCode,
        splitOperation: payload.splitOperation,
      },
      effectiveStation,
    );
    this.logger.debug(`Duplicate check query: ${JSON.stringify(dupQuery)}`);
    
    const dup = await this.model.findOne(dupQuery).exec();
    if (dup) {
      this.logger.warn(
        `Duplicate found for query. Station: ${effectiveStation?.stationCode}, Payload: ${JSON.stringify(payload)}, Found: ${JSON.stringify(dup)}`,
      );
      throw new ConflictException(
        'This airline, aircraft body, equipment, and split combination already exists',
      );
    }

    const doc = new this.model(payload);
    return doc.save();
  }

  /**
   * Active schedule-equipment rules for a flight context (airline + body + split).
   * Used by scheduled airlines equipment/manpower (no Advance tab permission required).
   */
  async findMatchingForFlight(
    args: {
      airlineCode?: string;
      airlineName?: string;
      aircraftBody?: string;
      splitOperation?: boolean;
    },
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const body = String(args.aircraftBody ?? 'NB')
      .trim()
      .toUpperCase();
    const aircraftBody = body === 'WB' ? 'WB' : 'NB';
    const splitOperation = args.splitOperation === true;
    const code = String(args.airlineCode ?? '')
      .trim()
      .toUpperCase();
    const validCode = code && code !== '-' ? code : '';
    const name = String(args.airlineName ?? '').trim();

    const base: Record<string, unknown> = {
      aircraftBody,
      splitOperation,
      active: true,
    };

    const airlineClause: Record<string, unknown>[] = [];
    if (validCode) {
      airlineClause.push({ airlineCode: validCode });
    }
    if (name) {
      airlineClause.push({
        airlineName: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      });
    }
    if (airlineClause.length === 0) {
      return [];
    }

    const query =
      airlineClause.length === 1
        ? { ...base, ...airlineClause[0] }
        : { ...base, $or: airlineClause };

    const runQuery = (bodyFilter: Record<string, unknown>) =>
      this.model
        .find(StationScope.filter(bodyFilter, station))
        .sort({ createdAt: -1 })
        .lean()
        .exec();

    let rows = await runQuery(query);

    // Split flag on main details may not match the schedule-equipment rule yet.
    if (rows.length === 0) {
      const { splitOperation: _split, ...relaxedBase } = base as Record<
        string,
        unknown
      >;
      const relaxedQuery =
        airlineClause.length === 1
          ? { ...relaxedBase, ...airlineClause[0] }
          : { ...relaxedBase, $or: airlineClause };
      rows = await runQuery(relaxedQuery);
    }

    // Aircraft body may be unset until main details is saved (defaults to NB in UI).
    if (rows.length === 0) {
      const altBody = aircraftBody === 'WB' ? 'NB' : 'WB';
      const altBase: Record<string, unknown> = { ...base, aircraftBody: altBody };
      const altQuery =
        airlineClause.length === 1
          ? { ...altBase, ...airlineClause[0] }
          : { ...altBase, $or: airlineClause };
      rows = await runQuery(altQuery);
      if (rows.length === 0) {
        const { splitOperation: _split, ...altRelaxedBase } = altBase;
        const altRelaxedQuery =
          airlineClause.length === 1
            ? { ...altRelaxedBase, ...airlineClause[0] }
            : { ...altRelaxedBase, $or: airlineClause };
        rows = await runQuery(altRelaxedQuery);
      }
    }

    // Same GSE can appear twice (e.g. split true+false after relaxed match).
    // Scheduled Airlines equipment form needs one row per equipment code/name.
    const seen = new Set<string>();
    const deduped: typeof rows = [];
    for (const row of rows) {
      const code = String(row.equipmentCode ?? '')
        .trim()
        .toUpperCase();
      const name = String(row.equipmentName ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      if (!code && !name) continue;
      if ((code && seen.has(`c:${code}`)) || (name && seen.has(`n:${name}`))) {
        continue;
      }
      if (code) seen.add(`c:${code}`);
      if (name) seen.add(`n:${name}`);
      deduped.push(row);
    }
    return deduped;
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
          { airlineName: regex },
          { airlineCode: regex },
          { equipmentName: regex },
          { equipmentCode: regex },
          { remarks: regex },
        ],
      };
    }
    return this.model
      .find(StationScope.filter(query, station))
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
      throw new NotFoundException('Schedule equipment record not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: UpdateAdvanceScheduleEquipmentDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.model
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Schedule equipment record not found');
    }

    const merged = {
      airlineName: existing.airlineName,
      airlineCode: existing.airlineCode,
      aircraftBody: existing.aircraftBody,
      splitOperation: existing.splitOperation,
      equipmentName: existing.equipmentName,
      equipmentCode: existing.equipmentCode,
      timeRequired: existing.timeRequired,
      option1Basis: existing.option1Basis,
      option1Sign: existing.option1Sign,
      option1Minutes: existing.option1Minutes,
      option2Basis: existing.option2Basis,
      option2Sign: existing.option2Sign,
      option2Minutes: existing.option2Minutes,
      remarks: existing.remarks,
      active: existing.active,
      ...this.normalize(dto),
    } as CreateAdvanceScheduleEquipmentDto;

    const payload = this.toPayload(merged, station);

    const dup = await this.model
      .findOne(
        StationScope.filter(
          {
            _id: { $ne: id },
            airlineCode: payload.airlineCode,
            aircraftBody: payload.aircraftBody,
            equipmentCode: payload.equipmentCode,
            splitOperation: payload.splitOperation,
          },
          station,
        ),
      )
      .exec();
    if (dup) {
      throw new ConflictException(
        'This airline, aircraft body, equipment, and split combination already exists',
      );
    }

    const updated = await this.model
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Schedule equipment record not found');
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
      throw new NotFoundException('Schedule equipment record not found');
    }
    return { message: 'Deleted successfully' };
  }
}
