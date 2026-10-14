import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RawFlightDataService } from '../../raw-flight-data/services/raw-flight-data.service';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from '../../common/station/station.constants';
import { randomUUID } from 'crypto';
import {
  AdvanceCargo,
  AdvanceCargoDocument,
  AdvanceCargoFlightRow,
  AdvanceCargoSection,
  AdvanceCargoSections,
  ADVANCE_CARGO_SERVICES_ENTRY_KEY,
  ADVANCE_CARGO_UNIT_MASTER_ENTRY_KEY,
  AdvanceCargoServiceItem,
  AdvanceCargoUnitMasterItem,
} from '../schema/advance-cargo.schema';
import { UpsertAdvanceCargoSectionDto } from '../dto/upsert-advance-cargo-section.dto';
import { SaveAdvanceCargoFlightDto } from '../dto/save-advance-cargo-flight.dto';
import { AppendAdvanceCargoServiceDto } from '../dto/append-advance-cargo-service.dto';
import { AppendAdvanceCargoUnitMasterDto } from '../dto/append-advance-cargo-unit-master.dto';

@Injectable()
export class AdvanceCargoService {
  private static readonly GLOBAL_SERIAL_BASE = 100000;

  constructor(
    @InjectModel(AdvanceCargo.name)
    private readonly advanceCargoModel: Model<AdvanceCargoDocument>,
    private readonly rawFlightDataService: RawFlightDataService,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  private normalizeEntryKey(key: string): string {
    const k = String(key ?? '')
      .trim()
      .toUpperCase();
    if (!k) {
      throw new BadRequestException('entryKey (airline code) is required');
    }
    if (k === ADVANCE_CARGO_SERVICES_ENTRY_KEY) {
      throw new BadRequestException(
        'Reserved entry key. Use POST /advance-cargo/services for the services catalog.',
      );
    }
    if (k === ADVANCE_CARGO_UNIT_MASTER_ENTRY_KEY) {
      throw new BadRequestException(
        'Reserved entry key. Use POST /advance-cargo/unit-master for the unit master catalog.',
      );
    }
    return k;
  }

  private async ensureDoc(
    entryKey: string,
    station: StationScopeContext,
  ): Promise<AdvanceCargoDocument> {
    const key = this.normalizeEntryKey(entryKey);
    let doc = await this.advanceCargoModel
      .findOne(StationScope.filter({ entryKey: key }, station))
      .exec();
    if (!doc) {
      doc = await this.advanceCargoModel.create({
        entryKey: key,
        sections: {},
        flights: [],
        stationCode: this.stampStationCode(station),
      });
    }
    return doc;
  }

  async findAll(station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE) {
    return this.advanceCargoModel
      .find(StationScope.filter({}, station))
      .sort({ updatedAt: -1 })
      .lean();
  }

  async findByEntryKey(
    entryKey: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const key = this.normalizeEntryKey(entryKey);
    const doc = await this.advanceCargoModel
      .findOne(StationScope.filter({ entryKey: key }, station))
      .lean();
    if (!doc) {
      throw new NotFoundException(`No advance-cargo entry for code ${key}`);
    }
    return doc;
  }

  async removeByEntryKey(
    entryKey: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const key = this.normalizeEntryKey(entryKey);
    const result = await this.advanceCargoModel
      .deleteOne(StationScope.filter({ entryKey: key }, station))
      .exec();
    if ((result.deletedCount ?? 0) === 0) {
      throw new NotFoundException(`No advance-cargo entry for code ${key}`);
    }
    return { success: true, entryKey: key };
  }

  async upsertSection(
    dto: UpsertAdvanceCargoSectionDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const key = this.normalizeEntryKey(dto.entryKey);
    const section = dto.section as AdvanceCargoSection;
    if (section === 'cargoAirline') {
      const address = String(dto.data?.address ?? '').trim();
      if (address.length > 250) {
        throw new BadRequestException('Address must be at most 250 characters.');
      }
    }
    const doc = await this.ensureDoc(key, station);
    const sections: AdvanceCargoSections = {
      ...(doc.sections ?? {}),
    };

    sections[section] = { ...dto.data, savedAt: new Date().toISOString() };

    doc.sections = sections;
    await doc.save();
    const lean = doc.toObject();
    return {
      success: true,
      entryKey: key,
      sections: lean.sections,
      flights: lean.flights ?? [],
    };
  }

  private async ensureServicesDoc(
    station: StationScopeContext,
  ): Promise<AdvanceCargoDocument> {
    let doc = await this.advanceCargoModel
      .findOne(
        StationScope.filter(
          { entryKey: ADVANCE_CARGO_SERVICES_ENTRY_KEY },
          station,
        ),
      )
      .exec();
    if (!doc) {
      doc = await this.advanceCargoModel.create({
        entryKey: ADVANCE_CARGO_SERVICES_ENTRY_KEY,
        sections: {},
        flights: [],
        services: [],
        unitMaster: [],
        stationCode: this.stampStationCode(station),
      });
    }
    return doc;
  }

  async listServices(
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{ services: AdvanceCargoServiceItem[] }> {
    const doc = await this.advanceCargoModel
      .findOne(
        StationScope.filter(
          { entryKey: ADVANCE_CARGO_SERVICES_ENTRY_KEY },
          station,
        ),
      )
      .lean();
    return { services: doc?.services ?? [] };
  }

  async appendService(
    dto: AppendAdvanceCargoServiceDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const name = String(dto.serviceName ?? '').trim().replace(/\s+/g, ' ');
    if (!name) {
      throw new BadRequestException('Service name is required');
    }
    if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) {
      throw new BadRequestException(
        'Service name may only contain letters and spaces.',
      );
    }
    const doc = await this.ensureServicesDoc(station);
    const item: AdvanceCargoServiceItem = {
      id: randomUUID(),
      serviceName: name,
      serviceCode: String(dto.serviceCode ?? '')
        .trim()
        .toUpperCase(),
      unitType: String(dto.unitType ?? '').trim(),
      quantityNecessary: String(dto.quantityNecessary ?? 'yes').trim() || 'yes',
      savedAt: new Date().toISOString(),
    };
    doc.services = [...(doc.services ?? []), item];
    await doc.save();
    return { success: true, services: doc.services };
  }

  private async ensureUnitMasterDoc(
    station: StationScopeContext,
  ): Promise<AdvanceCargoDocument> {
    let doc = await this.advanceCargoModel
      .findOne(
        StationScope.filter(
          { entryKey: ADVANCE_CARGO_UNIT_MASTER_ENTRY_KEY },
          station,
        ),
      )
      .exec();
    if (!doc) {
      doc = await this.advanceCargoModel.create({
        entryKey: ADVANCE_CARGO_UNIT_MASTER_ENTRY_KEY,
        sections: {},
        flights: [],
        services: [],
        unitMaster: [],
        stationCode: this.stampStationCode(station),
      });
    }
    return doc;
  }

  async listUnitMaster(
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{
    unitMaster: AdvanceCargoUnitMasterItem[];
  }> {
    const doc = await this.advanceCargoModel
      .findOne(
        StationScope.filter(
          { entryKey: ADVANCE_CARGO_UNIT_MASTER_ENTRY_KEY },
          station,
        ),
      )
      .lean();
    return { unitMaster: doc?.unitMaster ?? [] };
  }

  async appendUnitMaster(
    dto: AppendAdvanceCargoUnitMasterDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const name = String(dto.unitName ?? '').trim().replace(/\s+/g, ' ');
    if (!name) {
      throw new BadRequestException('Unit name is required');
    }
    if (!/[A-Za-z]/.test(name)) {
      throw new BadRequestException(
        'Unit name must include letters. Numbers or symbols alone are not allowed.',
      );
    }
    const doc = await this.ensureUnitMasterDoc(station);
    const item: AdvanceCargoUnitMasterItem = {
      id: randomUUID(),
      unitName: name,
      unitCode: String(dto.unitCode ?? '')
        .trim()
        .toUpperCase(),
      unitFormat: String(dto.unitFormat ?? '').trim(),
      savedAt: new Date().toISOString(),
    };
    doc.unitMaster = [...(doc.unitMaster ?? []), item];
    await doc.save();
    return { success: true, unitMaster: doc.unitMaster };
  }

  /** Same calendar day: STA must be earlier than STD unless Next Day is on. */
  private assertStaBeforeStd(dto: SaveAdvanceCargoFlightDto) {
    const payload = dto.flightPayload ?? {};
    const data = dto.data ?? {};
    const sta = String(payload.staTime ?? data.sta ?? data.staTime ?? '').trim();
    const std = String(payload.stdTime ?? data.std ?? data.stdTime ?? '').trim();
    const nextRaw = String(payload.nextDay ?? data.nextDay ?? '')
      .trim()
      .toLowerCase();
    const nextDay = nextRaw === 'yes' || nextRaw === 'true' || nextRaw === '1';
    if (nextDay) return;

    const staDate = String(data.staDate ?? payload.staDate ?? '').trim();
    const stdDate = String(data.stdDate ?? payload.stdDate ?? '').trim();
    if (staDate && stdDate && stdDate > staDate) return;

    const toMinutes = (value: string): number | null => {
      const match = /^(\d{1,2}):([0-5]\d)/.exec(value);
      if (!match) return null;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours > 23) return null;
      return hours * 60 + minutes;
    };
    const staMinutes = toMinutes(sta);
    const stdMinutes = toMinutes(std);
    if (staMinutes == null || stdMinutes == null) return;
    if (staMinutes >= stdMinutes) {
      throw new BadRequestException(
        'STA time must be earlier than STD time unless Next Day is on.',
      );
    }
  }

  async saveFlight(
    dto: SaveAdvanceCargoFlightDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const key = this.normalizeEntryKey(dto.entryKey);
    const flightNo = String(
      dto.flightPayload.flightNo ?? dto.flightPayload['Flight No'] ?? '',
    ).trim();
    if (!flightNo) {
      throw new BadRequestException('Flight number is required');
    }
    if (dto.section === 'cargoScheduled') {
      const route = String(dto.data?.route ?? dto.flightPayload.route ?? '')
        .trim()
        .replace(/\s+/g, '');
      if (route && !/^[A-Za-z]+(?:-[A-Za-z]+)*$/.test(route)) {
        throw new BadRequestException(
          'Route may only contain letters and hyphens.',
        );
      }
    }
    this.assertStaBeforeStd(dto);

    let serial = String(dto.serialNo ?? '').trim();
    if (serial) {
      const dup = await this.advanceCargoModel
        .findOne(
          StationScope.filter(
            {
              entryKey: key,
              flights: { $elemMatch: { serialNo: serial } },
            },
            station,
          ),
        )
        .lean();
      if (!dup) {
        throw new NotFoundException(
          `Flight serial ${serial} not found on cargo entry ${key}`,
        );
      }
    } else {
      serial = await this.getNextCargoFlightSerial();
      // Global serial pool (Strategy A): uniqueness check stays cross-station.
      const globalDup = await this.advanceCargoModel
        .findOne({ 'flights.serialNo': serial })
        .lean();
      if (globalDup) {
        throw new ConflictException(
          `Generated serial ${serial} already exists; retry save`,
        );
      }
    }

    const doc = await this.ensureDoc(key, station);
    const sections: AdvanceCargoSections = { ...(doc.sections ?? {}) };
    sections[dto.section] = {
      ...dto.data,
      savedAt: new Date().toISOString(),
    };
    doc.sections = sections;

    const flights: AdvanceCargoFlightRow[] = [...(doc.flights ?? [])];
    const idx = flights.findIndex((f) => f.serialNo === serial);
    const row: AdvanceCargoFlightRow = {
      serialNo: serial,
      ...(idx >= 0 ? flights[idx] : {}),
      [dto.section]: { ...dto.data, savedAt: new Date().toISOString() },
    };
    if (idx >= 0) {
      flights[idx] = row;
    } else {
      flights.push(row);
    }
    doc.flights = flights;
    await doc.save();

    const pipeline = await this.rawFlightDataService.persistAdvanceCargoFlight(
      serial,
      { ...dto.flightPayload, serialNo: serial },
      station,
    );

    return {
      success: true,
      entryKey: key,
      serialNo: serial,
      fhrStaDatesCount: pipeline.fhrStaDatesCount ?? 0,
      sections: doc.sections,
      flights: doc.flights,
    };
  }

  private async getNextCargoFlightSerial(): Promise<string> {
    let max = AdvanceCargoService.GLOBAL_SERIAL_BASE;
    const docs = await this.advanceCargoModel.find({}, { flights: 1 }).lean();
    for (const doc of docs) {
      for (const f of doc.flights ?? []) {
        const sid = String(f?.serialNo ?? '').trim();
        if (!/^\d{6}$/.test(sid)) continue;
        const n = Number(sid);
        if (!Number.isNaN(n) && n > max) max = n;
      }
    }
    const next = max + 1;
    if (next > 999999) {
      throw new BadRequestException(
        'Cargo flight serial limit reached (999999).',
      );
    }
    return String(next).padStart(6, '0');
  }
}
