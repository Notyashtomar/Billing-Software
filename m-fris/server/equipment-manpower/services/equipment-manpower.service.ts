import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EquipmentManpowerCatalogItem } from '../schema/equipment-manpower-catalog-item.schema';
import {
  EQUIPMENT_MANPOWER_CATALOG_SERIAL,
  EquipmentManpower,
  EquipmentManpowerDocument,
} from '../schema/equipment-manpower.schema';
import { AdminPatchEquipmentManpowerDto } from '../dto/admin-patch-equipment-manpower.dto';
import { CreateEquipmentManpowerDto } from '../dto/create-equipment-manpower.dto';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import { AdvanceScheduleEquipmentService } from 'src/advance-schedule-equipment/services/advance-schedule-equipment.service';
import { AdvanceEquipmentService } from 'src/advance-equipment/services/advance-equipment.service';
import {
  scheduleEquipmentWindowFromRule,
  type ScheduleEquipmentMilestones,
} from 'src/advance-schedule-equipment/utils/schedule-equipment-time.util';
import {
  FhrCollection,
  FhrCollectionDocument,
} from 'src/fhr-collection/schema/fhr-collection.schema';
import {
  enumerateDdMmYyyyBetweenInclusive,
  fhrStaDatesRangeFilter,
} from 'src/fhr-collection/utils/sta-dates.util';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  StationScope,
  type StationScopeContext,
} from 'src/common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from 'src/common/station/station.constants';
import {
  equipmentManpowerEntryToFhrDetail,
  scheduleTemplateToFhrDetail,
} from '../utils/equipment-manpower-to-fhr-details.util';

export type EquipmentManpowerCatalogItemDto = Pick<
  EquipmentManpowerCatalogItem,
  'abbr' | 'description' | 'unit_type' | 'category'
>;

function sanitizeCatalogCategory(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (s === 'M') return 'M';
  if (s === 'NM') return 'NM';
  if (s === 'T') return 'T';
  return '';
}

/** Uppercase trimmed key for matching FHR `equipment_name` to catalog `abbr` / `description`. */
function normalizeCatalogKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Equipment utilization time-slot mode: 6-hour bands (4 slabs) or 4-hour bands (6 slabs). */
export type EquipmentUtilSlotMode = '4h' | '6h';

/** Slot meta for `'6h'` — 4 bands of 6 hours, anchored at 22:00 to align with the night shift start. */
const EQUIPMENT_UTIL_SLOT_META_6H: ReadonlyArray<{
  label: string;
  startHour: number;
}> = [
  { label: '22:00 - 04:00', startHour: 22 },
  { label: '04:00 - 10:00', startHour: 4 },
  { label: '10:00 - 16:00', startHour: 10 },
  { label: '16:00 - 22:00', startHour: 16 },
];

/** Slot meta for `'4h'` — 6 bands of 4 hours, also anchored at 22:00. */
const EQUIPMENT_UTIL_SLOT_META_4H: ReadonlyArray<{
  label: string;
  startHour: number;
}> = [
  { label: '22:00 - 02:00', startHour: 22 },
  { label: '02:00 - 06:00', startHour: 2 },
  { label: '06:00 - 10:00', startHour: 6 },
  { label: '10:00 - 14:00', startHour: 10 },
  { label: '14:00 - 18:00', startHour: 14 },
  { label: '18:00 - 22:00', startHour: 18 },
];

function equipmentUtilSlotMetaFor(mode: EquipmentUtilSlotMode) {
  return mode === '4h'
    ? EQUIPMENT_UTIL_SLOT_META_4H
    : EQUIPMENT_UTIL_SLOT_META_6H;
}

/** Canonical slab labels for dashboard equipment utilization (4 or 6 slots). */
export function equipmentUtilExpectedSlotLabels(
  mode: EquipmentUtilSlotMode,
): readonly string[] {
  return equipmentUtilSlotMetaFor(mode).map((m) => m.label);
}

@Injectable()
export class EquipmentManpowerService implements OnModuleInit {
  private readonly logger = new Logger(EquipmentManpowerService.name);

