import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { invalidateListDailyFromAdvanceCache } from '../../raw-flight-data/utils/list-daily-from-advance-cache.util';
import { displayFlightNoFromScheduleData } from '../../raw-flight-data/utils/schedule-season.util';
import { Model, Types } from 'mongoose';
import {
  FhrCollection,
  FhrCollectionDocument,
} from '../schema/fhr-collection.schema';
import { UpsertFhrCollectionDto } from '../dto/upsert-fhr-collection.dto';
import {
  MainDetails,
  MainDetailsDocument,
} from 'src/main-details/schema/main-details.schema';
import {
  TerminalDetails,
  TerminalDetailsDocument,
} from 'src/terminal-details/schema/terminal-details.schema';
import {
  LoadControlDetails,
  LoadControlDetailsDocument,
} from 'src/load-control-details/schema/load-control-details.schema';
import {
  RampDetails1,
  RampDetails1Document,
} from 'src/ramp-details-1/schema/ramp-details-1.schema';
import {
  RampDetails2,
  RampDetails2Document,
} from 'src/ramp-details-2/schema/ramp-details-2.schema';
import {
  RampDetails3,
  RampDetails3Document,
} from 'src/ramp-details-3/schema/ramp-details-3.schema';
import { Remarks, RemarksDocument } from 'src/remarks/schema/remarks.schema';
import {
  EquipmentManpower,
  EquipmentManpowerDocument,
} from 'src/equipment-manpower/schema/equipment-manpower.schema';
import {
  Attachments,
  AttachmentsDocument,
} from 'src/attachments/schema/attachments.schema';
import { Report, ReportDocument } from 'src/reports/schema/reports.schema';
import {
  FlightInstanceIndex,
  FlightInstanceIndexDocument,
} from 'src/raw-flight-data/schema/flight-instance-index.schema';
import {
  computeStaDatesFromEmbeds,
  enumerateOperatingScheduleDates,
  expandStaDateQueryVariants,
  fhrStaDatesRangeFilter,
  normalizeDateDdMmYyyy,
  staDatesArraysEqual,
  ymdFromDdMmYyyy,
} from '../utils/sta-dates.util';
import type {
  FhrPerformanceReportBucketDto,
  FhrPerformanceReportDto,
} from 'src/reports/dto/fhr-performance-report.dto';
import type {
  ScheduledMixCountedFlightRow,
  AircraftAnalysisFlightRow,
} from '../dto/scheduled-mix-counted-flight.dto';
import type { AdvanceAircraftService } from 'src/advance-aircraft/services/advance-aircraft.service';
import { lazyService } from '../../common/nestjs/lazy-service.util';
import { normalizeFhrEquipmentDetailItems } from 'src/common/billing-trackable-equipment-name';
import { NsFhrCollectionService } from '../../ns-fhr-collection/services/ns-fhr-collection.service';
import { RafCollectionService } from '../../raf-collection/services/raf-collection.service';
import { isNonScheduledFhrDoc } from '../../mis-station-wise/utils/station-wise-scope.util';
import { resolveFlightReportCleaningDurationHhMm } from 'src/reports/utils/cleaning-duration.util';
import {
  AIRLINE_REMARKS_BLANK_LABEL,
  AIRLINE_REMARKS_RATING_VALUES,
  isAirlineRemarksRating,
} from 'src/remarks/remarks-rating.constants';
import { aggregateScheduledAirlinesActiveStatsFromLeanRows } from '../utils/scheduled-airlines-active-stats.util';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  STATION_CODE_FIELD,
  normalizeStationCode,
} from '../../common/station/station.constants';

export type CleaningServicesReportRow = {
  id: string;
  serialNo: number;
  flightSerialNo: string;
  flightNo: string;
  staYmd: string;
  customer: string;
  airlineCode: string;
  category: string;
  typeOfHandling: string;
  aircraftBody: string;
  typeOfFlight: 'Cargo' | 'Passenger';
  clFromDate: string;
  clFromTime: string;
  clEndDate: string;
  clEndTime: string;
  duration: string;
  supervisor: string;
  remarks: string;
};

/** Accidental unique indexes copied from `mainDetails` onto the FHR embed. */
const LEFTOVER_FHR_EMBED_UNIQUE_INDEXES = [
  'mainDetails.SerialNo_1',
  'mainDetails.flightSerialNumber_1',
] as const;

@Injectable()
export class FhrCollectionService implements OnModuleInit {
  private readonly logger = new Logger(FhrCollectionService.name);

  /** Shared across scheduled-airlines list + dashboard secondary cards (same STA `$in` scan). */
  private readonly staWindowRowsCache = new Map<
    string,
    {
      expiresAt: number;
      rows: Array<Record<string, unknown>>;
      wallMs: number;
    }
  >();
  private readonly staWindowRowsInflight = new Map<
    string,
    Promise<{ rows: Array<Record<string, unknown>>; wallMs: number }>
  >();

  private readonly fhrMutateCallbacks: Array<
    (ctx?: { slice?: string; affectedDates?: string[] }) => void | Promise<void>
  > = [];

  constructor(
    @InjectModel(FhrCollection.name)
    private readonly fhrModel: Model<FhrCollectionDocument>,
    @InjectModel(MainDetails.name)
    private readonly mainDetailsModel: Model<MainDetailsDocument>,
    @InjectModel(TerminalDetails.name)
    private readonly terminalDetailsModel: Model<TerminalDetailsDocument>,
    @InjectModel(LoadControlDetails.name)
    private readonly loadControlModel: Model<LoadControlDetailsDocument>,
    @InjectModel(RampDetails1.name)
    private readonly ramp1Model: Model<RampDetails1Document>,
    @InjectModel(RampDetails2.name)
    private readonly ramp2Model: Model<RampDetails2Document>,
    @InjectModel(RampDetails3.name)
    private readonly ramp3Model: Model<RampDetails3Document>,
    @InjectModel(Remarks.name)
    private readonly remarksModel: Model<RemarksDocument>,
    @InjectModel(EquipmentManpower.name)
    private readonly equipmentModel: Model<EquipmentManpowerDocument>,
    @InjectModel(Attachments.name)
    private readonly attachmentsModel: Model<AttachmentsDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(FlightInstanceIndex.name)
    private readonly flightIndexModel: Model<FlightInstanceIndexDocument>,
    @Inject(
      forwardRef(
        lazyService(
          () =>
            require('../../advance-aircraft/services/advance-aircraft.service')
              .AdvanceAircraftService as typeof import('../../advance-aircraft/services/advance-aircraft.service').AdvanceAircraftService,
        ),
      ),
    )
    private readonly advanceAircraftService: AdvanceAircraftService,
    private readonly nsFhrCollectionService: NsFhrCollectionService,
    private readonly rafCollectionService: RafCollectionService,
  ) {}

