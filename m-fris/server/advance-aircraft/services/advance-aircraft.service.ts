import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceAircraft,
  AdvanceAircraftDocument,
} from '../schema/advance-aircraft.schema';
import { CreateAdvanceAircraftDto } from '../dto/create-advance-aircraft.dto';
import { UpdateAdvanceAircraftDto } from '../dto/update-advance-aircraft.dto';
import { BulkCreateAdvanceAircraftItemDto } from '../dto/bulk-create-advance-aircraft.dto';
import { escapeRegex } from '../../common/escape-regex.util';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  type StationScopeContext,
} from '../../common/station/station-scope';
import {
  GLOBAL_AIRCRAFT_STATION_CODE,
  LEGACY_STATION_CODE,
} from '../../common/station/station.constants';
import type { RawFlightDataService } from '../../raw-flight-data/services/raw-flight-data.service';
import { lazyService } from '../../common/nestjs/lazy-service.util';

/** Aircraft master is a single global catalog — not station-scoped. */
const GLOBAL_AIRCRAFT_SCOPE = CROSS_STATION_SYSTEM_SCOPE;

@Injectable()
export class AdvanceAircraftService {
  constructor(
    @InjectModel(AdvanceAircraft.name)
    private advanceAircraftModel: Model<AdvanceAircraftDocument>,
    @Inject(
      forwardRef(
        lazyService(
          () =>
            require('../../raw-flight-data/services/raw-flight-data.service')
              .RawFlightDataService as typeof import('../../raw-flight-data/services/raw-flight-data.service').RawFlightDataService,
        ),
      ),
    )
    private readonly rawFlightDataService: RawFlightDataService,
  ) {}