  constructor(
    @InjectModel(EquipmentManpower.name)
    private equipmentManpowerModel: Model<EquipmentManpowerDocument>,
    @InjectModel(FhrCollection.name)
    private readonly fhrCollectionModel: Model<FhrCollectionDocument>,
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly advanceScheduleEquipmentService: AdvanceScheduleEquipmentService,
    private readonly advanceEquipmentService: AdvanceEquipmentService,
  ) {}

  onModuleInit(): void {
    this.fhrCollectionService.registerFhrMutateCallback(async (ctx) => {
      const serial = ctx?.serialNo;
      if (serial == null || !Number.isFinite(serial)) return;
      const slice = String(ctx?.slice ?? '');
      const publishSlices = new Set([
        'mainDetails',
        'terminalDetails',
        'loadControlDetails',
        'rampDetails1',
        'rampDetails3',
        'equipmentManpower',
      ]);
      if (!publishSlices.has(slice)) return;
      await this.publishEquipmentDetailsIfClosed(
        serial,
        CROSS_STATION_SYSTEM_SCOPE,
      );
    });
  }

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  private isFhrScheduledFlightClosed(
    fhr: Record<string, unknown> | null,
  ): boolean {
    if (!fhr) return false;
    const hasEmbed = (key: string) => {
      const v = fhr[key];
      return (
        v != null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        Object.keys(v as object).length > 0
      );
    };
    return (
      hasEmbed('mainDetails') &&
      hasEmbed('terminalDetails') &&
      hasEmbed('loadControlDetails') &&
      hasEmbed('rampDetails1')
    );
  }