  async onModuleInit(): Promise<void> {
    const coll = this.fhrModel.collection;
    for (const name of LEFTOVER_FHR_EMBED_UNIQUE_INDEXES) {
      try {
        await coll.dropIndex(name);
        this.logger.warn(`Dropped leftover unique index ${name} on fhr_collection`);
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (code === 27 || code === 26) continue;
        this.logger.debug(
          `fhr_collection index ${name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /** Lets other modules (e.g. dashboard summaries) react to FHR merges without circular imports. */
  registerFhrMutateCallback(
    cb: (ctx?: {
      serialNo?: number;
      slice?: string;
      affectedDates?: string[];
    }) => void | Promise<void>,
  ): void {
    this.fhrMutateCallbacks.push(cb);
  }

  private scheduleFhrMutateCallbacks(ctx?: {
    serialNo?: number;
    slice?: string;
    affectedDates?: string[];
  }): void {
    setImmediate(() => {
      for (const cb of this.fhrMutateCallbacks) {
        void Promise.resolve(cb(ctx)).catch((err) => {
          this.logger.debug(
            `[fhr_collection] mutate callback failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    });
  }

  /**
   * Resolve the `stationCode` to stamp on a NEWLY-created `fhr_collection` document.
   * Used only inside `$setOnInsert` so existing (incl. legacy MAA) docs are never
   * touched. A cross-station/system scope falls back to the legacy station (`MAA`),
   * matching current single-station production data.
   */
  private stampStationCode(station: StationScopeContext): string {
    if (station.crossStation) return LEGACY_STATION_CODE;
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  /**
   * Operational serial for `fhr_collection` rows: `SerialNo`, else `flightSerialNumber`
   * (both are kept in sync on normal upserts; lean projections or legacy docs may populate only one).
   */
  static leanDocInstanceSerial(doc: {
    SerialNo?: unknown;
    flightSerialNumber?: unknown;
  }): number | null {
    const coerce = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      const n = typeof v === 'string' ? Number(String(v).trim()) : Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    return coerce(doc.SerialNo) ?? coerce(doc.flightSerialNumber);
  }

  private static normalizeDateDdMmYyyy(input: string): string {
    if (!input?.trim()) return '';
    const s = input.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (iso) {
      const [, y, m, d] = iso;
      return `${d}/${m}/${y}`;
    }
    const parts = s.split(/[/-]/).map((p) => p.trim());
    if (parts.length === 3 && parts[2].length === 4) {
      const d0 = parts[0].padStart(2, '0');
      const m0 = parts[1].padStart(2, '0');
      return `${d0}/${m0}/${parts[2]}`;
    }
    return s;
  }

  private static leanPlain<T>(doc: T | null | undefined): T | null {
    if (doc == null) return null;
    return JSON.parse(JSON.stringify(doc)) as T;
  }

  /**
   * Drop `_id` / `__v` / timestamps so a source form document can be embedded under
   * `fhr_collection` without Mongo reuse issues. Accepts a Mongoose doc or plain object.
   */
  static stripMongoMetaForFhrEmbed(
    doc: Record<string, unknown> | { toObject: () => object },
  ): Record<string, unknown> {
    const plain =
      doc != null &&
      typeof (doc as { toObject?: () => object }).toObject === 'function'
        ? ((doc as { toObject: () => object }).toObject() as Record<
            string,
            unknown
          >)
        : { ...(doc as Record<string, unknown>) };
    const c = { ...plain };
    delete c['_id'];
    delete c['__v'];
    delete c['createdAt'];
    delete c['updatedAt'];
    return c;
  }

  /**
   * Drop Mongo metadata so embedded subdocs can be re-persisted under `fhr_collection`
   * without clashing with source collection _ids.
   */
  private static forEmbeddedCopy<T extends Record<string, unknown>>(
    row: T | null | undefined,
  ): T | null {
    if (row == null) return null;
    const lean = FhrCollectionService.leanPlain(row);
    if (lean == null) return null;
    return FhrCollectionService.stripMongoMetaForFhrEmbed(
      lean as Record<string, unknown>,
    ) as T;
  }

  private static parseSerialToken(raw: string): number | null {
    const trimmed = String(raw ?? '')
      .trim()
      .replace(/^FL-/i, '');
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * After `mergeStagingIntoRawFlightData`, map schedule row → instance `serialNo` when possible.
   */
  async onScheduledAirlinesStagingMerge(
    scheduleId: string,
    mergedData: Record<string, unknown>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<void> {
    const sid = String(scheduleId ?? '').trim();
    if (!sid) return;

    // Advance Schedule Setup masters are indexed by upsertAdvanceScheduleMasterToFhr.
    // Refreshing from empty per-flight form collections would replace the row and clear staDates.
    const scheduleSource = FhrCollectionService.firstString(
      mergedData.scheduleSource,
    );
    if (
      scheduleSource === 'advance_schedule_setup' ||
      (scheduleSource.includes('advance_schedule_setup') &&
        !scheduleSource.includes('scheduled_airlines_creation'))
    ) {
      return;
    }
    const staRaw = FhrCollectionService.firstString(
      mergedData.staDate,
      mergedData['STA Date'],
      mergedData.scheduleDate,
    );
    const opDate = FhrCollectionService.normalizeDateDdMmYyyy(staRaw);
    let instanceSerial: number | null = null;
    if (opDate) {
      const idx = await this.flightIndexModel
        .findOne({ scheduleId: sid, operationDate: opDate })
        .lean()
        .exec();
      if (idx?.serialNo != null) {
        instanceSerial = FhrCollectionService.parseSerialToken(
          String(idx.serialNo),
        );
      }
    }
    if (instanceSerial == null) {
      const sn = FhrCollectionService.firstString(
        mergedData.SlNo,
        mergedData.slNo,
        mergedData['Serial No'],
      );
      const fromSl = FhrCollectionService.parseSerialToken(sn);
      if (fromSl != null) instanceSerial = fromSl;
    }
    if (instanceSerial == null) {
      const n = Number(mergedData.SerialNo);
      if (Number.isFinite(n)) instanceSerial = n;
    }
    if (instanceSerial == null) {
      this.logger.debug(
        `FHR merge snapshot skipped: could not resolve instance serial (scheduleId=${sid})`,
      );
      return;
    }
    const mainExists = await this.mainDetailsModel
      .exists({ SerialNo: instanceSerial })
      .exec();
    if (!mainExists) {
      this.logger.debug(
        `FHR merge snapshot skipped: no mainDetails yet (serial=${instanceSerial})`,
      );
      return;
    }
    if (await this.shouldRouteSerialToNsFhr(instanceSerial)) {
      this.logger.debug(
        `FHR merge snapshot skipped: serial ${instanceSerial} is non-scheduled`,
      );
      return;
    }
    await this.refreshFromSourceCollections(
      instanceSerial,
      'raw_flight_staging_merge',
      { scheduleId: sid },
      station,
    );
  }

  /**
   * After Advance → Schedule Setup save: ensure `fhr_collection` has indexed `staDates`
   * for every operating day (validity ∩ scheduleDays) plus minimal embeds so the
   * Scheduled Airlines table can list the flight before forms are filled in.
   */
  async upsertAdvanceScheduleMasterToFhr(
    scheduleSerial: string,
    advanceData: Record<string, unknown>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<number> {
    const sid = String(scheduleSerial ?? '').trim();
    if (!sid) return 0;

    const serial = FhrCollectionService.parseSerialToken(sid);
    if (serial == null) {
      this.logger.debug(
        `advance schedule FHR upsert skipped: non-numeric serial ${sid}`,
      );
      return 0;
    }

    const validFrom = FhrCollectionService.firstString(
      advanceData.validFrom,
      advanceData['Valid From'],
      advanceData.staDate,
      advanceData['STA Date'],
    );
    const validTo = FhrCollectionService.firstString(
      advanceData.validTo,
      advanceData['Valid To'],
      advanceData.stdDate,
      advanceData['STD Date'],
    );
    const scheduleDays =
      advanceData.scheduleDays &&
      typeof advanceData.scheduleDays === 'object' &&
      !Array.isArray(advanceData.scheduleDays)
        ? (advanceData.scheduleDays as Record<string, unknown>)
        : {};

    let operatingDates = enumerateOperatingScheduleDates(
      validFrom,
      validTo,
      scheduleDays,
    );
    if (operatingDates.length === 0 && validFrom) {
      const fallback = normalizeDateDdMmYyyy(validFrom);
      if (fallback) operatingDates = [fallback];
    }
    if (operatingDates.length === 0) {
      this.logger.debug(
        `advance schedule FHR upsert skipped: no operating dates (serial=${sid})`,
      );
      return 0;
    }

    const airline = FhrCollectionService.firstString(
      advanceData.airline,
      advanceData.Airline,
    );
    const flightNo = FhrCollectionService.firstString(
      advanceData.flightNo,
      advanceData['Flight No'],
      advanceData.FlightNo,
    );
    if (!airline || !flightNo) {
      this.logger.debug(
        `advance schedule FHR upsert skipped: missing airline/flight (serial=${sid})`,
      );
      return 0;
    }

    const aircraft = FhrCollectionService.firstString(
      advanceData.aircraft,
      advanceData.Aircraft,
      advanceData.TypeCraft,
    );
    const routing = FhrCollectionService.firstString(
      advanceData.routing,
      advanceData.route,
      advanceData.Routing,
    );
    const typeOfHandling = FhrCollectionService.firstString(
      advanceData.typeOfHandling,
      advanceData['Type of Handling'],
    );
    const categoryOfFlight = FhrCollectionService.firstFlightCategory(
      advanceData.categoryOfFlight,
      advanceData.Cate_of_Flight,
      advanceData.category_of_flight,
      advanceData.flightType,
      advanceData['Flight Type'],
      advanceData['Type of flight'],
      advanceData.flight,
    );
    const staTime = FhrCollectionService.firstString(
      advanceData.staTime,
      advanceData['STA Time'],
    );
    const stdTime = FhrCollectionService.firstString(
      advanceData.stdTime,
      advanceData['STD Time'],
    );
    const firstSta = operatingDates[0];
    const staTimeNorm = FhrCollectionService.scheduleTimeDisplayHhMm(
      staTime || '00:00',
    );
    const stdTimeNorm = FhrCollectionService.scheduleTimeDisplayHhMm(
      stdTime || '00:00',
    );
    const scheduleTimeToMinutes = (t: string): number => {
      const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(t ?? '').trim());
      if (!m) return 0;
      return Number(m[1]) * 60 + Number(m[2]);
    };
    const masterStdFallback = normalizeDateDdMmYyyy(
      FhrCollectionService.firstString(
        advanceData.stdDate,
        advanceData['STD Date'],
        firstSta,
      ),
    );
    const stdDateNorm =
      scheduleTimeToMinutes(staTimeNorm) > 0 &&
      scheduleTimeToMinutes(stdTimeNorm) > 0
        ? normalizeDateDdMmYyyy(firstSta) || masterStdFallback
        : masterStdFallback;

    const existing = await this.fhrModel
      .findOne({ SerialNo: serial })
      .lean()
      .exec();

    const existingMain = (existing?.mainDetails ?? {}) as Record<
      string,
      unknown
    >;
    const existingTerminal = (existing?.terminalDetails ?? {}) as Record<
      string,
      unknown
    >;

    const mainDetails: Record<string, unknown> = {
      ...existingMain,
      SerialNo: serial,
      Airline: FhrCollectionService.firstString(existingMain.Airline, airline),
      FlightNo: FhrCollectionService.firstString(
        existingMain.FlightNo,
        existingMain.flightNo,
        flightNo,
      ),
      TypeCraft: FhrCollectionService.firstString(
        existingMain.TypeCraft,
        aircraft,
      ),
      Route: FhrCollectionService.firstString(existingMain.Route, routing),
      TypeofHandling: FhrCollectionService.firstString(
        existingMain.TypeofHandling,
        existingMain.typeOfHandling,
        typeOfHandling,
      ),
      Cate_of_Flight: FhrCollectionService.firstFlightCategory(
        existingMain.Cate_of_Flight,
        existingMain.cate_of_flight,
        existingMain.flightCategory,
        categoryOfFlight,
      ),
      STADate: FhrCollectionService.firstString(
        existingMain.STADate,
        existingMain.staDate,
        firstSta,
      ),
    };

    const terminalDetails: Record<string, unknown> = {
      ...existingTerminal,
      serialNo: serial,
      airlinesOperator: FhrCollectionService.firstString(
        existingTerminal.airlinesOperator,
        existingTerminal.Airline,
        airline,
      ),
      FlightNo: FhrCollectionService.firstString(
        existingTerminal.FlightNo,
        existingTerminal.flightNo,
        flightNo,
      ),
      STADate: FhrCollectionService.firstString(
        existingTerminal.STADate,
        existingTerminal.staDate,
        firstSta,
      ),
      STATime: FhrCollectionService.firstString(
        existingTerminal.STATime,
        existingTerminal.sta,
        staTime,
      ),
      STDDate: FhrCollectionService.firstString(
        existingTerminal.STDDate,
        existingTerminal.stdDate,
        stdDateNorm,
      ),
      STDTime: FhrCollectionService.firstString(
        existingTerminal.STDTime,
        existingTerminal.std,
        stdTime,
      ),
      TypeCraft: FhrCollectionService.firstString(
        existingTerminal.TypeCraft,
        aircraft,
      ),
    };

    const embedStaDates = computeStaDatesFromEmbeds(
      terminalDetails,
      existing?.rampDetails1 as Record<string, unknown> | null,
      existing?.rampDetails3 as Record<string, unknown> | null,
    );
    const staDates = Array.from(
      new Set(
        [...operatingDates, ...embedStaDates]
          .map((d) => normalizeDateDdMmYyyy(String(d ?? '')))
          .filter(Boolean),
      ),
    ).sort();

    const now = new Date();
    await this.fhrModel
      .findOneAndUpdate(
        { SerialNo: serial },
        {
          $set: {
            SerialNo: serial,
            flightSerialNumber: serial,
            scheduleId: sid,
            staDates,
            lastSnapshotAt: now,
            lastSnapshotReason: 'advance_schedule_setup',
            mainDetails: FhrCollectionService.forEmbeddedCopy(mainDetails),
            terminalDetails:
              FhrCollectionService.forEmbeddedCopy(terminalDetails),
          },
          $setOnInsert: {
            rampDetails2: [],
            reports: [],
            stationCode: this.stampStationCode(station),
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    // Clear every STA-window cache entry: list queries use the full from–to key
    // (e.g. `01/05/2026..31/05/2026:31`), not just the per-schedule staDates array.
    this.invalidateStaWindowRowsCache();
    this.logger.log(
      `advance schedule FHR upsert serial=${serial} operatingDays=${operatingDates.length} staDates=${staDates.length}`,
    );
    return staDates.length;
  }

  /**
   * When Schedule Setup edits STA/STD, push those fields onto already-generated
   * per-day FHR instance docs (and form collections) so Closed flights update
   * in place — including loadControl embeds that otherwise overwrite list times.
   */
  async patchExistingInstanceScheduleTimes(
    advanceData: Record<string, unknown>,
    operatingDatesDdMm: string[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    scheduleSerial?: string,
    options?: { quiet?: boolean },
  ): Promise<number> {
    const airline = FhrCollectionService.firstString(
      advanceData.airline,
      advanceData.Airline,
    );
    const flightNo = FhrCollectionService.firstString(
      advanceData.flightNo,
      advanceData['Flight No'],
      advanceData.FlightNo,
    );
    const normalizeHhMm = (raw: string): string => {
      const s = String(raw ?? '').trim();
      if (!s) return '';
      const m = /^(\d{1,2}):(\d{2})$/.exec(s);
      if (!m) return s;
      const hh = Math.min(23, Math.max(0, Number(m[1])));
      const mm = Math.min(59, Math.max(0, Number(m[2])));
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };
    const staTime = normalizeHhMm(
      FhrCollectionService.firstString(
        advanceData.staTime,
        advanceData['STA Time'],
        advanceData.STATime,
      ),
    );
    const stdTime = normalizeHhMm(
      FhrCollectionService.firstString(
        advanceData.stdTime,
        advanceData['STD Time'],
        advanceData.STDTime,
      ),
    );
    const aircraft = FhrCollectionService.firstString(
      advanceData.aircraft,
      advanceData.Aircraft,
      advanceData.TypeCraft,
    );
    const routing = FhrCollectionService.firstString(
      advanceData.routing,
      advanceData.route,
      advanceData.Routing,
    );
    if ((!airline && !flightNo && !scheduleSerial) || operatingDatesDdMm.length === 0) {
      return 0;
    }
    if (!staTime && !stdTime && !aircraft && !routing) return 0;

    const airlineNorm = airline.trim().toLowerCase().replace(/\s+/g, ' ');
    const flightTokens = new Set<string>();
    const fullFn = flightNo.trim().toLowerCase().replace(/\s+/g, '');
    if (fullFn) flightTokens.add(fullFn);
    for (const part of flightNo.split('/')) {
      const t = part.trim().toLowerCase().replace(/\s+/g, '');
      if (t) flightTokens.add(t);
    }

    const dates = operatingDatesDdMm
      .map((d) => normalizeDateDdMmYyyy(String(d ?? '')))
      .filter(Boolean);
    if (dates.length === 0) return 0;

    const serialCandidates = new Set<number>();

    const sid = String(scheduleSerial ?? '').trim();
    if (sid) {
      const indexed = await this.flightIndexModel
        .find({
          scheduleId: sid,
          operationDate: { $in: dates },
        })
        .select({ serialNo: 1 })
        .lean()
        .exec();
      for (const row of indexed) {
        const n = FhrCollectionService.parseSerialToken(String(row.serialNo ?? ''));
        if (n != null && n >= 100000) serialCandidates.add(n);
      }
    }

    const docs = await this.fhrModel
      .find(
        StationScope.filter(
          {
            $or: [
              ...(serialCandidates.size > 0
                ? [{ SerialNo: { $in: [...serialCandidates] } }]
                : []),
              {
                staDates: { $in: dates },
                SerialNo: { $gte: 100000 },
              },
            ],
          },
          station,
        ),
      )
      .select({
        SerialNo: 1,
        scheduleId: 1,
        mainDetails: 1,
        terminalDetails: 1,
        loadControlDetails: 1,
        rampDetails1: 1,
        staDates: 1,
      })
      .lean()
      .exec();

    let patched = 0;
    for (const doc of docs) {
      const sn = FhrCollectionService.leanDocInstanceSerial(
        doc as { SerialNo?: unknown; flightSerialNumber?: unknown },
      );
      if (sn == null || sn < 100000) continue;

      const linkedBySchedule =
        sid &&
        (String((doc as { scheduleId?: unknown }).scheduleId ?? '').trim() ===
          sid ||
          serialCandidates.has(sn));

      const m = (doc.mainDetails ?? {}) as Record<string, unknown>;
      const t = (doc.terminalDetails ?? {}) as Record<string, unknown>;

      let flightMatch = linkedBySchedule;
      if (!flightMatch && flightTokens.size > 0) {
        const docAirline = FhrCollectionService.firstString(
          t.airlinesOperator,
          t.Airline,
          m.Airline,
          m.airline,
        )
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');
        // Allow airline match when both sides present; otherwise rely on flight tokens.
        if (airlineNorm && docAirline && docAirline !== airlineNorm) {
          continue;
        }

        const arr = FhrCollectionService.firstString(
          m.ArrivalFltNo,
          m.arrivalFlightNo,
        );
        const dep = FhrCollectionService.firstString(
          m.DepartureFltNo,
          m.departureFlightNo,
        );
        const composed = FhrCollectionService.flightNoFromMainArrivalDeparture(
          arr,
          dep,
        );
        const docFlight = FhrCollectionService.firstString(
          composed,
          t.FlightNo,
          t.flightNo,
          m.FlightNo,
          m.flightNo,
          m['Flight No'],
        );
        const docTokens = new Set<string>();
        const docFull = docFlight.trim().toLowerCase().replace(/\s+/g, '');
        if (docFull) docTokens.add(docFull);
        for (const part of docFlight.split('/')) {
          const p = part.trim().toLowerCase().replace(/\s+/g, '');
          if (p) docTokens.add(p);
        }
        for (const tok of flightTokens) {
          if (docTokens.has(tok)) {
            flightMatch = true;
            break;
          }
        }
      }
      if (!flightMatch) continue;

      const $set: Record<string, unknown> = {
        lastSnapshotAt: new Date(),
        lastSnapshotReason: 'advance_schedule_setup_edit',
      };
      if (sid) $set.scheduleId = sid;
      if (staTime) {
        $set['terminalDetails.STATime'] = staTime;
        $set['terminalDetails.sta'] = staTime;
        $set['mainDetails.STATime'] = staTime;
        $set['loadControlDetails.STATime'] = staTime;
        $set['rampDetails1.STATime'] = staTime;
        $set['rampDetails1.sta'] = staTime;
      }
      if (stdTime) {
        $set['terminalDetails.STDTime'] = stdTime;
        $set['terminalDetails.std'] = stdTime;
        $set['mainDetails.STDTime'] = stdTime;
        $set['loadControlDetails.STDTime'] = stdTime;
        $set['rampDetails1.STDTime'] = stdTime;
        $set['rampDetails1.std'] = stdTime;
      }
      if (aircraft) {
        $set['terminalDetails.TypeCraft'] = aircraft;
        $set['mainDetails.TypeCraft'] = aircraft;
      }
      if (routing) {
        $set['terminalDetails.routing'] = routing;
        $set['mainDetails.Route'] = routing;
      }

      await this.fhrModel.updateOne({ SerialNo: sn }, { $set }).exec();

      const formSet: Record<string, unknown> = {};
      if (staTime) {
        formSet.STATime = staTime;
        formSet.sta = staTime;
      }
      if (stdTime) {
        formSet.STDTime = stdTime;
        formSet.std = stdTime;
      }
      if (aircraft) formSet.TypeCraft = aircraft;
      if (routing) formSet.routing = routing;

      if (Object.keys(formSet).length > 0) {
        await Promise.all([
          this.terminalDetailsModel
            .updateOne({ serialNo: sn }, { $set: formSet })
            .exec()
            .catch((err) => { this.logger.warn(`FHR form sync failed: ${err instanceof Error ? err.message : String(err)}`); }),
          this.loadControlModel
            .updateOne(
              { serialNo: sn },
              {
                $set: {
                  ...(staTime ? { STATime: staTime } : {}),
                  ...(stdTime ? { STDTime: stdTime } : {}),
                },
              },
            )
            .exec()
            .catch((err) => { this.logger.warn(`FHR form sync failed: ${err instanceof Error ? err.message : String(err)}`); }),
          this.ramp1Model
            .updateOne({ serialNo: sn }, { $set: formSet })
            .exec()
            .catch((err) => { this.logger.warn(`FHR form sync failed: ${err instanceof Error ? err.message : String(err)}`); }),
          this.mainDetailsModel
            .updateOne(
              { SerialNo: sn },
              {
                $set: {
                  ...(staTime ? { STATime: staTime } : {}),
                  ...(stdTime ? { STDTime: stdTime } : {}),
                  ...(aircraft ? { TypeCraft: aircraft } : {}),
                  ...(routing ? { Route: routing } : {}),
                },
              },
            )
            .exec()
            .catch((err) => { this.logger.warn(`FHR form sync failed: ${err instanceof Error ? err.message : String(err)}`); }),
        ]);
      }
      patched += 1;
    }

    if (patched > 0) {
      this.invalidateStaWindowRowsCache();
      invalidateListDailyFromAdvanceCache();
      if (!options?.quiet) {
        this.logger.log(
          `[advance_edit] patched ${patched} FHR instance(s) for ${airline || '?'} ${flightNo || sid || '?'} schedule=${sid || '?'} sta=${staTime} std=${stdTime}`,
        );
      }
    } else if (!options?.quiet) {
      // Bulk daily heal uses quiet:true + one summary log. Explicit schedule
      // edits keep a single warn so missing instances stay visible.
      const msg = `[advance_edit] no FHR instance matched for ${airline || '?'} ${flightNo || '?'} schedule=${sid || '?'} dates=${dates.join(',')}`;
      if (sid) this.logger.warn(msg);
      else this.logger.debug(msg);
    }
    return patched;
  }

  private static firstString(...vals: unknown[]): string {
    for (const v of vals) {
      const t = String(v ?? '').trim();
      if (t) return t;
    }
    return '';
  }

  /** Drop "Unknown" and ops labels so they cannot overwrite a real category. */
  private static firstFlightCategory(...vals: unknown[]): string {
    const skip = new Set([
      'unknown',
      'turnaround',
      'transit',
      'arrival',
      'departure',
    ]);
    for (const v of vals) {
      const t = String(v ?? '').trim();
      if (!t || skip.has(t.toLowerCase())) continue;
      return t;
    }
    return '';
  }

  /**
   * Load all form collections for a flight and upsert a single `fhr_collection` document.
   */
  async refreshFromSourceCollections(
    SerialNo: number,
    reason: string,
    extra?: { scheduleId?: string },
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<FhrCollectionDocument> {
    if (!Number.isFinite(SerialNo)) {
      throw new NotFoundException('Invalid SerialNo');
    }
    const serial = SerialNo;
    const sourceFilter = StationScope.filter({ SerialNo: serial }, station);
    const sourceSerialFilter = StationScope.filter(
      { serialNo: serial },
      station,
    );
    const sourceFhrNoFilter = StationScope.filter({ fhrNo: serial }, station);
    const [
      main,
      terminal,
      load,
      ramp1,
      ramp2,
      ramp3,
      remarks,
      equipment,
      attachments,
      reportRows,
    ] = await Promise.all([
      this.mainDetailsModel.findOne(sourceFilter).lean().exec(),
      this.terminalDetailsModel.findOne(sourceSerialFilter).lean().exec(),
      this.loadControlModel.findOne(sourceSerialFilter).lean().exec(),
      this.ramp1Model.findOne(sourceSerialFilter).lean().exec(),
      this.ramp2Model
        .find(sourceSerialFilter)
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.ramp3Model.findOne(sourceSerialFilter).lean().exec(),
      this.remarksModel.findOne(sourceSerialFilter).lean().exec(),
      this.equipmentModel.findOne(sourceSerialFilter).lean().exec(),
      this.attachmentsModel.findOne(sourceFhrNoFilter).lean().exec(),
      this.reportModel
        .find(sourceSerialFilter)
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
    ]);

    const now = new Date();
    const dutyRows = (ramp2 ?? [])
      .map((d) =>
        FhrCollectionService.forEmbeddedCopy(
          d as unknown as Record<string, unknown>,
        ),
      )
      .filter((x): x is NonNullable<typeof x> => x != null);
    const reportsStripped = (reportRows ?? []).map((d) =>
      FhrCollectionService.forEmbeddedCopy(
        d as unknown as Record<string, unknown>,
      ),
    );

    if (
      (await this.shouldRouteSerialToNsFhr(serial, {
        mainDetails: (main ?? undefined) as Record<string, unknown> | undefined,
      }))
    ) {
      const nsDoc = await this.nsFhrCollectionService.upsertMerge(
        serial,
        {
          mainDetails: FhrCollectionService.forEmbeddedCopy(
            main as unknown as Record<string, unknown> | null,
          ) as Record<string, unknown> | undefined,
          terminalDetails: FhrCollectionService.forEmbeddedCopy(
            terminal as unknown as Record<string, unknown> | null,
          ) as Record<string, unknown> | undefined,
          loadControlDetails: FhrCollectionService.forEmbeddedCopy(
            load as unknown as Record<string, unknown> | null,
          ) as Record<string, unknown> | undefined,
          rampDetails1: FhrCollectionService.forEmbeddedCopy(
            ramp1 as unknown as Record<string, unknown> | null,
          ) as Record<string, unknown> | undefined,
          rampDetails2: dutyRows,
          rampDetails3: FhrCollectionService.forEmbeddedCopy(
            ramp3 as unknown as Record<string, unknown> | null,
          ) as Record<string, unknown> | undefined,
          remarks: FhrCollectionService.forEmbeddedCopy(
            remarks as unknown as Record<string, unknown> | null,
          ) as Record<string, unknown> | undefined,
          equipmentManpower: FhrCollectionService.forEmbeddedCopy(
            equipment as unknown as Record<string, unknown> | null,
          ) as Record<string, unknown> | undefined,
          attachments: FhrCollectionService.forEmbeddedCopy(
            attachments as unknown as Record<string, unknown> | null,
          ) as Record<string, unknown> | undefined,
          reports: reportsStripped.filter(
            (x): x is NonNullable<typeof x> => x != null,
          ),
        },
        reason,
        station,
      );
      await this.deleteStrayScheduledFhrCopy(serial);
      return nsDoc as unknown as FhrCollectionDocument;
    }

    const existingLean = await this.fhrModel
      .findOne({ SerialNo: serial })
      .lean()
      .exec();
    const embedStaDates = computeStaDatesFromEmbeds(
      terminal as unknown as Record<string, unknown> | null,
      ramp1 as unknown as Record<string, unknown> | null,
      ramp3 as unknown as Record<string, unknown> | null,
    );
    const previousStaDates = Array.isArray(existingLean?.staDates)
      ? (existingLean!.staDates as string[])
      : [];
    const staDates =
      embedStaDates.length > 0
        ? embedStaDates
        : previousStaDates.length > 0
          ? previousStaDates
          : embedStaDates;

    const doc: Record<string, unknown> = {
      SerialNo: serial,
      flightSerialNumber: serial,
      staDates,
      lastSnapshotAt: now,
      lastSnapshotReason: reason,
      mainDetails: FhrCollectionService.forEmbeddedCopy(
        main as unknown as Record<string, unknown> | null,
      ),
      terminalDetails: FhrCollectionService.forEmbeddedCopy(
        terminal as unknown as Record<string, unknown> | null,
      ),
      loadControlDetails: FhrCollectionService.forEmbeddedCopy(
        load as unknown as Record<string, unknown> | null,
      ),
      rampDetails1: FhrCollectionService.forEmbeddedCopy(
        ramp1 as unknown as Record<string, unknown> | null,
      ),
      rampDetails2: dutyRows,
      rampDetails3: FhrCollectionService.forEmbeddedCopy(
        ramp3 as unknown as Record<string, unknown> | null,
      ),
      remarks: FhrCollectionService.forEmbeddedCopy(
        remarks as unknown as Record<string, unknown> | null,
      ),
      equipmentManpower: FhrCollectionService.forEmbeddedCopy(
        equipment as unknown as Record<string, unknown> | null,
      ),
      attachments: FhrCollectionService.forEmbeddedCopy(
        attachments as unknown as Record<string, unknown> | null,
      ),
      reports: reportsStripped.filter(
        (x): x is NonNullable<typeof x> => x != null,
      ),
    };
    if (extra?.scheduleId) doc.scheduleId = extra.scheduleId;

    const preserveKeys = [
      'shareFhrToAirline',
      'shareReportsToGhRep',
      'airlineFhrEmailSentAt',
      'airlineFhrEmailTo',
      'ghRepLockedReportsEmailSentAt',
      'ghRepLockedReportsEmailTo',
      'equipmentDetails',
    ] as const;
    for (const key of preserveKeys) {
      const prev = existingLean?.[key];
      if (prev !== undefined && prev !== null && prev !== '') {
        doc[key] = prev;
      }
    }
    // `findOneAndReplace` overwrites the whole document, so the top-level
    // `stationCode` must be carried forward explicitly:
    //  - existing stamped doc  -> keep its stationCode (no reassignment)
    //  - existing legacy doc    -> leave unset (still MAA-visible via legacy rule)
    //  - brand-new doc (insert) -> stamp from the caller's station
    const existingStationCode = normalizeStationCode(
      existingLean?.[STATION_CODE_FIELD] as string | undefined,
    );
    if (existingStationCode) {
      doc[STATION_CODE_FIELD] = existingStationCode;
    } else if (!existingLean) {
      doc[STATION_CODE_FIELD] = this.stampStationCode(station);
    }

    const prevMainEmbed = existingLean?.mainDetails as
      | Record<string, unknown>
      | null
      | undefined;
    if (
      prevMainEmbed &&
      doc.mainDetails &&
      typeof doc.mainDetails === 'object'
    ) {
      const mergedMain = doc.mainDetails as Record<string, unknown>;
      if (prevMainEmbed.shareFhrToAirline === true) {
        mergedMain.shareFhrToAirline = true;
        doc.shareFhrToAirline = true;
      }
      if (prevMainEmbed.shareReportsToGhRep === true) {
        mergedMain.shareReportsToGhRep = true;
        doc.shareReportsToGhRep = true;
      }
    }

    const replaced = await this.fhrModel
      .findOneAndReplace({ SerialNo: serial }, doc as never, {
        new: true,
        upsert: true,
      })
      .exec();
    if (!replaced) {
      throw new NotFoundException('fhr_collection replace failed');
    }
    invalidateListDailyFromAdvanceCache();
    return replaced;
  }

  /**
   * Called when a flight is marked closed in raw/advance/creation — persist full FHR row.
   * Pass `station` so new `fhr_collection` rows stamp the correct airport (not legacy MAA).
   */
  async onFlightStatusClosed(
    serialToken: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<FhrCollectionDocument | void> {
    const n = FhrCollectionService.parseSerialToken(serialToken);
    if (n == null) {
      this.logger.debug(
        `FHR close snapshot: non-numeric serial, attempting index lookup: ${serialToken}`,
      );
      const bySchedule = await this.flightIndexModel
        .findOne({ scheduleId: String(serialToken).trim() })
        .sort({ updatedAt: -1 })
        .lean()
        .exec();
      if (bySchedule?.serialNo) {
        const s = FhrCollectionService.parseSerialToken(
          String(bySchedule.serialNo),
        );
        if (s != null) {
          return this.refreshFromSourceCollections(
            s,
            'flight_status_closed',
            undefined,
            station,
          );
        }
      }
      return;
    }
    return this.refreshFromSourceCollections(
      n,
      'flight_status_closed',
      undefined,
      station,
    );
  }

  async findBySerial(
    SerialNo: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    // NS serials live in `ns_fhr_collection`. Prefer NS when present so a
    // colliding/empty `fhr_collection` stub (same numeric serial) cannot hide
    // GSE / form embeds used by Non-Scheduled reports.
    if (await this.nsFhrCollectionService.existsBySerial(SerialNo, station)) {
      return this.nsFhrCollectionService.findBySerial(SerialNo, station);
    }

    const doc = await this.fhrModel
      .findOne(
        StationScope.filter(
          { $or: [{ SerialNo }, { flightSerialNumber: SerialNo }] },
          station,
        ),
      )
      .lean()
      .exec();
    const raf = await this.rafCollectionService.getLeanBySerial(SerialNo, station);
    if (doc) {
      return this.mergeRafFieldsOntoDoc(
        doc as unknown as Record<string, unknown>,
        raf,
      );
    }
    if (raf) return raf;

    throw new NotFoundException(
      `No fhr_collection / ns_fhr_collection / raf_collection document for serial ${SerialNo}`,
    );
  }

  /** Persist leftover SKD workbook columns after form upserts mirror into FHR. */
  async mergeWorkbookExtras(
    SerialNo: number,
    extras: Record<string, string>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<void> {
    if (!extras || Object.keys(extras).length === 0) return;
    if (await this.shouldRouteSerialToNsFhr(SerialNo)) return;
    await this.fhrModel
      .updateOne(
        StationScope.filter({ SerialNo }, station),
        {
          $set: {
            workbookExtras: extras,
            lastSnapshotReason: 'flat_skd_excel_seed',
            lastSnapshotAt: new Date(),
          },
        },
      )
      .exec();
  }

  /**
   * Read-only cleaning-services table rows sourced from `fhr_collection`.
   * Includes only flights with at least one cleaning date/time value.
   */
  async listCleaningServicesForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<CleaningServicesReportRow[]> {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    if (!f || !t || f > t) {
      return [];
    }

    const bodyCatalog =
      await this.advanceAircraftService.getActiveAircraftBodyMap();
    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const rows: Array<{
      SerialNo?: number;
      flightSerialNumber?: number;
      mainDetails?: Record<string, unknown> | null;
      terminalDetails?: Record<string, unknown> | null;
      rampDetails1?: Record<string, unknown> | null;
      rampDetails3?: Record<string, unknown> | null;
      remarks?: Record<string, unknown> | null;
    }> = [];

    const cursor = this.fhrModel
      .find(
        StationScope.filter(
          FhrCollectionService.scheduledMergeFilterForDates(dateStrings),
          station,
        ),
      )
      .select({
        _id: 0,
        SerialNo: 1,
        flightSerialNumber: 1,
        mainDetails: 1,
        terminalDetails: 1,
        rampDetails1: 1,
        rampDetails3: 1,
        remarks: 1,
      })
      .lean()
      .cursor();

    for await (const doc of cursor) {
      rows.push(doc as (typeof rows)[number]);
    }

    const out: CleaningServicesReportRow[] = [];

    for (const doc of rows) {
      const mainDetails = doc.mainDetails;
      const terminalDetails = doc.terminalDetails;
      const rampDetails1 = doc.rampDetails1;
      const rampDetails3 = doc.rampDetails3;
      const remarks = doc.remarks;

      const staYmd = FhrCollectionService.fhrDocumentStaYmd(
        mainDetails ?? undefined,
        terminalDetails ?? undefined,
        rampDetails1,
        rampDetails3,
      );
      if (!staYmd || staYmd < f || staYmd > t) {
        continue;
      }

      const serialNo =
        FhrCollectionService.leanDocInstanceSerial({
          SerialNo: doc.SerialNo,
          flightSerialNumber: doc.flightSerialNumber,
        }) ?? 0;
      if (!serialNo) {
        continue;
      }

      const clFrom = FhrCollectionService.splitCleaningDateTime(
        FhrCollectionService.nonEmpty(
          rampDetails1?.['CleaningFr'],
          rampDetails1?.['cleaningStartedDate'],
        ),
        rampDetails1?.['cleaningStartedTime'],
      );
      const clEnd = FhrCollectionService.splitCleaningDateTime(
        FhrCollectionService.nonEmpty(
          rampDetails1?.['CleaningTo'],
          rampDetails1?.['cleaningClosedDate'],
        ),
        rampDetails1?.['cleaningClosedTime'],
      );
      const clFromDate = clFrom.date;
      const clFromTime = clFrom.time;
      const clEndDate = clEnd.date;
      const clEndTime = clEnd.time;

      if (!clFromDate && !clFromTime && !clEndDate && !clEndTime) {
        continue;
      }

      const duration =
        FhrCollectionService.normalizeCleaningDurationHhMm(
          FhrCollectionService.nonEmpty(
            rampDetails1?.['cleaningDuration'],
            rampDetails1?.['cleaning_duration'],
          ),
        ) ||
        resolveFlightReportCleaningDurationHhMm(
          [clFromDate, clFromTime].filter(Boolean).join(' ').trim(),
          [clEndDate, clEndTime].filter(Boolean).join(' ').trim(),
          clFromTime,
          clEndTime,
        );

      const catalogAircraftBody =
        this.advanceAircraftService.matchCatalogAircraftBody(
          bodyCatalog,
          String(mainDetails?.['TypeCraft'] ?? '').trim(),
        );
      const embeddedAircraftBody = FhrCollectionService.nonEmpty(
        mainDetails?.['aircraftBody'],
        mainDetails?.['AircraftBody'],
      )
        .trim()
        .toUpperCase();
      const storedBody =
        embeddedAircraftBody === 'WB' || embeddedAircraftBody.includes('WIDE')
          ? 'WB'
          : embeddedAircraftBody === 'NB' || embeddedAircraftBody.includes('NARROW')
            ? 'NB'
            : '';
      const aircraftBody = storedBody
        ? storedBody
        : catalogAircraftBody
          ? catalogAircraftBody
          : FhrCollectionService.isWideBodyFromMainEmbed(mainDetails ?? {})
            ? 'WB'
            : '';
      const flightNo = FhrCollectionService.mixCountedFlightNoForExport(
        mainDetails ?? {},
        terminalDetails,
        rampDetails1,
        rampDetails3,
      );
      const typeOfFlight = String(flightNo).trim().toUpperCase().includes('F')
        ? 'Cargo'
        : 'Passenger';

      const remarksText = [
        remarks?.['ghRemarks'],
        remarks?.['AirRepRem'],
        remarks?.['airrep'],
      ]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .join(' | ');

      out.push({
        id: `${serialNo}-${staYmd}`,
        serialNo,
        flightSerialNo: String(serialNo),
        flightNo,
        staYmd,
        customer: FhrCollectionService.nonEmpty(
          mainDetails?.['airlineName'],
          remarks?.['Airline'],
        ),
        airlineCode: FhrCollectionService.nonEmpty(
          mainDetails?.['airlineCode'],
          mainDetails?.['Arline_Code'],
        ),
        category: FhrCollectionService.nonEmpty(
          mainDetails?.['flightCategory'],
          mainDetails?.['Cate_of_Flight'],
        ),
        typeOfHandling: FhrCollectionService.nonEmpty(
          mainDetails?.['TypeofHandling'],
          mainDetails?.['typeOfHandling'],
        ),
        aircraftBody,
        typeOfFlight,
        clFromDate,
        clFromTime,
        clEndDate,
        clEndTime,
        duration,
        supervisor: FhrCollectionService.nonEmpty(
          remarks?.['ghRep'],
          remarks?.['PAX_Airline_SignByDate'],
          mainDetails?.['ghRep'],
          mainDetails?.['PAX_Airline_SignByDate'],
        ),
        remarks: remarksText,
      });
    }

    out.sort((a, b) => {
      const ak = `${a.staYmd}\0${a.serialNo}`;
      const bk = `${b.staYmd}\0${b.serialNo}`;
      return ak.localeCompare(bk);
    });

    return out;
  }

  /**
   * After a form save in its source collection, mirror that document into
   * `fhr_collection` (scheduled) or `ns_fhr_collection` (non-scheduled).
   * Logs on failure only; the source collection remains authoritative.
   */
  async mirrorFormSaveToFhrCollection(
    SerialNo: number,
    slice:
      | 'mainDetails'
      | 'terminalDetails'
      | 'loadControlDetails'
      | 'rampDetails1'
      | 'rampDetails3'
      | 'remarks'
      | 'equipmentManpower'
      | 'attachments',
    doc: { toObject: () => object },
    reason: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<void> {
    try {
      const payload = {
        [slice]: FhrCollectionService.stripMongoMetaForFhrEmbed(doc),
      } as UpsertFhrCollectionDto;

      const routeToNs = await this.shouldRouteSerialToNsFhr(SerialNo, payload);

      if (routeToNs) {
        await this.nsFhrCollectionService.upsertMerge(
          SerialNo,
          payload,
          reason,
          station,
        );
        await this.deleteStrayScheduledFhrCopy(SerialNo);
        return;
      }

      await this.upsertMerge(SerialNo, payload, reason, station);
    } catch (err) {
      this.logger.warn(
        `fhr mirror (${slice}) failed for serial ${SerialNo}: ${err}`,
      );
    }
  }

  /**
   * Replace `rampDetails2` embed with all rows for this flight from `rampDetails2` collection.
   */
  async mirrorRampDetails2ToFhrCollection(
    SerialNo: number,
    reason: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<void> {
    if (!Number.isFinite(SerialNo) || SerialNo <= 0) return;
    try {
      const rows = await this.ramp2Model
        .find({ serialNo: SerialNo })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
      const stripped = rows.map((r) =>
        FhrCollectionService.stripMongoMetaForFhrEmbed(
          r as unknown as Record<string, unknown>,
        ),
      );
      await this.upsertMerge(
        SerialNo,
        { rampDetails2: stripped },
        reason,
        station,
      );
    } catch (err) {
      this.logger.warn(
        `fhr_collection merge (rampDetails2) failed for serial ${SerialNo}: ${err}`,
      );
    }
  }

  private async shouldRouteSerialToNsFhr(
    SerialNo: number,
    dto?: UpsertFhrCollectionDto,
  ): Promise<boolean> {
    if (dto && NsFhrCollectionService.payloadLooksNonScheduled(dto)) {
      return true;
    }
    return this.nsFhrCollectionService.existsBySerialAnyStation(SerialNo);
  }

  /**
   * NS form saves used to snapshot into scheduled `fhr_collection` (same serial).
   * Drop that copy so Scheduled Airlines / daily-from-advance cannot list it.
   */
  private async deleteStrayScheduledFhrCopy(SerialNo: number): Promise<void> {
    if (!Number.isFinite(SerialNo) || SerialNo <= 0) return;
    const stray = await this.fhrModel
      .findOne({
        $or: [{ SerialNo }, { flightSerialNumber: SerialNo }],
      })
      .lean()
      .exec();
    if (stray) {
      await this.nsFhrCollectionService.adoptEmbeddedSignaturesIfEmpty(
        SerialNo,
        stray as unknown as {
          signatures?: Record<string, unknown> | null;
          status?: string;
          finalizedAt?: Date | null;
          finalizedByUserId?: string;
        },
      );
    }
    const res = await this.fhrModel
      .deleteOne({
        $or: [{ SerialNo }, { flightSerialNumber: SerialNo }],
      })
      .exec();
    const deleted = Number(res.deletedCount ?? 0);
    if (deleted <= 0) return;
    this.logger.warn(
      `Removed stray fhr_collection copy for non-scheduled serial ${SerialNo}`,
    );
    this.invalidateStaWindowRowsCache();
    invalidateListDailyFromAdvanceCache();
  }

  /**
   * Merge user-provided form slices into the stored document.
   * Non-scheduled serials are written only to `ns_fhr_collection`.
   */
  async upsertMerge(
    SerialNo: number,
    dto: UpsertFhrCollectionDto,
    reason: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<FhrCollectionDocument> {
    const routeToNs = await this.shouldRouteSerialToNsFhr(SerialNo, dto);
    if (routeToNs) {
      const nsDoc = await this.nsFhrCollectionService.upsertMerge(
        SerialNo,
        dto,
        reason,
        station,
      );
      await this.deleteStrayScheduledFhrCopy(SerialNo);
      return nsDoc as unknown as FhrCollectionDocument;
    }

    const hasRafPayload =
      dto.rafAdhocDetails !== undefined || dto.rafCleaningServices !== undefined;
    const otherFormKeys: (keyof UpsertFhrCollectionDto)[] = [
      'terminalDetails',
      'loadControlDetails',
      'rampDetails1',
      'rampDetails3',
      'remarks',
      'equipmentManpower',
      'equipmentDetails',
      'attachments',
      'reports',
    ];
    const hasOtherForms =
      otherFormKeys.some((k) => dto[k] !== undefined) ||
      dto.rampDetails2 !== undefined;

    if (hasRafPayload) {
      const rafDoc = await this.rafCollectionService.upsertMerge(
        SerialNo,
        {
          mainDetails: dto.mainDetails as Record<string, unknown> | undefined,
          rafAdhocDetails: dto.rafAdhocDetails ?? undefined,
          rafCleaningServices: dto.rafCleaningServices ?? undefined,
        },
        reason,
        station,
      );
      // RAF-only writes (Ramp Assistance forms / Excel seed) stay out of fhr_collection.
      if (!hasOtherForms) {
        return rafDoc as unknown as FhrCollectionDocument;
      }
    }

    const set: Record<string, unknown> = {
      lastSnapshotAt: new Date(),
      lastSnapshotReason: reason,
    };
    const formKeys: (keyof UpsertFhrCollectionDto)[] = [
      'mainDetails',
      'terminalDetails',
      'loadControlDetails',
      'rampDetails1',
      'rampDetails3',
      'remarks',
      'equipmentManpower',
      'equipmentDetails',
      'attachments',
      'reports',
      // RAF payloads live in raf_collection — never write onto fhr_collection.
    ];
    for (const k of formKeys) {
      if (dto[k] === undefined) continue;
      if (k === 'equipmentDetails' && Array.isArray(dto.equipmentDetails)) {
        set.equipmentDetails = normalizeFhrEquipmentDetailItems(dto.equipmentDetails);
        continue;
      }
      if (
        k === 'mainDetails' &&
        dto.mainDetails &&
        typeof dto.mainDetails === 'object'
      ) {
        set.mainDetails = {
          ...(dto.mainDetails as object),
          SerialNo:
            (dto.mainDetails as { SerialNo?: number }).SerialNo ?? SerialNo,
          flightSerialNumber:
            (dto.mainDetails as { flightSerialNumber?: number })
              .flightSerialNumber ?? SerialNo,
        } as object;
        const md = dto.mainDetails as Record<string, unknown>;
        if (md.shareFhrToAirline === false) {
          set.airlineFhrEmailSentAt = null;
          set.airlineFhrEmailTo = '';
          set.shareFhrToAirline = false;
        } else if (md.shareFhrToAirline === true) {
          set.shareFhrToAirline = true;
        }
        if (md.shareReportsToGhRep === false) {
          set.ghRepLockedReportsEmailSentAt = null;
          set.ghRepLockedReportsEmailTo = '';
          set.shareReportsToGhRep = false;
        } else if (md.shareReportsToGhRep === true) {
          set.shareReportsToGhRep = true;
        }
        continue;
      }
      set[k] = dto[k] as object;
    }
    if (dto.rampDetails2 !== undefined) {
      set.rampDetails2 = dto.rampDetails2;
    }
    const updated = await this.fhrModel
      .findOneAndUpdate(
        { SerialNo },
        {
          $set: { SerialNo, flightSerialNumber: SerialNo, ...set },
          $unset: { rafAdhocDetails: 1, rafCleaningServices: 1 },
          // Insert-only: never re-stamp an existing (incl. legacy MAA) document.
          $setOnInsert: { stationCode: this.stampStationCode(station) },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!updated) {
      throw new NotFoundException('fhr_collection upsert failed');
    }
    const plain =
      typeof (updated as { toObject?: () => Record<string, unknown> })
        .toObject === 'function'
        ? (updated as { toObject: () => Record<string, unknown> }).toObject()
        : (updated as unknown as Record<string, unknown>);
    const staDates = FhrCollectionService.computeStaDatesFromLeanDoc(plain);
    const prev = Array.isArray(plain.staDates)
      ? (plain.staDates as string[])
      : [];
    if (!staDatesArraysEqual(prev, staDates)) {
      await this.fhrModel
        .updateOne({ SerialNo }, { $set: { staDates } })
        .exec();
    }
    const affectedYmd = new Set<string>();
    for (const ddMm of [...prev, ...staDates]) {
      const ymd = FhrCollectionService.ddMmYyyyToYmd(ddMm);
      if (ymd) affectedYmd.add(ymd);
    }
    this.scheduleFhrMutateCallbacks({
      serialNo: SerialNo,
      slice: FhrCollectionService.primaryMutateSliceFromDto(dto),
      affectedDates: [...affectedYmd],
    });
    return updated;
  }

  private static primaryMutateSliceFromDto(
    dto: UpsertFhrCollectionDto,
  ): string | undefined {
    const order: (keyof UpsertFhrCollectionDto)[] = [
      'remarks',
      'equipmentDetails',
      'equipmentManpower',
      'mainDetails',
      'terminalDetails',
      'loadControlDetails',
      'rampDetails1',
      'rampDetails3',
      'attachments',
      'reports',
      'rampDetails2',
    ];
    for (const key of order) {
      if (dto[key] !== undefined) return String(key);
    }
    return undefined;
  }

  /**
   * Single lean `fhr_collection` row (or null) — no NotFound. Used to hydrate scheduled UI when
   * operational sub-collections were never written but FHR was seeded/merged in `fhr_collection` only.
   */
  async getLeanFhrBySerial(
    SerialNo: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Record<string, unknown> | null> {
    if (!Number.isFinite(SerialNo)) return null;
    // Prefer NS when the serial is non-scheduled (same rule as findBySerial).
    const nsDoc = await this.nsFhrCollectionService.getLeanBySerial(
      SerialNo,
      station,
    );
    if (nsDoc != null) return nsDoc;

    const doc = await this.fhrModel
      .findOne(
        StationScope.filter(
          { $or: [{ SerialNo }, { flightSerialNumber: SerialNo }] },
          station,
        ),
      )
      .lean()
      .exec();
    const raf = await this.rafCollectionService.getLeanBySerial(SerialNo, station);
    if (doc != null) {
      return this.mergeRafFieldsOntoDoc(
        doc as unknown as Record<string, unknown>,
        raf,
      );
    }
    return raf;
  }

  /** Overlay raf_collection payload onto an FHR lean doc for RAF form/billing readers. */
  private mergeRafFieldsOntoDoc(
    fhr: Record<string, unknown>,
    raf: Record<string, unknown> | null,
  ): Record<string, unknown> {
    if (!raf) {
      const cleaned = { ...fhr };
      delete cleaned.rafAdhocDetails;
      delete cleaned.rafCleaningServices;
      return cleaned;
    }
    return {
      ...fhr,
      mainDetails: raf.mainDetails ?? fhr.mainDetails,
      rafAdhocDetails: raf.rafAdhocDetails ?? null,
      rafCleaningServices: raf.rafCleaningServices ?? null,
    };
  }

  private static serialKeysFromFhrDoc(d: Record<string, unknown>): number[] {
    return [d.SerialNo, d.flightSerialNumber]
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));
  }

  /**
   * True when the lean FHR row has GSE the scheduled export / GSE report can render:
   * named `equipmentDetails` lines, or an `equipmentManpower.entries` embed.
   */
  private static fhrDocHasEquipmentPayload(
    doc: Record<string, unknown> | undefined,
  ): boolean {
    if (!doc) return false;
    const details = Array.isArray(doc.equipmentDetails)
      ? doc.equipmentDetails
      : [];
    for (const row of details) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const name = String(
        o.equipment_name ?? o.equipmentName ?? o.equipmentNo ?? '',
      ).trim();
      if (name) return true;
    }
    const embed = doc.equipmentManpower as
      | { entries?: unknown[] }
      | null
      | undefined;
    return Array.isArray(embed?.entries) && embed.entries.length > 0;
  }

  /**
   * Collision rule for batch FHR lookup. `GET /fhr-collection/flight/:id` prefers NS
   * so an empty scheduled stub cannot hide GSE. Batch used to query scheduled first
   * and skip NS entirely when that stub existed — scheduled data export then missed
   * equipment the GSE report still showed. Prefer the doc that actually has GSE;
   * tie-break NS (same as the single-flight GET).
   */
  private static pickBatchFhrDoc(
    scheduled: Record<string, unknown> | undefined,
    ns: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    const scheduledHas =
      FhrCollectionService.fhrDocHasEquipmentPayload(scheduled);
    const nsHas = FhrCollectionService.fhrDocHasEquipmentPayload(ns);
    if (nsHas && !scheduledHas) return ns;
    if (scheduledHas && !nsHas) return scheduled;
    return ns ?? scheduled;
  }

  /**
   * Batch lookup: one `$in` query for many candidate serials (numeric `SerialNo` or
   * `flightSerialNumber`) instead of N sequential per-flight round trips. Used by the
   * Scheduled data export page to resolve many flights' FHR docs in a single request.
   * Keyed by every matching numeric serial value on the doc, so callers can look up
   * by any candidate token they tried (primary/table/legacy serial variants).
   */
  async getLeanFhrDocsBatch(
    serials: number[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Map<number, Record<string, unknown>>> {
    const unique = Array.from(
      new Set(serials.filter((n) => Number.isFinite(n))),
    );
    const wanted = new Set(unique);
    const out = new Map<number, Record<string, unknown>>();
    if (unique.length === 0) return out;

    const [docs, nsMap] = await Promise.all([
      this.fhrModel
        .find(
          StationScope.filter(
            {
              $or: [
                { SerialNo: { $in: unique } },
                { flightSerialNumber: { $in: unique } },
              ],
            },
            station,
          ),
        )
        .lean()
        .exec(),
      this.nsFhrCollectionService.getLeanDocsBatch(unique, station),
    ]);

    const scheduledBySerial = new Map<number, Record<string, unknown>>();
    for (const doc of docs) {
      const d = doc as unknown as Record<string, unknown>;
      for (const n of FhrCollectionService.serialKeysFromFhrDoc(d)) {
        if (wanted.has(n) && !scheduledBySerial.has(n)) {
          scheduledBySerial.set(n, d);
        }
      }
    }

    for (const n of unique) {
      const picked = FhrCollectionService.pickBatchFhrDoc(
        scheduledBySerial.get(n),
        nsMap.get(n),
      );
      if (picked) out.set(n, picked);
    }
    return out;
  }

  /**
   * Latest `fhr_collection` row for airline + flight number lookup in Scheduled Airlines find-record flow.
   */
  async findLatestLeanByAirlineFlight(
    airline: string,
    flightNo: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Record<string, unknown> | null> {
    const al = String(airline ?? '')
      .trim()
      .toLowerCase();
    const fn = String(flightNo ?? '')
      .trim()
      .toUpperCase();
    if (!al || !fn) return null;
    const rows = await this.fhrModel
      .find(StationScope.filter({}, station), {
        SerialNo: 1,
        flightSerialNumber: 1,
        mainDetails: 1,
        terminalDetails: 1,
        updatedAt: 1,
      })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    for (const row of rows) {
      const main =
        row.mainDetails && typeof row.mainDetails === 'object'
          ? (row.mainDetails as unknown as Record<string, unknown>)
          : {};
      const terminal =
        row.terminalDetails && typeof row.terminalDetails === 'object'
          ? (row.terminalDetails as unknown as Record<string, unknown>)
          : {};
      const rowAirline = FhrCollectionService.nonEmpty(
        terminal.airlinesOperator,
        main.Airline,
        main.airline,
      ).toLowerCase();
      const rowFlight = FhrCollectionService.nonEmpty(
        terminal.FlightNo,
        main.FlightNo,
        main.ArrivalFltNo,
        main.DepartureFltNo,
      ).toUpperCase();
      if (rowAirline === al && rowFlight === fn) {
        return row as unknown as Record<string, unknown>;
      }
    }
    return null;
  }

  /** Map SerialNo → lean FHR row (batch, for `listDailyFromAdvance` merge). */
  async getLeanFhrBySerialsMap(
    serials: number[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Map<number, Record<string, unknown>>> {
    const m = new Map<number, Record<string, unknown>>();
    const uniq = [...new Set(serials.filter((n) => Number.isFinite(n)))];
    if (uniq.length === 0) return m;
    const rows = await this.fhrModel
      .find(
        StationScope.filter(
          {
            $or: [
              { SerialNo: { $in: uniq } },
              { flightSerialNumber: { $in: uniq } },
            ],
          },
          station,
        ),
      )
      .lean()
      .exec();
    for (const d of rows) {
      const plain = d as {
        SerialNo?: number;
        flightSerialNumber?: number;
      };
      const lean = d as unknown as Record<string, unknown>;
      const keys = new Set<number>();
      if (Number.isFinite(plain.SerialNo)) keys.add(Number(plain.SerialNo));
      if (Number.isFinite(plain.flightSerialNumber)) {
        keys.add(Number(plain.flightSerialNumber));
      }
      for (const k of keys) m.set(k, lean);
    }

    const missing = uniq.filter((n) => !m.has(n));
    if (missing.length > 0) {
      const nsMap = await this.nsFhrCollectionService.getLeanDocsBatch(
        missing,
        station,
      );
      for (const [n, lean] of nsMap) {
        if (!m.has(n)) m.set(n, lean);
      }
    }
    return m;
  }

  /** `dd/MM/yyyy` → `yyyy-MM-dd` for daily aggregate keys. */
  static ddMmYyyyToYmd(ddMmYyyy: string): string | null {
    const parts = String(ddMmYyyy ?? '')
      .trim()
      .split('/');
    if (parts.length !== 3 || parts[2].length !== 4) return null;
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    return `${parts[2]}-${m}-${d}`;
  }

  /** Flattened STA labels (dd/MM/yyyy) from terminal + ramp embeds — indexed as `staDates`. */
  static computeStaDatesFromLeanDoc(
    doc: {
      terminalDetails?: Record<string, unknown> | null;
      rampDetails1?: Record<string, unknown> | null;
      rampDetails3?: Record<string, unknown> | null;
    } | null,
  ): string[] {
    if (!doc) return [];
    return computeStaDatesFromEmbeds(
      doc.terminalDetails,
      doc.rampDetails1,
      doc.rampDetails3,
    );
  }

  /**
   * True when `fhr_collection` already has the operational embeds written by flat
   * spreadsheet import (main / terminal / ramp / load-control). Used to skip
   * re-seeding rows that are already complete for a serial + station.
   */
  async isSpreadsheetOperationalSeedComplete(
    SerialNo: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<boolean> {
    if (!Number.isFinite(SerialNo) || SerialNo <= 0) return false;

    const doc = await this.fhrModel
      .findOne(
        StationScope.filter(
          { $or: [{ SerialNo }, { flightSerialNumber: SerialNo }] },
          station,
        ),
      )
      .select({
        mainDetails: 1,
        terminalDetails: 1,
        rampDetails1: 1,
        loadControlDetails: 1,
      })
      .lean()
      .exec();

    if (!doc) return false;

    return (
      FhrCollectionService.embedHasOperationalFields(doc.mainDetails) &&
      FhrCollectionService.embedHasOperationalFields(doc.terminalDetails) &&
      FhrCollectionService.embedHasOperationalFields(doc.rampDetails1) &&
      FhrCollectionService.embedHasOperationalFields(doc.loadControlDetails)
    );
  }

  /** Non-empty object embed with at least one meaningful field beyond identity keys. */
  private static embedHasOperationalFields(
    embed: unknown,
  ): boolean {
    if (embed == null || typeof embed !== 'object' || Array.isArray(embed)) {
      return false;
    }
    const skip = new Set([
      '_id',
      '__v',
      'SerialNo',
      'serialNo',
      'flightSerialNumber',
      'stationCode',
      'createdAt',
      'updatedAt',
    ]);
    for (const [key, val] of Object.entries(embed as Record<string, unknown>)) {
      if (skip.has(key)) continue;
      if (val == null) continue;
      if (typeof val === 'string' && val.trim() === '') continue;
      if (Array.isArray(val) && val.length === 0) continue;
      return true;
    }
    return false;
  }

  /**
   * Rebuild indexed `staDates` from terminal/ramp embeds (post-import / repair).
   * Scoped to the caller's station when not cross-station.
   */
  async reindexStaDatesFromEmbeds(
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<number> {
    const filter = station.crossStation
      ? {}
      : StationScope.filter({}, station);
    const rows = await this.fhrModel
      .find(filter)
      .select({
        _id: 1,
        staDates: 1,
        terminalDetails: 1,
        rampDetails1: 1,
        rampDetails3: 1,
      })
      .lean()
      .exec();

    let updated = 0;
    for (const row of rows) {
      const staDates = FhrCollectionService.computeStaDatesFromLeanDoc(
        row as {
          terminalDetails?: Record<string, unknown> | null;
          rampDetails1?: Record<string, unknown> | null;
          rampDetails3?: Record<string, unknown> | null;
        },
      );
      const prev = Array.isArray(row.staDates) ? (row.staDates as string[]) : [];
      if (!staDatesArraysEqual(prev, staDates)) {
        await this.fhrModel
          .updateOne({ _id: row._id }, { $set: { staDates } })
          .exec();
        updated += 1;
      }
    }
    if (updated > 0) {
      this.invalidateStaWindowRowsCache();
      invalidateListDailyFromAdvanceCache();
    }
    return updated;
  }

  /**
   * Indexed `staDates $in` plus legacy branch (missing/empty staDates + nested STADate `$in`).
   * Keeps parity with documents not yet backfilled.
   */
  private static scheduledMergeFilterForDates(
    dateStrings: string[],
  ): Record<string, unknown> {
    return fhrStaDatesRangeFilter(dateStrings);
  }

  /** Default STA calendar window when callers omit date filters — matches Scheduled Airlines UI defaults (Feb 28–Mar 31 2026). */
  private static readonly DEFAULT_SCHEDULED_MERGE_FROM_YMD = '2026-02-28';
  private static readonly DEFAULT_SCHEDULED_MERGE_TO_YMD = '2026-03-31';

  /**
   * Minimal projection for scheduled merge / finalize paths.
   * - Includes `staDates` so filters align with indexed paths (explain plans reference staDates).
   * - Keeps `mainDetails` — required by `appendFhrCollectionRowsToDaily` (airline, legs, ATA/Times).
   * - `_id: 0` trims BSON id bytes over the wire from Atlas.
   * Note: With nested embeds this cannot be a fully “covered” query (documents still fetch subdocs).
   */
  private static readonly SCHEDULED_MERGE_PROJECTION = {
    _id: 0,
    stationCode: 1,
    staDates: 1,
    SerialNo: 1,
    flightSerialNumber: 1,
    mainDetails: 1,
    terminalDetails: 1,
    rampDetails1: 1,
    rampDetails3: 1,
    loadControlDetails: 1,
    equipmentManpower: 1,
    equipmentDetails: 1,
  };

  /** Lean fields for dashboard airline-remarks rating aggregation (STA + cancel + rating only). */
  private static readonly AIRLINE_REMARKS_AGG_PROJECTION = {
    _id: 0,
    SerialNo: 1,
    flightSerialNumber: 1,
    isCancelled: 1,
    mainDetails: 1,
    terminalDetails: 1,
    rampDetails1: 1,
    rampDetails3: 1,
    'remarks.airlineRemarksRating': 1,
    'remarks.flightStaDateIso': 1,
  };

  /**
   * One query for Bird dashboard secondary cards: scheduled merge fields + airline remarks.
   * Avoids three separate Mongo scans for airline remarks, aircraft mix, and equipment util.
   */
  private static readonly DASHBOARD_BUNDLE_PROJECTION = {
    ...FhrCollectionService.SCHEDULED_MERGE_PROJECTION,
    isCancelled: 1,
    /** Last persistence time on `fhr_collection` (cancellation history export). */
    updatedAt: 1,
    'remarks.airlineRemarksRating': 1,
    'remarks.AirlineRemarksRating': 1,
    'remarks.flightStaDateIso': 1,
    'remarks.airlineRemarks': 1,
    'remarks.AirRepRem': 1,
    'remarks.airrep': 1,
  };

  private static readonly STA_WINDOW_ROWS_CACHE_TTL_MS = 5 * 60 * 1000;
  private static readonly STA_WINDOW_ROWS_CACHE_MAX_ENTRIES = 12;

  private sweepStaWindowRowsCache(now = Date.now()): void {
    for (const [key, entry] of this.staWindowRowsCache) {
      if (entry.expiresAt <= now) this.staWindowRowsCache.delete(key);
    }
    while (this.staWindowRowsCache.size > FhrCollectionService.STA_WINDOW_ROWS_CACHE_MAX_ENTRIES) {
      let oldestKey: string | undefined;
      let oldestExp = Infinity;
      for (const [key, entry] of this.staWindowRowsCache) {
        if (entry.expiresAt < oldestExp) {
          oldestExp = entry.expiresAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      this.staWindowRowsCache.delete(oldestKey);
    }
  }

  /** Above ~3 weeks of calendar keys, split `$in` into parallel chunks (Promise.all) to overlap RTTs. */
  private static scheduledMergeParallelMinDays(): number {
    const n = Number(process.env.FHR_MERGE_PARALLEL_MIN_DAYS);
    return Number.isFinite(n) && n > 0 ? n : 21;
  }

  /** Days per `$in` chunk when parallel mode is active (env override). */
  private static scheduledMergeChunkDays(): number {
    const n = Number(process.env.FHR_MERGE_CHUNK_DAYS);
    return Number.isFinite(n) && n > 0 ? n : 10;
  }

  /** Partition contiguous dd/MM lists into slices for chunked queries. */
  private static chunkDdMmYyyyStrings(
    list: string[],
    chunkSize: number,
  ): string[][] {
    if (chunkSize <= 0 || list.length <= chunkSize) return [list];
    const chunks: string[][] = [];
    for (let i = 0; i < list.length; i += chunkSize) {
      chunks.push(list.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /** Same operational serial wins — preserves one doc when overlap occurs across STA buckets. */
  /** True when any indexed/embed STA day falls inside [fromYmd, toYmd] (inclusive). */
  private static fhrDocMatchesStaYmdWindow(
    doc: Record<string, unknown>,
    fromYmd: string,
    toYmd: string,
  ): boolean {
    const staDates = Array.isArray(doc.staDates) ? doc.staDates : [];
    for (const raw of staDates) {
      const ymd = ymdFromDdMmYyyy(normalizeDateDdMmYyyy(String(raw ?? '')));
      if (ymd && ymd >= fromYmd && ymd <= toYmd) return true;
    }
    const m = doc.mainDetails as Record<string, unknown> | null | undefined;
    const td = doc.terminalDetails as
      | Record<string, unknown>
      | null
      | undefined;
    const r1 = doc.rampDetails1 as Record<string, unknown> | null | undefined;
    const r3 = doc.rampDetails3 as Record<string, unknown> | null | undefined;
    for (const raw of [
      td?.STADate,
      td?.staDate,
      r1?.STADate,
      r1?.staDate,
      r3?.STADate,
      m?.STADate,
      m?.staDate,
    ]) {
      const ymd = ymdFromDdMmYyyy(normalizeDateDdMmYyyy(String(raw ?? '')));
      if (ymd && ymd >= fromYmd && ymd <= toYmd) return true;
    }
    return false;
  }

  /**
   * Advance schedule masters (`scheduleId` = 6-digit setup serial) are sometimes missed by
   * `{ staDates: { $in: [...] } }` when stored dates use a legacy shape. Load masters and
   * match in-process with normalized calendar keys.
   */
  /**
   * Rebuild indexed `staDates` on an advance master from `advance_schedule_setup` when a
   * prior refreshFromSourceCollections replace cleared them.
   */
  private async repairAdvanceMasterStaDatesFromStaging(
    scheduleSerial: string,
  ): Promise<string[]> {
    const sid = String(scheduleSerial ?? '').trim();
    if (!/^\d{6}$/.test(sid)) return [];
    try {
      const col = this.fhrModel.db.collection('advance_schedule_setup');
      const adv = (await col.findOne({ serialNo: sid })) as {
        data?: Record<string, unknown>;
      } | null;
      if (!adv?.data || typeof adv.data !== 'object') return [];
      const count = await this.upsertAdvanceScheduleMasterToFhr(sid, adv.data);
      if (count === 0) return [];
      const refreshed = await this.fhrModel
        .findOne({ SerialNo: Number(sid) })
        .select({ staDates: 1 })
        .lean()
        .exec();
      const dates = Array.isArray(refreshed?.staDates)
        ? (refreshed!.staDates as string[])
        : [];
      return dates
        .map((d) => normalizeDateDdMmYyyy(String(d ?? '')))
        .filter(Boolean);
    } catch (err: unknown) {
      this.logger.warn(
        `repairAdvanceMasterStaDatesFromStaging failed serial=${sid}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  private async fetchAdvanceScheduleMasterSupplementForStaWindow(
    dateStrings: string[],
  ): Promise<Array<Record<string, unknown>>> {
    const fromYmd = ymdFromDdMmYyyy(
      normalizeDateDdMmYyyy(String(dateStrings[0] ?? '')),
    );
    const toYmd = ymdFromDdMmYyyy(
      normalizeDateDdMmYyyy(String(dateStrings[dateStrings.length - 1] ?? '')),
    );
    if (!fromYmd || !toYmd) return [];

    const variants = expandStaDateQueryVariants(dateStrings);
    const out: Array<Record<string, unknown>> = [];
    const cursor = this.fhrModel
      .find({
        scheduleId: { $exists: true, $type: 'string', $regex: /^\d{6}$/ },
      })
      .select(FhrCollectionService.SCHEDULED_MERGE_PROJECTION)
      .lean()
      .cursor();

    for await (const doc of cursor) {
      const row = doc as unknown as Record<string, unknown>;
      let normalizedStaDates = (Array.isArray(row.staDates) ? row.staDates : [])
        .map((d) => normalizeDateDdMmYyyy(String(d ?? '')))
        .filter(Boolean);

      const scheduleSerial = String(row.scheduleId ?? '').trim();
      if (normalizedStaDates.length === 0 && /^\d{6}$/.test(scheduleSerial)) {
        const repaired =
          await this.repairAdvanceMasterStaDatesFromStaging(scheduleSerial);
        if (repaired.length > 0) normalizedStaDates = repaired;
      }

      const uniqueStaDates = [...new Set(normalizedStaDates)].sort();
      if (uniqueStaDates.length > 0) {
        row.staDates = uniqueStaDates;
        const serial = FhrCollectionService.leanDocInstanceSerial(row);
        const rawStaDates = Array.isArray(doc.staDates) ? doc.staDates : [];
        const needsPersist =
          JSON.stringify([...rawStaDates].sort()) !==
          JSON.stringify(uniqueStaDates);
        if (needsPersist && serial != null) {
          void this.fhrModel
            .updateOne(
              { SerialNo: serial },
              { $set: { staDates: uniqueStaDates } },
            )
            .exec()
            .catch((err: unknown) => {
              this.logger.warn(
                `staDates normalize persist failed serial=${serial}: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
        }
      }

      const matchesNormalized = FhrCollectionService.fhrDocMatchesStaYmdWindow(
        row,
        fromYmd,
        toYmd,
      );
      const matchesVariants =
        uniqueStaDates.length > 0 &&
        uniqueStaDates.some((d) => variants.includes(d));
      if (matchesNormalized || matchesVariants) {
        out.push(row);
      }
    }
    return out;
  }

  private static dedupeScheduledMergeRows<
    T extends { SerialNo?: unknown; flightSerialNumber?: unknown },
  >(rows: T[]): T[] {
    const bySerial = new Map<number, T>();
    for (const doc of rows) {
      const sn = FhrCollectionService.leanDocInstanceSerial(doc);
      if (sn != null) bySerial.set(sn, doc);
    }
    return [...bySerial.values()];
  }

  /** Cursor streaming fetch for one `$in` bucket (indexed staDates path + legacy branch unchanged). */
  private async fetchScheduledMergeRowsChunk(dateStrings: string[]): Promise<{
    rows: unknown[];
    queryMs: number;
  }> {
    const filter =
      FhrCollectionService.scheduledMergeFilterForDates(dateStrings);
    const t0 = Date.now();
    const rows: unknown[] = [];
    const cursor = this.fhrModel
      .find(filter)
      .select(FhrCollectionService.SCHEDULED_MERGE_PROJECTION)
      .lean()
      .cursor();
    for await (const doc of cursor) {
      rows.push(doc);
    }
    return { rows, queryMs: Date.now() - t0 };
  }

  private async fetchAirlineRemarksAggRowsChunk(
    dateStrings: string[],
  ): Promise<{
    rows: unknown[];
    queryMs: number;
  }> {
    const filter =
      FhrCollectionService.scheduledMergeFilterForDates(dateStrings);
    const t0 = Date.now();
    const rows: unknown[] = [];
    const cursor = this.fhrModel
      .find(filter)
      .select(FhrCollectionService.AIRLINE_REMARKS_AGG_PROJECTION)
      .lean()
      .cursor();
    for await (const doc of cursor) {
      rows.push(doc);
    }
    return { rows, queryMs: Date.now() - t0 };
  }

  private async fetchDashboardBundleRowsChunk(dateStrings: string[]): Promise<{
    rows: unknown[];
    queryMs: number;
  }> {
    const filter =
      FhrCollectionService.scheduledMergeFilterForDates(dateStrings);
    const t0 = Date.now();
    const rows: unknown[] = [];
    const cursor = this.fhrModel
      .find(filter)
      .select(FhrCollectionService.DASHBOARD_BUNDLE_PROJECTION)
      .lean()
      .cursor();
    for await (const doc of cursor) {
      rows.push(doc);
    }
    return { rows, queryMs: Date.now() - t0 };
  }

  private static staWindowRowsCacheKey(dateStrings: string[]): string {
    if (dateStrings.length === 0) return '';
    if (dateStrings.length === 1) return dateStrings[0];
    return `${dateStrings[0]}..${dateStrings[dateStrings.length - 1]}:${dateStrings.length}`;
  }

  /** Drop cached STA-window rows (e.g. after FHR merge). */
  invalidateStaWindowRowsCache(dateStrings?: string[]): void {
    if (!dateStrings?.length) {
      this.staWindowRowsCache.clear();
      this.staWindowRowsInflight.clear();
      return;
    }
    const key = FhrCollectionService.staWindowRowsCacheKey(dateStrings);
    this.staWindowRowsCache.delete(key);
    this.staWindowRowsInflight.delete(key);
  }

  /**
   * One Mongo scan per STA date window (cached 5 min). Used by scheduled-airlines list and
   * dashboard secondary cards so the dashboard does not repeat a 40s+ Atlas read.
   */
  private async loadStaWindowRowsCached(dateStrings: string[]): Promise<{
    rows: Array<Record<string, unknown>>;
    wallMs: number;
    cacheHit: boolean;
  }> {
    const effectiveDateStrings =
      dateStrings && dateStrings.length > 0
        ? dateStrings
        : FhrCollectionService.ymdRangeToDdMmYyyyList(
            FhrCollectionService.DEFAULT_SCHEDULED_MERGE_FROM_YMD,
            FhrCollectionService.DEFAULT_SCHEDULED_MERGE_TO_YMD,
          );
    const key =
      FhrCollectionService.staWindowRowsCacheKey(effectiveDateStrings);
    const now = Date.now();
    this.sweepStaWindowRowsCache(now);
    const cached = this.staWindowRowsCache.get(key);
    if (cached && cached.expiresAt > now) {
      this.logger.debug(
        `[fhr_perf] staWindowRows cacheHit key=${key} rows=${cached.rows.length}`,
      );
      return { rows: cached.rows, wallMs: cached.wallMs, cacheHit: true };
    }

    const inflight = this.staWindowRowsInflight.get(key);
    if (inflight) {
      this.logger.debug(`[fhr_perf] staWindowRows inflightJoin key=${key}`);
      const joined = await inflight;
      return { rows: joined.rows, wallMs: joined.wallMs, cacheHit: true };
    }

    const loadPromise = (async (): Promise<{
      rows: Array<Record<string, unknown>>;
      wallMs: number;
    }> => {
      const wallStart = Date.now();
      if (process.env.FHR_EXPLAIN_MERGE === '1') {
        await this.logScheduledMergeExplain(effectiveDateStrings);
      }

      const parallelMin = FhrCollectionService.scheduledMergeParallelMinDays();
      const chunkDays = FhrCollectionService.scheduledMergeChunkDays();
      const useParallel =
        effectiveDateStrings.length > parallelMin &&
        effectiveDateStrings.length > chunkDays;

      let rows: Array<Record<string, unknown>>;
      if (useParallel) {
        const chunks = FhrCollectionService.chunkDdMmYyyyStrings(
          effectiveDateStrings,
          chunkDays,
        );
        const partial = await Promise.all(
          chunks.map((chunk) => this.fetchDashboardBundleRowsChunk(chunk)),
        );
        const flat = partial.flatMap((p) => p.rows) as Array<
          Record<string, unknown>
        >;
        rows = FhrCollectionService.dedupeScheduledMergeRows(flat);
      } else {
        const one =
          await this.fetchDashboardBundleRowsChunk(effectiveDateStrings);
        rows = one.rows as Array<Record<string, unknown>>;
      }

      const supplement =
        await this.fetchAdvanceScheduleMasterSupplementForStaWindow(
          effectiveDateStrings,
        );
      if (supplement.length > 0) {
        rows = FhrCollectionService.dedupeScheduledMergeRows([
          ...rows,
          ...supplement,
        ]);
        this.logger.log(
          `[fhr_perf] staWindowRows advance supplement key=${key} added=${supplement.length} total=${rows.length}`,
        );
      }

      const wallMs = Date.now() - wallStart;
      this.staWindowRowsCache.set(key, {
        expiresAt:
          Date.now() + FhrCollectionService.STA_WINDOW_ROWS_CACHE_TTL_MS,
        rows,
        wallMs,
      });
      this.sweepStaWindowRowsCache();
      this.logger.log(
        `[fhr_perf] staWindowRows cacheMiss key=${key} rows=${rows.length} wallMs=${wallMs}`,
      );
      return { rows, wallMs };
    })();

    this.staWindowRowsInflight.set(key, loadPromise);
    try {
      const loaded = await loadPromise;
      return { ...loaded, cacheHit: false };
    } finally {
      this.staWindowRowsInflight.delete(key);
    }
  }

  private async findLeanForAirlineRemarksAgg(
    dateStrings: string[],
  ): Promise<unknown[]> {
    const parallelMin = FhrCollectionService.scheduledMergeParallelMinDays();
    const chunkDays = FhrCollectionService.scheduledMergeChunkDays();
    const useParallel =
      dateStrings.length > parallelMin && dateStrings.length > chunkDays;

    if (useParallel) {
      const chunks = FhrCollectionService.chunkDdMmYyyyStrings(
        dateStrings,
        chunkDays,
      );
      const partial = await Promise.all(
        chunks.map((chunk) => this.fetchAirlineRemarksAggRowsChunk(chunk)),
      );
      const flat = partial.flatMap((p) => p.rows) as Array<{
        SerialNo?: unknown;
        flightSerialNumber?: unknown;
      }>;
      return FhrCollectionService.dedupeScheduledMergeRows(flat);
    }

    const one = await this.fetchAirlineRemarksAggRowsChunk(dateStrings);
    return one.rows;
  }

  /** Optional executionStats sample log — enable `FHR_EXPLAIN_MERGE=1` (staging/profiling only). */
  private async logScheduledMergeExplain(dateStrings: string[]): Promise<void> {
    try {
      const filter =
        FhrCollectionService.scheduledMergeFilterForDates(dateStrings);
      const explain = await this.fhrModel
        .find(filter)
        .select(FhrCollectionService.SCHEDULED_MERGE_PROJECTION)
        .limit(300)
        .explain('executionStats');
      const explainUnknown = explain as unknown;
      const x = explainUnknown as Record<string, unknown>;
      const stats = x.executionStats as Record<string, unknown> | undefined;
      const qp = x.queryPlanner as Record<string, unknown> | undefined;
      const wp = qp?.winningPlan as Record<string, unknown> | undefined;
      this.logger.warn(
        `[fhr_perf_explain] stage=${String(wp?.stage ?? '')} ` +
          `nReturned=${String(stats?.nReturned ?? '')} ` +
          `totalDocsExamined=${String(stats?.totalDocsExamined ?? '')} ` +
          `executionTimeMillis=${String(stats?.executionTimeMillis ?? '')}`,
      );
    } catch (err) {
      this.logger.warn(`[fhr_perf_explain] explain failed: ${err}`);
    }
  }

  /**
   * Used to build Scheduled Airlines rows from `fhr_collection`.
   *
   * Pass `dateStrings` (dd/MM/yyyy covering the requested window). If omitted or empty, uses the
   * Scheduled Airlines default window **2026-02-28 → 2026-03-31** so the default flights tab stays
   * aligned with the UI and returns the full indexed `$in` set (not an unbounded `{}` scan).
   *
   * Projection includes all sub-documents needed by both `appendFhrCollectionRowsToDaily`
   * and `finalizeDailyFhrCollectionOnly` so the result can be reused and the second
   * `getLeanFhrBySerialsMap` round-trip is eliminated.
   *
   * Results stream via a cursor (incremental driver reads; steady memory for large result sets).
   */
  async findAllLeanForScheduledTableMerge(
    dateStrings?: string[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<
    Array<{
      SerialNo?: number;
      flightSerialNumber?: number;
      mainDetails?: Record<string, unknown> | null;
      terminalDetails?: Record<string, unknown> | null;
      rampDetails1?: Record<string, unknown> | null;
      rampDetails3?: Record<string, unknown> | null;
      loadControlDetails?: Record<string, unknown> | null;
      equipmentManpower?: Record<string, unknown> | null;
      equipmentDetails?: unknown[] | null;
    }>
  > {
    const perfTimers = process.env.FHR_PERF_TIMERS === '1';
    if (perfTimers) console.time('mongoQuery');

    const effectiveDateStrings =
      dateStrings && dateStrings.length > 0
        ? dateStrings
        : FhrCollectionService.ymdRangeToDdMmYyyyList(
            FhrCollectionService.DEFAULT_SCHEDULED_MERGE_FROM_YMD,
            FhrCollectionService.DEFAULT_SCHEDULED_MERGE_TO_YMD,
          );

    const { rows, wallMs, cacheHit } =
      await this.loadStaWindowRowsCached(effectiveDateStrings);

    // The window scan cache is shared across stations (a server-side optimization).
    // Apply station visibility in-memory here so each caller only sees its own
    // station's rows; legacy unstamped rows are MAA-only (legacy-aware rule).
    const scoped = FhrCollectionService.filterRowsByStation(rows, station);
    const withoutNsLabels = scoped.filter(
      (row) => !isNonScheduledFhrDoc(row as Record<string, unknown>),
    );
    const serials = withoutNsLabels
      .map((row) =>
        FhrCollectionService.leanDocInstanceSerial(
          row as { SerialNo?: unknown; flightSerialNumber?: unknown },
        ),
      )
      .filter((n): n is number => n != null);
    const nsSerials =
      await this.nsFhrCollectionService.existingSerialsAnyStation(serials);
    const scheduledOnly = withoutNsLabels.filter((row) => {
      const sn = FhrCollectionService.leanDocInstanceSerial(
        row as { SerialNo?: unknown; flightSerialNumber?: unknown },
      );
      return sn == null || !nsSerials.has(sn);
    });

    if (perfTimers) console.timeEnd('mongoQuery');

    this.logger.debug(
      `[fhr_perf] rowsReturned=${scheduledOnly.length}/${rows.length} wallMs=${wallMs} cacheHit=${cacheHit}`,
    );
    return scheduledOnly as Array<{
      SerialNo?: number;
      flightSerialNumber?: number;
      mainDetails?: Record<string, unknown> | null;
      terminalDetails?: Record<string, unknown> | null;
      rampDetails1?: Record<string, unknown> | null;
      rampDetails3?: Record<string, unknown> | null;
      loadControlDetails?: Record<string, unknown> | null;
      equipmentManpower?: Record<string, unknown> | null;
      equipmentDetails?: unknown[] | null;
    }>;
  }

  /**
   * In-memory station visibility filter for rows pulled from a shared (cross-station)
   * scan cache. Mirrors the legacy-aware DB predicate: cross-station scopes keep
   * everything; MAA keeps its own + legacy unstamped/empty rows; any other station
   * keeps only exact `stationCode` matches.
   */
  private static filterRowsByStation<T extends Record<string, unknown>>(
    rows: T[],
    station: StationScopeContext,
  ): T[] {
    if (station.crossStation) return rows;
    const code = normalizeStationCode(station.stationCode);
    if (!code) return rows;
    const isLegacyStation = code === LEGACY_STATION_CODE;
    return rows.filter((row) => {
      const rowCode = normalizeStationCode(
        (row as { stationCode?: unknown }).stationCode as string | undefined,
      );
      if (!rowCode) return isLegacyStation;
      return rowCode === code;
    });
  }

  /**
   * Single lean fetch for Bird dashboard secondary cards (airline remarks + aircraft mix + equipment util).
   * Reuses {@link loadStaWindowRowsCached} — same scan as scheduled-airlines list.
   */
  async findAllLeanForDashboardBundle(
    dateStrings: string[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{
    rows: Array<{
      SerialNo?: number;
      flightSerialNumber?: number;
      isCancelled?: boolean;
      mainDetails?: Record<string, unknown> | null;
      terminalDetails?: Record<string, unknown> | null;
      rampDetails1?: Record<string, unknown> | null;
      rampDetails3?: Record<string, unknown> | null;
      loadControlDetails?: Record<string, unknown> | null;
      equipmentManpower?: Record<string, unknown> | null;
      equipmentDetails?: unknown[] | null;
      remarks?: Record<string, unknown> | null;
    }>;
    queryMs: number;
    cacheHit: boolean;
  }> {
    const effectiveDateStrings =
      dateStrings && dateStrings.length > 0
        ? dateStrings
        : FhrCollectionService.ymdRangeToDdMmYyyyList(
            FhrCollectionService.DEFAULT_SCHEDULED_MERGE_FROM_YMD,
            FhrCollectionService.DEFAULT_SCHEDULED_MERGE_TO_YMD,
          );

    const { rows, wallMs, cacheHit } =
      await this.loadStaWindowRowsCached(effectiveDateStrings);

    // The window scan cache is shared across stations; apply station visibility
    // in-memory so each station's dashboard only aggregates its own rows
    // (legacy unstamped rows are MAA-only — legacy-aware rule).
    const scoped = FhrCollectionService.filterRowsByStation(rows, station);

    this.logger.debug(
      `[dash_secondary] bundleRowsReturned=${scoped.length}/${rows.length} wallMs=${wallMs} cacheHit=${cacheHit}`,
    );
    return {
      rows: scoped as Array<{
        SerialNo?: number;
        flightSerialNumber?: number;
        isCancelled?: boolean;
        mainDetails?: Record<string, unknown> | null;
        terminalDetails?: Record<string, unknown> | null;
        rampDetails1?: Record<string, unknown> | null;
        rampDetails3?: Record<string, unknown> | null;
        loadControlDetails?: Record<string, unknown> | null;
        equipmentManpower?: Record<string, unknown> | null;
        equipmentDetails?: unknown[] | null;
        remarks?: Record<string, unknown> | null;
      }>,
      queryMs: wallMs,
      cacheHit,
    };
  }

  /**
   * Parse `fromDate` / `tillDate` query (yyyy-MM-dd or dd/MM/yyyy) to `yyyy-MM-dd`.
   */
  static queryParamToYmd(param?: string): string | null {
    const s = String(param ?? '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
    if (m) {
      const d = m[1].padStart(2, '0');
      const mo = m[2].padStart(2, '0');
      return `${m[3]}-${mo}-${d}`;
    }
    return null;
  }

  /** Generate all dd/MM/yyyy strings in a yyyy-MM-dd range (inclusive). */
  private static ymdRangeToDdMmYyyyList(
    fromYmd: string,
    toYmd: string,
  ): string[] {
    const list: string[] = [];
    const cur = new Date(`${fromYmd}T00:00:00Z`);
    const endMs = new Date(`${toYmd}T00:00:00Z`).getTime();
    while (cur.getTime() <= endMs) {
      const d = String(cur.getUTCDate()).padStart(2, '0');
      const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const y = cur.getUTCFullYear();
      list.push(`${d}/${m}/${y}`);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return list;
  }

  /**
   * Scheduled Airlines header tiles: same operating-day window and cancel rules as `listDailyFromAdvance`.
   * `handled` + `cancelled` = `total` (FHR documents with a resolvable STA or STD day in [fromYmd, toYmd]).
   */
  async getHandledAndCancelledForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{ handled: number; cancelled: number; total: number }> {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    if (!f || !t || f > t) {
      return { handled: 0, cancelled: 0, total: 0 };
    }
    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const rows = await this.findAllLeanForScheduledTableMerge(
      dateStrings,
      station,
    );
    let handled = 0;
    let cancelled = 0;
    for (const doc of rows) {
      const d = doc as Record<string, unknown>;
      const m = d.mainDetails as Record<string, unknown> | null | undefined;
      const td = d.terminalDetails as
        | Record<string, unknown>
        | null
        | undefined;
      const r1 = d.rampDetails1 as Record<string, unknown> | null | undefined;
      const r3 = d.rampDetails3 as Record<string, unknown> | null | undefined;
      const staYmd = FhrCollectionService.fhrDocumentStaYmd(
        m ?? undefined,
        td ?? undefined,
        r1,
        r3,
      );
      if (!staYmd || staYmd < f || staYmd > t) continue;
      if (FhrCollectionService.fhrLeanDocIsCancelled(d)) {
        cancelled += 1;
      } else {
        handled += 1;
      }
    }
    return {
      handled,
      cancelled,
      total: handled + cancelled,
    };
  }

  /**
   * Scheduled Airlines active-flights breakdown panel (dashboard FHR rules, STA operating-day window).
   */
  async getScheduledAirlinesActiveStatsForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    if (!f || !t || f > t) {
      return aggregateScheduledAirlinesActiveStatsFromLeanRows([], f, t);
    }
    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const rows = await this.findAllLeanForScheduledTableMerge(
      dateStrings,
      station,
    );
    return aggregateScheduledAirlinesActiveStatsFromLeanRows(rows, f, t);
  }

  /**
   * Bird dashboard airline remarks card: counts from `fhr_collection.remarks.airlineRemarksRating`
   * for non-cancelled flights with STA in [fromYmd, toYmd]. Blank rating → `Blanks` bucket.
   */
  async aggregateAirlineRemarksRatingsForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
  ): Promise<{
    from: string;
    to: string;
    total: number;
    blanks: number;
    buckets: { rating: string; count: number }[];
  }> {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (!ymd.test(f) || !ymd.test(t)) {
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    }
    if (f > t) {
      throw new BadRequestException('from must be on or before to');
    }

    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const rows = await this.findLeanForAirlineRemarksAgg(dateStrings);
    return this.aggregateAirlineRemarksRatingsFromLeanRows(rows, f, t);
  }

  aggregateAirlineRemarksRatingsFromLeanRows(
    rows: unknown[],
    fromYmd: string,
    toYmd: string,
  ): {
    from: string;
    to: string;
    total: number;
    blanks: number;
    buckets: { rating: string; count: number }[];
  } {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    const byRating = new Map<string, number>();
    for (const rating of AIRLINE_REMARKS_RATING_VALUES) {
      byRating.set(rating, 0);
    }
    let blanks = 0;
    let total = 0;

    for (const doc of rows) {
      const d = doc as Record<string, unknown>;
      const staYmd = FhrCollectionService.fhrDocStaYmdForAirlineRemarks(d);
      if (!staYmd || staYmd < f || staYmd > t) continue;
      if (FhrCollectionService.fhrLeanDocIsCancelled(d)) continue;

      total += 1;
      const rem = d.remarks as Record<string, unknown> | null | undefined;
      const rating = String(
        rem?.airlineRemarksRating ?? rem?.AirlineRemarksRating ?? '',
      ).trim();
      if (!rating) {
        blanks += 1;
        continue;
      }
      if (isAirlineRemarksRating(rating)) {
        byRating.set(rating, (byRating.get(rating) ?? 0) + 1);
      } else {
        blanks += 1;
      }
    }

    const buckets: { rating: string; count: number }[] =
      AIRLINE_REMARKS_RATING_VALUES.map((rating) => ({
        rating,
        count: byRating.get(rating) ?? 0,
      }));
    buckets.push({ rating: AIRLINE_REMARKS_BLANK_LABEL, count: blanks });
    return { from: f, to: t, total, blanks, buckets };
  }

  /** ATA/airline/meta from bundled `fhr_collection` dashboard lean row (embedded mainDetails keys). */
  private static ataAndFlightMetaFromDashboardLean(
    d: Record<string, unknown>,
  ): {
    ataDate: string;
    ataTime: string;
    aircraftType: string;
    airline: string;
    flightNo: string;
  } {
    const mdRaw = d.mainDetails;
    const md =
      mdRaw && typeof mdRaw === 'object' && !Array.isArray(mdRaw)
        ? (mdRaw as Record<string, unknown>)
        : null;
    const s = (v: unknown) => String(v ?? '').trim();
    if (!md)
      return {
        ataDate: '',
        ataTime: '',
        aircraftType: '',
        airline: '',
        flightNo: '',
      };
    return {
      ataDate: s(md.ATADate ?? md.ataDate),
      ataTime: s(md.ATATime ?? md.ataTime),
      aircraftType: s(md.TypeCraft ?? md.typeCraft),
      airline: s(md.Airline ?? md.airline),
      flightNo:
        s(md.ArrivalFltNo) ||
        s(md.DepartureFltNo) ||
        s(md.FlightNo ?? md.flightNo),
    };
  }

  private static airlineRepRemFromDashboardRemarks(
    rem: Record<string, unknown>,
  ): string {
    return String(
      rem.AirRepRem ?? rem.airlineRemarks ?? rem.airrep ?? rem.Air_rep ?? '',
    ).trim();
  }

  /**
   * Modal rows matching the airline-remarks KPI card counts: non-cancelled, STA window, rating from `fhr_collection.remarks`.
   * Reuses the same cached STA bundle as `/reports/dashboard-secondary-cards` (typically fast vs a second remarks scan).
   */
  async listDashboardAirlineRemarksDetailRows(
    fromYmd: string,
    toYmd: string,
  ): Promise<{
    from: string;
    to: string;
    rows: Array<{
      serialNo: number;
      airline: string;
      flightNo: string;
      aircraftType: string;
      ataDate: string;
      ataTime: string;
      airlineRepRem: string;
      airlineRemarksRating: string;
    }>;
  }> {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (!ymd.test(f) || !ymd.test(t)) {
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    }
    if (f > t) {
      throw new BadRequestException('from must be on or before to');
    }
    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const { rows: rawRows } =
      await this.findAllLeanForDashboardBundle(dateStrings);

    const out: Array<{
      serialNo: number;
      airline: string;
      flightNo: string;
      aircraftType: string;
      ataDate: string;
      ataTime: string;
      airlineRepRem: string;
      airlineRemarksRating: string;
    }> = [];

    for (const doc of rawRows) {
      const d = doc as Record<string, unknown>;
      const staYmd = FhrCollectionService.fhrDocStaYmdForAirlineRemarks(d);
      if (!staYmd || staYmd < f || staYmd > t) continue;
      if (FhrCollectionService.fhrLeanDocIsCancelled(d)) continue;

      const serial = FhrCollectionService.leanDocInstanceSerial(d);
      if (serial == null) continue;

      const rem =
        d.remarks && typeof d.remarks === 'object' && !Array.isArray(d.remarks)
          ? (d.remarks as Record<string, unknown>)
          : null;

      const ratingRaw = String(
        rem?.airlineRemarksRating ?? rem?.AirlineRemarksRating ?? '',
      ).trim();

      const ex = FhrCollectionService.ataAndFlightMetaFromDashboardLean(d);
      const airlineRepRem = rem
        ? FhrCollectionService.airlineRepRemFromDashboardRemarks(rem)
        : '';

      out.push({
        serialNo: serial,
        airline: ex.airline,
        flightNo: ex.flightNo,
        aircraftType: ex.aircraftType,
        ataDate: ex.ataDate,
        ataTime: ex.ataTime,
        airlineRepRem,
        airlineRemarksRating: ratingRaw,
      });
    }

    out.sort((a, b) => {
      const ra = `${a.airlineRemarksRating}`.localeCompare(
        `${b.airlineRemarksRating}`,
      );
      if (ra !== 0) return ra;
      if (a.serialNo !== b.serialNo) return a.serialNo - b.serialNo;
      return 0;
    });

    return { from: f, to: t, rows: out };
  }

  /**
   * Worker-only: compact airline-remark drill rows from an already-loaded STA lean bundle
   * (same filtering rules as {@link listDashboardAirlineRemarksDetailRows} — no Mongo calls).
   */
  extractAirlineRemarkDrillRowsFromLean(
    rawRows: unknown[],
    fromYmd: string,
    toYmd: string,
    remarkPreviewMax = 200,
  ): Array<{
    serialNo: number;
    airline: string;
    flightNo: string;
    ataDate: string;
    ataTime: string;
    airlineRemarksRating: string;
    remarkPreview: string;
  }> {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    const out: Array<{
      serialNo: number;
      airline: string;
      flightNo: string;
      ataDate: string;
      ataTime: string;
      airlineRemarksRating: string;
      remarkPreview: string;
    }> = [];

    for (const doc of rawRows) {
      const d = doc as Record<string, unknown>;
      const staYmd = FhrCollectionService.fhrDocStaYmdForAirlineRemarks(d);
      if (!staYmd || staYmd < f || staYmd > t) continue;
      if (FhrCollectionService.fhrLeanDocIsCancelled(d)) continue;

      const serial = FhrCollectionService.leanDocInstanceSerial(d);
      if (serial == null) continue;

      const rem =
        d.remarks && typeof d.remarks === 'object' && !Array.isArray(d.remarks)
          ? (d.remarks as Record<string, unknown>)
          : null;

      const ratingRaw = String(
        rem?.airlineRemarksRating ?? rem?.AirlineRemarksRating ?? '',
      ).trim();

      const ex = FhrCollectionService.ataAndFlightMetaFromDashboardLean(d);
      const fullRem = rem
        ? FhrCollectionService.airlineRepRemFromDashboardRemarks(rem)
        : '';
      const remarkPreview =
        fullRem.length <= remarkPreviewMax
          ? fullRem
          : `${fullRem.slice(0, remarkPreviewMax)}…`;

      out.push({
        serialNo: serial,
        airline: ex.airline,
        flightNo: ex.flightNo,
        ataDate: ex.ataDate,
        ataTime: ex.ataTime,
        airlineRemarksRating: ratingRaw,
        remarkPreview,
      });
    }

    out.sort((a, b) => {
      const ra = `${a.airlineRemarksRating}`.localeCompare(
        `${b.airlineRemarksRating}`,
      );
      if (ra !== 0) return ra;
      if (a.serialNo !== b.serialNo) return a.serialNo - b.serialNo;
      return 0;
    });

    return out;
  }

  private static fhrDocStaYmdForAirlineRemarks(
    doc: Record<string, unknown>,
  ): string | null {
    const rem = doc.remarks as Record<string, unknown> | null | undefined;
    const staFromRem = String(rem?.flightStaDateIso ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(staFromRem)) return staFromRem;

    const m = doc.mainDetails as Record<string, unknown> | null | undefined;
    const td = doc.terminalDetails as
      | Record<string, unknown>
      | null
      | undefined;
    const r1 = doc.rampDetails1 as Record<string, unknown> | null | undefined;
    const r3 = doc.rampDetails3 as Record<string, unknown> | null | undefined;
    const fromSchedule = FhrCollectionService.fhrDocumentStaYmd(
      m ?? undefined,
      td ?? undefined,
      r1,
      r3,
    );
    if (fromSchedule) return fromSchedule;

    if (!m) return null;
    for (const key of [
      'ATADate',
      'ataDate',
      'staDate',
      'IPosDate',
      'iposDate',
      'ATDDate',
      'atdDate',
      'etdDate',
    ]) {
      const iso = FhrCollectionService.mainEmbedDateToYmd(m[key]);
      if (iso) return iso;
    }
    return null;
  }

  private static mainEmbedDateToYmd(raw: unknown): string | null {
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text) return null;
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const norm = FhrCollectionService.normalizeDateDdMmYyyy(text);
    return norm ? FhrCollectionService.scheduleLabelToYmd(norm) : null;
  }

  /** Indian station IATA codes for route-based mix when `Cate_of_Flight` is blank. */
  private static readonly INDIAN_DOMESTIC_IATA = new Set([
    'MAA',
    'DEL',
    'BOM',
    'BLR',
    'CCU',
    'HYD',
    'AMD',
    'PNQ',
    'GAU',
    'COK',
    'TRV',
    'IXE',
    'GOI',
    'LKO',
    'PAT',
    'BBI',
    'IXB',
    'IXC',
    'IXR',
    'VTZ',
    'IDR',
    'JAI',
    'SXR',
    'UDR',
    'NAG',
    'IXJ',
    'ATQ',
    'CCJ',
    'IXZ',
    'RPR',
    'BHO',
    'DED',
    'JDH',
    'IXL',
    'SAG',
    'SHL',
    'PBD',
    'DIU',
    'KNU',
    'KQH',
    'AGX',
    'VGA',
  ]);

  /** Infer intl/domestic pax from route when category text is missing on the FHR row. */
  private static scheduledCategoryBaseFromRoute(
    routeRaw: string,
  ): 'intl_pax' | 'dom_pax' | 'intl_freight' | 'dom_freight' | null {
    const route = String(routeRaw ?? '').trim();
    if (!route) return null;
    const parts = route
      .split(/\s*[-–—/]\s*/)
      .map((p) => p.trim().toUpperCase())
      .filter((p) => /^[A-Z]{3}$/.test(p));
    if (parts.length === 0) return null;
    const hasIntl = parts.some(
      (p) => !FhrCollectionService.INDIAN_DOMESTIC_IATA.has(p),
    );
    return hasIntl ? 'intl_pax' : 'dom_pax';
  }

  /** Free-text for scheduled mix: flight category fields + turnaround (e.g. Domestic-International). */
  private static scheduledCategoryRawFromMainEmbed(
    m: Record<string, unknown>,
  ): string {
    const parts = [
      FhrCollectionService.firstString(
        m['Cate_of_Flight'],
        m['flightCategory'],
        m['Cate_of Flight'],
      ),
      FhrCollectionService.firstString(
        m['turnaroundStatus'],
        m['turnaround_status'],
        m['TurnaroundStatus'],
      ),
    ]
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);
    return parts.join(' ').trim();
  }

  /** Category base from embed text, else route inference (aircraft analysis card). */
  private static resolveScheduledCategoryBase(
    m: Record<string, unknown>,
    routeFallback?: string,
  ): 'intl_pax' | 'dom_pax' | 'intl_freight' | 'dom_freight' | null {
    const catRaw = FhrCollectionService.scheduledCategoryRawFromMainEmbed(m);
    const fromText =
      FhrCollectionService.scheduledCategoryBaseFromMainText(catRaw);
    if (fromText) return fromText;
    const route = FhrCollectionService.nonEmpty(
      routeFallback,
      m['Route'],
      m['routing'],
      m['Routing'],
    );
    return FhrCollectionService.scheduledCategoryBaseFromRoute(route);
  }

  /**
   * Operating segment from `mainDetails` free-text (category + turnaround).
   * Compound **domestic … international** (e.g. `domestic-international`) → international.
   * Compound **international … domestic** → domestic (last-mentioned segment wins for I/D).
   */
  private static scheduledCategoryBaseFromMainText(
    raw: string,
  ): 'intl_pax' | 'dom_pax' | 'intl_freight' | 'dom_freight' | null {
    const n = raw
      .trim()
      .toLowerCase()
      .replace(/->/g, ' ')
      .replace(/[-_/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!n) return null;

    const hasFreight = n.includes('cargo') || n.includes('freighter');
    const hasDom = n.includes('domestic');
    const hasIntl = n.includes('international');

    if (hasDom && hasIntl) {
      const lastDom = n.lastIndexOf('domestic');
      const lastIntl = n.lastIndexOf('international');
      const useDomestic = lastDom > lastIntl;
      if (hasFreight) return useDomestic ? 'dom_freight' : 'intl_freight';
      return useDomestic ? 'dom_pax' : 'intl_pax';
    }

    if (hasFreight) {
      if (hasDom) return 'dom_freight';
      return 'intl_freight';
    }
    if (n.startsWith('domestic')) return 'dom_pax';
    if (hasIntl) return 'intl_pax';
    if (hasDom) return 'dom_pax';
    return null;
  }

  /**
   * NB/WB: prefer `advance-aircraft` match on `TypeCraft`; else main-details embed heuristics.
   */
  private isWideBodyForScheduledCategoryMix(
    m: Record<string, unknown>,
    catalog: Map<string, 'NB' | 'WB'>,
  ): boolean {
    const stored = String(m['aircraftBody'] ?? m['AircraftBody'] ?? '')
      .trim()
      .toUpperCase();
    if (stored === 'WB' || stored.includes('WIDE')) return true;
    if (stored === 'NB' || stored.includes('NARROW')) return false;
    const tc = String(m['TypeCraft'] ?? '').trim();
    const hit = this.advanceAircraftService.matchCatalogAircraftBody(
      catalog,
      tc,
    );
    if (hit === 'WB') return true;
    if (hit === 'NB') return false;
    return FhrCollectionService.isWideBodyFromMainEmbed(m);
  }

  /** Narrow vs wide from `aircraftBody` / `TypeCraft` on the main-details embed. */
  private static isWideBodyFromMainEmbed(m: Record<string, unknown>): boolean {
    const ab = String(m['aircraftBody'] ?? m['AircraftBody'] ?? '')
      .trim()
      .toUpperCase();
    if (ab === 'WB' || ab.includes('WIDE')) return true;
    if (ab === 'NB' || ab.includes('NARROW')) return false;
    const tc = String(m['TypeCraft'] ?? '')
      .trim()
      .toUpperCase();
    const compact = tc.replace(/[^A-Z0-9]/g, '');
    if (
      /(?:777|787|767|747|MD11|DC10|B77[23WL]|B78[89X]|B76[234]|B74[0-8]|A3(?:00|10|3[2389]|4[2356]|5[09]|5K|8[08])|380|350|340|330|310|300|359)/.test(
        compact,
      )
    ) {
      return true;
    }
    return false;
  }

  private static schScheduledKey(
    base: 'intl_pax' | 'dom_pax' | 'intl_freight' | 'dom_freight',
    wide: boolean,
  ):
    | 'SCH-I-P-NB'
    | 'SCH-I-P-WB'
    | 'SCH-D-P-NB'
    | 'SCH-D-P-WB'
    | 'SCH-I-F-NB'
    | 'SCH-I-F-WB'
    | 'SCH-D-F-NB'
    | 'SCH-D-F-WB'
    | null {
    if (base === 'intl_pax') return wide ? 'SCH-I-P-WB' : 'SCH-I-P-NB';
    if (base === 'dom_pax') return wide ? 'SCH-D-P-WB' : 'SCH-D-P-NB';
    if (base === 'intl_freight') return wide ? 'SCH-I-F-WB' : 'SCH-I-F-NB';
    if (base === 'dom_freight') return wide ? 'SCH-D-F-WB' : 'SCH-D-F-NB';
    return null;
  }

  /**
   * SCH-*-*-* aircraft-analysis buckets count only **scheduled** handling rows from main details.
   * Excludes **Additional** (and other non-scheduled labels); blank / unknown handling excluded.
   */
  /** KPI strip handling bucket (not used by aircraft mix — see isScheduled/isAdditional below). */
  static classifyDashboardHandlingBucket(
    handlingRaw: string,
  ): 'scheduled' | 'additional' | null {
    const n = String(handlingRaw ?? '')
      .trim()
      .toUpperCase();
    if (!n) return null;
    if (/(^|[^A-Z])(ADDL|ADDITIONAL)([^A-Z]|$)/.test(n)) return 'additional';
    if (/(FERRY|DIVERTED|RETURN\s*TO\s*RAMP|LOAD\s*IN|LOAD\s*OUT)/.test(n)) {
      return 'additional';
    }
    if (n.includes('NON-SCHEDULED') || n.includes('NON SCHEDULED')) {
      return 'additional';
    }
    if (/(^|[^A-Z])(SCH|SCHEDULED|TURNAROUND)([^A-Z]|$)/.test(n)) {
      return 'scheduled';
    }
    return null;
  }

  /**
   * Canonical handling label from main-details embed (matches KPI strip + aircraft mix).
   */
  static resolveMainDetailsHandlingText(
    m: Record<string, unknown> | null | undefined,
  ): string {
    if (!m) return '';
    return FhrCollectionService.nonEmpty(
      m['TypeofHandling'],
      m['typeOfHandling'],
      m['typeofHandling'],
      m['Type_of_Handling'],
      m['Type of Handling'],
      m['Typeofflight'],
      m['typeofflight'],
      m['ops'],
      m['operations'],
      m['opsType'],
    ).trim();
  }

  /** Handling type from main + ramp embeds (dashboard KPI / aircraft). */
  static resolveFhrRowHandlingText(doc: Record<string, unknown>): string {
    const m = doc.mainDetails as Record<string, unknown> | null | undefined;
    const r1 = doc.rampDetails1 as Record<string, unknown> | null | undefined;
    const r3 = doc.rampDetails3 as Record<string, unknown> | null | undefined;
    return FhrCollectionService.nonEmpty(
      FhrCollectionService.resolveMainDetailsHandlingText(m),
      FhrCollectionService.resolveMainDetailsHandlingText(r1 ?? undefined),
      FhrCollectionService.resolveMainDetailsHandlingText(r3 ?? undefined),
    );
  }

  /**
   * Merge main-details with ramp/terminal fields used by dashboard aggregators
   * when main embed is sparse (common before forms are fully saved).
   */
  static mergeDashboardMainView(
    doc: Record<string, unknown>,
  ): Record<string, unknown> {
    const m = {
      ...((doc.mainDetails as Record<string, unknown> | null | undefined) ??
        {}),
    };
    const overlays = [
      doc.rampDetails1,
      doc.rampDetails3,
      doc.terminalDetails,
    ] as Array<Record<string, unknown> | null | undefined>;
    const keys = [
      'TypeofHandling',
      'typeOfHandling',
      'typeofHandling',
      'Typeofflight',
      'Cate_of_Flight',
      'flightCategory',
      'Route',
      'route',
      'routing',
      'Routing',
      'TypeCraft',
      'typeCraft',
      'aircraftBody',
      'AircraftBody',
      'ATADate',
      'ATATime',
      'ATDDate',
      'ATDTime',
      'turnaroundStatus',
      'turnaround_status',
      'TurnaroundStatus',
    ] as const;
    for (const src of overlays) {
      if (!src || typeof src !== 'object') continue;
      for (const key of keys) {
        if (
          !FhrCollectionService.nonEmpty(m[key]) &&
          FhrCollectionService.nonEmpty(src[key])
        ) {
          m[key] = src[key];
        }
      }
    }
    return m;
  }

  private static isScheduledTypeOfHandlingForSchMixBuckets(
    m: Record<string, unknown>,
  ): boolean {
    const raw = FhrCollectionService.resolveMainDetailsHandlingText(m);
    return (
      FhrCollectionService.classifyDashboardHandlingBucket(raw) === 'scheduled'
    );
  }

  /** Additional-flight mix buckets (ADDL label or ferry / diverted / load ops). */
  private static isAdditionalTypeOfHandlingForAdditionalMixBuckets(
    m: Record<string, unknown>,
  ): boolean {
    const raw = FhrCollectionService.resolveMainDetailsHandlingText(m);
    return (
      FhrCollectionService.classifyDashboardHandlingBucket(raw) === 'additional'
    );
  }

  private static emptyScheduledCategoryMixCounts(): {
    'SCH-I-P-NB': number;
    'SCH-I-P-WB': number;
    'SCH-D-P-NB': number;
    'SCH-D-P-WB': number;
    'SCH-I-F-NB': number;
    'SCH-I-F-WB': number;
    'SCH-D-F-NB': number;
    'SCH-D-F-WB': number;
  } {
    return {
      'SCH-I-P-NB': 0,
      'SCH-I-P-WB': 0,
      'SCH-D-P-NB': 0,
      'SCH-D-P-WB': 0,
      'SCH-I-F-NB': 0,
      'SCH-I-F-WB': 0,
      'SCH-D-F-NB': 0,
      'SCH-D-F-WB': 0,
    };
  }

  private static finalizeScheduledCategoryBreakdown(
    counts: ReturnType<
      typeof FhrCollectionService.emptyScheduledCategoryMixCounts
    >,
    other: number,
  ): {
    SIP: number;
    SIF: number;
    SDP: number;
    SDF: number;
    'SCH-I-P-NB': number;
    'SCH-I-P-WB': number;
    'SCH-D-P-NB': number;
    'SCH-D-P-WB': number;
    'SCH-I-F-NB': number;
    'SCH-I-F-WB': number;
    'SCH-D-F-NB': number;
    'SCH-D-F-WB': number;
    other: number;
    total: number;
  } {
    const sip = counts['SCH-I-P-NB'] + counts['SCH-I-P-WB'];
    const sif = counts['SCH-I-F-NB'] + counts['SCH-I-F-WB'];
    const sdp = counts['SCH-D-P-NB'] + counts['SCH-D-P-WB'];
    const sdf = counts['SCH-D-F-NB'] + counts['SCH-D-F-WB'];
    const total =
      counts['SCH-I-P-NB'] +
      counts['SCH-I-P-WB'] +
      counts['SCH-D-P-NB'] +
      counts['SCH-D-P-WB'] +
      counts['SCH-I-F-NB'] +
      counts['SCH-I-F-WB'] +
      counts['SCH-D-F-NB'] +
      counts['SCH-D-F-WB'] +
      other;
    return {
      SIP: sip,
      SIF: sif,
      SDP: sdp,
      SDF: sdf,
      ...counts,
      other,
      total,
    };
  }

  /**
   * Scheduled and **Additional** flight category counts from `fhr_collection.mainDetails` plus NB/WB from
   * `advance-aircraft` when `TypeCraft` matches the catalog (fallback: main embed heuristics).
   * Same STA calendar-day window + cancel rules as {@link getHandledAndCancelledForStaYmdWindow}.
   *
   * **Scheduled** — same rules as before: `TypeofHandling` is `Scheduled` or `SCH` (never Additional / non-scheduled).
   * **Additional** — `TypeofHandling` text includes “additional”. Same I/D, P/F, NB/WB buckets as scheduled (SCH-* keys in JSON).
   */
  async getScheduledCategoryBreakdownForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
  ): Promise<{
    scheduled: {
      SIP: number;
      SIF: number;
      SDP: number;
      SDF: number;
      'SCH-I-P-NB': number;
      'SCH-I-P-WB': number;
      'SCH-D-P-NB': number;
      'SCH-D-P-WB': number;
      'SCH-I-F-NB': number;
      'SCH-I-F-WB': number;
      'SCH-D-F-NB': number;
      'SCH-D-F-WB': number;
      other: number;
      total: number;
    };
    additional: {
      SIP: number;
      SIF: number;
      SDP: number;
      SDF: number;
      'SCH-I-P-NB': number;
      'SCH-I-P-WB': number;
      'SCH-D-P-NB': number;
      'SCH-D-P-WB': number;
      'SCH-I-F-NB': number;
      'SCH-I-F-WB': number;
      'SCH-D-F-NB': number;
      'SCH-D-F-WB': number;
      other: number;
      total: number;
    };
  }> {
    const z = (): {
      scheduled: ReturnType<
        typeof FhrCollectionService.finalizeScheduledCategoryBreakdown
      >;
      additional: ReturnType<
        typeof FhrCollectionService.finalizeScheduledCategoryBreakdown
      >;
    } => ({
      scheduled: FhrCollectionService.finalizeScheduledCategoryBreakdown(
        FhrCollectionService.emptyScheduledCategoryMixCounts(),
        0,
      ),
      additional: FhrCollectionService.finalizeScheduledCategoryBreakdown(
        FhrCollectionService.emptyScheduledCategoryMixCounts(),
        0,
      ),
    });

    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    if (!f || !t || f > t) {
      return z();
    }

    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const rows = await this.findAllLeanForScheduledTableMerge(dateStrings);
    const bodyCatalog =
      await this.advanceAircraftService.getActiveAircraftBodyMap();
    return this.getScheduledCategoryBreakdownFromLeanRows(
      rows,
      f,
      t,
      bodyCatalog,
    );
  }

  getScheduledCategoryBreakdownFromLeanRows(
    rows: Array<{
      mainDetails?: Record<string, unknown> | null;
      terminalDetails?: Record<string, unknown> | null;
      rampDetails1?: Record<string, unknown> | null;
      rampDetails3?: Record<string, unknown> | null;
    }>,
    fromYmd: string,
    toYmd: string,
    bodyCatalog: Map<string, 'NB' | 'WB'>,
  ): {
    scheduled: ReturnType<
      typeof FhrCollectionService.finalizeScheduledCategoryBreakdown
    >;
    additional: ReturnType<
      typeof FhrCollectionService.finalizeScheduledCategoryBreakdown
    >;
  } {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    const z = (): {
      scheduled: ReturnType<
        typeof FhrCollectionService.finalizeScheduledCategoryBreakdown
      >;
      additional: ReturnType<
        typeof FhrCollectionService.finalizeScheduledCategoryBreakdown
      >;
    } => ({
      scheduled: FhrCollectionService.finalizeScheduledCategoryBreakdown(
        FhrCollectionService.emptyScheduledCategoryMixCounts(),
        0,
      ),
      additional: FhrCollectionService.finalizeScheduledCategoryBreakdown(
        FhrCollectionService.emptyScheduledCategoryMixCounts(),
        0,
      ),
    });
    if (!f || !t || f > t) {
      return z();
    }

    const schedCounts = FhrCollectionService.emptyScheduledCategoryMixCounts();
    let schedOther = 0;
    const addCounts = FhrCollectionService.emptyScheduledCategoryMixCounts();
    let addOther = 0;

    for (const doc of rows) {
      const d = doc as Record<string, unknown>;
      const m = FhrCollectionService.mergeDashboardMainView(d);
      const td = d.terminalDetails as
        | Record<string, unknown>
        | null
        | undefined;
      const r1 = d.rampDetails1 as Record<string, unknown> | null | undefined;
      const r3 = d.rampDetails3 as Record<string, unknown> | null | undefined;

      const staYmd = FhrCollectionService.fhrDocumentStaYmd(
        m,
        td ?? undefined,
        r1,
        r3,
      );
      if (!staYmd || staYmd < f || staYmd > t) continue;
      if (FhrCollectionService.fhrLeanDocIsCancelled(d)) continue;

      const isSched =
        FhrCollectionService.isScheduledTypeOfHandlingForSchMixBuckets(m);
      const isAdd =
        FhrCollectionService.isAdditionalTypeOfHandlingForAdditionalMixBuckets(
          m,
        );

      type Track = 'scheduled' | 'additional';
      let track: Track | null = null;
      if (isSched) track = 'scheduled';
      else if (isAdd) track = 'additional';
      else continue;

      const routeHint = FhrCollectionService.nonEmpty(
        m['Route'],
        r1?.['Route'],
        td?.['routing'],
      );
      const base = FhrCollectionService.resolveScheduledCategoryBase(
        m,
        routeHint,
      );
      if (!base) {
        if (track === 'scheduled') schedOther += 1;
        else addOther += 1;
        continue;
      }
      const wide = this.isWideBodyForScheduledCategoryMix(m, bodyCatalog);
      const key = FhrCollectionService.schScheduledKey(base, wide);
      if (key) {
        if (track === 'scheduled') schedCounts[key] += 1;
        else addCounts[key] += 1;
      } else {
        if (track === 'scheduled') schedOther += 1;
        else addOther += 1;
      }
    }

    return {
      scheduled: FhrCollectionService.finalizeScheduledCategoryBreakdown(
        schedCounts,
        schedOther,
      ),
      additional: FhrCollectionService.finalizeScheduledCategoryBreakdown(
        addCounts,
        addOther,
      ),
    };
  }

  /** Display flight no for scheduled-mix export rows (main arr/dep, else terminal/ramp FlightNo). */
  private static mixCountedFlightNoForExport(
    m: Record<string, unknown>,
    td?: Record<string, unknown> | null,
    r1?: Record<string, unknown> | null,
    r3?: Record<string, unknown> | null,
  ): string {
    const arr = FhrCollectionService.nonEmpty(
      m['ArrivalFltNo'],
      m['arrivalFltNo'],
    );
    const dep = FhrCollectionService.nonEmpty(
      m['DepartureFltNo'],
      m['departureFltNo'],
    );
    const t0 = td ?? {};
    const r1o = r1 ?? {};
    const r3o = r3 ?? {};
    const tFn = FhrCollectionService.nonEmpty(
      t0['FlightNo'],
      t0['flightNo'],
      r1o['FlightNo'],
      r1o['flightNo'],
      r3o['FlightNo'],
      '',
    );
    return FhrCollectionService.nonEmpty(
      FhrCollectionService.flightNoFromMainArrivalDeparture(arr, dep),
      tFn,
      m['FlightNo'],
      m['Flt_No'],
    );
  }

  /**
   * Flights that receive an SCH-*-*-* bucket in {@link getScheduledCategoryBreakdownForStaYmdWindow}
   * (STA window, non-cancelled, **mainDetails.TypeofHandling** scheduled only — excludes Additional, etc.).
   */
  async listScheduledMixCountedFlightsForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
  ): Promise<ScheduledMixCountedFlightRow[]> {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    if (!f || !t || f > t) {
      return [];
    }

    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const rows = await this.findAllLeanForScheduledTableMerge(dateStrings);
    const bodyCatalog =
      await this.advanceAircraftService.getActiveAircraftBodyMap();
    const out: ScheduledMixCountedFlightRow[] = [];

    for (const doc of rows) {
      const d = doc as Record<string, unknown>;
      const m = FhrCollectionService.mergeDashboardMainView(d);
      const td = d.terminalDetails as
        | Record<string, unknown>
        | null
        | undefined;
      const r1 = d.rampDetails1 as Record<string, unknown> | null | undefined;
      const r3 = d.rampDetails3 as Record<string, unknown> | null | undefined;

      const staYmd = FhrCollectionService.fhrDocumentStaYmd(
        m,
        td ?? undefined,
        r1,
        r3,
      );
      if (!staYmd || staYmd < f || staYmd > t) {
        continue;
      }
      if (FhrCollectionService.fhrLeanDocIsCancelled(d)) {
        continue;
      }

      if (!FhrCollectionService.isScheduledTypeOfHandlingForSchMixBuckets(m)) {
        continue;
      }

      const routeHint = FhrCollectionService.nonEmpty(
        m['Route'],
        r1?.['Route'],
        td?.['routing'],
      );
      const base = FhrCollectionService.resolveScheduledCategoryBase(
        m,
        routeHint,
      );
      if (!base) {
        continue;
      }
      const wide = this.isWideBodyForScheduledCategoryMix(m, bodyCatalog);
      const mixCategory = FhrCollectionService.schScheduledKey(base, wide);
      if (!mixCategory) {
        continue;
      }

      const segment: 'I' | 'D' =
        base === 'intl_pax' || base === 'intl_freight' ? 'I' : 'D';
      const passengerOrFreighter: 'P' | 'F' =
        base === 'intl_pax' || base === 'dom_pax' ? 'P' : 'F';
      const aircraftBody: 'NB' | 'WB' = wide ? 'WB' : 'NB';
      const catRaw = FhrCollectionService.scheduledCategoryRawFromMainEmbed(m);

      out.push({
        serialNo: FhrCollectionService.leanDocInstanceSerial(
          d as { SerialNo?: unknown; flightSerialNumber?: unknown },
        ),
        flightNo: FhrCollectionService.mixCountedFlightNoForExport(
          m,
          td,
          r1,
          r3,
        ),
        staYmd,
        mixCategory,
        typeofHandling: String(m['TypeofHandling'] ?? '').trim(),
        cateOfFlight: String(catRaw).trim(),
        typeCraftRaw: String(m['TypeCraft'] ?? '').trim(),
        segment,
        passengerOrFreighter,
        aircraftBody,
      });
    }

    out.sort((a, b) => {
      const ak = `${a.staYmd}\0${a.serialNo ?? 0}\0${a.flightNo}`;
      const bk = `${b.staYmd}\0${b.serialNo ?? 0}\0${b.flightNo}`;
      return ak.localeCompare(bk);
    });
    return out;
  }

  /**
   * Flights backing the dashboard "Aircraft analysis" split tables — both carrier
   * tracks (`scheduled` + `additional`) in one pass, tagged with their `SCH-*`
   * category bucket (or `'OTHER'` when the route/category can't be resolved).
   *
   * Uses the exact same source, STA window, cancel rules and classification as
   * {@link getScheduledCategoryBreakdownForStaYmdWindow}, so the per-bucket flight
   * counts here line up with the counts shown in the card tables.
   */
  async listAircraftAnalysisFlightsForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
    flightScope: 'scheduled' | 'nonScheduled' = 'scheduled',
  ): Promise<AircraftAnalysisFlightRow[]> {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    if (!f || !t || f > t) {
      return [];
    }

    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const rows =
      flightScope === 'nonScheduled'
        ? (
            await this.nsFhrCollectionService.findAllLeanForDashboardBundle(
              dateStrings,
            )
          ).rows
        : await this.findAllLeanForScheduledTableMerge(dateStrings);
    const bodyCatalog =
      await this.advanceAircraftService.getActiveAircraftBodyMap();
    const out: AircraftAnalysisFlightRow[] = [];

    for (const doc of rows) {
      const d = doc as Record<string, unknown>;
      const m = FhrCollectionService.mergeDashboardMainView(d);
      const td = d.terminalDetails as
        | Record<string, unknown>
        | null
        | undefined;
      const r1 = d.rampDetails1 as Record<string, unknown> | null | undefined;
      const r3 = d.rampDetails3 as Record<string, unknown> | null | undefined;

      const staYmd = FhrCollectionService.fhrDocumentStaYmd(
        m,
        td ?? undefined,
        r1,
        r3,
      );
      if (!staYmd || staYmd < f || staYmd > t) {
        continue;
      }
      if (FhrCollectionService.fhrLeanDocIsCancelled(d)) {
        continue;
      }

      const isSched =
        FhrCollectionService.isScheduledTypeOfHandlingForSchMixBuckets(m);
      const isAdd =
        FhrCollectionService.isAdditionalTypeOfHandlingForAdditionalMixBuckets(
          m,
        );
      const carrierType: AircraftAnalysisFlightRow['carrierType'] | null =
        isSched ? 'scheduled' : isAdd ? 'additional' : null;
      if (!carrierType) {
        continue;
      }

      const routeHint = FhrCollectionService.nonEmpty(
        m['Route'],
        r1?.['Route'],
        td?.['routing'],
      );
      const base = FhrCollectionService.resolveScheduledCategoryBase(
        m,
        routeHint,
      );
      let mixCategory: AircraftAnalysisFlightRow['mixCategory'] = 'OTHER';
      if (base) {
        const wide = this.isWideBodyForScheduledCategoryMix(m, bodyCatalog);
        const key = FhrCollectionService.schScheduledKey(base, wide);
        if (key) {
          mixCategory = key;
        }
      }

      const catRaw = FhrCollectionService.scheduledCategoryRawFromMainEmbed(m);
      const airline = FhrCollectionService.nonEmpty(
        m['Airline'],
        m['airline'],
        td?.['airlinesOperator'],
        td?.['Airline'],
        td?.['airline'],
        r1?.['airlinesOperator'],
        r3?.['airlinesOperator'],
        r3?.['Airline'],
      );
      const staDate = FhrCollectionService.nonEmpty(
        td?.['STADate'],
        td?.['staDate'],
        r1?.['STADate'],
        r1?.['staDate'],
        r3?.['STADate'],
        r3?.['staDate'],
        m['STADate'],
        m['staDate'],
      );
      const staTime = FhrCollectionService.nonEmpty(
        td?.['STATime'],
        td?.['sta'],
        r1?.['STATime'],
        r1?.['sta'],
        r3?.['STATime'],
        r3?.['sta'],
        m['STATime'],
        m['staTime'],
      );
      const stdDate = FhrCollectionService.nonEmpty(
        td?.['STDDate'],
        td?.['stdDate'],
        r1?.['STDDate'],
        r1?.['stdDate'],
        r3?.['STDDate'],
        r3?.['stdDate'],
        m['STDDate'],
        m['stdDate'],
      );
      const stdTime = FhrCollectionService.nonEmpty(
        td?.['STDTime'],
        td?.['std'],
        r1?.['STDTime'],
        r1?.['std'],
        r3?.['STDTime'],
        r3?.['std'],
        m['STDTime'],
        m['stdTime'],
      );
      const ataDate = FhrCollectionService.nonEmpty(
        m['ATADate'],
        m['ataDate'],
        r1?.['ATADate'],
        r1?.['ataDate'],
        td?.['ATADate'],
        td?.['ataDate'],
      );
      const ataTime = FhrCollectionService.nonEmpty(
        m['ATATime'],
        m['ataTime'],
        r1?.['ATATime'],
        r1?.['ataTime'],
        r1?.['ata'],
        td?.['ATATime'],
        td?.['ata'],
      );
      const atdDate = FhrCollectionService.nonEmpty(
        m['ATDDate'],
        m['atdDate'],
        r1?.['ATDDate'],
        r1?.['atdDate'],
        td?.['ATDDate'],
        td?.['atdDate'],
      );
      const atdTime = FhrCollectionService.nonEmpty(
        m['ATDTime'],
        m['atdTime'],
        r1?.['ATDTime'],
        r1?.['atdTime'],
        r1?.['atd'],
        td?.['ATDTime'],
        td?.['atd'],
      );
      out.push({
        serialNo: FhrCollectionService.leanDocInstanceSerial(
          d as { SerialNo?: unknown; flightSerialNumber?: unknown },
        ),
        flightNo: FhrCollectionService.mixCountedFlightNoForExport(
          m,
          td,
          r1,
          r3,
        ),
        staYmd,
        carrierType,
        mixCategory,
        typeofHandling: String(m['TypeofHandling'] ?? '').trim(),
        cateOfFlight: String(catRaw).trim(),
        typeCraftRaw: String(m['TypeCraft'] ?? '').trim(),
        airline,
        staDate,
        staTime,
        stdDate,
        stdTime,
        ataDate,
        ataTime,
        atdDate,
        atdTime,
      });
    }

    out.sort((a, b) => {
      const ak = `${a.staYmd}\0${a.serialNo ?? 0}\0${a.flightNo}`;
      const bk = `${b.staYmd}\0${b.serialNo ?? 0}\0${b.flightNo}`;
      return ak.localeCompare(bk);
    });
    return out;
  }

  /**
   * Performance report KPIs from `fhr_collection` only (same STA-day window + cancel rules as
   * {@link getHandledAndCancelledForStaYmdWindow}). Denominator for all percentages =
   * operated (non-cancelled) flights in range. Sub-counts skip legs missing required timestamps.
   */
  async getPerformanceReportForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
  ): Promise<FhrPerformanceReportDto> {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();

    const pct = (value: number, totalOperated: number): string =>
      totalOperated === 0 ? '0.0' : ((value / totalOperated) * 100).toFixed(1);

    const empty = (): FhrPerformanceReportDto => ({
      range: { fromYmd: f, toYmd: t },
      onTime: { count: 0, percentage: '0.0' },
      cancelled: { count: 0, percentage: '0.0' },
      offSkd: { count: 0, percentage: '0.0' },
      groundTimeSaved: { count: 0, percentage: '0.0' },
      departedBeforeStd: { count: 0, percentage: '0.0' },
      agtGtSgt: { count: 0, percentage: '0.0' },
      totalFlights: { count: 0, percentage: '0.0' },
    });

    if (!f || !t || f > t) {
      return empty();
    }

    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const rows = await this.findAllLeanForScheduledTableMerge(dateStrings);

    let cancelledCount = 0;
    let operatedCount = 0;
    let onTimeCount = 0;
    let groundTimeSaved = 0;
    let departedOnOrBeforeStd = 0;
    let agtGreaterSgt = 0;
    let skippedStaOutOfBand = 0;

    for (const doc of rows) {
      const d = doc as Record<string, unknown>;
      const m = d.mainDetails as Record<string, unknown> | null | undefined;
      const td = d.terminalDetails as
        | Record<string, unknown>
        | null
        | undefined;
      const r1 = d.rampDetails1 as Record<string, unknown> | null | undefined;
      const r3 = d.rampDetails3 as Record<string, unknown> | null | undefined;

      const staYmd = FhrCollectionService.fhrDocumentStaYmd(
        m ?? undefined,
        td ?? undefined,
        r1,
        r3,
      );
      if (!staYmd || staYmd < f || staYmd > t) {
        skippedStaOutOfBand += 1;
        continue;
      }

      if (FhrCollectionService.fhrLeanDocIsCancelled(d)) {
        cancelledCount += 1;
        continue;
      }
      operatedCount += 1;

      const lc = d.loadControlDetails as
        | Record<string, unknown>
        | null
        | undefined;
      const fullTimings = FhrCollectionService.performanceTimingMsFromFhrEmbeds(
        m ?? undefined,
        lc ?? undefined,
      );
      if (fullTimings) {
        const { ataMs, staMs, atdMs, stdMs } = fullTimings;
        if (ataMs === staMs && atdMs === stdMs) {
          onTimeCount += 1;
        }
        const AGT = atdMs - ataMs;
        const SGT = stdMs - staMs;
        /** Row 3A — OR of three conditions (matches staff definition). */
        let qualifiesGroundTimeSaved = false;
        if (atdMs <= stdMs) qualifiesGroundTimeSaved = true;
        if (atdMs > stdMs && AGT <= SGT) qualifiesGroundTimeSaved = true;
        if (atdMs < stdMs && AGT < SGT) qualifiesGroundTimeSaved = true;
        if (qualifiesGroundTimeSaved) groundTimeSaved += 1;
        if (AGT > SGT) {
          agtGreaterSgt += 1;
        }
      }

      const atdStd = FhrCollectionService.atdStdMsFromFhrEmbeds(
        m ?? undefined,
        lc ?? undefined,
      );
      if (atdStd && atdStd.atdMs <= atdStd.stdMs) {
        departedOnOrBeforeStd += 1;
      }
    }

    const TOTAL = operatedCount;

    const mergedRowTally = skippedStaOutOfBand + cancelledCount + operatedCount;
    if (mergedRowTally !== rows.length) {
      this.logger.error(
        `[fhr_performance_report] Row reconciliation: skippedSta=${skippedStaOutOfBand} + cancelled=${cancelledCount} + operated=${operatedCount} !== mergedRows=${rows.length}`,
      );
    }

    if (f === '2026-03-01' && t === '2026-03-31' && TOTAL !== 893) {
      this.logger.error(
        `[fhr_performance_report] March 2026 operated total expected 893, got ${TOTAL}`,
      );
    }

    if (groundTimeSaved > TOTAL) {
      this.logger.error(
        `[fhr_performance_report] Invalid ground time saved count ${groundTimeSaved} exceeds operated total ${TOTAL}`,
      );
    }

    return {
      range: { fromYmd: f, toYmd: t },
      onTime: { count: onTimeCount, percentage: pct(onTimeCount, TOTAL) },
      cancelled: {
        count: cancelledCount,
        percentage: pct(cancelledCount, TOTAL),
      },
      offSkd: { count: TOTAL, percentage: TOTAL === 0 ? '0.0' : '100.0' },
      groundTimeSaved: {
        count: groundTimeSaved,
        percentage: pct(groundTimeSaved, TOTAL),
      },
      departedBeforeStd: {
        count: departedOnOrBeforeStd,
        percentage: pct(departedOnOrBeforeStd, TOTAL),
      },
      agtGtSgt: { count: agtGreaterSgt, percentage: pct(agtGreaterSgt, TOTAL) },
      totalFlights: {
        count: TOTAL,
        percentage: TOTAL === 0 ? '0.0' : '100.0',
      },
    };
  }

  async getQualityReportScheduledTableForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
    airline?: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<
    Array<{
      code: string;
      airline: string;
      flights: number;
      cancels: number;
      additional: number;
      firstBagPct: number;
      lastBagPct: number;
      holdClosedPct: number;
      arrivalPax: number;
      departPax: number;
      arrivalCargo: number;
      departCargo: number;
      arrivalMail: number;
      departMail: number;
      arrivalBaggage: number;
      departBaggage: number;
      qualityScore: number;
    }>
  > {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    if (!f || !t || f > t) return [];

    const airlineFilter = String(airline ?? '')
      .trim()
      .toLowerCase();
    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const rows = await this.findAllLeanForScheduledTableMerge(dateStrings, station);

    type AggregateRow = {
      code: string;
      airline: string;
      flights: number;
      cancels: number;
      additional: number;
      firstBagAchieved: number;
      lastBagAchieved: number;
      holdClosedAchieved: number;
      arrivalPax: number;
      departPax: number;
      arrivalCargo: number;
      departCargo: number;
      arrivalMail: number;
      departMail: number;
      arrivalBaggage: number;
      departBaggage: number;
    };

    const byAirline = new Map<string, AggregateRow>();

    for (const doc of rows) {
      const d = doc as Record<string, unknown>;
      const m = d.mainDetails as Record<string, unknown> | null | undefined;
      const td = d.terminalDetails as
        | Record<string, unknown>
        | null
        | undefined;
      const r1 = d.rampDetails1 as Record<string, unknown> | null | undefined;
      const r3 = d.rampDetails3 as Record<string, unknown> | null | undefined;

      const staYmd = FhrCollectionService.fhrDocumentStaYmd(
        m ?? undefined,
        td ?? undefined,
        r1,
        r3,
      );
      if (!staYmd || staYmd < f || staYmd > t) continue;

      const airlineName = FhrCollectionService.nonEmpty(
        m?.Airline,
        td?.airlinesOperator,
        r1?.airlinesOperator,
        r3?.Airline,
      );
      if (!airlineName) continue;
      if (airlineFilter && airlineName.trim().toLowerCase() !== airlineFilter)
        continue;

      const key = airlineName.trim().toLowerCase();
      let aggregate = byAirline.get(key);
      if (!aggregate) {
        aggregate = {
          code: FhrCollectionService.qualityScheduledAirlineCode(m, td, r1, r3),
          airline: airlineName.trim(),
          flights: 0,
          cancels: 0,
          additional: 0,
          firstBagAchieved: 0,
          lastBagAchieved: 0,
          holdClosedAchieved: 0,
          arrivalPax: 0,
          departPax: 0,
          arrivalCargo: 0,
          departCargo: 0,
          arrivalMail: 0,
          departMail: 0,
          arrivalBaggage: 0,
          departBaggage: 0,
        };
        byAirline.set(key, aggregate);
      }

      aggregate.flights += 1;

      const cancelled = FhrCollectionService.fhrLeanDocIsCancelled(d);
      if (cancelled) {
        aggregate.cancels += 1;
      }

      if (
        !cancelled &&
        m &&
        typeof m === 'object' &&
        FhrCollectionService.isAdditionalTypeOfHandlingForAdditionalMixBuckets(
          m,
        )
      ) {
        aggregate.additional += 1;
      }

      aggregate.arrivalPax += FhrCollectionService.qualityMetricNumber(
        td?.arrivalpax,
        td?.passengerArrived,
      );
      aggregate.departPax += FhrCollectionService.qualityMetricNumber(
        td?.deppax,
        td?.departed,
      );
      aggregate.arrivalCargo += FhrCollectionService.qualityMetricNumber(
        r1?.cgoarr,
        r1?.arrivalCargoWeight,
      );
      aggregate.departCargo += FhrCollectionService.qualityMetricNumber(
        r1?.cgoactdep,
        r1?.depActualCargoWeight,
        r1?.cgoplan,
        r1?.depPlannedCargoWeight,
      );
      aggregate.arrivalMail += FhrCollectionService.qualityMetricNumber(
        r1?.mailarr,
        r1?.arrivalMailWeight,
      );
      aggregate.departMail += FhrCollectionService.qualityMetricNumber(
        r1?.mailactdep,
        r1?.depActualMailWeight,
        r1?.mailplan,
        r1?.depPlannedMailWeight,
      );
      aggregate.arrivalBaggage += FhrCollectionService.qualityMetricNumber(
        r1?.airlinecount,
        r1?.arrivalBag,
      );
      aggregate.departBaggage += FhrCollectionService.qualityMetricNumber(
        r1?.arrivalBaggageCount,
        r1?.departureBaggageCount,
        r1?.bagreco,
        td?.departureBag,
      );

      if (!cancelled) {
        const ataTime = FhrCollectionService.nonEmpty(
          m?.ATATime,
          m?.ataTime,
          r1?.ATATime,
          r1?.ataTime,
        );
        if (
          FhrCollectionService.qualityBagAchieved(
            ataTime,
            r1?.firstBagInBmaTime,
            15,
          )
        ) {
          aggregate.firstBagAchieved += 1;
        }
        if (
          FhrCollectionService.qualityBagAchieved(
            ataTime,
            r1?.lastBagInBmaTime,
            45,
          )
        ) {
          aggregate.lastBagAchieved += 1;
        }

        const stdTime = FhrCollectionService.nonEmpty(
          td?.STDTime,
          td?.std,
          r1?.STDTime,
          r1?.std,
          r3?.STDTime,
          r3?.std,
        );
        const holdClosedTime = FhrCollectionService.nonEmpty(
          r1?.lastActivityHoldTime,
          r1?.holdCloseMainDeckTime,
          r1?.holdCloseRearTime,
          r1?.holdCloseFrontTime,
          r1?.holdCloseBulkTime,
        );
        if (
          FhrCollectionService.qualityHoldClosed(stdTime, holdClosedTime, 5)
        ) {
          aggregate.holdClosedAchieved += 1;
        }
      }
    }

    return [...byAirline.values()]
      .map((row) => {
        const denominator = Math.max(1, row.flights);
        const firstBagPct = Math.round(
          (row.firstBagAchieved / denominator) * 100,
        );
        const lastBagPct = Math.round(
          (row.lastBagAchieved / denominator) * 100,
        );
        const holdClosedPct = Math.round(
          (row.holdClosedAchieved / denominator) * 100,
        );
        const qualityScore = Math.round(
          (firstBagPct + lastBagPct + holdClosedPct) / 3,
        );

        return {
          code: row.code,
          airline: row.airline,
          flights: row.flights,
          cancels: row.cancels,
          additional: row.additional,
          firstBagPct,
          lastBagPct,
          holdClosedPct,
          arrivalPax: Math.round(row.arrivalPax),
          departPax: Math.round(row.departPax),
          arrivalCargo: Math.round(row.arrivalCargo),
          departCargo: Math.round(row.departCargo),
          arrivalMail: Math.round(row.arrivalMail),
          departMail: Math.round(row.departMail),
          arrivalBaggage: Math.round(row.arrivalBaggage),
          departBaggage: Math.round(row.departBaggage),
          qualityScore,
        };
      })
      .sort((left, right) => {
        if (right.flights !== left.flights) return right.flights - left.flights;
        return left.airline.localeCompare(right.airline);
      });
  }

  /**
   * Recalculate First Bag / Last Bag / Hold Closed KPIs for the STA window,
   * stamp `qualityKpis` on each station-scoped FHR doc, and bust the STA cache.
   */
  async updateQualityFbLbHoldForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{
    updated: number;
    flights: number;
    firstBagOnTime: number;
    lastBagOnTime: number;
    holdClosedOnTime: number;
  }> {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    if (!f || !t || f > t) {
      return {
        updated: 0,
        flights: 0,
        firstBagOnTime: 0,
        lastBagOnTime: 0,
        holdClosedOnTime: 0,
      };
    }

    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const baseFilter =
      FhrCollectionService.scheduledMergeFilterForDates(dateStrings);
    const filter = station.crossStation
      ? baseFilter
      : StationScope.filter(baseFilter, station);

    const docs = await this.fhrModel
      .find(filter)
      .select({
        _id: 1,
        isCancelled: 1,
        mainDetails: 1,
        terminalDetails: 1,
        rampDetails1: 1,
        rampDetails3: 1,
      })
      .lean()
      .exec();

    let updated = 0;
    let firstBagOnTime = 0;
    let lastBagOnTime = 0;
    let holdClosedOnTime = 0;
    const nowIso = new Date().toISOString();
    const ops: Array<{
      updateOne: {
        filter: { _id: Types.ObjectId };
        update: {
          $set: {
            qualityKpis: {
              firstBagOnTime: boolean;
              lastBagOnTime: boolean;
              holdClosedOnTime: boolean;
              cancelled: boolean;
              computedAt: string;
            };
          };
        };
      };
    }> = [];

    for (const doc of docs) {
      const d = doc as unknown as Record<string, unknown>;
      const m = d.mainDetails as Record<string, unknown> | null | undefined;
      const td = d.terminalDetails as
        | Record<string, unknown>
        | null
        | undefined;
      const r1 = d.rampDetails1 as Record<string, unknown> | null | undefined;
      const r3 = d.rampDetails3 as Record<string, unknown> | null | undefined;

      const staYmd = FhrCollectionService.fhrDocumentStaYmd(
        m ?? undefined,
        td ?? undefined,
        r1,
        r3,
      );
      if (!staYmd || staYmd < f || staYmd > t) continue;

      const cancelled = FhrCollectionService.fhrLeanDocIsCancelled(d);
      let firstBag = false;
      let lastBag = false;
      let holdClosed = false;

      if (!cancelled) {
        const ataTime = FhrCollectionService.nonEmpty(
          m?.ATATime,
          m?.ataTime,
          r1?.ATATime,
          r1?.ataTime,
        );
        firstBag = FhrCollectionService.qualityBagAchieved(
          ataTime,
          r1?.firstBagInBmaTime,
          15,
        );
        lastBag = FhrCollectionService.qualityBagAchieved(
          ataTime,
          r1?.lastBagInBmaTime,
          45,
        );
        const stdTime = FhrCollectionService.nonEmpty(
          td?.STDTime,
          td?.std,
          r1?.STDTime,
          r1?.std,
          r3?.STDTime,
          r3?.std,
        );
        const holdClosedTime = FhrCollectionService.nonEmpty(
          r1?.lastActivityHoldTime,
          r1?.holdCloseMainDeckTime,
          r1?.holdCloseRearTime,
          r1?.holdCloseFrontTime,
          r1?.holdCloseBulkTime,
        );
        holdClosed = FhrCollectionService.qualityHoldClosed(
          stdTime,
          holdClosedTime,
          5,
        );
      }

      if (firstBag) firstBagOnTime += 1;
      if (lastBag) lastBagOnTime += 1;
      if (holdClosed) holdClosedOnTime += 1;

      const id = d._id as Types.ObjectId;
      ops.push({
        updateOne: {
          filter: { _id: id },
          update: {
            $set: {
              qualityKpis: {
                firstBagOnTime: firstBag,
                lastBagOnTime: lastBag,
                holdClosedOnTime: holdClosed,
                cancelled,
                computedAt: nowIso,
              },
            },
          },
        },
      });
      updated += 1;
    }

    if (ops.length > 0) {
      await this.fhrModel.bulkWrite(ops, { ordered: false });
    }

    this.invalidateStaWindowRowsCache(dateStrings);
    this.nsFhrCollectionService.invalidateStaWindowRowsCache(dateStrings);

    return {
      updated,
      flights: docs.length,
      firstBagOnTime,
      lastBagOnTime,
      holdClosedOnTime,
    };
  }

  /**
   * Non-scheduled quality table from `ns_fhr_collection` (station-scoped STA window).
   */
  async getQualityReportNonScheduledTableForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
    airline?: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<
    Array<{
      operator: string;
      flights: number;
      cancelNoOp: number;
      arrivalPax: number;
      departPax: number;
      arrivalCargo: number;
      departCargo: number;
      arrivalMail: number;
      departMail: number;
      arrivalBaggage: number;
      departBaggage: number;
    }>
  > {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    if (!f || !t || f > t) return [];

    const airlineFilter = String(airline ?? '')
      .trim()
      .toLowerCase();
    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const { rows } =
      await this.nsFhrCollectionService.findAllLeanForDashboardBundle(
        dateStrings,
        station,
      );

    type AggregateRow = {
      operator: string;
      flights: number;
      cancelNoOp: number;
      arrivalPax: number;
      departPax: number;
      arrivalCargo: number;
      departCargo: number;
      arrivalMail: number;
      departMail: number;
      arrivalBaggage: number;
      departBaggage: number;
    };

    const byOperator = new Map<string, AggregateRow>();

    for (const doc of rows) {
      const d = doc as Record<string, unknown>;
      const m = d.mainDetails as Record<string, unknown> | null | undefined;
      const td = d.terminalDetails as
        | Record<string, unknown>
        | null
        | undefined;
      const r1 = d.rampDetails1 as Record<string, unknown> | null | undefined;
      const r3 = d.rampDetails3 as Record<string, unknown> | null | undefined;

      const staYmd = FhrCollectionService.fhrDocumentStaYmd(
        m ?? undefined,
        td ?? undefined,
        r1,
        r3,
      );
      if (!staYmd || staYmd < f || staYmd > t) continue;

      const operator = FhrCollectionService.nonEmpty(
        m?.Airline,
        td?.airlinesOperator,
        r1?.airlinesOperator,
        r3?.Airline,
      );
      if (!operator) continue;
      if (airlineFilter && operator.trim().toLowerCase() !== airlineFilter)
        continue;

      const key = operator.trim().toLowerCase();
      let aggregate = byOperator.get(key);
      if (!aggregate) {
        aggregate = {
          operator: operator.trim(),
          flights: 0,
          cancelNoOp: 0,
          arrivalPax: 0,
          departPax: 0,
          arrivalCargo: 0,
          departCargo: 0,
          arrivalMail: 0,
          departMail: 0,
          arrivalBaggage: 0,
          departBaggage: 0,
        };
        byOperator.set(key, aggregate);
      }

      aggregate.flights += 1;
      if (FhrCollectionService.fhrLeanDocIsCancelled(d)) {
        aggregate.cancelNoOp += 1;
      }

      aggregate.arrivalPax += FhrCollectionService.qualityMetricNumber(
        td?.arrivalpax,
        td?.passengerArrived,
      );
      aggregate.departPax += FhrCollectionService.qualityMetricNumber(
        td?.deppax,
        td?.departed,
      );
      aggregate.arrivalCargo += FhrCollectionService.qualityMetricNumber(
        r1?.cgoarr,
        r1?.arrivalCargoWeight,
      );
      aggregate.departCargo += FhrCollectionService.qualityMetricNumber(
        r1?.cgoactdep,
        r1?.depActualCargoWeight,
        r1?.cgoplan,
        r1?.depPlannedCargoWeight,
      );
      aggregate.arrivalMail += FhrCollectionService.qualityMetricNumber(
        r1?.mailarr,
        r1?.arrivalMailWeight,
      );
      aggregate.departMail += FhrCollectionService.qualityMetricNumber(
        r1?.mailactdep,
        r1?.depActualMailWeight,
        r1?.mailplan,
        r1?.depPlannedMailWeight,
      );
      aggregate.arrivalBaggage += FhrCollectionService.qualityMetricNumber(
        r1?.airlinecount,
        r1?.arrivalBag,
      );
      aggregate.departBaggage += FhrCollectionService.qualityMetricNumber(
        r1?.arrivalBaggageCount,
        r1?.departureBaggageCount,
        r1?.bagreco,
        td?.departureBag,
      );
    }

    return [...byOperator.values()]
      .map((row) => ({
        operator: row.operator,
        flights: row.flights,
        cancelNoOp: row.cancelNoOp,
        arrivalPax: Math.round(row.arrivalPax),
        departPax: Math.round(row.departPax),
        arrivalCargo: Math.round(row.arrivalCargo),
        departCargo: Math.round(row.departCargo),
        arrivalMail: Math.round(row.arrivalMail),
        departMail: Math.round(row.departMail),
        arrivalBaggage: Math.round(row.arrivalBaggage),
        departBaggage: Math.round(row.departBaggage),
      }))
      .sort((left, right) => {
        if (right.flights !== left.flights) return right.flights - left.flights;
        return left.operator.localeCompare(right.operator);
      });
  }

  static fhrLeanDocIsCancelled(doc: Record<string, unknown>): boolean {
    if (doc.isCancelled === true) return true;
    const m = doc.mainDetails as Record<string, unknown> | null | undefined;
    const td = doc.terminalDetails as
      | Record<string, unknown>
      | null
      | undefined;
    const r1 = doc.rampDetails1 as Record<string, unknown> | null | undefined;
    const r3 = doc.rampDetails3 as Record<string, unknown> | null | undefined;
    return FhrCollectionService.fhrIsCancelled(
      m ?? undefined,
      td ?? undefined,
      r1,
      r3,
    );
  }

  /** HH:mm:ss for wall-clock combine (seconds default 0). */
  private static normalizeTimeToHms(input: unknown): string {
    const s = String(input ?? '')
      .trim()
      .replace(/\./g, ':');
    const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/.exec(s);
    if (!m) return '';
    const hh = Math.max(0, Math.min(23, Number(m[1])));
    const mm = Math.max(0, Math.min(59, Number(m[2])));
    const ss = Math.max(0, Math.min(59, Number(m[3] ?? 0)));
    if (Number.isNaN(hh) || Number.isNaN(mm) || Number.isNaN(ss)) return '';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  private static datetimeMsFromDdMmYyyyAndTime(
    dateRaw: unknown,
    timeRaw: unknown,
  ): number | null {
    const ds = FhrCollectionService.nonEmpty(String(dateRaw ?? ''));
    const ts = FhrCollectionService.normalizeTimeToHms(timeRaw);
    if (!ds || !ts) return null;
    const dn = FhrCollectionService.normalizeDateDdMmYyyy(ds);
    const d = FhrCollectionService.parseDdMmYyyy(dn);
    if (!d) return null;
    const parts = ts.split(':').map((x) => Number(x));
    d.setHours(parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, 0);
    const ms = d.getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  /**
   * Build ms from dd/mm date + time. If **date is blank** but time is present, try each fallback
   * date (same order as Bird client `timingField` / OTP): keeps overnight and same-turnaround
   * arithmetic correct for AGT = ATD−ATA and SGT = STD−STA.
   */
  private static datetimeMsFromDdMmYyyyAndTimeOrFallbackChain(
    dateRaw: unknown,
    timeRaw: unknown,
    fallbackDates: unknown[],
  ): number | null {
    const direct = FhrCollectionService.datetimeMsFromDdMmYyyyAndTime(
      dateRaw,
      timeRaw,
    );
    if (direct != null) return direct;
    const hasDate = FhrCollectionService.nonEmpty(String(dateRaw ?? '')) !== '';
    if (hasDate) return null;
    for (const fb of fallbackDates) {
      const ms = FhrCollectionService.datetimeMsFromDdMmYyyyAndTime(
        fb,
        timeRaw,
      );
      if (ms != null) return ms;
    }
    return null;
  }

  static performanceTimingMsFromFhrEmbeds(
    main: Record<string, unknown> | undefined,
    lc: Record<string, unknown> | undefined,
  ): {
    ataMs: number;
    staMs: number;
    atdMs: number;
    stdMs: number;
  } | null {
    if (!main || !lc) return null;

    const staDate = lc.STADate ?? lc.staDate;
    const stdDate = lc.STDDate ?? lc.stdDate;
    const staTime = lc.STATime ?? lc.staTime;
    const stdTime = lc.STDTime ?? lc.stdTime;

    const ataDate = main.ATADate ?? main.ataDate;
    const ataTime = main.ATATime ?? main.ataTime;
    const atdDate = main.ATDDate ?? main.atdDate;
    const atdTime = main.ATDTime ?? main.atdTime;

    const ataMs =
      FhrCollectionService.datetimeMsFromDdMmYyyyAndTimeOrFallbackChain(
        ataDate,
        ataTime,
        [staDate],
      );
    const staMs =
      FhrCollectionService.datetimeMsFromDdMmYyyyAndTimeOrFallbackChain(
        staDate,
        staTime,
        [stdDate],
      );
    const stdMs =
      FhrCollectionService.datetimeMsFromDdMmYyyyAndTimeOrFallbackChain(
        stdDate,
        stdTime,
        [staDate],
      );
    const atdMs =
      FhrCollectionService.datetimeMsFromDdMmYyyyAndTimeOrFallbackChain(
        atdDate,
        atdTime,
        [ataDate, staDate],
      );

    if (ataMs == null || staMs == null || atdMs == null || stdMs == null) {
      return null;
    }
    return { ataMs, staMs, atdMs, stdMs };
  }

  /** @deprecated expanded ramp/terminal timing path — use {@link performanceTimingMsFromFhrEmbeds}. */
  private static performanceTimingMsFromFhrEmbedsExpanded(
    main: Record<string, unknown> | undefined,
    lc: Record<string, unknown> | undefined,
    terminal?: Record<string, unknown> | undefined,
    ramp1?: Record<string, unknown> | null,
    ramp3?: Record<string, unknown> | null,
  ): {
    ataMs: number;
    staMs: number;
    atdMs: number;
    stdMs: number;
  } | null {
    if (!main) return null;

    const staDate = FhrCollectionService.nonEmpty(
      lc?.STADate,
      lc?.staDate,
      terminal?.STADate,
      terminal?.staDate,
      ramp1?.STADate,
      ramp1?.staDate,
      ramp3?.STADate,
      ramp3?.staDate,
    );
    const stdDate = FhrCollectionService.nonEmpty(
      lc?.STDDate,
      lc?.stdDate,
      terminal?.STDDate,
      terminal?.stdDate,
      ramp1?.STDDate,
      ramp1?.stdDate,
      ramp3?.STDDate,
      ramp3?.stdDate,
      staDate,
    );
    const staTime = FhrCollectionService.nonEmpty(
      lc?.STATime,
      lc?.staTime,
      lc?.sta,
      terminal?.STATime,
      terminal?.staTime,
      terminal?.sta,
      ramp1?.STATime,
      ramp1?.staTime,
      ramp1?.sta,
      ramp3?.STATime,
      ramp3?.staTime,
      ramp3?.sta,
    );
    const stdTime = FhrCollectionService.nonEmpty(
      lc?.STDTime,
      lc?.stdTime,
      lc?.std,
      terminal?.STDTime,
      terminal?.stdTime,
      terminal?.std,
      ramp1?.STDTime,
      ramp1?.stdTime,
      ramp1?.std,
      ramp3?.STDTime,
      ramp3?.stdTime,
      ramp3?.std,
    );

    const ataDate = FhrCollectionService.nonEmpty(
      main.ATADate,
      main.ataDate,
      ramp1?.ATADate,
      ramp1?.ataDate,
      ramp3?.ATADate,
      ramp3?.ataDate,
      staDate,
    );
    const ataTime = FhrCollectionService.nonEmpty(
      main.ATATime,
      main.ataTime,
      ramp1?.ATATime,
      ramp1?.ataTime,
      ramp1?.ata,
      ramp3?.ATATime,
      ramp3?.ataTime,
      ramp3?.ata,
    );
    const atdDate = FhrCollectionService.nonEmpty(
      main.ATDDate,
      main.atdDate,
      ramp3?.ATDDate,
      ramp3?.atdDate,
      ramp1?.ATDDate,
      ramp1?.atdDate,
      ataDate,
      staDate,
    );
    const atdTime = FhrCollectionService.nonEmpty(
      main.ATDTime,
      main.atdTime,
      ramp3?.ATDTime,
      ramp3?.atdTime,
      ramp1?.ATDTime,
      ramp1?.atdTime,
      ramp3?.etd,
      ramp1?.etd,
    );

    const ataMs =
      FhrCollectionService.datetimeMsFromDdMmYyyyAndTimeOrFallbackChain(
        ataDate,
        ataTime,
        [staDate],
      );
    const staMs =
      FhrCollectionService.datetimeMsFromDdMmYyyyAndTimeOrFallbackChain(
        staDate,
        staTime,
        [stdDate],
      );
    const stdMs =
      FhrCollectionService.datetimeMsFromDdMmYyyyAndTimeOrFallbackChain(
        stdDate,
        stdTime,
        [staDate],
      );
    const atdMs =
      FhrCollectionService.datetimeMsFromDdMmYyyyAndTimeOrFallbackChain(
        atdDate,
        atdTime,
        [ataDate, staDate],
      );

    if (ataMs == null || staMs == null || atdMs == null || stdMs == null) {
      return null;
    }
    return { ataMs, staMs, atdMs, stdMs };
  }

  private static atdStdMsFromFhrEmbeds(
    main: Record<string, unknown> | undefined,
    lc: Record<string, unknown> | undefined,
  ): { atdMs: number; stdMs: number } | null {
    if (!main || !lc) return null;
    const atdMs = FhrCollectionService.datetimeMsFromDdMmYyyyAndTime(
      main.ATDDate ?? main.atdDate,
      main.ATDTime ?? main.atdTime,
    );
    const stdMs = FhrCollectionService.datetimeMsFromDdMmYyyyAndTime(
      lc.STDDate ?? lc.stdDate,
      lc.STDTime ?? lc.stdTime,
    );
    if (atdMs == null || stdMs == null) return null;
    return { atdMs, stdMs };
  }

  private static fhrDocumentStaYmd(
    m: Record<string, unknown> | undefined,
    t: Record<string, unknown> | undefined,
    r1?: Record<string, unknown> | null,
    r3?: Record<string, unknown> | null,
  ): string | null {
    const m0 = m ?? {};
    const t0 = t ?? {};
    const r1o = r1 ?? {};
    const r3o = r3 ?? {};
    const staScheduleRaw = FhrCollectionService.firstScheduleDateString(
      t0.STADate,
      t0.staDate,
      r1o.STADate,
      r1o.staDate,
      r3o.STADate,
    );
    const stdScheduleRaw = FhrCollectionService.firstScheduleDateString(
      t0.STDDate,
      t0.stdDate,
      r1o.STDDate,
      r1o.stdDate,
      r3o.STDDate,
    );
    const anchorRaw = staScheduleRaw || stdScheduleRaw;
    if (!anchorRaw) return null;
    const norm = FhrCollectionService.normalizeDateDdMmYyyy(
      String(staScheduleRaw || anchorRaw),
    );
    if (!norm) return null;
    return FhrCollectionService.scheduleLabelToYmd(norm);
  }

  private static fhrIsCancelled(
    m: Record<string, unknown> | undefined,
    t: Record<string, unknown> | undefined,
    r1?: Record<string, unknown> | null,
    r3?: Record<string, unknown> | null,
  ): boolean {
    if (m && FhrCollectionService.isMainDetailsEmbedCancelled(m)) return true;
    const m0 = m ?? {};
    const t0 = t ?? {};
    const r1o = r1 ?? {};
    const r3o = r3 ?? {};
    const arr = FhrCollectionService.nonEmpty(m0.ArrivalFltNo, m0.arrivalFltNo);
    const dep = FhrCollectionService.nonEmpty(
      m0.DepartureFltNo,
      m0.departureFltNo,
    );
    const tFn = FhrCollectionService.nonEmpty(
      t0.FlightNo,
      t0.flightNo,
      r1o.FlightNo,
      r1o.flightNo,
      r3o.FlightNo,
      '',
    );
    const flightNo = FhrCollectionService.nonEmpty(
      FhrCollectionService.flightNoFromMainArrivalDeparture(arr, dep),
      tFn,
      '',
    );
    const u = String(flightNo).trim().toUpperCase();
    return u.includes('CANC');
  }

  private static isMainDetailsEmbedCancelled(
    m: Record<string, unknown>,
  ): boolean {
    if (m.flightCancelled === true) return true;
    return (
      String(m.departureStatus ?? '')
        .trim()
        .toLowerCase() === 'cancelled'
    );
  }

  private static nonEmpty(...values: unknown[]): string {
    for (const v of values) {
      if (v == null) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return '';
  }

  private static qualityMetricNumber(...values: unknown[]): number {
    const raw = FhrCollectionService.nonEmpty(...values).replace(/,/g, '');
    if (!raw) return 0;
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    if (!match) return 0;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private static qualityTimeToMinutes(raw: unknown): number | null {
    const normalized = FhrCollectionService.normalizeTimeToHms(raw);
    if (!normalized) return null;
    const [hh, mm, ss] = normalized.split(':').map((value) => Number(value));
    if ([hh, mm, ss].some((value) => Number.isNaN(value))) return null;
    return (hh ?? 0) * 60 + (mm ?? 0);
  }

  private static qualityTimeDiffMinutes(
    fromTime: unknown,
    toTime: unknown,
  ): number | null {
    const from = FhrCollectionService.qualityTimeToMinutes(fromTime);
    const to = FhrCollectionService.qualityTimeToMinutes(toTime);
    if (from == null || to == null) return null;
    const diff = to - from;
    return diff >= 0 ? diff : diff + 24 * 60;
  }

  private static qualityBagAchieved(
    ataTime: unknown,
    bagTime: unknown,
    thresholdMinutes: number,
  ): boolean {
    const diff = FhrCollectionService.qualityTimeDiffMinutes(ataTime, bagTime);
    return diff != null && diff <= thresholdMinutes;
  }

  private static qualityHoldClosed(
    stdTime: unknown,
    holdClosedTime: unknown,
    thresholdMinutes: number,
  ): boolean {
    const diff = FhrCollectionService.qualityTimeDiffMinutes(
      holdClosedTime,
      stdTime,
    );
    return diff != null && diff >= thresholdMinutes;
  }

  private static qualityScheduledAirlineCode(
    m?: Record<string, unknown> | null,
    td?: Record<string, unknown> | null,
    r1?: Record<string, unknown> | null,
    r3?: Record<string, unknown> | null,
  ): string {
    const explicit = FhrCollectionService.nonEmpty(
      m?.Arline_Code,
      m?.airlineCode,
      m?.['Airline Code'],
    )
      .replace(/\s+/g, '')
      .toUpperCase();
    if (explicit) return explicit;

    const flightNo = FhrCollectionService.nonEmpty(
      FhrCollectionService.flightNoFromMainArrivalDeparture(
        FhrCollectionService.nonEmpty(m?.ArrivalFltNo, m?.arrivalFltNo),
        FhrCollectionService.nonEmpty(m?.DepartureFltNo, m?.departureFltNo),
      ),
      td?.FlightNo,
      td?.flightNo,
      r1?.FlightNo,
      r1?.flightNo,
      r3?.FlightNo,
    )
      .replace(/^CANC\s*/i, '')
      .trim();
    const prefix = /^[A-Z0-9]{2,3}/.exec(flightNo.toUpperCase())?.[0] ?? '';
    if (prefix) return prefix;

    const airline = FhrCollectionService.nonEmpty(
      m?.Airline,
      td?.airlinesOperator,
      r1?.airlinesOperator,
      r3?.Airline,
    ).toUpperCase();
    return airline.slice(0, 2) || 'NA';
  }

  private static splitCleaningDateTime(
    dateLike: unknown,
    timeLike?: unknown,
  ): { date: string; time: string } {
    const rawDateLike = String(dateLike ?? '').trim();
    const rawTimeLike = String(timeLike ?? '').trim();

    const dateMatch =
      rawDateLike.match(
        /(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})/,
      )?.[1] ?? '';
    const timeMatch =
      rawTimeLike.match(/(\d{1,2}:\d{2}(?::\d{2})?)/)?.[1] ??
      rawDateLike.match(/(\d{1,2}:\d{2}(?::\d{2})?)/)?.[1] ??
      '';

    return {
      date: dateMatch
        ? FhrCollectionService.normalizeDateDdMmYyyy(dateMatch)
        : '',
      time: timeMatch,
    };
  }

  private static normalizeCleaningDurationHhMm(raw: string): string {
    const text = String(raw ?? '').trim();
    if (!text) return '';

    const hhMm = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (hhMm) {
      return `${hhMm[1].padStart(2, '0')}:${hhMm[2]}`;
    }

    const hrsOnly = /^(\d+)\s*hrs?$/i.exec(text);
    if (hrsOnly) {
      return `${String(Number(hrsOnly[1]) || 0).padStart(2, '0')}:00`;
    }

    const minsOnly = /^(\d+)\s*min$/i.exec(text);
    if (minsOnly) {
      const totalMin = Number(minsOnly[1]) || 0;
      return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
    }

    const hrsMin = /^(\d+)\s*hrs?\s*(\d+)\s*min$/i.exec(text);
    if (hrsMin) {
      return `${String(Number(hrsMin[1]) || 0).padStart(2, '0')}:${String(Number(hrsMin[2]) || 0).padStart(2, '0')}`;
    }

    return '';
  }

  /** Prefer Schedule Setup / split-aware display; legacy arr/dep join is fallback. */
  private static flightNoFromMainArrivalDeparture(
    arrivalRaw: unknown,
    departureRaw: unknown,
    airlineCode?: unknown,
    ifOperationSplit?: unknown,
  ): string {
    return displayFlightNoFromScheduleData({
      ArrivalFltNo: arrivalRaw,
      DepartureFltNo: departureRaw,
      airlineCode,
      ifOperationSplit:
        ifOperationSplit === true ||
        String(ifOperationSplit ?? '')
          .trim()
          .toLowerCase() === 'yes'
          ? true
          : ifOperationSplit,
    });
  }

  private static firstScheduleDateString(...candidates: unknown[]): string {
    for (const v of candidates) {
      if (v == null) continue;
      const s =
        v instanceof Date
          ? FhrCollectionService.dateToYmd(v)
          : String(v).trim();
      if (s) return s;
    }
    return '';
  }

  private static dateToYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private static parseDdMmYyyy(input: string): Date | null {
    const s = FhrCollectionService.normalizeDateDdMmYyyy(input);
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (!day || !month || !year) return null;
    const d = new Date(year, month - 1, day);
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day
    ) {
      return null;
    }
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private static scheduleLabelToYmd(input: string): string | null {
    const raw = String(input ?? '').trim();
    if (!raw) return null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parsed = FhrCollectionService.parseDdMmYyyy(raw);
    if (!parsed) return null;
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private static readonly YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

  /** HH:mm for table display from schedule time strings. */
  private static scheduleTimeDisplayHhMm(raw: unknown): string {
    const hms = FhrCollectionService.normalizeTimeToHms(raw);
    if (!hms) return '';
    return hms.slice(0, 5);
  }

  /** Normalize Mongo/driver date values to UTC ISO string (export / API). */
  private static mongoDateToIsoString(raw: unknown): string | undefined {
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return raw.toISOString();
    }
    if (typeof raw === 'string' && raw.trim()) {
      const t = Date.parse(raw);
      if (!Number.isNaN(t)) return new Date(t).toISOString();
    }
    return undefined;
  }

  /**
   * Cancelled flights from `fhr_collection` only: same STA-day window and cancel rules as
   * {@link getHandledAndCancelledForStaYmdWindow} (embed flags + CANC flight number).
   * `cancelledDate` is the operating STA calendar day (`yyyy-MM-dd`).
   */
  async listCancelledFlightsForStaYmdWindow(
    fromYmd: string,
    toYmd: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<
    Array<{
      _id: string;
      instanceSerial: string;
      cancelledDate: string;
      reason: string;
      airlineName: string;
      flightNo: string;
      route: string;
      source: string;
      destination: string;
      staDate: string;
      staTime: string;
      stdDate: string;
      stdTime: string;
      aircraft: string;
      dataSource: 'fhr_collection';
      /** Last `fhr_collection` document update (ISO). Export uses as fallback recorded time. */
      fhrRecordUpdatedAtIso?: string;
    }>
  > {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    if (!FhrCollectionService.YMD_RE.test(f)) {
      throw new BadRequestException('fromDate must resolve to YYYY-MM-DD');
    }
    if (!FhrCollectionService.YMD_RE.test(t)) {
      throw new BadRequestException('tillDate must resolve to YYYY-MM-DD');
    }
    if (f > t) {
      throw new BadRequestException('fromDate must be on or before tillDate');
    }

    const dateStrings = FhrCollectionService.ymdRangeToDdMmYyyyList(f, t);
    const rows = await this.findAllLeanForScheduledTableMerge(
      dateStrings,
      station,
    );
    const out: {
      _id: string;
      instanceSerial: string;
      cancelledDate: string;
      reason: string;
      airlineName: string;
      flightNo: string;
      route: string;
      source: string;
      destination: string;
      staDate: string;
      staTime: string;
      stdDate: string;
      stdTime: string;
      aircraft: string;
      dataSource: 'fhr_collection';
      fhrRecordUpdatedAtIso?: string;
    }[] = [];
    const seenKeys = new Set<string>();

    for (const doc of rows) {
      const d = doc as Record<string, unknown>;
      if (!FhrCollectionService.fhrLeanDocIsCancelled(d)) continue;

      const sn = FhrCollectionService.leanDocInstanceSerial(
        doc as { SerialNo?: unknown; flightSerialNumber?: unknown },
      );
      if (sn == null) continue;

      const m = (d.mainDetails ?? {}) as Record<string, unknown>;
      const td = (d.terminalDetails ?? {}) as Record<string, unknown>;
      const r1 = (d.rampDetails1 ?? {}) as Record<string, unknown>;
      const r3 = (d.rampDetails3 ?? {}) as Record<string, unknown>;

      const staYmd = FhrCollectionService.fhrDocumentStaYmd(m, td, r1, r3);
      if (!staYmd || staYmd < f || staYmd > t) continue;

      const key = `${sn}|${staYmd}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const staScheduleRaw = FhrCollectionService.firstScheduleDateString(
        td.STADate,
        td.staDate,
        r1.STADate,
        r1.staDate,
        r3.STADate,
      );
      const stdScheduleRaw = FhrCollectionService.firstScheduleDateString(
        td.STDDate,
        td.stdDate,
        r1.STDDate,
        r1.stdDate,
        r3.STDDate,
      );
      const anchorRaw = staScheduleRaw || stdScheduleRaw;
      if (!anchorRaw) continue;
      const staDateNorm = FhrCollectionService.normalizeDateDdMmYyyy(
        String(staScheduleRaw || anchorRaw),
      );
      if (!staDateNorm) continue;

      let stdDateRaw = FhrCollectionService.firstScheduleDateString(
        td.STDDate,
        td.stdDate,
        r1.STDDate,
        r1.stdDate,
        r3.STDDate,
        m.ATDDate,
      );
      if (!stdDateRaw) stdDateRaw = stdScheduleRaw || staScheduleRaw || '';
      const stdDateNorm = FhrCollectionService.nonEmpty(
        FhrCollectionService.normalizeDateDdMmYyyy(String(stdDateRaw)),
        staDateNorm,
      );

      const arr = FhrCollectionService.nonEmpty(m.ArrivalFltNo, m.arrivalFltNo);
      const dep = FhrCollectionService.nonEmpty(
        m.DepartureFltNo,
        m.departureFltNo,
      );
      const tFn = FhrCollectionService.nonEmpty(
        td.FlightNo,
        td.flightNo,
        r1.FlightNo,
        r1.flightNo,
        r3.FlightNo,
        '',
      );
      const flightNo = FhrCollectionService.nonEmpty(
        displayFlightNoFromScheduleData({
          flightNo: tFn,
          'Flight No': tFn,
          ArrivalFltNo: arr,
          DepartureFltNo: dep,
          airlineCode: FhrCollectionService.nonEmpty(
            m['Airline Code'],
            m.airlineCode,
            td.airlineCode,
            td['Airline Code'],
          ),
          ifOperationSplit: m.ifOperationSplit ?? m['Operation Split'],
          'Operation Split': m['Operation Split'] ?? m.ifOperationSplit,
        }),
      );

      const airlineName = FhrCollectionService.nonEmpty(
        td.airlinesOperator,
        td.Airline,
        m.Airline,
        m.airlineName,
        r1.airlinesOperator,
        '',
      );

      const route = FhrCollectionService.nonEmpty(m.Route, td.routing, '');
      const routeParts = route
        .split(/\s*[-–—/]\s*/)
        .map((x) => x.trim())
        .filter(Boolean);
      const source = routeParts[0] ?? '';
      const destination = routeParts[1] ?? '';

      const staTime = FhrCollectionService.scheduleTimeDisplayHhMm(
        FhrCollectionService.nonEmpty(
          td.STATime,
          td.sta,
          r1.STATime,
          r1.sta,
          m.ATATime,
          m.ataTime,
          '',
        ),
      );
      const stdTime = FhrCollectionService.scheduleTimeDisplayHhMm(
        FhrCollectionService.nonEmpty(
          td.STDTime,
          td.std,
          r1.STDTime,
          r1.std,
          m.ATDTime,
          m.atdTime,
          '',
        ),
      );

      const reason = FhrCollectionService.nonEmpty(
        m.departureStatus,
        m.departureDelay,
        m.arrivalDelay,
        '',
      );
      const serialStr = String(sn);
      const fhrRecordUpdatedAtIso = FhrCollectionService.mongoDateToIsoString(
        d.updatedAt,
      );

      out.push({
        _id: `fhr_collection:${serialStr}:${staYmd}`,
        instanceSerial: serialStr,
        cancelledDate: staYmd,
        reason: reason || '—',
        airlineName,
        flightNo,
        route,
        source,
        destination,
        staDate: staDateNorm,
        staTime,
        stdDate: stdDateNorm,
        stdTime,
        aircraft: FhrCollectionService.nonEmpty(m.TypeCraft, td.TypeCraft, ''),
        dataSource: 'fhr_collection',
        fhrRecordUpdatedAtIso,
      });
    }

    return out.sort((a, b) => {
      const d = a.cancelledDate.localeCompare(b.cancelledDate);
      if (d !== 0) return d;
      const tm = a.staTime.localeCompare(b.staTime);
      if (tm !== 0) return tm;
      return a.instanceSerial.localeCompare(b.instanceSerial);
    });
  }

  /**
   * Remove `fhr_collection` documents (e.g. before a full workbook reseed).
   * Use only with explicit admin/seed tooling.
   *
   * Multi-station safety guard: a destructive bulk delete must be explicitly
   * scoped. Pass `{ stationCode }` to wipe a single station, or `{ allStations:
   * true }` to opt in to a cross-station wipe. An unconfirmed call now throws
   * instead of silently truncating every station's flight records.
   *
   * NOTE: per-station scoping becomes effective once `fhr_collection` carries a
   * backfilled `stationCode` (Phase 3 backbone conversion). Until then this guard
   * removes the accidental global-wipe risk identified in the safety audit.
   */
  async deleteAllDocuments(
    opts: {
      stationCode?: string;
      allStations?: boolean;
      isGlobalAdmin?: boolean;
    } = {},
  ): Promise<number> {
    if (opts.allStations && opts.isGlobalAdmin !== true) {
      throw new ForbiddenException(
        'Only Global Admins may run all-stations (cross-station) maintenance operations.',
      );
    }
    const stationCode = (opts.stationCode ?? '').trim().toUpperCase();
    if (!opts.allStations && !stationCode) {
      throw new BadRequestException(
        'Refusing to bulk-delete fhr_collection without scope. Pass { stationCode } to wipe one station or { allStations: true } to confirm a cross-station wipe.',
      );
    }
    const filter = opts.allStations ? {} : { stationCode };
    const r = await this.fhrModel.deleteMany(filter).exec();
    const n = r.deletedCount ?? 0;
    this.logger.warn(
      `fhr_collection deleteMany (${
        opts.allStations ? 'ALL STATIONS' : stationCode
      }): removed ${n} documents`,
    );
    return n;
  }
}