  /**
   * UPPERCASE; spaces become hyphen; only A–Z, 0–9, hyphen, and slash allowed.
   * Hyphen or slash separates segments (e.g. B737-800, A320/B737).
   */
  private normalizeAircraftType(raw: string): string {
    return raw
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '-')
      .replace(/[^A-Z0-9/-]/g, '')
      .replace(/-+/g, '-')
      .replace(/\/+/g, '/')
      .replace(/[-/]{2,}/g, '-')
      .replace(/^[-/]+|[-/]+$/g, '');
  }

  private isValidAircraftType(normalized: string): boolean {
    if (normalized.length < 2) return false;
    return /^[A-Z0-9]+(?:[/-][A-Z0-9]+)*$/.test(normalized);
  }

  private aircraftRegex(normalized: string): RegExp {
    return new RegExp(`^${escapeRegex(normalized)}$`, 'i');
  }

  private docPriority(doc: {
    stationCode?: string;
    updatedAt?: Date;
  }): number {
    const code = String(doc.stationCode ?? '').toUpperCase();
    if (code === GLOBAL_AIRCRAFT_STATION_CODE) return 0;
    if (code === LEGACY_STATION_CODE) return 1;
    return 2;
  }

  /** One row per aircraft type when legacy per-station copies still exist. */
  private dedupeByAircraft<T extends { aircraft?: string; stationCode?: string; updatedAt?: Date }>(
    docs: T[],
  ): T[] {
    const byType = new Map<string, T>();
    for (const doc of docs) {
      const key = this.normalizeAircraftType(String(doc.aircraft ?? ''));
      if (!this.isValidAircraftType(key)) continue;
      const existing = byType.get(key);
      if (!existing) {
        byType.set(key, doc);
        continue;
      }
      const existingPri = this.docPriority(existing);
      const docPri = this.docPriority(doc);
      const pick =
        docPri < existingPri
          ? doc
          : docPri > existingPri
            ? existing
            : doc.updatedAt &&
                existing.updatedAt &&
                doc.updatedAt > existing.updatedAt
              ? doc
              : existing;
      byType.set(key, pick);
    }
    return [...byType.values()].sort((a, b) =>
      String(a.aircraft ?? '').localeCompare(String(b.aircraft ?? '')),
    );
  }

  private buildCreatePayload(
    dto: CreateAdvanceAircraftDto & {
      universalRow?: Record<string, string>;
    },
    aircraft: string,
  ): Record<string, unknown> {
    return {
      ...dto,
      aircraft,
      aircraftBody: dto.aircraftBody ?? 'NB',
      category: dto.category ?? 'A',
      manufacturer: dto.manufacturer ?? '',
      icaoCode: dto.icaoCode ?? '',
      wingspan:
        dto.wingspan != null && Number.isFinite(dto.wingspan)
          ? Math.round(dto.wingspan)
          : null,
      passengerCapacity:
        dto.passengerCapacity != null && Number.isFinite(dto.passengerCapacity)
          ? Math.round(dto.passengerCapacity)
          : null,
      active: dto.active ?? true,
      universalRow: dto.universalRow,
      stationCode: GLOBAL_AIRCRAFT_STATION_CODE,
    };
  }

  private normalizeBulkItem(
    dto: BulkCreateAdvanceAircraftItemDto,
  ): (CreateAdvanceAircraftDto & { universalRow?: Record<string, string> }) | null {
    const aircraft = this.normalizeAircraftType(dto.aircraft ?? '');
    if (!aircraft || !this.isValidAircraftType(aircraft)) {
      return null;
    }

    const categoryRaw = String(dto.category ?? '').trim().toUpperCase();
    const category = ['A', 'B', 'C', 'D', 'E'].includes(categoryRaw)
      ? categoryRaw
      : 'A';

    const bodyRaw = String(dto.aircraftBody ?? '').trim().toUpperCase();
    let aircraftBody = 'NB';
    if (bodyRaw === 'WB') aircraftBody = 'WB';
    else if (bodyRaw === 'NB') aircraftBody = 'NB';

    return {
      aircraft,
      aircraftBody,
      mtow: String(dto.mtow ?? '').trim(),
      description: String(dto.description ?? '').trim(),
      manufacturer: String(dto.manufacturer ?? '').trim(),
      icaoCode: String(dto.icaoCode ?? '').trim().toUpperCase(),
      wingspan:
        dto.wingspan != null && Number.isFinite(dto.wingspan)
          ? Math.round(dto.wingspan)
          : undefined,
      passengerCapacity:
        dto.passengerCapacity != null && Number.isFinite(dto.passengerCapacity)
          ? Math.round(dto.passengerCapacity)
          : undefined,
      category,
      active: dto.active ?? true,
      universalRow: dto.universalRow,
    };
  }

  async createBulk(
    dtos: BulkCreateAdvanceAircraftItemDto[],
    _station: StationScopeContext = GLOBAL_AIRCRAFT_SCOPE,
  ) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      return { inserted: 0, updated: 0, skipped: 0, failed: [] as Array<{ index: number; reason: string }> };
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const failed: Array<{ index: number; reason: string }> = [];

    for (let index = 0; index < dtos.length; index++) {
      const normalized = this.normalizeBulkItem(dtos[index]);
      if (!normalized) {
        skipped += 1;
        continue;
      }

      const aircraft = normalized.aircraft;
      try {
        const existing = await this.advanceAircraftModel
          .findOne({ aircraft: this.aircraftRegex(aircraft) })
          .exec();

        const payload = this.buildCreatePayload(normalized, aircraft);

        if (existing) {
          const mergedUniversal = {
            ...(existing.universalRow ?? {}),
            ...(normalized.universalRow ?? {}),
          };
          await this.advanceAircraftModel
            .updateMany(
              { aircraft: this.aircraftRegex(aircraft) },
              {
                $set: {
                  ...payload,
                  universalRow: Object.keys(mergedUniversal).length
                    ? mergedUniversal
                    : undefined,
                },
              },
            )
            .exec();
          const kept = await this.advanceAircraftModel
            .findOne({ aircraft: this.aircraftRegex(aircraft) })
            .exec();
          if (kept) {
            await this.advanceAircraftModel
              .deleteMany({
                _id: { $ne: kept._id },
                aircraft: this.aircraftRegex(aircraft),
              })
              .exec();
          }
          updated += 1;
        } else {
          const doc = new this.advanceAircraftModel(payload);
          const saved = await doc.save();
          await this.advanceAircraftModel
            .deleteMany({
              _id: { $ne: saved._id },
              aircraft: this.aircraftRegex(aircraft),
            })
            .exec();
          inserted += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Import failed';
        failed.push({ index, reason: message });
      }
    }

    return { inserted, updated, skipped, failed };
  }

  async create(
    dto: CreateAdvanceAircraftDto,
    _station: StationScopeContext = GLOBAL_AIRCRAFT_SCOPE,
  ) {
    const aircraft = this.normalizeAircraftType(dto.aircraft ?? '');
    if (!aircraft) {
      throw new BadRequestException('Aircraft type is required');
    }
    if (!this.isValidAircraftType(aircraft)) {
      throw new BadRequestException(
        'Aircraft must be UPPERCASE letters and numbers, with optional hyphen (-) or slash (/) between parts (e.g. A320, B737-800, A320/B737).',
      );
    }

    const existing = await this.advanceAircraftModel
      .findOne({ aircraft: this.aircraftRegex(aircraft) })
      .exec();
    if (existing) {
      throw new ConflictException('This aircraft type already exists');
    }

    const doc = new this.advanceAircraftModel(
      this.buildCreatePayload(dto, aircraft),
    );
    try {
      const saved = await doc.save();
      await this.advanceAircraftModel
        .deleteMany({
          _id: { $ne: saved._id },
          aircraft: this.aircraftRegex(aircraft),
        })
        .exec();
      return saved;
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null ? (err as { code?: number }).code : undefined;
      if (code === 11000) {
        throw new ConflictException('This aircraft type already exists');
      }
      throw err;
    }
  }

  /**
   * FHR / reports: resolve MTOW from advance-aircraft by matching aircraft type
   * (same normalization as create: uppercase, spaces→hyphen, optional /). Case-insensitive DB match.
   */
  async resolveMtowByAircraftType(
    rawType: string,
    _station: StationScopeContext = GLOBAL_AIRCRAFT_SCOPE,
  ): Promise<string> {
    const tryOne = async (fragment: string): Promise<string> => {
      const normalized = this.normalizeAircraftType(fragment ?? '');
      if (normalized.length < 2) return '';
      const doc = await this.advanceAircraftModel
        .findOne({ aircraft: this.aircraftRegex(normalized) })
        .select('mtow')
        .lean()
        .exec();
      const v = doc?.mtow;
      return v != null && String(v).trim() !== '' ? String(v).trim() : '';
    };

    const primary = await tryOne(rawType);
    if (primary) return primary;
    const parts = String(rawType ?? '')
      .split(/[/|,]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of parts) {
      const m = await tryOne(p);
      if (m) return m;
    }
    return '';
  }

  /**
   * FHR / reports: read aircraft type from `advance_schedule_setup`, then MTOW
   * from the global `advance-aircraft` catalog (Advance → Aircraft page).
   */
  async resolveMtowForFlightSerial(
    serialNo: string,
    station: StationScopeContext = GLOBAL_AIRCRAFT_SCOPE,
  ): Promise<string> {
    const aircraftType =
      await this.rawFlightDataService.getAdvanceScheduleSetupAircraft(
        serialNo,
        station,
      );
    if (!aircraftType) return '';
    return this.resolveMtowByAircraftType(aircraftType);
  }

  /**
   * Active catalog rows as NB/WB map for batch FHR classification (keys =
   * normalized `aircraft` strings matching persisted catalog entries).
   */
  async getActiveAircraftBodyMap(): Promise<Map<string, 'NB' | 'WB'>> {
    const docs = await this.advanceAircraftModel
      .find({ active: { $ne: false } })
      .select('aircraft aircraftBody')
      .lean()
      .exec();
    const map = new Map<string, 'NB' | 'WB'>();
    for (const d of this.dedupeByAircraft(docs)) {
      const k = this.normalizeAircraftType(String(d.aircraft ?? ''));
      if (!this.isValidAircraftType(k)) continue;
      const body = String(d.aircraftBody ?? '').trim().toUpperCase();
      map.set(
        k,
        body === 'WB' || body.includes('WIDE') ? 'WB' : 'NB',
      );
    }
    return map;
  }

  /**
   * Resolve NB/WB from a preloaded catalog (`getActiveAircraftBodyMap`).
   * Tries full normalized TypeCraft, then slash-/comma-separated fragments (parity with MTOW resolve).
   */
  matchCatalogAircraftBody(
    catalog: Map<string, 'NB' | 'WB'>,
    rawTypeCraft: string,
  ): 'NB' | 'WB' | null {
    const primary = this.normalizeAircraftType(rawTypeCraft ?? '');
    if (primary.length >= 2 && this.isValidAircraftType(primary)) {
      const hit = catalog.get(primary);
      if (hit) return hit;
    }
    const parts = String(rawTypeCraft ?? '')
      .split(/[/|,]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of parts) {
      const k = this.normalizeAircraftType(p);
      if (!this.isValidAircraftType(k)) continue;
      const hit = catalog.get(k);
      if (hit) return hit;
    }
    return null;
  }

  async findAll(
    search?: string,
    _station: StationScopeContext = GLOBAL_AIRCRAFT_SCOPE,
  ) {
    let filter: Record<string, unknown> = {};
    if (search && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
      filter = {
        $or: [
          { aircraft: regex },
          { aircraftBody: regex },
          { mtow: regex },
          { description: regex },
          { manufacturer: regex },
          { icaoCode: regex },
          { category: regex },
        ],
      };
    }
    const docs = await this.advanceAircraftModel
      .find(filter)
      .sort({ aircraft: 1 })
      .exec();
    return this.dedupeByAircraft(docs);
  }

  async findOne(
    id: string,
    _station: StationScopeContext = GLOBAL_AIRCRAFT_SCOPE,
  ) {
    const doc = await this.advanceAircraftModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Advance aircraft not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: UpdateAdvanceAircraftDto,
    _station: StationScopeContext = GLOBAL_AIRCRAFT_SCOPE,
  ) {
    const existing = await this.advanceAircraftModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Advance aircraft not found');
    }
    const patch: Record<string, unknown> = {};

    const originalAircraft = this.normalizeAircraftType(String(existing.aircraft ?? ''));

    if (dto.aircraft !== undefined) {
      const next = this.normalizeAircraftType(dto.aircraft);
      if (!next) {
        throw new BadRequestException('Aircraft type is required');
      }
      if (!this.isValidAircraftType(next)) {
        throw new BadRequestException(
          'Aircraft must be UPPERCASE letters and numbers, with optional hyphen (-) or slash (/) between parts (e.g. A320, B737-800, A320/B737).',
        );
      }
      const dup = await this.advanceAircraftModel
        .findOne({
          _id: { $ne: id },
          aircraft: this.aircraftRegex(next),
        })
        .exec();
      if (dup) {
        throw new ConflictException('This aircraft type already exists');
      }
      patch.aircraft = next;
    }

    if (dto.aircraftBody !== undefined) {
      patch.aircraftBody = dto.aircraftBody || 'NB';
    }
    if (dto.mtow !== undefined) {
      patch.mtow = dto.mtow.trim();
    }
    if (dto.description !== undefined) {
      patch.description = dto.description.trim();
    }
    if (dto.manufacturer !== undefined) {
      patch.manufacturer = dto.manufacturer.trim();
    }
    if (dto.icaoCode !== undefined) {
      patch.icaoCode = dto.icaoCode.trim();
    }
    if (dto.wingspan !== undefined) {
      patch.wingspan =
        dto.wingspan != null && Number.isFinite(dto.wingspan)
          ? Math.round(dto.wingspan)
          : null;
    }
    if (dto.passengerCapacity !== undefined) {
      patch.passengerCapacity =
        dto.passengerCapacity != null && Number.isFinite(dto.passengerCapacity)
          ? Math.round(dto.passengerCapacity)
          : null;
    }
    if (dto.category !== undefined) {
      patch.category = dto.category;
    }
    if (dto.active !== undefined) {
      patch.active = dto.active;
    }

    if (Object.keys(patch).length === 0) {
      return this.findOne(id);
    }

    patch.stationCode = GLOBAL_AIRCRAFT_STATION_CODE;

    await this.advanceAircraftModel
      .updateMany(
        { aircraft: this.aircraftRegex(originalAircraft) },
        { $set: patch },
      )
      .exec();

    const updated = await this.advanceAircraftModel.findById(id).exec();
    if (!updated) {
      throw new NotFoundException('Advance aircraft not found');
    }

    const finalAircraft = this.normalizeAircraftType(
      String(patch.aircraft ?? updated.aircraft ?? ''),
    );
    await this.advanceAircraftModel
      .deleteMany({
        _id: { $ne: updated._id },
        aircraft: this.aircraftRegex(finalAircraft),
      })
      .exec();

    return updated;
  }

  async remove(
    id: string,
    _station: StationScopeContext = GLOBAL_AIRCRAFT_SCOPE,
  ) {
    const existing = await this.advanceAircraftModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Advance aircraft not found');
    }
    const normalized = this.normalizeAircraftType(String(existing.aircraft ?? ''));
    if (!normalized) {
      await this.advanceAircraftModel.findByIdAndDelete(id).exec();
      return { message: 'Deleted successfully' };
    }
    await this.advanceAircraftModel
      .deleteMany({ aircraft: this.aircraftRegex(normalized) })
      .exec();
    return { message: 'Deleted successfully' };
  }
}