  private milestonesFromFhrMain(
    fhr: Record<string, unknown>,
  ): ScheduleEquipmentMilestones & { defaultDate: string } {
    const md =
      fhr.mainDetails && typeof fhr.mainDetails === 'object'
        ? (fhr.mainDetails as Record<string, unknown>)
        : {};
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = String(md[k] ?? '').trim();
        if (v) return v;
      }
      return '';
    };
    const ataDate = pick('ataDate', 'ATADate');
    const ataTime = pick('ataTime', 'ATATime');
    const atdDate = pick('atdDate', 'ATDDate');
    const atdTime = pick('atdTime', 'ATDTime');
    const staDate = pick('staDate', 'STADate');
    const stdDate = pick('stdDate', 'STDDate');
    const defaultDate = stdDate || staDate || ataDate || atdDate || '';
    return {
      ataDate: ataDate || staDate,
      ataTime,
      atdDate: atdDate || stdDate,
      atdTime,
      defaultDate,
    };
  }

  private airlineLookupFromFhr(
    fhr: Record<string, unknown>,
  ): { airlineCode?: string; airlineName?: string; aircraftBody?: string; splitOperation?: boolean } {
    const md =
      fhr.mainDetails && typeof fhr.mainDetails === 'object'
        ? (fhr.mainDetails as Record<string, unknown>)
        : {};
    const airlineCode = String(
      md.airlineCode ?? md.Arline_Code ?? '',
    ).trim();
    const airlineName = String(md.airlineName ?? md.Airline ?? '').trim();
    const aircraftBody = String(md.aircraftBody ?? 'NB').trim();
    return {
      airlineCode: airlineCode && airlineCode !== '-' ? airlineCode : undefined,
      airlineName: airlineName || undefined,
      aircraftBody,
      splitOperation: md.ifOperationSplit === true,
    };
  }

  private async buildEquipmentDetailsLines(
    fhr: Record<string, unknown>,
    station: StationScopeContext,
  ): Promise<Record<string, unknown>[]> {
    const lines: Record<string, unknown>[] = [];
    const embed = fhr.equipmentManpower;
    const entries =
      embed &&
      typeof embed === 'object' &&
      Array.isArray((embed as { entries?: unknown }).entries)
        ? ((embed as { entries: unknown[] }).entries ?? [])
        : [];

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const line = equipmentManpowerEntryToFhrDetail(
        entry as Record<string, unknown>,
      );
      if (line) lines.push(line);
    }

    if (lines.length > 0) {
      return lines;
    }

    const { defaultDate, ...milestones } = this.milestonesFromFhrMain(fhr);
    const lookup = this.airlineLookupFromFhr(fhr);
    const templates = await this.getScheduledAirlineEquipmentTemplates(
      {
        ...lookup,
        milestones,
        defaultDate,
      },
      station,
    );
    for (const template of templates) {
      const line = scheduleTemplateToFhrDetail(template);
      if (line) lines.push(line);
    }
    return lines;
  }

  /** Publish `equipmentDetails` on FHR when the flight is closed (GSE report source). */
  async publishEquipmentDetailsIfClosed(
    serial: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<void> {
    try {
      const fhr = await this.fhrCollectionService.getLeanFhrBySerial(
        serial,
        station,
      );
      if (!this.isFhrScheduledFlightClosed(fhr)) return;

      const lines = await this.buildEquipmentDetailsLines(fhr ?? {}, station);
      if (lines.length === 0) return;

      await this.fhrCollectionService.upsertMerge(
        serial,
        { equipmentDetails: lines },
        'equipment_details_closed_flight',
        station,
      );
    } catch (err) {
      this.logger.warn(
        `equipmentDetails publish skipped for serial ${serial}: ${err}`,
      );
    }
  }

  private async afterEquipmentManpowerPersisted(
    serial: number,
    station: StationScopeContext,
  ): Promise<void> {
    await this.publishEquipmentDetailsIfClosed(serial, station);
  }

  /**
   * Replace the shared equipment/manpower master list (Excel seed).
   * Does not mirror into `fhr_collection` (reserved non-flight serial).
   * The catalog is per-station (one catalog doc per station).
   */
  async replaceMasterCatalog(
    items: EquipmentManpowerCatalogItem[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{
    serialNo: number;
    itemCount: number;
  }> {
    await this.equipmentManpowerModel.findOneAndUpdate(
      StationScope.filter(
        { serialNo: EQUIPMENT_MANPOWER_CATALOG_SERIAL },
        station,
      ),
      {
        $set: {
          serialNo: EQUIPMENT_MANPOWER_CATALOG_SERIAL,
          isEquipmentManpowerCatalog: true,
          catalogItems: items,
          entries: [],
          listType: 'MasterCatalog',
          airlinesOperator: '',
          flightNo: '',
          routing: '',
          operations: '',
          acType: '',
          sta: '',
          staDate: '',
          std: '',
          stdDate: '',
          atdDate: '',
          verifiedBy: '',
          verifiedByCode: '',
          verifiedAt: '',
        },
        $setOnInsert: { stationCode: this.stampStationCode(station) },
      },
      { upsert: true, new: true },
    );
    return {
      serialNo: EQUIPMENT_MANPOWER_CATALOG_SERIAL,
      itemCount: items.length,
    };
  }

  /** Master list rows (`abbr` ↔ FHR `equipment_name`, display `description` in GSE reports). */
  async getMasterCatalog(
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<EquipmentManpowerCatalogItemDto[]> {
    const doc = await this.equipmentManpowerModel
      .findOne(
        StationScope.filter(
          {
            serialNo: EQUIPMENT_MANPOWER_CATALOG_SERIAL,
            isEquipmentManpowerCatalog: true,
          },
          station,
        ),
      )
      .select({ catalogItems: 1 })
      .lean()
      .exec();
    const raw = doc?.catalogItems;
    if (!Array.isArray(raw) || raw.length === 0) {
      const equipmentRows = await this.advanceEquipmentService.findAll(
        undefined,
        station,
      );
      return equipmentRows
        .filter((row) => row.active !== false)
        .map((row) => ({
          abbr: String(row.equipmentCode ?? '').trim(),
          description: String(row.equipmentName ?? '').trim(),
          unit_type: '',
          category: sanitizeCatalogCategory(row.category),
        }))
        .filter((row) => row.abbr || row.description);
    }
    return raw.map((row) => ({
      abbr: String((row as { abbr?: unknown }).abbr ?? '').trim(),
      description: String(
        (row as { description?: unknown }).description ?? '',
      ).trim(),
      unit_type: String(
        (row as { unit_type?: unknown }).unit_type ?? '',
      ).trim(),
      category: sanitizeCatalogCategory(
        (row as { category?: unknown }).category,
      ),
    }));
  }

  /**
   * Flat list of every `equipment_name` string across all FHR docs' `equipmentDetails`.
   * Dashboard reads this + the master catalog to classify each line into M / NM / T client-side.
   */
  async getAllEquipmentLineNames(): Promise<string[]> {
    const docs = await this.fhrCollectionModel
      .find(
        { 'equipmentDetails.0': { $exists: true } },
        { 'equipmentDetails.equipment_name': 1, _id: 0 },
      )
      .lean()
      .exec();
    const names: string[] = [];
    for (const doc of docs) {
      const lines = Array.isArray(doc.equipmentDetails)
        ? doc.equipmentDetails
        : [];
      for (const line of lines) {
        const raw = (line as { equipment_name?: unknown })?.equipment_name;
        names.push(String(raw ?? ''));
      }
    }
    return names;
  }

  // CREATE (One per flight)
  async create(
    serial: number,
    dto: CreateEquipmentManpowerDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    // Serial uniqueness is global (Strategy A), so the existence check stays
    // cross-station; only the new row's ownership is stamped to the station.
    const existing = await this.equipmentManpowerModel.findOne({
      serialNo: serial,
    });

    if (existing) {
      throw new Error('EquipmentManpower already exists for this flight');
    }

    const doc = new this.equipmentManpowerModel({
      ...dto,
      serialNo: serial,
      stationCode: this.stampStationCode(station),
    });

    const saved = await doc.save();
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'equipmentManpower',
      saved,
      'equipment_manpower_form_save',
    );
    await this.afterEquipmentManpowerPersisted(serial, station);
    return saved;
  }

  // GET
  async findBySerial(
    serial: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.equipmentManpowerModel
      .findOne(StationScope.filter({ serialNo: serial }, station))
      .exec();
    if (doc) return doc;
    const fhr = await this.fhrCollectionService.getLeanFhrBySerial(serial);
    const embed = fhr?.equipmentManpower;
    if (embed && typeof embed === 'object' && !Array.isArray(embed)) {
      return embed as EquipmentManpowerDocument;
    }
    return null;
  }

  /**
   * Advance → Schedule Equipment templates for scheduled airlines equipment/manpower UI.
   * Times are computed from ATA/ATD (with STA/STD fallbacks) and option 1 / option 2 offsets.
   */
  async getScheduledAirlineEquipmentTemplates(
    args: {
      airlineCode?: string;
      airlineName?: string;
      aircraftBody?: string;
      splitOperation?: boolean;
      milestones: ScheduleEquipmentMilestones;
      defaultDate: string;
    },
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const rules = await this.advanceScheduleEquipmentService.findMatchingForFlight(
      {
        airlineCode: args.airlineCode,
        airlineName: args.airlineName,
        aircraftBody: args.aircraftBody,
        splitOperation: args.splitOperation,
      },
      station,
    );

    return rules.map((rule) => {
      const window = scheduleEquipmentWindowFromRule(
        rule as {
          timeRequired?: boolean;
          option1Basis?: string;
          option1Sign?: string;
          option1Minutes?: number;
          option2Basis?: string;
          option2Sign?: string;
          option2Minutes?: number;
        },
        args.milestones,
        args.defaultDate,
      );
      return {
        equipmentName: String(rule.equipmentName ?? '').trim(),
        equipmentCode: String(rule.equipmentCode ?? '').trim(),
        timeRequired: rule.timeRequired === true,
        option1Basis: rule.option1Basis,
        option1Sign: rule.option1Sign,
        option1Minutes: rule.option1Minutes,
        option2Basis: rule.option2Basis,
        option2Sign: rule.option2Sign,
        option2Minutes: rule.option2Minutes,
        remarks: String(rule.remarks ?? '').trim(),
        splitOperation: rule.splitOperation === true,
        fromDate: window.fromDate,
        fromTime: window.fromTime,
        toDate: window.toDate,
        toTime: window.toTime,
      };
    });
  }

  // UPDATE
  async updateBySerial(
    serial: number,
    dto: Partial<CreateEquipmentManpowerDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const updated = await this.equipmentManpowerModel.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      dto,
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('EquipmentManpower not found');
    }

    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'equipmentManpower',
      updated,
      'equipment_manpower_form_save',
    );
    await this.afterEquipmentManpowerPersisted(serial, station);
    return updated;
  }

  /** Upsert by flight serial (create or update). Used by non-scheduled save flow. */
  async upsertBySerial(
    serial: number,
    dto: CreateEquipmentManpowerDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const updated = await this.equipmentManpowerModel.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      {
        $set: { ...dto, serialNo: serial },
        $setOnInsert: { stationCode: this.stampStationCode(station) },
      },
      { new: true, upsert: true },
    );
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'equipmentManpower',
      updated,
      'equipment_manpower_form_save',
    );
    await this.afterEquipmentManpowerPersisted(serial, station);
    return updated;
  }

  // DELETE
  async deleteBySerial(
    serial: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.equipmentManpowerModel.findOneAndDelete(
      StationScope.filter({ serialNo: serial }, station),
    );

    if (!deleted) {
      throw new NotFoundException('EquipmentManpower not found');
    }

    return {
      success: true,
      message: 'Deleted successfully',
    };
  }

  // ADMIN
  async findAll(station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE) {
    return this.equipmentManpowerModel
      .find(StationScope.filter({}, station))
      .exec();
  }

  /** Lean list for Advance Gateway (JSON-safe `_id`). */
  async findAllLeanAdmin(
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Record<string, unknown>[]> {
    const docs = await this.equipmentManpowerModel
      .find(StationScope.filter({}, station))
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => ({
      ...d,
      _id: String(d._id),
    })) as Record<string, unknown>[];
  }

  /**
   * Patch any document by `_id`. Mirrors into `fhr_collection` only for non-catalog flight rows.
   */
  async adminPatchById(
    mongoId: string,
    dto: AdminPatchEquipmentManpowerDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<EquipmentManpowerDocument> {
    if (!Types.ObjectId.isValid(mongoId)) {
      throw new BadRequestException('Invalid document id');
    }
    const patch = dto as Record<string, unknown>;
    const $set: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
      const v = patch[key];
      if (v !== undefined) $set[key] = v;
    }
    if (Object.keys($set).length === 0) {
      const existing = await this.equipmentManpowerModel
        .findOne(StationScope.filter({ _id: mongoId }, station))
        .exec();
      if (!existing) throw new NotFoundException('EquipmentManpower not found');
      return existing;
    }
    const updated = await this.equipmentManpowerModel
      .findOneAndUpdate(
        StationScope.filter({ _id: mongoId }, station),
        { $set },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new NotFoundException('EquipmentManpower not found');
    }
    const isCat = updated.isEquipmentManpowerCatalog === true;
    const serial = updated.serialNo;
    if (!isCat && Number.isFinite(serial)) {
      try {
        await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
          serial,
          'equipmentManpower',
          updated,
          'equipment_manpower_admin_patch',
        );
        await this.afterEquipmentManpowerPersisted(serial, station);
      } catch {
        /* mirror is best-effort */
      }
    }
    return updated;
  }

  /**
   * Dashboard equipment utilization: flights in STA date range (`staDates` / legacy STADate),
   * each `equipmentDetails` line bucketed by **from_time** only; categories from master catalog.
   * Per-slot equipment lists (`motorisedEquipment` / `nonMotorisedEquipment` / `towableEquipment`)
   * give per-`equipment_name` line counts within that slab for each category.
   */
  async aggregateDashboardEquipmentUtilSlots(
    fromYmd: string,
    toYmd: string,
    mode: EquipmentUtilSlotMode = '6h',
  ): Promise<{
    slots: {
      label: string;
      motorisedCount: number;
      motorisedPct: number;
      nonMotorisedCount: number;
      nonMotorisedPct: number;
      towableCount: number;
      towablePct: number;
      motorisedEquipment: { equipmentName: string; count: number }[];
      nonMotorisedEquipment: { equipmentName: string; count: number }[];
      towableEquipment: { equipmentName: string; count: number }[];
    }[];
    totalRow: {
      motorisedCount: number;
      motorisedPct: number;
      nonMotorisedCount: number;
      nonMotorisedPct: number;
      towableCount: number;
      towablePct: number;
    };
    categoryTotals: {
      motorisedCount: number;
      nonMotorisedCount: number;
      towableCount: number;
    };
    entryCount: number;
    unclassifiedCount: number;
  }> {
    const slotMeta = equipmentUtilSlotMetaFor(mode);
    const slotCount = slotMeta.length;
    const emptySlots = slotMeta.map((m) => ({
      label: m.label,
      motorisedCount: 0,
      motorisedPct: 0,
      nonMotorisedCount: 0,
      nonMotorisedPct: 0,
      towableCount: 0,
      towablePct: 0,
      motorisedEquipment: [] as { equipmentName: string; count: number }[],
      nonMotorisedEquipment: [] as { equipmentName: string; count: number }[],
      towableEquipment: [] as { equipmentName: string; count: number }[],
    }));
    const empty = {
      slots: emptySlots,
      totalRow: {
        motorisedCount: 0,
        motorisedPct: 100,
        nonMotorisedCount: 0,
        nonMotorisedPct: 100,
        towableCount: 0,
        towablePct: 100,
      },
      categoryTotals: {
        motorisedCount: 0,
        nonMotorisedCount: 0,
        towableCount: 0,
      },
      entryCount: 0,
      unclassifiedCount: 0,
    };

    const rangeStart = this.parseYmdLocal(fromYmd);
    const rangeEnd = this.parseYmdLocal(toYmd);
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
      return empty;
    }

    const dateStrings = enumerateDdMmYyyyBetweenInclusive(fromYmd, toYmd);
    if (!dateStrings.length) {
      return empty;
    }

    const catalog = await this.getMasterCatalog();
    const filter = fhrStaDatesRangeFilter(dateStrings);
    const fhrs = await this.fhrCollectionModel
      .find(filter)
      .select({ equipmentDetails: 1 })
      .lean()
      .exec();

    return this.aggregateDashboardEquipmentUtilFromLeanRows(
      fhrs,
      mode,
      catalog,
    );
  }

  aggregateDashboardEquipmentUtilFromLeanRows(
    fhrs: Array<{ equipmentDetails?: unknown[] | null }>,
    mode: EquipmentUtilSlotMode = '6h',
    catalog?: EquipmentManpowerCatalogItemDto[],
  ): {
    slots: {
      label: string;
      motorisedCount: number;
      motorisedPct: number;
      nonMotorisedCount: number;
      nonMotorisedPct: number;
      towableCount: number;
      towablePct: number;
      motorisedEquipment: { equipmentName: string; count: number }[];
      nonMotorisedEquipment: { equipmentName: string; count: number }[];
      towableEquipment: { equipmentName: string; count: number }[];
    }[];
    totalRow: {
      motorisedCount: number;
      motorisedPct: number;
      nonMotorisedCount: number;
      nonMotorisedPct: number;
      towableCount: number;
      towablePct: number;
    };
    categoryTotals: {
      motorisedCount: number;
      nonMotorisedCount: number;
      towableCount: number;
    };
    entryCount: number;
    unclassifiedCount: number;
  } {
    const slotMeta = equipmentUtilSlotMetaFor(mode);
    const slotCount = slotMeta.length;
    const emptySlots = slotMeta.map((m) => ({
      label: m.label,
      motorisedCount: 0,
      motorisedPct: 0,
      nonMotorisedCount: 0,
      nonMotorisedPct: 0,
      towableCount: 0,
      towablePct: 0,
      motorisedEquipment: [] as { equipmentName: string; count: number }[],
      nonMotorisedEquipment: [] as { equipmentName: string; count: number }[],
      towableEquipment: [] as { equipmentName: string; count: number }[],
    }));
    const empty = {
      slots: emptySlots,
      totalRow: {
        motorisedCount: 0,
        motorisedPct: 100,
        nonMotorisedCount: 0,
        nonMotorisedPct: 100,
        towableCount: 0,
        towablePct: 100,
      },
      categoryTotals: {
        motorisedCount: 0,
        nonMotorisedCount: 0,
        towableCount: 0,
      },
      entryCount: 0,
      unclassifiedCount: 0,
    };

    const catalogRows = catalog ?? [];
    /** Catalog key (uppercase, trimmed) → category (`M` / `NM` / `T`). */
    const abbrToCat = new Map<string, string>();
    const descToCat = new Map<string, string>();
    /** Catalog key → original description from the master list (used as the **display** equipment name). */
    const abbrToDesc = new Map<string, string>();
    const descToDesc = new Map<string, string>();
    for (const row of catalogRows) {
      const rawDesc = String(row.description ?? '').trim();
      const abbr = normalizeCatalogKey(row.abbr);
      const cat = sanitizeCatalogCategory(row.category);
      if (abbr && cat) abbrToCat.set(abbr, cat);
      if (abbr && rawDesc) abbrToDesc.set(abbr, rawDesc);
      const desc = normalizeCatalogKey(row.description);
      if (desc && cat) descToCat.set(desc, cat);
      if (desc && rawDesc) descToDesc.set(desc, rawDesc);
    }

    const slotM = new Array<number>(slotCount).fill(0);
    const slotNM = new Array<number>(slotCount).fill(0);
    const slotT = new Array<number>(slotCount).fill(0);
    let unclassifiedCount = 0;
    let entryCount = 0;

    const newMaps = (): Map<string, number>[] =>
      Array.from({ length: slotCount }, () => new Map<string, number>());
    const motorMaps: Map<string, number>[] = newMaps();
    const nonMotorMaps: Map<string, number>[] = newMaps();
    const towableMaps: Map<string, number>[] = newMaps();

    /** Resolve display name + category from the master catalog. Falls back to the raw equipment_name. */
    const resolveCatalog = (
      equipmentName: string,
    ): { category: 'M' | 'NM' | 'T' | 'U'; displayName: string } => {
      const key = normalizeCatalogKey(equipmentName);
      if (!key) return { category: 'U', displayName: equipmentName };
      const c = abbrToCat.get(key) ?? descToCat.get(key);
      const desc = abbrToDesc.get(key) ?? descToDesc.get(key);
      const displayName = desc || equipmentName;
      if (c === 'M') return { category: 'M', displayName };
      if (c === 'NM') return { category: 'NM', displayName };
      if (c === 'T') return { category: 'T', displayName };
      return { category: 'U', displayName };
    };

    const bumpName = (
      maps: Map<string, number>[],
      band: number,
      displayName: string,
    ): void => {
      const m = maps[band];
      const prev = m.get(displayName) ?? 0;
      m.set(displayName, prev + 1);
    };

    for (const doc of fhrs) {
      const lines = Array.isArray(doc.equipmentDetails)
        ? doc.equipmentDetails
        : [];
      for (const line of lines) {
        const rawName = (line as { equipment_name?: unknown })?.equipment_name;
        const equipmentName = String(rawName ?? '').trim();
        if (!equipmentName) continue;

        const fromD = this.parseFlexDate(
          String((line as { from_date?: unknown })?.from_date ?? ''),
        );
        if (!fromD) continue;

        const mins = this.parseFromTimeToMinutesFromMidnight(
          (line as { from_time?: unknown })?.from_time,
        );
        if (mins === null) continue;

        const band = this.timeMinutesToUtilSlot(mins, mode);
        const { category, displayName } = resolveCatalog(equipmentName);

        entryCount += 1;
        if (category === 'M') {
          slotM[band] += 1;
          bumpName(motorMaps, band, displayName);
        } else if (category === 'NM') {
          slotNM[band] += 1;
          bumpName(nonMotorMaps, band, displayName);
        } else if (category === 'T') {
          slotT[band] += 1;
          bumpName(towableMaps, band, displayName);
        } else {
          unclassifiedCount += 1;
        }
      }
    }

    const catTotM = slotM.reduce((a, b) => a + b, 0);
    const catTotNM = slotNM.reduce((a, b) => a + b, 0);
    const catTotT = slotT.reduce((a, b) => a + b, 0);

    const mPcts = this.weightsToPercentsSumming100(slotM);
    const nmPcts = this.weightsToPercentsSumming100(slotNM);
    const tPcts = this.weightsToPercentsSumming100(slotT);

    const toSortedList = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([equipmentName, count]) => ({ equipmentName, count }))
        .sort(
          (a, b) =>
            b.count - a.count || a.equipmentName.localeCompare(b.equipmentName),
        );

    const slots = slotMeta.map((m, i) => ({
      label: m.label,
      motorisedCount: slotM[i],
      motorisedPct: mPcts[i] ?? 0,
      nonMotorisedCount: slotNM[i],
      nonMotorisedPct: nmPcts[i] ?? 0,
      towableCount: slotT[i],
      towablePct: tPcts[i] ?? 0,
      motorisedEquipment: toSortedList(motorMaps[i]),
      nonMotorisedEquipment: toSortedList(nonMotorMaps[i]),
      towableEquipment: toSortedList(towableMaps[i]),
    }));

    return {
      slots,
      totalRow: {
        motorisedCount: catTotM,
        motorisedPct: 100,
        nonMotorisedCount: catTotNM,
        nonMotorisedPct: 100,
        towableCount: catTotT,
        towablePct: 100,
      },
      categoryTotals: {
        motorisedCount: catTotM,
        nonMotorisedCount: catTotNM,
        towableCount: catTotT,
      },
      entryCount,
      unclassifiedCount,
    };
  }

  /**
   * Map non-negative integer slab counts to **one-decimal** percentages summing to **exactly 100.0**
   * (largest remainder on 1000 units). Column-wise within each category.
   */
  private weightsToPercentsSumming100(weights: number[]): number[] {
    if (weights.length === 0) return [];
    const wsum = weights.reduce((a, b) => a + b, 0);
    if (wsum <= 0) return weights.map(() => 0);
    const units = 1000;
    const raw = weights.map((w) => (w / wsum) * units);
    const floors = raw.map((x) => Math.floor(x));
    const rem = units - floors.reduce((a, b) => a + b, 0);
    const order = raw
      .map((x, i) => ({ i, frac: x - Math.floor(x) }))
      .sort((a, b) => b.frac - a.frac);
    const alloc = [...floors];
    for (let k = 0; k < rem; k++) {
      alloc[order[k % order.length].i] += 1;
    }
    return alloc.map((x) => Math.round(x) / 10);
  }

  private parseFromTimeToMinutesFromMidnight(raw: unknown): number | null {
    if (raw == null) return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const x = raw;
      const frac = ((x % 1) + 1) % 1;
      const mins = Math.round(frac * 24 * 60);
      return ((mins % 1440) + 1440) % 1440;
    }
    const s = String(raw).trim();
    if (!s) return null;
    const pl = s.replace(',', '.');
    if (!s.includes(':')) {
      const v = Number(pl);
      if (!Number.isFinite(v)) return null;
      const frac = ((v % 1) + 1) % 1;
      const mins = Math.round(frac * 24 * 60);
      return ((mins % 1440) + 1440) % 1440;
    }
    const hm = this.parseHm(s);
    return hm.h * 60 + hm.m;
  }

  /**
   * Map minutes-from-midnight to a slot index for the given mode.
   * `6h` returns 0..3 (4 bands of 6 hours); `4h` returns 0..5 (6 bands of 4 hours).
   * Both modes anchor band 0 at **22:00** so the first slab is the night-start shift.
   */
  private timeMinutesToUtilSlot(
    minsRaw: number,
    mode: EquipmentUtilSlotMode,
  ): number {
    const m = ((minsRaw % 1440) + 1440) % 1440;
    if (mode === '4h') {
      const offset = (m - 22 * 60 + 1440) % 1440;
      return Math.floor(offset / (4 * 60));
    }
    if (m >= 22 * 60 || m < 4 * 60) return 0;
    if (m >= 4 * 60 && m < 10 * 60) return 1;
    if (m >= 10 * 60 && m < 16 * 60) return 2;
    return 3;
  }

  private parseYmdLocal(s: string): Date | null {
    const t = s?.trim();
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
    const [y, m, d] = t.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  private parseFlexDate(s: string): Date | null {
    const t = s?.trim().split(/\s+/)[0] ?? '';
    if (!t) return null;
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return new Date(+iso[1], +iso[2] - 1, +iso[3], 0, 0, 0, 0);
    }
    const dm = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dm) {
      return new Date(+dm[3], +dm[2] - 1, +dm[1], 0, 0, 0, 0);
    }
    return null;
  }

  private parseHm(s: string): { h: number; m: number } {
    const t = s?.trim();
    if (!t) return { h: 0, m: 0 };
    const p = t.match(/^(\d{1,2}):(\d{2})/);
    if (!p) return { h: 0, m: 0 };
    return {
      h: Math.min(23, Math.max(0, +p[1])),
      m: Math.min(59, Math.max(0, +p[2])),
    };
  }
}
