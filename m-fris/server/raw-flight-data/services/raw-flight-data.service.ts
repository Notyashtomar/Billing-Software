import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import {
  RawFlightData,
  RawFlightDataDocument,
} from '../schema/raw-flight-data.schema';
import {
  AdvanceScheduleSetup,
  AdvanceScheduleSetupDocument,
} from '../schema/advance-schedule-setup.schema';
import {
  ScheduledAirlinesCreation,
  ScheduledAirlinesCreationDocument,
} from '../schema/scheduled-airlines-creation.schema';
import {
  FlightInstanceIndex,
  FlightInstanceIndexDocument,
} from '../schema/flight-instance-index.schema';
import {
  FlightSerialCounter,
  FlightSerialCounterDocument,
} from '../schema/flight-serial-counter.schema';
import {
  CreationAdditionalFlights,
  CreationAdditionalFlightsDocument,
} from '../../creation/schema/creation-additional-flights.schema';
import {
  ADDITIONAL_FLIGHT_SCHEDULE_SOURCE,
  buildAdditionalFlightScheduleId,
  isAdditionalFlightScheduleId,
  isAdditionalFlightScheduleSource,
} from '../../creation/utils/additional-flight.util';
import {
  getListDailyFromAdvanceCacheEntry,
  invalidateListDailyFromAdvanceCache,
  LIST_DAILY_ADVANCE_CACHE_TTL_MS,
  setListDailyFromAdvanceCacheEntry,
  sweepListDailyFromAdvanceCache,
} from '../utils/list-daily-from-advance-cache.util';
import {
  bustScheduledListAndEnqueueRefresh,
} from '../utils/scheduled-daily-write-hook.util';
import {
  isScheduledDailyReadModelEnabledForStation,
  readScheduledDailyReadModelEnv,
} from '../config/scheduled-daily-read-model.env';
import { ScheduledDailyReadService } from './scheduled-daily-read.service';
import type { FlightCancellationsService } from '../../flight-cancellations/flight-cancellations.service';
import type { FhrCollectionService } from '../../fhr-collection/services/fhr-collection.service';
import { lazyService } from '../../common/nestjs/lazy-service.util';

type FhrCollectionServiceCtor = typeof import('../../fhr-collection/services/fhr-collection.service').FhrCollectionService;

function fhrCollectionServiceClass(): FhrCollectionServiceCtor {
  // Static helpers — must not use `import type` binding (erased under SWC).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../fhr-collection/services/fhr-collection.service')
    .FhrCollectionService as FhrCollectionServiceCtor;
}
import {
  CROSS_STATION_SYSTEM_SCOPE,
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from '../../common/station/station.constants';
import {
  MainDetails,
  MainDetailsDocument,
} from '../../main-details/schema/main-details.schema';
import {
  TerminalDetails,
  TerminalDetailsDocument,
} from '../../terminal-details/schema/terminal-details.schema';
import {
  RampDetails1,
  RampDetails1Document,
} from '../../ramp-details-1/schema/ramp-details-1.schema';
import { Remarks, RemarksDocument } from '../../remarks/schema/remarks.schema';
import {
  LoadControlDetails,
  LoadControlDetailsDocument,
} from '../../load-control-details/schema/load-control-details.schema';
import {
  EquipmentManpower,
  EquipmentManpowerDocument,
} from '../../equipment-manpower/schema/equipment-manpower.schema';
import { DASHBOARD_SOURCE_CHANGED } from '../../dashboard-summary/events/dashboard-events.constants';
import { DashboardSourceChangedEvent } from '../../dashboard-summary/events/dashboard-source-changed.event';
import { DASHBOARD_SOURCE_TYPES } from '../../dashboard-summary/registry/dashboard-dependency.registry';
import {
  buildScheduleIdentityKey,
  compareScheduleDates,
  detectScheduleSeason,
  displayFlightNoFromScheduleData,
  isValidScheduleFlightNo,
  isValidScheduleRouting,
  mergeScheduleValidityRange,
  pickExtendedValidTo,
  normalizeRoutingForMatch,
  normalizeScheduleDayTimes,
  normalizeScheduleFlightNoForStorage,
  normalizeScheduleRoutingForStorage,
  parseScheduleDateDdMmYyyy,
  scheduleSaveSuccessMessage,
  tryDetectScheduleSeason,
  unionScheduleDays,
  type ScheduleSaveAction,
  type ScheduleSeason,
  type ScheduleSeasonInfo,
} from '../utils/schedule-season.util';

export type FlightStatus = 'Open' | 'Closed' | 'Cancelled';

/** @deprecated Prefer importing from `list-daily-from-advance-cache.util` directly. */
export { invalidateListDailyFromAdvanceCache } from '../utils/list-daily-from-advance-cache.util';

const ADVANCE_DAILY_SYNC_SOURCE = 'advance_schedule_setup';

@Injectable()
export class RawFlightDataService {
  private readonly logger = new Logger(RawFlightDataService.name);
  private static readonly GLOBAL_SERIAL_COUNTER_ID = 'global_flight_serial';
  private static readonly GLOBAL_SERIAL_BASE = 100000;

  /** Closed when all core forms exist or Ramp + Pax + GSD locks are all engaged. */
  private static flightStatusFromFormAndLockPresence(input: {
    cancelled?: boolean;
    hasMain: boolean;
    hasTerminal: boolean;
    hasRamp: boolean;
    hasLoadControl: boolean;
    hasGsd: boolean;
  }): FlightStatus {
    if (input.cancelled) return 'Cancelled';
    if (
      input.hasMain &&
      input.hasTerminal &&
      input.hasRamp &&
      input.hasLoadControl
    ) {
      return 'Closed';
    }
    if (input.hasRamp && input.hasTerminal && input.hasGsd) {
      return 'Closed';
    }
    return 'Open';
  }

  /**
   * Non-scheduled bookings promote into `fhr_collection` for NS Airlines forms.
   * Scheduled Airlines daily list must exclude them.
   */
  private static isNonScheduledMainDetails(
    m: Record<string, unknown> | null | undefined,
  ): boolean {
    if (!m || typeof m !== 'object') return false;

    const norm = (v: unknown) =>
      String(v ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    const flightType = norm(
      m.Typeofflight ??
        m.typeofflight ??
        m['Type of flight'] ??
        m.flightType ??
        m.TypeofFlight,
    );
    if (
      flightType.includes('non-scheduled') ||
      flightType.includes('non scheduled') ||
      flightType.includes('nonschedule') ||
      flightType.includes('non-skd') ||
      flightType.includes('nonskd')
    ) {
      return true;
    }

    const handling = norm(
      m.TypeofHandling ??
        m.typeOfHandling ??
        m['Type of Handling'] ??
        m.typeofHandling,
    );
    if (
      handling.includes('non-scheduled') ||
      handling.includes('non scheduled') ||
      handling.includes('non-skd') ||
      handling.includes('nonskd')
    ) {
      return true;
    }

    // NS promote stamps booking/challan; scheduled rows do not.
    if (RawFlightDataService.nonEmpty(m.bookingNo, m.challanNo)) {
      return true;
    }

    return false;
  }

  constructor(
    @InjectModel(RawFlightData.name)
    private readonly rawFlightDataModel: Model<RawFlightDataDocument>,
    @InjectModel(AdvanceScheduleSetup.name)
    private readonly advanceScheduleModel: Model<AdvanceScheduleSetupDocument>,
    @InjectModel(ScheduledAirlinesCreation.name)
    private readonly scheduledCreationModel: Model<ScheduledAirlinesCreationDocument>,
    @InjectModel(FlightInstanceIndex.name)
    private readonly flightInstanceIndexModel: Model<FlightInstanceIndexDocument>,
    @InjectModel(FlightSerialCounter.name)
    private readonly flightSerialCounterModel: Model<FlightSerialCounterDocument>,
    @InjectModel(CreationAdditionalFlights.name)
    private readonly creationAdditionalFlightsModel: Model<CreationAdditionalFlightsDocument>,
    @InjectModel(MainDetails.name)
    private readonly mainDetailsModel: Model<MainDetailsDocument>,
    @InjectModel(TerminalDetails.name)
    private readonly terminalDetailsModel: Model<TerminalDetailsDocument>,
    @InjectModel(RampDetails1.name)
    private readonly rampDetails1Model: Model<RampDetails1Document>,
    @InjectModel(Remarks.name)
    private readonly remarksModel: Model<RemarksDocument>,
    @InjectModel(LoadControlDetails.name)
    private readonly loadControlDetailsModel: Model<LoadControlDetailsDocument>,
    @InjectModel(EquipmentManpower.name)
    private readonly equipmentManpowerModel: Model<EquipmentManpowerDocument>,
    @Inject(
      forwardRef(
        lazyService(
          () =>
            require('../../flight-cancellations/flight-cancellations.service')
              .FlightCancellationsService as typeof import('../../flight-cancellations/flight-cancellations.service').FlightCancellationsService,
        ),
      ),
    )
    private readonly flightCancellationsService: FlightCancellationsService,
    @Inject(
      forwardRef(
        lazyService(
          () =>
            require('../../fhr-collection/services/fhr-collection.service')
              .FhrCollectionService as typeof import('../../fhr-collection/services/fhr-collection.service').FhrCollectionService,
        ),
      ),
    )
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly eventEmitter: EventEmitter2,
    private readonly scheduledDailyReadService: ScheduledDailyReadService,
  ) {}

  /** Same normalization as `FlightCancellationsService` for serial+date keys. */
  private static normalizeInstanceSerial(raw: string): string {
    return String(raw ?? '')
      .trim()
      .replace(/^FL-/i, '');
  }

  /**
   * Bust list-daily cache and enqueue CP-01 projection refresh for the station.
   */
  private bustScheduledListCaches(
    station: StationScopeContext,
    opts?: {
      staYmd?: string;
      staYmds?: string[];
      fromYmd?: string;
      toYmd?: string;
      reason?: string;
    },
  ): void {
    bustScheduledListAndEnqueueRefresh(this.eventEmitter, station, opts);
  }

  private static isMainDetailsCancelled(doc: {
    flightCancelled?: boolean;
    departureStatus?: string;
  }): boolean {
    if (doc.flightCancelled === true) return true;
    return (
      String(doc.departureStatus ?? '')
        .trim()
        .toLowerCase() === 'cancelled'
    );
  }

  /**
   * Advance/schedule rule used across ops: a row is treated as cancelled when the
   * displayed flight number starts with CANC (after trim), regardless of form locks.
   */
  private static isScheduleFlightNoMarkedCancelled(
    data: Record<string, unknown>,
  ): boolean {
    const fn = RawFlightDataService.nonEmpty(
      data.flightNo,
      data['Flight No'],
      data.FlightNo,
    );
    return String(fn).trim().toUpperCase().startsWith('CANC');
  }

  /**
   * Scheduled Airlines shows the FHR flight number when it still carries the Excel CANC prefix.
   * Spaces are removed; every other character stays.
   */
  private static applyFhrCancelledFlightNo(
    data: Record<string, unknown>,
    fhr: Record<string, unknown> | undefined,
  ): void {
    if (!fhr) return;
    const embeds = [fhr.mainDetails, fhr.terminalDetails, fhr.rampDetails1, fhr.loadControlDetails];
    for (const embed of embeds) {
      if (!embed || typeof embed !== 'object' || Array.isArray(embed)) continue;
      const rec = embed as Record<string, unknown>;
      const compact = String(rec.FlightNo ?? rec.flightNo ?? '').replace(/\s+/g, '');
      if (!/^CANC/i.test(compact)) continue;
      data.flightNo = compact;
      data['Flight No'] = compact;
      data.FlightNo = compact;
      return;
    }
  }

  private static normTokenAirline(input: string): string {
    return String(input ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private static normTokenFlight(input: string): string {
    return String(input ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  /** Match key: airline + flight + STA calendar day (for legacy serial ↔ schedule row fallback). */
  private static scheduleRowNaturalKey(
    data: Record<string, unknown>,
  ): string | null {
    const airline = RawFlightDataService.normTokenAirline(
      RawFlightDataService.nonEmpty(data.airline, data.Airline),
    );
    const flight = RawFlightDataService.normTokenFlight(
      RawFlightDataService.nonEmpty(data.flightNo, data['Flight No']),
    );
    const staRaw = RawFlightDataService.nonEmpty(
      data.staDate,
      data['STA Date'],
      data.scheduleDate,
    );
    const ymd = staRaw
      ? RawFlightDataService.scheduleLabelToYmd(
          RawFlightDataService.normalizeDateDdMmYyyy(staRaw),
        )
      : null;
    if (!airline || !flight || !ymd) return null;
    return `${airline}|${flight}|${ymd}`;
  }

  /** Normalized flight tokens: full string plus each `/` segment (schedule may use one leg only). */
  private static scheduleFlightNatTokens(rawFlight: string): string[] {
    const raw = String(rawFlight ?? '').trim();
    if (!raw) return [];
    const tokens = new Set<string>();
    const full = RawFlightDataService.normTokenFlight(raw);
    if (full) tokens.add(full);
    for (const part of raw.split('/')) {
      const t = RawFlightDataService.normTokenFlight(part);
      if (t) tokens.add(t);
    }
    return [...tokens];
  }

  /**
   * Schedule rows key off STA calendar day; imported mains often leave ATA empty while terminal
   * carries STA. Index legacy mains under every plausible operational day + flight token so `mdNat` resolves.
   */
  private static mainDetailsScheduleNatKeys(
    doc: {
      Airline?: string;
      ArrivalFltNo?: string;
      DepartureFltNo?: string;
      ATADate?: string;
      ATDDate?: string;
      IPosDate?: string;
    },
    terminalStaDate?: string,
  ): string[] {
    const airline = RawFlightDataService.normTokenAirline(
      String(doc.Airline ?? ''),
    );
    if (!airline) return [];
    const flightTokens = new Set<string>();
    for (const fc of [doc.ArrivalFltNo, doc.DepartureFltNo]) {
      for (const t of RawFlightDataService.scheduleFlightNatTokens(
        String(fc ?? ''),
      )) {
        flightTokens.add(t);
      }
    }
    if (flightTokens.size === 0) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (flight: string, raw: string) => {
      const lbl = RawFlightDataService.nonEmpty(String(raw ?? ''));
      if (!lbl) return;
      const ymd = RawFlightDataService.scheduleLabelToYmd(
        RawFlightDataService.normalizeDateDdMmYyyy(lbl),
      );
      if (!ymd) return;
      const nk = `${airline}|${flight}|${ymd}`;
      if (seen.has(nk)) return;
      seen.add(nk);
      out.push(nk);
    };
    for (const flight of flightTokens) {
      for (const raw of [
        doc.ATADate,
        doc.ATDDate,
        doc.IPosDate,
        terminalStaDate,
      ]) {
        push(flight, String(raw ?? ''));
      }
    }
    return out;
  }

  /** Prefer legacy main (<100k) when SlNo is a global instance id so ops serial matches Mongo forms. */
  private static mainDirectFromSerialMaps<T>(
    primaryNorm: string,
    legacyNorm: string,
    mainBySerial: Map<string, T>,
  ): T | undefined {
    const mdFromLegacy = legacyNorm ? mainBySerial.get(legacyNorm) : undefined;
    const mdFromPrimary = primaryNorm
      ? mainBySerial.get(primaryNorm)
      : undefined;
    const nPri = primaryNorm ? Number(primaryNorm) : NaN;
    if (
      Number.isFinite(nPri) &&
      nPri >= RawFlightDataService.GLOBAL_SERIAL_BASE
    ) {
      return mdFromLegacy || mdFromPrimary;
    }
    return mdFromPrimary || mdFromLegacy;
  }

  /**
   * Resolve operational Mongo serial for forms + bag metrics: advance instance SlNo may differ from
   * `mainDetails.SerialNo` when data was seeded/imported under legacy IDs (< 100000).
   */
  private async finalizeDailyFilteredRows(
    filtered: Array<{ data: Record<string, unknown> }>,
    dateCancelledKeys: Set<string>,
  ): Promise<Array<{ data: Record<string, unknown> }>> {
    type MainLean = {
      SerialNo: number;
      flightCancelled?: boolean;
      departureStatus?: string;
      ATATime?: string;
      updatedAt?: Date;
      Airline?: string;
      ArrivalFltNo?: string;
      DepartureFltNo?: string;
      ATADate?: string;
      ATDDate?: string;
      IPosDate?: string;
      Cate_of_Flight?: string;
    };

    const primaryByRow = filtered.map((row) => {
      const raw = RawFlightDataService.nonEmpty(
        row.data.SlNo ??
          row.data.slNo ??
          row.data['Serial No'] ??
          row.data.serialNo,
      );
      const primaryNorm = raw
        ? RawFlightDataService.normalizeInstanceSerial(raw)
        : '';
      const rawLegacy = RawFlightDataService.nonEmpty(
        row.data.legacySlNo,
        row.data.scheduleMasterSerial,
        row.data['legacy Sl No'],
      );
      const legacyNorm = rawLegacy
        ? RawFlightDataService.normalizeInstanceSerial(String(rawLegacy))
        : '';
      const natKey = RawFlightDataService.scheduleRowNaturalKey(row.data);
      return { row, primaryNorm, legacyNorm, natKey };
    });

    const serialNums = new Set<number>();
    for (const p of primaryByRow) {
      if (p.primaryNorm) {
        const n = Number(p.primaryNorm);
        if (!Number.isNaN(n)) serialNums.add(n);
      }
      if (p.legacyNorm) {
        const n = Number(p.legacyNorm);
        if (!Number.isNaN(n)) serialNums.add(n);
      }
    }

    const mainRowsAll =
      serialNums.size > 0
        ? await this.mainDetailsModel
            .find({ SerialNo: { $in: [...serialNums] } })
            .select({
              SerialNo: 1,
              Airline: 1,
              ArrivalFltNo: 1,
              DepartureFltNo: 1,
              ATADate: 1,
              flightCancelled: 1,
              departureStatus: 1,
              ATATime: 1,
              updatedAt: 1,
              Cate_of_Flight: 1,
            })
            .sort({ updatedAt: -1 })
            .lean()
            .exec()
        : [];

    const mainBySerial = new Map<string, MainLean>();
    for (const m of mainRowsAll) {
      const k = String(m.SerialNo ?? '').trim();
      if (k && !mainBySerial.has(k)) mainBySerial.set(k, m as MainLean);
    }

    const scheduleNatKeys = new Set<string>();
    for (const p of primaryByRow) {
      if (p.natKey) scheduleNatKeys.add(p.natKey);
      const fnRaw = RawFlightDataService.nonEmpty(
        p.row.data.flightNo,
        p.row.data['Flight No'],
      );
      for (const tok of RawFlightDataService.scheduleFlightNatTokens(fnRaw)) {
        const airline = RawFlightDataService.normTokenAirline(
          RawFlightDataService.nonEmpty(p.row.data.airline, p.row.data.Airline),
        );
        const staRaw = RawFlightDataService.nonEmpty(
          p.row.data.staDate,
          p.row.data['STA Date'],
          p.row.data.scheduleDate,
        );
        const ymd = staRaw
          ? RawFlightDataService.scheduleLabelToYmd(
              RawFlightDataService.normalizeDateDdMmYyyy(staRaw),
            )
          : null;
        if (airline && ymd) scheduleNatKeys.add(`${airline}|${tok}|${ymd}`);
      }
    }

    let mainByNatural = new Map<string, MainLean>();
    if (scheduleNatKeys.size > 0) {
      const legacyMains = await this.mainDetailsModel
        .find({
          SerialNo: { $lt: RawFlightDataService.GLOBAL_SERIAL_BASE },
        })
        .select({
          SerialNo: 1,
          Airline: 1,
          ArrivalFltNo: 1,
          DepartureFltNo: 1,
          ATADate: 1,
          ATDDate: 1,
          IPosDate: 1,
          flightCancelled: 1,
          departureStatus: 1,
          ATATime: 1,
          updatedAt: 1,
          Cate_of_Flight: 1,
        })
        .sort({ updatedAt: -1 })
        .lean()
        .exec();

      const legacySerials = legacyMains
        .map((m) => m.SerialNo)
        .filter((n) => Number.isFinite(n));
      const terminalStaBySerial = new Map<string, string>();
      const rampStaBySerial = new Map<string, string>();
      if (legacySerials.length > 0) {
        const [termStaRows, rampStaRows] = await Promise.all([
          this.terminalDetailsModel
            .find({ serialNo: { $in: legacySerials } })
            .select({ serialNo: 1, STADate: 1, updatedAt: 1 })
            .sort({ updatedAt: -1 })
            .lean()
            .exec(),
          this.rampDetails1Model
            .find({ serialNo: { $in: legacySerials } })
            .select({ serialNo: 1, STADate: 1, updatedAt: 1 })
            .sort({ updatedAt: -1 })
            .lean()
            .exec(),
        ]);
        for (const t of termStaRows) {
          const k = String(t.serialNo ?? '').trim();
          if (!k || terminalStaBySerial.has(k)) continue;
          const sd = RawFlightDataService.nonEmpty(
            (t as { STADate?: string }).STADate,
          );
          if (sd) terminalStaBySerial.set(k, sd);
        }
        for (const t of rampStaRows) {
          const k = String(t.serialNo ?? '').trim();
          if (!k || rampStaBySerial.has(k)) continue;
          const sd = RawFlightDataService.nonEmpty(
            (t as { STADate?: string }).STADate,
          );
          if (sd) rampStaBySerial.set(k, sd);
        }
      }

      mainByNatural = new Map<string, MainLean>();
      for (const m of legacyMains) {
        const ma = m as MainLean;
        const serialK = String(ma.SerialNo ?? '').trim();
        const staFromTerminal = serialK
          ? RawFlightDataService.nonEmpty(
              terminalStaBySerial.get(serialK),
              rampStaBySerial.get(serialK),
            )
          : undefined;
        const nkList = RawFlightDataService.mainDetailsScheduleNatKeys(
          ma,
          staFromTerminal,
        );
        for (const nk of nkList) {
          if (!scheduleNatKeys.has(nk)) continue;
          const prev = mainByNatural.get(nk);
          if (
            !prev ||
            RawFlightDataService.toEpoch(ma.updatedAt) >
              RawFlightDataService.toEpoch(prev.updatedAt)
          ) {
            mainByNatural.set(nk, ma);
          }
        }
      }
    }

    const resolvedOpsSerials: number[] = [];
    for (const p of primaryByRow) {
      const mdDirect = RawFlightDataService.mainDirectFromSerialMaps(
        p.primaryNorm,
        p.legacyNorm,
        mainBySerial,
      );
      let mdNat: MainLean | undefined;
      if (!mdDirect && p.natKey) {
        mdNat = mainByNatural.get(p.natKey);
        if (!mdNat) {
          const fnRaw = RawFlightDataService.nonEmpty(
            p.row.data.flightNo,
            p.row.data['Flight No'],
          );
          const airline = RawFlightDataService.normTokenAirline(
            RawFlightDataService.nonEmpty(
              p.row.data.airline,
              p.row.data.Airline,
            ),
          );
          const staRaw = RawFlightDataService.nonEmpty(
            p.row.data.staDate,
            p.row.data['STA Date'],
            p.row.data.scheduleDate,
          );
          const ymd = staRaw
            ? RawFlightDataService.scheduleLabelToYmd(
                RawFlightDataService.normalizeDateDdMmYyyy(staRaw),
              )
            : null;
          if (airline && ymd) {
            for (const tok of RawFlightDataService.scheduleFlightNatTokens(
              fnRaw,
            )) {
              const altKey = `${airline}|${tok}|${ymd}`;
              mdNat = mainByNatural.get(altKey);
              if (mdNat) break;
            }
          }
        }
      }
      const md = mdDirect ?? mdNat;
      const nPri = p.primaryNorm ? Number(p.primaryNorm) : NaN;
      const nLeg = p.legacyNorm ? Number(p.legacyNorm) : NaN;
      let op: number | null = null;
      if (md && Number.isFinite(md.SerialNo)) {
        op = md.SerialNo;
      } else if (Number.isFinite(nLeg)) {
        op = nLeg;
      } else if (Number.isFinite(nPri)) {
        op = nPri;
      }
      if (op != null) resolvedOpsSerials.push(op);

      if (md) {
        const mdSerialStr = String(md.SerialNo ?? '').trim();
        const priStr = p.primaryNorm;
        if (
          mdSerialStr &&
          priStr &&
          mdSerialStr !== RawFlightDataService.normalizeInstanceSerial(priStr)
        ) {
          const prevLeg = RawFlightDataService.nonEmpty(
            String(p.row.data.legacySlNo ?? ''),
          );
          if (!prevLeg) p.row.data.legacySlNo = mdSerialStr;
        }
      }
    }

    const uniqueOps = [...new Set(resolvedOpsSerials)];

    const [terminalRows, rampRows, loadRows, remarkRows, equipmentRows] =
      uniqueOps.length > 0
        ? await Promise.all([
            this.terminalDetailsModel
              .find({ serialNo: { $in: uniqueOps } })
              .select({ serialNo: 1, updatedAt: 1 })
              .sort({ updatedAt: -1 })
              .lean()
              .exec(),
            this.rampDetails1Model
              .find({ serialNo: { $in: uniqueOps } })
              .select({
                serialNo: 1,
                firstBagInBmaTime: 1,
                lastBagInBmaTime: 1,
                updatedAt: 1,
              })
              .sort({ updatedAt: -1 })
              .lean()
              .exec(),
            this.loadControlDetailsModel
              .find({ serialNo: { $in: uniqueOps } })
              .select({ serialNo: 1, updatedAt: 1 })
              .lean()
              .exec(),
            this.remarksModel
              .find({ serialNo: { $in: uniqueOps } })
              .select({ serialNo: 1, flightCancelled: 1, updatedAt: 1 })
              .sort({ updatedAt: -1 })
              .lean()
              .exec(),
            this.equipmentManpowerModel
              .find({ serialNo: { $in: uniqueOps } })
              .select({
                serialNo: 1,
                entries: 1,
                verifiedBy: 1,
                verifiedAt: 1,
                updatedAt: 1,
              })
              .sort({ updatedAt: -1 })
              .lean()
              .exec(),
          ])
        : [[], [], [], [], []];

    const hasTerminal = new Set<string>();
    for (const r of terminalRows as { serialNo?: number }[]) {
      const k = String(r.serialNo ?? '').trim();
      if (k && !hasTerminal.has(k)) hasTerminal.add(k);
    }
    const rampBagBySerial = new Map<string, { first: string; last: string }>();
    for (const r of rampRows as {
      serialNo?: number;
      firstBagInBmaTime?: string;
      lastBagInBmaTime?: string;
    }[]) {
      const k = String(r.serialNo ?? '').trim();
      if (!k || rampBagBySerial.has(k)) continue;
      rampBagBySerial.set(k, {
        first: RawFlightDataService.nonEmpty(r.firstBagInBmaTime),
        last: RawFlightDataService.nonEmpty(r.lastBagInBmaTime),
      });
    }
    const hasLoad = new Set<string>();
    for (const r of loadRows as { serialNo?: number }[]) {
      const k = String(r.serialNo ?? '').trim();
      if (k && !hasLoad.has(k)) hasLoad.add(k);
    }
    const remarksCancelled = new Set<string>();
    for (const r of remarkRows as {
      serialNo?: number;
      flightCancelled?: boolean;
    }[]) {
      const k = String(r.serialNo ?? '').trim();
      if (!k || remarksCancelled.has(k)) continue;
      if (r.flightCancelled === true) remarksCancelled.add(k);
    }

    const hasEquipmentManpower = new Set<string>();
    for (const r of equipmentRows as {
      serialNo?: number;
      entries?: unknown[];
      verifiedBy?: string;
      verifiedAt?: string;
    }[]) {
      const k = String(r.serialNo ?? '').trim();
      if (!k || hasEquipmentManpower.has(k)) continue;
      const entries = Array.isArray(r.entries) ? r.entries : [];
      const verified =
        RawFlightDataService.nonEmpty(r.verifiedBy) ||
        RawFlightDataService.nonEmpty(r.verifiedAt);
      if (entries.length > 0 || verified) hasEquipmentManpower.add(k);
    }

    const fhrBySerial =
      await this.fhrCollectionService.getLeanFhrBySerialsMap(uniqueOps);

    const ataBySerial = new Map<string, string>();
    const mainDetailsCancelled = new Set<string>();
    for (const m of mainRowsAll) {
      const serialKey = String(m.SerialNo ?? '').trim();
      if (serialKey && !ataBySerial.has(serialKey)) {
        const ata = RawFlightDataService.nonEmpty((m as MainLean).ATATime);
        if (ata) ataBySerial.set(serialKey, ata);
      }
      if (RawFlightDataService.isMainDetailsCancelled(m)) {
        mainDetailsCancelled.add(serialKey);
      }
    }
    for (const m of mainByNatural.values()) {
      const serialKey = String(m.SerialNo ?? '').trim();
      if (serialKey && !ataBySerial.has(serialKey)) {
        const ata = RawFlightDataService.nonEmpty(m.ATATime);
        if (ata) ataBySerial.set(serialKey, ata);
      }
      if (RawFlightDataService.isMainDetailsCancelled(m)) {
        mainDetailsCancelled.add(serialKey);
      }
    }

    return primaryByRow.map(({ row, primaryNorm, legacyNorm, natKey }) => {
      const mdDirect = RawFlightDataService.mainDirectFromSerialMaps(
        primaryNorm,
        legacyNorm,
        mainBySerial,
      );
      let mdNat: MainLean | undefined;
      if (!mdDirect && natKey) {
        mdNat = mainByNatural.get(natKey);
        if (!mdNat) {
          const fnRaw = RawFlightDataService.nonEmpty(
            row.data.flightNo,
            row.data['Flight No'],
          );
          const airline = RawFlightDataService.normTokenAirline(
            RawFlightDataService.nonEmpty(row.data.airline, row.data.Airline),
          );
          const staRaw = RawFlightDataService.nonEmpty(
            row.data.staDate,
            row.data['STA Date'],
            row.data.scheduleDate,
          );
          const ymd = staRaw
            ? RawFlightDataService.scheduleLabelToYmd(
                RawFlightDataService.normalizeDateDdMmYyyy(staRaw),
              )
            : null;
          if (airline && ymd) {
            for (const tok of RawFlightDataService.scheduleFlightNatTokens(
              fnRaw,
            )) {
              const altKey = `${airline}|${tok}|${ymd}`;
              mdNat = mainByNatural.get(altKey);
              if (mdNat) break;
            }
          }
        }
      }
      const md = mdDirect ?? mdNat;

      const nPri = primaryNorm ? Number(primaryNorm) : NaN;
      const nLeg = legacyNorm ? Number(legacyNorm) : NaN;
      let opSerial: number | null = null;
      if (md && Number.isFinite(md.SerialNo)) {
        opSerial = md.SerialNo;
      } else if (Number.isFinite(nLeg)) {
        opSerial = nLeg;
      } else if (Number.isFinite(nPri)) {
        opSerial = nPri;
      }

      const opStr = opSerial != null ? String(opSerial) : '';

      const cancelSerialCandidates = [
        primaryNorm,
        legacyNorm,
        opStr ? RawFlightDataService.normalizeInstanceSerial(opStr) : '',
      ]
        .map((s) => (s ? String(s).trim() : ''))
        .filter((s, i, a) => s && a.indexOf(s) === i);

      const opYmdCandidates = new Set<string>();
      for (const raw of [
        row.data.scheduleDate,
        row.data['STA Date'],
        row.data.staDate,
      ]) {
        const lbl = RawFlightDataService.nonEmpty(String(raw ?? ''));
        const y = lbl ? RawFlightDataService.scheduleLabelToYmd(lbl) : null;
        if (y) opYmdCandidates.add(y);
      }

      const isCancelledFromCollection = cancelSerialCandidates.some((cs) =>
        [...opYmdCandidates].some((opYmd) =>
          dateCancelledKeys.has(`${cs}|${opYmd}`),
        ),
      );

      const isCancelledFromMainDetails =
        !!opStr && mainDetailsCancelled.has(opStr);

      const isCancelledFromRemarks = !!opStr && remarksCancelled.has(opStr);

      const isCancelledFromAdvanceFlightNo =
        RawFlightDataService.isScheduleFlightNoMarkedCancelled(row.data);

      if (
        isCancelledFromCollection ||
        isCancelledFromMainDetails ||
        isCancelledFromRemarks ||
        isCancelledFromAdvanceFlightNo
      ) {
        row.data.flightStatus = 'Cancelled';
        row.data.flightCancelled = true;
        row.data.isCancelled = true;
      }

      const fhr = opStr ? fhrBySerial.get(Number(opStr)) : undefined;
      RawFlightDataService.applyFhrCancelledFlightNo(row.data, fhr);
      const fhrM = !!(
        fhr?.mainDetails != null && typeof fhr.mainDetails === 'object'
      );
      const fhrT = !!(
        fhr?.terminalDetails != null && typeof fhr.terminalDetails === 'object'
      );
      const fhrR1 = !!(
        fhr?.rampDetails1 != null && typeof fhr.rampDetails1 === 'object'
      );
      const fhrL = !!(
        fhr?.loadControlDetails != null &&
        typeof fhr.loadControlDetails === 'object'
      );
      const eqE = fhr?.equipmentManpower;
      const fhrG =
        eqE != null &&
        typeof eqE === 'object' &&
        (() => {
          const entries = Array.isArray(
            (eqE as { entries?: unknown[] }).entries,
          )
            ? (eqE as { entries: unknown[] }).entries
            : [];
          if (entries.length > 0) return true;
          return (
            RawFlightDataService.nonEmpty(
              (eqE as { verifiedBy?: string }).verifiedBy,
            ) ||
            RawFlightDataService.nonEmpty(
              (eqE as { verifiedAt?: string }).verifiedAt,
            )
          );
        })();

      const hasMainEffective = !!md || fhrM;
      const hasT = (!!opStr && hasTerminal.has(opStr)) || fhrT;
      const hasR = (!!opStr && rampBagBySerial.has(opStr)) || fhrR1;
      const hasL = (!!opStr && hasLoad.has(opStr)) || fhrL;
      const hasG = (!!opStr && hasEquipmentManpower.has(opStr)) || fhrG;

      row.data.hasMainDetails = hasMainEffective;
      row.data.hasTerminalDetails = hasT;
      row.data.hasRampDetails = hasR;
      row.data.hasLoadControlDetails = hasL;
      row.data.hasEquipmentManpowerDetails = hasG;

      const mainEmbedStaged = fhr?.mainDetails as
        | Record<string, unknown>
        | undefined;
      const typeOfHandlingStaged = RawFlightDataService.nonEmpty(
        mainEmbedStaged?.TypeofHandling,
        mainEmbedStaged?.typeOfHandling,
        md && typeof md === 'object'
          ? (md as { TypeofHandling?: string }).TypeofHandling
          : undefined,
        md && typeof md === 'object'
          ? (md as { typeOfHandling?: string }).typeOfHandling
          : undefined,
      );
      if (typeOfHandlingStaged) {
        row.data.typeOfHandling = typeOfHandlingStaged;
        row.data.TypeofHandling = typeOfHandlingStaged;
        row.data['Type of Handling'] = typeOfHandlingStaged;
      }

      const cateStaged = RawFlightDataService.nonEmpty(
        RawFlightDataService.categoryOfFlightFromFhrCollectionLean(fhr),
        md && typeof md === 'object'
          ? (md as { Cate_of_Flight?: string }).Cate_of_Flight
          : undefined,
        mainEmbedStaged?.Cate_of_Flight,
        mainEmbedStaged?.cate_of_flight,
        row.data.Cate_of_Flight,
        row.data.cate_of_flight,
        row.data.category_of_flights,
        row.data.category_of_flight,
      );
      if (cateStaged) {
        row.data.Cate_of_Flight = cateStaged;
        row.data.cate_of_flight = cateStaged;
        row.data.category_of_flights = cateStaged;
        row.data.category_of_flight = cateStaged;
      }

      row.data.rampLocked = hasR ? 'Yes' : 'No';
      row.data.paxLocked = hasT ? 'Yes' : 'No';
      row.data.gsdLocked = hasG ? 'Yes' : 'No';
      row.data['Ramp Locked'] = row.data.rampLocked;
      row.data['PAX Locked'] = row.data.paxLocked;
      row.data['GSD Locked'] = row.data.gsdLocked;

      if (
        row.data.flightStatus !== 'Cancelled' &&
        row.data.isCancelled !== true
      ) {
        row.data.flightStatus = RawFlightDataService.flightStatusFromFormAndLockPresence(
          {
            hasMain: hasMainEffective,
            hasTerminal: hasT,
            hasRamp: hasR,
            hasLoadControl: hasL,
            hasGsd: !!hasG,
          },
        );
      }

      const ata = opStr ? (ataBySerial.get(opStr) ?? '') : '';
      const ramp = opStr
        ? (rampBagBySerial.get(opStr) ?? { first: '', last: '' })
        : { first: '', last: '' };
      const r1 =
        fhrR1 && fhr
          ? (fhr.rampDetails1 as {
              firstBagInBmaTime?: string;
              lastBagInBmaTime?: string;
            })
          : null;
      const rampFirst = RawFlightDataService.nonEmpty(
        ramp.first,
        r1 ? String(r1.firstBagInBmaTime ?? '') : '',
      );
      const rampLast = RawFlightDataService.nonEmpty(
        ramp.last,
        r1 ? String(r1.lastBagInBmaTime ?? '') : '',
      );

      row.data.fBag = RawFlightDataService.bagAchievedByAta(ata, rampFirst, 15);
      row.data['F Bag'] = row.data.fBag;
      row.data.lBag = RawFlightDataService.bagAchievedByAta(ata, rampLast, 40);
      row.data['L Bag'] = row.data.lBag;

      delete row.data._inRequestedRange;
      return row;
    });
  }

  /**
   * Post-process rows built from `fhr_collection` only. Uses {@link FhrCollectionService.getLeanFhrBySerialsMap}
   * and embedded subdocs — does not read the separate `mainDetails` collection.
   */
  /**
   * Attach lock/cancellation/bag status to each filtered row.
   *
   * `prefetchedFhrMap` is the map built by `appendFhrCollectionRowsToDaily` from the
   * same Atlas query — passing it in avoids a second `getLeanFhrBySerialsMap` round-trip.
   * When not provided (legacy callers) it falls back to a fresh query.
   */
  private async finalizeDailyFhrCollectionOnly(
    filtered: Array<{ data: Record<string, unknown> }>,
    prefetchedFhrMap?: Map<number, Record<string, unknown>>,
    fromYmd?: string,
    toYmd?: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Array<{ data: Record<string, unknown> }>> {
    const primaryByRow = filtered.map((row) => {
      const raw = RawFlightDataService.nonEmpty(
        row.data.SlNo ??
          row.data.slNo ??
          row.data['Serial No'] ??
          row.data.serialNo,
      );
      const primaryNorm = raw
        ? RawFlightDataService.normalizeInstanceSerial(raw)
        : '';
      const rawLegacy = RawFlightDataService.nonEmpty(
        row.data.legacySlNo,
        row.data.scheduleMasterSerial,
        row.data['legacy Sl No'],
      );
      const legacyNorm = rawLegacy
        ? RawFlightDataService.normalizeInstanceSerial(String(rawLegacy))
        : '';
      return { row, primaryNorm, legacyNorm };
    });

    let fhrBySerial: Map<number, Record<string, unknown>>;
    if (prefetchedFhrMap) {
      fhrBySerial = prefetchedFhrMap;
    } else {
      const serialNums: number[] = [];
      for (const p of primaryByRow) {
        const nPri = p.primaryNorm ? Number(p.primaryNorm) : NaN;
        const nLeg = p.legacyNorm ? Number(p.legacyNorm) : NaN;
        let op: number | null = null;
        if (Number.isFinite(nLeg)) op = nLeg;
        else if (Number.isFinite(nPri)) op = nPri;
        if (op != null) serialNums.push(op);
      }
      const uniqueOps = [...new Set(serialNums)];
      fhrBySerial =
        uniqueOps.length > 0
          ? await this.fhrCollectionService.getLeanFhrBySerialsMap(
              uniqueOps,
              station,
            )
          : new Map<number, Record<string, unknown>>();
    }

    const ataBySerial = new Map<string, string>();
    const mainDetailsCancelled = new Set<string>();
    const dateCancelledKeys =
      fromYmd && toYmd
        ? await this.flightCancellationsService.getCancelledKeysInRange(
            fromYmd,
            toYmd,
            station,
          )
        : new Set<string>();
    for (const [sn, fhr] of fhrBySerial) {
      const k = String(sn).trim();
      const m = fhr?.mainDetails as
        | {
            ATATime?: string;
            flightCancelled?: boolean;
            departureStatus?: string;
          }
        | undefined;
      if (m && RawFlightDataService.isMainDetailsCancelled(m)) {
        if (k) mainDetailsCancelled.add(k);
      }
      const ata = m ? RawFlightDataService.nonEmpty(m.ATATime) : '';
      if (k && ata && !ataBySerial.has(k)) ataBySerial.set(k, ata);
    }

    const navFromRaw = await this.loadExportedNavLabelsBySerials(
      primaryByRow.flatMap(({ row, primaryNorm, legacyNorm }) => [
        primaryNorm,
        legacyNorm,
        String(row.data.SlNo ?? ''),
        String(row.data.slNo ?? ''),
        String(row.data.serialNo ?? ''),
        String(row.data.legacySlNo ?? ''),
        String(row.data.scheduleMasterSerial ?? ''),
      ]),
    );

    return primaryByRow.map(({ row, primaryNorm, legacyNorm }) => {
      const nPri = primaryNorm ? Number(primaryNorm) : NaN;
      const nLeg = legacyNorm ? Number(legacyNorm) : NaN;

      let fhr: Record<string, unknown> | undefined;
      if (Number.isFinite(nLeg)) fhr = fhrBySerial.get(nLeg);
      if (!fhr && Number.isFinite(nPri)) fhr = fhrBySerial.get(nPri);
      RawFlightDataService.applyFhrCancelledFlightNo(row.data, fhr);

      let canonicalOpStr = '';
      if (fhr) {
        const op = fhrCollectionServiceClass().leanDocInstanceSerial(
          fhr as { SerialNo?: unknown; flightSerialNumber?: unknown },
        );
        if (op != null) canonicalOpStr = String(op);
      }
      if (!canonicalOpStr) {
        if (Number.isFinite(nLeg)) canonicalOpStr = String(nLeg);
        else if (Number.isFinite(nPri)) canonicalOpStr = String(nPri);
      }

      const priNum = primaryNorm ? Number(primaryNorm) : NaN;
      const isInstanceRow =
        Number.isFinite(priNum) &&
        priNum >= RawFlightDataService.GLOBAL_SERIAL_BASE;
      const cancelSerialCandidates = [primaryNorm, canonicalOpStr]
        .concat(isInstanceRow ? [] : [legacyNorm])
        .map((s) => (s ? String(s).trim() : ''))
        .filter((s, i, a) => s && a.indexOf(s) === i);
      const opYmdCandidates = new Set<string>();
      for (const raw of [
        row.data.scheduleDate,
        row.data['STA Date'],
        row.data.staDate,
      ]) {
        const lbl = RawFlightDataService.nonEmpty(String(raw ?? ''));
        const y = lbl ? RawFlightDataService.scheduleLabelToYmd(lbl) : null;
        if (y) opYmdCandidates.add(y);
      }
      const isCancelledFromCollection = cancelSerialCandidates.some((cs) =>
        [...opYmdCandidates].some((opYmd) =>
          dateCancelledKeys.has(`${cs}|${opYmd}`),
        ),
      );

      const isCancelledFromMainDetails =
        !!canonicalOpStr && mainDetailsCancelled.has(canonicalOpStr);

      const isCancelledFromFlightNo =
        RawFlightDataService.isScheduleFlightNoMarkedCancelled(row.data);

      if (
        isCancelledFromCollection ||
        isCancelledFromMainDetails ||
        isCancelledFromFlightNo
      ) {
        row.data.flightStatus = 'Cancelled';
        row.data.flightCancelled = true;
        row.data.isCancelled = true;
      }
      const fhrM = !!(
        fhr?.mainDetails != null && typeof fhr.mainDetails === 'object'
      );
      const fhrT = !!(
        fhr?.terminalDetails != null && typeof fhr.terminalDetails === 'object'
      );
      const fhrR1 = !!(
        fhr?.rampDetails1 != null && typeof fhr.rampDetails1 === 'object'
      );
      const fhrL = !!(
        fhr?.loadControlDetails != null &&
        typeof fhr.loadControlDetails === 'object'
      );
      const eqE = fhr?.equipmentManpower;
      const fhrG =
        eqE != null &&
        typeof eqE === 'object' &&
        (() => {
          const entries = Array.isArray(
            (eqE as { entries?: unknown[] }).entries,
          )
            ? (eqE as { entries: unknown[] }).entries
            : [];
          if (entries.length > 0) return true;
          return (
            RawFlightDataService.nonEmpty(
              (eqE as { verifiedBy?: string }).verifiedBy,
            ) ||
            RawFlightDataService.nonEmpty(
              (eqE as { verifiedAt?: string }).verifiedAt,
            )
          );
        })();

      const hasMainEffective = fhrM;
      const hasT = fhrT;
      const hasR = fhrR1;
      const hasL = fhrL;
      const hasG = fhrG;

      row.data.hasMainDetails = hasMainEffective;
      row.data.hasTerminalDetails = hasT;
      row.data.hasRampDetails = hasR;
      row.data.hasLoadControlDetails = hasL;
      row.data.hasEquipmentManpowerDetails = hasG;

      const mainEmbedFhrOnly = fhr?.mainDetails as
        | Record<string, unknown>
        | undefined;
      const typeFromEmbed = RawFlightDataService.nonEmpty(
        mainEmbedFhrOnly?.TypeofHandling,
        mainEmbedFhrOnly?.typeOfHandling,
      );
      if (typeFromEmbed) {
        row.data.typeOfHandling = typeFromEmbed;
        row.data.TypeofHandling = typeFromEmbed;
        row.data['Type of Handling'] = typeFromEmbed;
      }

      const flightTypeFromEmbed = RawFlightDataService.nonEmpty(
        mainEmbedFhrOnly?.Typeofflight,
        mainEmbedFhrOnly?.typeofflight,
        mainEmbedFhrOnly?.['Type of flight'],
        mainEmbedFhrOnly?.flightType,
      );
      if (flightTypeFromEmbed) {
        row.data.Typeofflight = flightTypeFromEmbed;
        row.data.flightType = flightTypeFromEmbed;
        row.data['Type of flight'] = flightTypeFromEmbed;
      }

      const fhrLean = fhr;
      const cateFromEmbed = RawFlightDataService.nonEmpty(
        RawFlightDataService.categoryOfFlightFromFhrCollectionLean(fhrLean),
        mainEmbedFhrOnly?.Cate_of_Flight,
        mainEmbedFhrOnly?.cate_of_flight,
        row.data.Cate_of_Flight,
        row.data.cate_of_flight,
        row.data.category_of_flights,
        row.data.category_of_flight,
      );
      if (cateFromEmbed) {
        row.data.Cate_of_Flight = cateFromEmbed;
        row.data.cate_of_flight = cateFromEmbed;
        row.data.category_of_flights = cateFromEmbed;
        row.data.category_of_flight = cateFromEmbed;
      }

      /** Expose ATA/ATD from `mainDetails` and STA/STD from `loadControlDetails` on flattened `data` for dashboard OTP (fhr_collection embeds only). */
      const lcEmbed = fhrL
        ? (fhr?.loadControlDetails as Record<string, unknown> | undefined)
        : undefined;
      const applyDdMmPair = (
        dateRaw: unknown,
        timeRaw: unknown,
      ): { dn: string; tn: string } | null => {
        const ds = RawFlightDataService.nonEmpty(String(dateRaw ?? ''));
        const ts = RawFlightDataService.nonEmpty(String(timeRaw ?? ''));
        if (!ds || !ts) return null;
        const dn = RawFlightDataService.normalizeDateDdMmYyyy(ds);
        const tn = RawFlightDataService.normalizeTimeHhMm(ts);
        if (!dn || !tn) return null;
        return { dn, tn };
      };
      if (mainEmbedFhrOnly) {
        const ataPair = applyDdMmPair(
          mainEmbedFhrOnly.ATADate,
          mainEmbedFhrOnly.ATATime,
        );
        if (ataPair) {
          row.data.ataDate = ataPair.dn;
          row.data['ATA Date'] = ataPair.dn;
          row.data.ATADate = ataPair.dn;
          row.data.ataTime = ataPair.tn;
          row.data['ATA Time'] = ataPair.tn;
          row.data.ATATime = ataPair.tn;
        }
        const atdPair = applyDdMmPair(
          mainEmbedFhrOnly.ATDDate,
          mainEmbedFhrOnly.ATDTime,
        );
        if (atdPair) {
          row.data.atdDate = atdPair.dn;
          row.data['ATD Date'] = atdPair.dn;
          row.data.ATDDate = atdPair.dn;
          row.data.atdTime = atdPair.tn;
          row.data['ATD Time'] = atdPair.tn;
          row.data.ATDTime = atdPair.tn;
        }
      }
      if (lcEmbed) {
        const staLc = applyDdMmPair(lcEmbed.STADate, lcEmbed.STATime);
        if (staLc) {
          row.data.staDate = staLc.dn;
          row.data['STA Date'] = staLc.dn;
          row.data.STADate = staLc.dn;
          row.data.staTime = staLc.tn;
          row.data['STA Time'] = staLc.tn;
          row.data.STATime = staLc.tn;
        }
        const stdLc = applyDdMmPair(lcEmbed.STDDate, lcEmbed.STDTime);
        if (stdLc) {
          row.data.stdDate = stdLc.dn;
          row.data['STD Date'] = stdLc.dn;
          row.data.STDDate = stdLc.dn;
          row.data.stdTime = stdLc.tn;
          row.data['STD Time'] = stdLc.tn;
          row.data.STDTime = stdLc.tn;
        }
      }

      /** Arrival/departure delay rows + departure status from embedded main details (dashboard GHA codes 11–52). */
      if (mainEmbedFhrOnly) {
        const ad =
          mainEmbedFhrOnly.arrivalDelays ?? mainEmbedFhrOnly.ArrivalDelays;
        const dd =
          mainEmbedFhrOnly.departureDelays ?? mainEmbedFhrOnly.DepartureDelays;
        if (Array.isArray(ad) && ad.length > 0) {
          row.data.arrivalDelays = ad;
        }
        if (Array.isArray(dd) && dd.length > 0) {
          row.data.departureDelays = dd;
        }
        const depStat = RawFlightDataService.nonEmpty(
          mainEmbedFhrOnly.departureStatus,
          mainEmbedFhrOnly.DepartureStatus,
        );
        if (depStat) {
          row.data.departureStatus = depStat;
          row.data.DepartureStatus = depStat;
        }
        const depDelayFreeText = RawFlightDataService.nonEmpty(
          mainEmbedFhrOnly.departureDelay,
          mainEmbedFhrOnly.DepartureDelay,
        );
        if (depDelayFreeText) {
          row.data.departureDelay = depDelayFreeText;
          row.data.DepartureDelay = depDelayFreeText;
        }
      }

      row.data.rampLocked = hasR ? 'Yes' : 'No';
      row.data.paxLocked = hasT ? 'Yes' : 'No';
      row.data.gsdLocked = hasG ? 'Yes' : 'No';
      row.data['Ramp Locked'] = row.data.rampLocked;
      row.data['PAX Locked'] = row.data.paxLocked;
      row.data['GSD Locked'] = row.data.gsdLocked;

      if (
        row.data.flightStatus !== 'Cancelled' &&
        row.data.isCancelled !== true
      ) {
        row.data.flightStatus = RawFlightDataService.flightStatusFromFormAndLockPresence(
          {
            hasMain: hasMainEffective,
            hasTerminal: hasT,
            hasRamp: hasR,
            hasLoadControl: hasL,
            hasGsd: !!hasG,
          },
        );
      }

      const ata = canonicalOpStr ? (ataBySerial.get(canonicalOpStr) ?? '') : '';
      const r1 =
        fhrR1 && fhr
          ? (fhr.rampDetails1 as {
              firstBagInBmaTime?: string;
              lastBagInBmaTime?: string;
            })
          : null;
      const rampFirst = RawFlightDataService.nonEmpty(
        r1 ? String(r1.firstBagInBmaTime ?? '') : '',
      );
      const rampLast = RawFlightDataService.nonEmpty(
        r1 ? String(r1.lastBagInBmaTime ?? '') : '',
      );

      row.data.fBag = RawFlightDataService.bagAchievedByAta(ata, rampFirst, 15);
      row.data['F Bag'] = row.data.fBag;
      row.data.lBag = RawFlightDataService.bagAchievedByAta(ata, rampLast, 40);
      row.data['L Bag'] = row.data.lBag;

      let exportedNav =
        RawFlightDataService.exportedNavLabelForDailyRow(mainEmbedFhrOnly);
      if (exportedNav !== 'Yes') {
        const navCandidates = [
          canonicalOpStr,
          primaryNorm,
          legacyNorm,
          String(row.data.SlNo ?? '').trim(),
          String(row.data.slNo ?? '').trim(),
          String(row.data.serialNo ?? '').trim(),
          String(row.data.legacySlNo ?? '').trim(),
        ];
        for (const key of navCandidates) {
          if (key && navFromRaw.get(key) === 'Yes') {
            exportedNav = 'Yes';
            break;
          }
        }
      }
      row.data.exportedNAV = exportedNav;
      row.data.ExportedNAV = exportedNav;
      row.data['Exported NAV'] = exportedNav;

      delete row.data._inRequestedRange;
      return row;
    });
  }

  /** List saved master rows from `advance_schedule_setup` (Advance → Schedule Setup). */
  async listAdvanceScheduleSetupMasters(
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    return this.advanceScheduleModel
      .find(StationScope.filter({}, station))
      .sort({ updatedAt: -1 })
      .lean();
  }

  /**
   * Stretch Valid To on this station's Schedule Setup masters (and matching
   * raw_flight_data copies). Never shortens. Does not mint daily FHR rows.
   */
  async extendAdvanceScheduleValidityTo(
    validToRaw: string,
    station: StationScopeContext,
  ): Promise<{
    success: true;
    validTo: string;
    scanned: number;
    updated: number;
    skipped: number;
    rawUpdated: number;
  }> {
    const validTo = RawFlightDataService.normalizeDateDdMmYyyy(validToRaw);
    const parsed = parseScheduleDateDdMmYyyy(validTo);
    if (!validTo || !parsed) {
      throw new BadRequestException('Valid To must be a date (dd/MM/yyyy).');
    }
    const year = parsed.getFullYear();
    if (year < 2026 || year > 2028) {
      throw new BadRequestException(
        'Valid To year must be between 2026 and 2028.',
      );
    }

    const docs = await this.advanceScheduleModel
      .find(StationScope.filter({}, station))
      .lean();

    let updated = 0;
    let skipped = 0;
    let rawUpdated = 0;

    for (const doc of docs) {
      const data = (doc.data ?? {}) as Record<string, unknown>;
      const currentTo = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(data.validTo, data['Valid To']),
      );
      const currentFrom = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(data.validFrom, data['Valid From']),
      );
      if (currentFrom && compareScheduleDates(currentFrom, validTo) > 0) {
        skipped += 1;
        continue;
      }
      const next = pickExtendedValidTo(currentTo, validTo);
      if (!next) {
        skipped += 1;
        continue;
      }

      await this.advanceScheduleModel.updateOne(
        { _id: doc._id },
        {
          $set: {
            'data.validTo': next,
            'data.Valid To': next,
          },
        },
      );
      updated += 1;

      const serial = String(doc.serialNo ?? '').trim();
      if (!serial) continue;
      const rawRes = await this.rawFlightDataModel.updateMany(
        StationScope.filter({ $or: this.serialMatchFilter(serial) }, station),
        {
          $set: {
            'data.validTo': next,
            'data.Valid To': next,
          },
        },
      );
      rawUpdated += rawRes.modifiedCount ?? 0;
    }

    return {
      success: true,
      validTo,
      scanned: docs.length,
      updated,
      skipped,
      rawUpdated,
    };
  }

  /** Remove one master row from `advance_schedule_setup` (Advance → Gateway → Scheduled Airlines). */
  async removeAdvanceScheduleSetupMaster(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const trimmed = String(id ?? '').trim();
    if (!trimmed) {
      throw new NotFoundException('Schedule setup record not found');
    }

    const scope = StationScope.filter({}, station);
    let deleted: AdvanceScheduleSetupDocument | null = null;

    if (Types.ObjectId.isValid(trimmed)) {
      deleted = await this.advanceScheduleModel
        .findOneAndDelete({ ...scope, _id: trimmed })
        .exec();
    }

    if (!deleted) {
      deleted = await this.advanceScheduleModel
        .findOneAndDelete({ ...scope, serialNo: trimmed })
        .exec();
    }

    if (!deleted) {
      throw new NotFoundException('Schedule setup record not found');
    }

    return { message: 'Deleted successfully', serialNo: deleted.serialNo };
  }

  /**
   * Distinct airlines present on schedule-setup master rows (`data.airline` / `data.Airline`),
   * optionally with `Airline Code` when stored on the same document.
   */
  async listDistinctAirlinesFromAdvanceScheduleSetup(
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{ id: string; name: string; code: string }[]> {
    const docs = await this.advanceScheduleModel
      .find(StationScope.filter({}, station))
      .select({ data: 1 })
      .lean();
    const byLower = new Map<string, { name: string; code: string }>();
    for (const doc of docs) {
      const data = doc?.data as Record<string, unknown> | undefined;
      if (!data || typeof data !== 'object') continue;
      const name = RawFlightDataService.nonEmpty(
        data.airline,
        data.Airline,
      ).trim();
      if (!name) continue;
      const code = RawFlightDataService.nonEmpty(
        data['Airline Code'],
        data.airlineCode,
      ).trim();
      const key = name.toLowerCase();
      const prev = byLower.get(key);
      if (!prev) {
        byLower.set(key, { name, code });
      } else if (code && !prev.code) {
        prev.code = code;
      }
    }
    return Array.from(byLower.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({
        id: r.name,
        name: r.name,
        code: r.code,
      }));
  }

  /**
   * Distinct flight numbers from Advance → Schedule Setup for one airline.
   * Used by Creation → Schedule Airlines Flight No dropdown.
   */
  async listFlightNosFromAdvanceScheduleSetup(
    airline: string,
    airlineCode?: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{ flightNo: string }[]> {
    const al = RawFlightDataService.nonEmpty(airline);
    const code = RawFlightDataService.nonEmpty(airlineCode).toUpperCase();
    if (!al && !code) {
      throw new BadRequestException('airline or airlineCode is required');
    }

    const docs = await this.advanceScheduleModel
      .find(StationScope.filter({}, station))
      .select({ data: 1 })
      .lean();

    const seen = new Set<string>();
    const out: string[] = [];
    for (const doc of docs) {
      const data =
        doc?.data && typeof doc.data === 'object' && !Array.isArray(doc.data)
          ? (doc.data as Record<string, unknown>)
          : {};
      if (!RawFlightDataService.airlineMatchesFind(al, code, data)) continue;

      const flightNo = RawFlightDataService.nonEmpty(
        displayFlightNoFromScheduleData(data),
      );
      if (!flightNo) continue;
      const key = flightNo.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(flightNo);
    }

    out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return out.map((flightNo) => ({ flightNo }));
  }

  /**
   * One-time admin reset: clears persisted instance->serial mapping and global counter.
   *
   * Multi-station safety guard: this clears shared serial-mapping infrastructure.
   * It must be explicitly confirmed with `{ allStations: true }` so it cannot be
   * triggered accidentally. Under the approved Strategy A (shared global serial
   * pool) serials stay globally unique across all stations — there are no
   * per-station serial counters or ranges; `flight_serial_counter` remains a
   * global system collection and is never station-scoped.
   */
  async resetGlobalSerialMapping(
    opts: { allStations?: boolean; isGlobalAdmin?: boolean } = {},
  ) {
    if (opts.allStations && opts.isGlobalAdmin !== true) {
      throw new ForbiddenException(
        'Only Global Admins may run all-stations (cross-station) maintenance operations.',
      );
    }
    if (!opts.allStations) {
      throw new BadRequestException(
        'Refusing to reset serial mapping without confirmation. Pass { allStations: true } to confirm this cross-station reset.',
      );
    }
    const [indexDelete, counterDelete] = await Promise.all([
      this.flightInstanceIndexModel.deleteMany({}),
      this.flightSerialCounterModel.deleteMany({
        $or: [{ key: RawFlightDataService.GLOBAL_SERIAL_COUNTER_ID }],
      }),
    ]);
    return {
      success: true,
      message:
        'Global flight serial mapping reset. Regeneration will restart from 100001.',
      deletedIndexRows: indexDelete.deletedCount ?? 0,
      deletedCounterRows: counterDelete.deletedCount ?? 0,
    };
  }

  /**
   * Remove `raw_flight_data` rows whose serial fields are exactly six decimal digits
   * (same class as Scheduled Airlines UI hidden “global instance” serials: 100000–999999,
   * zero-padded 6-char strings, FL-###### labels). Stale duplicates here can skew counts
   * and lookups; schedule masters remain in `advance_schedule_setup`.
   */
  async pruneRawFlightDataSixDigitSerialRows(
    opts: { allStations?: boolean; isGlobalAdmin?: boolean } = {},
  ): Promise<{
    success: true;
    deletedCount: number;
    message: string;
  }> {
    if (opts.allStations && opts.isGlobalAdmin !== true) {
      throw new ForbiddenException(
        'Only Global Admins may run all-stations (cross-station) maintenance operations.',
      );
    }
    if (!opts.allStations) {
      throw new BadRequestException(
        'Refusing to prune raw_flight_data without confirmation. Pass { allStations: true } to confirm this cross-station cleanup.',
      );
    }
    const sixDigitString = '^[0-9]{6}$';
    const filter = {
      $or: [
        {
          'data.SerialNo': {
            $gte: RawFlightDataService.GLOBAL_SERIAL_BASE,
            $lte: 999999,
          },
        },
        { 'data.serialNo': { $gte: 100000, $lte: 999999 } },
        { 'data.slNo': { $regex: sixDigitString } },
        { 'data.SlNo': { $regex: sixDigitString } },
        { 'data.serialNo': { $regex: sixDigitString } },
        { 'data.Serial No': { $regex: sixDigitString } },
        { 'data.Serial Number': { $regex: sixDigitString } },
        { 'data.SerialNo': { $regex: sixDigitString } },
        { 'data.serialLabel': { $regex: '^FL-[0-9]{6}$', $options: 'i' } },
      ],
    };
    const res = await this.rawFlightDataModel.deleteMany(filter);
    return {
      success: true,
      deletedCount: res.deletedCount ?? 0,
      message:
        'Deleted raw_flight_data documents with six-digit serial identifiers (numeric 100000–999999 or matching string / FL-###### fields).',
    };
  }

  /**
   * Resolve the stationCode to stamp on a NEW raw flight row. A scoped FRIS user
   * (or admin with an active station) stamps that station; a cross-station/system
   * caller without an active station falls back to the legacy station (MAA),
   * matching current single-station production. Serials are never derived from
   * this value.
   */
  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }


  async getAllRawFlightData(
    date: string | undefined,
    station: StationScopeContext,
  ) {
    const filter = date ? { 'data.STA Date': date } : {};

    return this.rawFlightDataModel
      .find(StationScope.filter(filter, station))
      .sort({ 'data.STA Time': 1 })
      .lean();
  }

  async filterByDateRange(
    from: string,
    to: string,
    station: StationScopeContext,
  ) {
    if (!from || !to) {
      throw new BadRequestException('From and To dates are required');
    }

    // Convert from/to into numeric keys: YYYYMMDD
    const fromKey = Number(from.replace(/-/g, '')); // 20251201
    const toKey = Number(to.replace(/-/g, '')); // 20251231

    const allFlights = await this.rawFlightDataModel
      .find(StationScope.filter({}, station))
      .lean();
    const staDateKey = (
      data: Record<string, unknown> | undefined,
    ): number | null => {
      const raw =
        data?.['STA Date'] ??
        data?.staDate ??
        data?.STADate ??
        data?.['Valid From'];
      if (raw == null || String(raw).trim() === '') return null;
      const s = String(raw).trim();
      const normalized = s.includes('/') ? s : s.replace(/-/g, '/');
      const [day, month, year] = normalized.split('/');
      if (!year || !month || !day) return null;
      return Number(`${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`);
    };

    const filtered = allFlights.filter((doc: any) => {
      const k = staDateKey(doc.data);
      if (k == null) return false;
      return k >= fromKey && k <= toKey;
    });

    return filtered.sort((a, b) => {
      const keyA = staDateKey(a.data) ?? 0;
      const keyB = staDateKey(b.data) ?? 0;
      return keyA - keyB;
    });
  }

  /**
   * STA/STD fields as stored from Advance Schedule Setup (and other ingest) under `data`.
   */
  private extractScheduleFields(
    data: Record<string, unknown> | null | undefined,
  ): {
    serialNo?: string;
    airline?: string;
    flightNo?: string;
    aircraft?: string;
    staDate: string;
    stdDate: string;
    staTime: string;
    stdTime: string;
    route?: string;
    typeOfHandling?: string;
    categoryOfFlight?: string;
    scheduleSource?: string;
  } {
    const d = data ?? {};
    const str = (v: unknown) => (v != null ? String(v).trim() : '');
    const route = str(d.route ?? d.Routing ?? d.routing);
    const serialNo = str(
      d.SlNo ?? d.slNo ?? d['Serial No'] ?? d.serialNo ?? d.SerialNo,
    );
    const airline = str(d.airline ?? d.Airline ?? d.airlines);
    const flightNo = str(d.flightNo ?? d['Flight No'] ?? d.FlightNo);
    const aircraft = str(d.aircraft ?? d.Aircraft ?? d.TypeCraft ?? d.acType);
    const typeOfHandling = str(
      d['Type of Handling'] ??
        d.typeOfHandling ??
        d.TypeofHandling ??
        d.opsType ??
        d.operations ??
        d.ops,
    );
    const categoryOfFlight = str(
      d['Type of flight'] ??
        d['Flight Type'] ??
        d.categoryOfFlight ??
        d.Cate_of_Flight ??
        d.category_of_flight,
    );
    return {
      ...(serialNo ? { serialNo } : {}),
      ...(airline ? { airline } : {}),
      ...(flightNo ? { flightNo } : {}),
      ...(aircraft ? { aircraft } : {}),
      staDate: str(
        d.staDate ?? d['STA Date'] ?? d.STADate ?? d['Valid From'] ?? d.date,
      ),
      stdDate: str(
        d.stdDate ??
          d['STD Date'] ??
          d.STDDate ??
          d['Valid To'] ??
          d.date2 ??
          d.date,
      ),
      staTime: str(d.staTime ?? d['STA Time'] ?? d.STATime),
      stdTime: str(d.stdTime ?? d['STD Time'] ?? d.STDTime),
      ...(route ? { route } : {}),
      ...(typeOfHandling ? { typeOfHandling } : {}),
      ...(categoryOfFlight ? { categoryOfFlight } : {}),
      scheduleSource: str(d.scheduleSource),
    };
  }

  private async resolveScheduleSerialCandidates(
    serialNo: string,
  ): Promise<string[]> {
    const s = String(serialNo ?? '').trim();
    if (!s) return [];
    const mapped = await this.flightInstanceIndexModel
      .find({ serialNo: s }, { scheduleId: 1, _id: 0 })
      .lean();
    return Array.from(
      new Set([
        s,
        ...mapped
          .map((row) => String(row.scheduleId ?? '').trim())
          .filter(Boolean),
      ]),
    );
  }

  /** Aircraft type stored on `advance_schedule_setup` for a flight or schedule serial. */
  async getAdvanceScheduleSetupAircraft(
    serialNo: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<string> {
    const candidates = await this.resolveScheduleSerialCandidates(serialNo);
    if (candidates.length === 0) return '';
    const doc = await this.advanceScheduleModel
      .findOne(StationScope.filter({ serialNo: { $in: candidates } }, station))
      .select({ data: 1 })
      .lean();
    if (!doc?.data || typeof doc.data !== 'object' || Array.isArray(doc.data)) {
      return '';
    }
    const d = doc.data as Record<string, unknown>;
    return RawFlightDataService.nonEmpty(
      d.aircraft,
      d.Aircraft,
      d.TypeCraft,
      d.acType,
    );
  }

  /** One row from `advance_schedule_setup` by flight serial (or mapped schedule serial). */
  async findScheduleBySerial(
    serialNo: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const candidates = await this.resolveScheduleSerialCandidates(serialNo);
    if (candidates.length === 0) return null;
    const doc = await this.advanceScheduleModel
      .findOne(StationScope.filter({ serialNo: { $in: candidates } }, station))
      .lean();
    if (doc?.data && typeof doc.data === 'object') {
      return this.extractScheduleFields({
        ...doc.data,
        serialNo: doc.serialNo,
      });
    }
    const cre = await this.scheduledCreationModel
      .findOne(StationScope.filter({ serialNo: { $in: candidates } }, station))
      .sort({ updatedAt: -1 })
      .lean();
    if (!cre?.data || typeof cre.data !== 'object') return null;
    return this.extractScheduleFields({
      ...cre.data,
      serialNo: cre.serialNo,
      scheduleSource: 'scheduled_airlines_creation',
    });
  }

  /**
   * Bulk schedule lookup — one `$in` query per collection instead of N per-serial queries.
   * Used by the flight-report-batch path so large exports do 2 queries total instead of
   * 2 × N (one per serial for advance_schedule_setup + scheduled_airlines_creation).
   * Advance schedule is preferred; creation doc fills in only when no advance doc exists.
   */
  async findSchedulesBySerialsBulk(
    serials: number[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Map<number, ReturnType<RawFlightDataService['extractScheduleFields']>>> {
    const unique = Array.from(new Set(serials.filter((n) => Number.isFinite(n))));
    const out = new Map<
      number,
      ReturnType<RawFlightDataService['extractScheduleFields']>
    >();
    if (unique.length === 0) return out;

    const stringSerials = unique.map(String);

    const [advanceDocs, creationDocs] = await Promise.all([
      this.advanceScheduleModel
        .find(
          StationScope.filter({ serialNo: { $in: stringSerials } }, station),
          { serialNo: 1, data: 1 },
        )
        .lean(),
      this.scheduledCreationModel
        .find(
          StationScope.filter({ serialNo: { $in: stringSerials } }, station),
          { serialNo: 1, data: 1 },
        )
        .sort({ updatedAt: -1 })
        .lean(),
    ]);

    for (const doc of advanceDocs) {
      if (!doc?.data || typeof doc.data !== 'object') continue;
      const serial = Number(doc.serialNo);
      if (!Number.isFinite(serial)) continue;
      if (!out.has(serial)) {
        out.set(
          serial,
          this.extractScheduleFields({
            ...(doc.data as Record<string, unknown>),
            serialNo: doc.serialNo,
          }),
        );
      }
    }

    for (const doc of creationDocs) {
      if (!doc?.data || typeof doc.data !== 'object') continue;
      const serial = Number(doc.serialNo);
      if (!Number.isFinite(serial)) continue;
      if (!out.has(serial)) {
        out.set(
          serial,
          this.extractScheduleFields({
            ...(doc.data as Record<string, unknown>),
            serialNo: doc.serialNo,
            scheduleSource: 'scheduled_airlines_creation',
          }),
        );
      }
    }

    return out;
  }

  /**
   * Navision export flag for Invoice Pending → Exported Data Status.
   * `Y` → exported in Navision; `N` → not exported.
   */
  async setNavisionDataExportStatus(
    serialNo: string,
    body: {
      status: 'Y' | 'N';
      recordType?: 'flight' | 'equipment';
      flightType?: string;
    },
    station: StationScopeContext,
  ): Promise<{
    ok: true;
    serialNo: string;
    status: 'Y' | 'N';
    recordType: string;
  }> {
    const serial = String(serialNo ?? '')
      .trim()
      .replace(/^FL-/i, '');
    if (!serial) {
      throw new BadRequestException('Serial No is required.');
    }

    const status: 'Y' | 'N' = body.status === 'Y' ? 'Y' : 'N';
    const recordType = body.recordType === 'equipment' ? 'equipment' : 'flight';
    const navDisplay = status === 'Y' ? 'Yes' : 'No';

    if (recordType === 'equipment') {
      const n = Number(serial);
      if (!Number.isFinite(n)) {
        throw new BadRequestException(
          'Equipment export requires a numeric serial.',
        );
      }
      const eqUpdate = await this.equipmentManpowerModel.updateOne(
        { serialNo: n, isEquipmentManpowerCatalog: { $ne: true } },
        { $set: { 'entries.$[].exportedInNav': status } },
      );
      if (eqUpdate.matchedCount === 0) {
        throw new NotFoundException(
          `No equipment/manpower record for serial ${serial}.`,
        );
      }

      try {
        await this.fhrCollectionService.upsertMerge(
          n,
          { equipmentManpower: { exportedInNav: status } },
          'navision_export_status',
          station,
        );
      } catch (err: unknown) {
        this.logger.warn(
          `[setNavisionDataExportStatus] FHR equipment merge failed for ${serial}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      this.bustScheduledListCaches(station, {
        reason: 'navision_export_status',
      });
      return { ok: true, serialNo: serial, status, recordType };
    }

    const or = this.serialMatchFilter(serial);
    const rawDoc = await this.rawFlightDataModel
      .findOne(StationScope.filter({ $or: or }, station))
      .lean();
    if (!rawDoc?.data || typeof rawDoc.data !== 'object') {
      const n = Number(serial);
      const data: Record<string, unknown> = {
        SlNo: serial,
        slNo: serial,
        'Serial No': serial,
        serialNo: serial,
        exportedNAV: navDisplay,
        ExportedNAV: navDisplay,
        'Exported NAV': navDisplay,
      };
      if (Number.isFinite(n)) data.SerialNo = n;
      await this.rawFlightDataModel.create({
        data,
        stationCode: this.stampStationCode(station),
      });
    } else {
      const data = {
        ...(rawDoc.data as Record<string, unknown>),
        exportedNAV: navDisplay,
        ExportedNAV: navDisplay,
        'Exported NAV': navDisplay,
      };
      await this.rawFlightDataModel.updateOne(
        { _id: rawDoc._id },
        { $set: { data } },
      );
    }

    const n = Number(serial);
    if (Number.isFinite(n)) {
      try {
        await this.fhrCollectionService.upsertMerge(
          n,
          {
            mainDetails: {
              exportedNAV: navDisplay,
              navisionDataExportStatus: status,
            },
          },
          'navision_export_status',
          station,
        );
      } catch {
        /* FHR row may not exist yet */
      }
    }

    this.bustScheduledListCaches(station, {
      reason: 'navision_export_status',
    });
    return { ok: true, serialNo: serial, status, recordType };
  }

  private static isExportedNavValue(value: unknown): boolean {
    const s = String(value ?? '')
      .trim()
      .toLowerCase();
    return s === 'exported' || s === 'y' || s === 'yes';
  }

  /** Scheduled Airlines NAV column: Yes / No. */
  private static exportedNavLabelForDailyRow(
    data: Record<string, unknown> | undefined,
  ): string {
    if (!data) return 'No';
    const raw = RawFlightDataService.nonEmpty(
      data.exportedNAV,
      data['Exported NAV'],
      data.ExportedNAV,
      data.navisionDataExportStatus === 'Y' ? 'Yes' : '',
    );
    return RawFlightDataService.isExportedNavValue(raw) ? 'Yes' : 'No';
  }

  private static serialKeysFromDataRow(
    data: Record<string, unknown>,
  ): string[] {
    const keys = [
      data.SlNo,
      data.slNo,
      data['Serial No'],
      data.serialNo,
      data.legacySlNo,
      data.SerialNo,
    ];
    return [
      ...new Set(keys.map((k) => String(k ?? '').trim()).filter(Boolean)),
    ];
  }

  /** Batch-load NAV export flags from `raw_flight_data` for scheduled table rows. */
  private async loadExportedNavLabelsBySerials(
    serials: string[],
  ): Promise<Map<string, string>> {
    const unique = [
      ...new Set(serials.map((s) => String(s).trim()).filter(Boolean)),
    ];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;

    const or: Record<string, string | number>[] = [];
    for (const s of unique) {
      or.push(...this.serialMatchFilter(s));
    }

    const docs = await this.rawFlightDataModel
      .find({ $or: or })
      .select({ data: 1 })
      .lean();

    for (const doc of docs) {
      if (!doc?.data || typeof doc.data !== 'object') continue;
      const d = doc.data as Record<string, unknown>;
      const label = RawFlightDataService.exportedNavLabelForDailyRow(d);
      if (label !== 'Yes') continue;
      for (const key of RawFlightDataService.serialKeysFromDataRow(d)) {
        map.set(key, 'Yes');
      }
    }
    return map;
  }

  private static queryParamToYmd(input?: string): string | null {
    const s = String(input ?? '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const ddMm = RawFlightDataService.normalizeDateDdMmYyyy(s);
    if (!ddMm) return null;
    const parts = ddMm.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  private static ymdToDdMmYyyy(ymd: string): string {
    const parts = ymd.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
    const [y, m, d] = parts;
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }

  private mapDataToNavisionExportError(
    data: Record<string, unknown>,
    serialFallback: string,
  ): {
    serialNo: string;
    airline: string;
    flightNo: string;
    staDate: string;
    staTime: string;
    stdDate: string;
    errorMessage: string;
    errorDate: string;
    exportedStatus: string;
  } {
    const pick = (...vals: unknown[]) => {
      for (const v of vals) {
        const s = String(v ?? '').trim();
        if (s) return s;
      }
      return '';
    };
    const exportedStatus = pick(
      data.exportedNAV,
      data.ExportedNAV,
      data['Exported NAV'],
    );
    return {
      serialNo: pick(
        data.SlNo,
        data.slNo,
        data['Serial No'],
        data.serialNo,
        serialFallback,
      ),
      airline: pick(data.Airline, data.airline),
      flightNo: pick(
        data['Flight No'],
        data.flightNo,
        data.FlightNo,
        data['Flight Number'],
      ),
      staDate: pick(data['STA Date'], data.staDate, data.STADate),
      staTime: pick(data['STA Time'], data.staTime, data.STATime),
      stdDate: pick(data['STD Date'], data.stdDate, data.STDDate),
      errorMessage:
        'Error report while exporting to Navision — record not marked as exported (Exported NAV).',
      errorDate: new Date().toISOString().slice(0, 10),
      exportedStatus: exportedStatus || 'No',
    };
  }

  /**
   * Invoice Pending → Exported Error Report: flights not exported to Navision in range or by serial.
   */
  async listNavisionExportErrors(
    params: {
      serialNo?: string;
      fromDate?: string;
      tillDate?: string;
    },
    station: StationScopeContext,
  ): Promise<
    Array<{
      serialNo: string;
      airline: string;
      flightNo: string;
      staDate: string;
      staTime: string;
      stdDate: string;
      errorMessage: string;
      errorDate: string;
      exportedStatus: string;
    }>
  > {
    const serial = String(params.serialNo ?? '')
      .trim()
      .replace(/^FL-/i, '');
    if (serial) {
      const or = this.serialMatchFilter(serial);
      const doc = await this.rawFlightDataModel
        .findOne(StationScope.filter({ $or: or }, station))
        .lean();
      if (!doc?.data || typeof doc.data !== 'object') return [];
      const d = doc.data as Record<string, unknown>;
      if (
        RawFlightDataService.isExportedNavValue(
          d.exportedNAV ?? d['Exported NAV'],
        )
      ) {
        return [];
      }
      return [this.mapDataToNavisionExportError(d, serial)];
    }

    const fromYmd = RawFlightDataService.queryParamToYmd(params.fromDate);
    const toYmd = RawFlightDataService.queryParamToYmd(params.tillDate);
    if (!fromYmd || !toYmd) {
      throw new BadRequestException(
        'Provide serialNo or both fromDate and tillDate (yyyy-MM-dd or dd/MM/yyyy).',
      );
    }
    if (fromYmd > toYmd) {
      throw new BadRequestException('fromDate must be on or before tillDate.');
    }

    const fromDd = RawFlightDataService.ymdToDdMmYyyy(fromYmd);
    const toDd = RawFlightDataService.ymdToDdMmYyyy(toYmd);
    const daily = await this.listDailyFromAdvance(fromDd, toDd, true);
    const out: ReturnType<
      RawFlightDataService['mapDataToNavisionExportError']
    >[] = [];
    const seen = new Set<string>();

    for (const row of daily) {
      const d = row?.data;
      if (!d || typeof d !== 'object') continue;
      const data = d as Record<string, unknown>;
      if (RawFlightDataService.isExportedNavValue(data.exportedNAV)) continue;

      const sl = String(
        data.SlNo ?? data.slNo ?? data['Serial No'] ?? data.serialNo ?? '',
      ).trim();
      const key = sl || `${data.flightNo}-${data.staDate}`;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);

      const cancelled =
        data.isCancelled === true ||
        data.flightCancelled === true ||
        String(data.flightStatus ?? '')
          .trim()
          .toLowerCase() === 'cancelled';
      if (cancelled) continue;

      out.push(this.mapDataToNavisionExportError(data, sl));
    }

    out.sort((a, b) => {
      const ak = `${a.staDate}\0${a.serialNo}`;
      const bk = `${b.staDate}\0${b.serialNo}`;
      return ak.localeCompare(bk);
    });
    return out;
  }

  /** Operating-day row for a generated instance serial (`flight_instance_index`). */
  async getInstanceOccurrenceBySerial(serialNo: string): Promise<{
    operationDate: string;
    scheduleId: string;
  } | null> {
    const s = RawFlightDataService.normalizeInstanceSerial(
      String(serialNo ?? ''),
    );
    if (!s) return null;
    const row = await this.flightInstanceIndexModel
      .findOne({ serialNo: s })
      .select({ operationDate: 1, scheduleId: 1, _id: 0 })
      .lean();
    if (!row) return null;
    const operationDate = RawFlightDataService.normalizeDateDdMmYyyy(
      String(row.operationDate ?? ''),
    );
    const scheduleId = String(row.scheduleId ?? '').trim();
    if (!operationDate) return null;
    return { operationDate, scheduleId };
  }

  async getBasicFlightIdentityBySerial(serialNo: string): Promise<{
    airlineName: string;
    flightNo: string;
    aircraftType: string;
    airlineRepresentativeName: string;
  }> {
    const candidates = await this.resolveScheduleSerialCandidates(serialNo);
    if (candidates.length === 0) {
      return {
        airlineName: '',
        flightNo: '',
        aircraftType: '',
        airlineRepresentativeName: '',
      };
    }
    const doc = await this.advanceScheduleModel
      .findOne({ serialNo: { $in: candidates } })
      .lean();
    const data = doc?.data && typeof doc.data === 'object' ? doc.data : {};
    return {
      airlineName: RawFlightDataService.nonEmpty(data.airline, data.Airline),
      flightNo: RawFlightDataService.nonEmpty(data.flightNo, data['Flight No']),
      aircraftType: RawFlightDataService.nonEmpty(
        data.aircraft,
        data.Aircraft,
        data.TypeCraft,
      ),
      airlineRepresentativeName: RawFlightDataService.nonEmpty(
        data.airlineRepresentativeName,
        data.airlineRep,
      ),
    };
  }

  /**
   * Flight category from `fhr_collection`: optional top-level aliases plus nested `mainDetails`
   * (`Cate_of_Flight`). Does not merge the separate `mainDetails` collection — that is chained in callers.
   */
  private static categoryOfFlightFromFhrCollectionLean(
    fhr: Record<string, unknown> | undefined,
  ): string {
    if (!fhr) return '';
    let mdEmbed: Record<string, unknown> | undefined;
    if (
      fhr.mainDetails != null &&
      typeof fhr.mainDetails === 'object' &&
      !Array.isArray(fhr.mainDetails)
    ) {
      mdEmbed = fhr.mainDetails as Record<string, unknown>;
    }
    return RawFlightDataService.firstFlightCategory(
      fhr.category_of_flights,
      fhr.category_of_flight,
      fhr.categoryOfFlights,
      fhr.categoryOfFlight,
      fhr.flightCategory,
      mdEmbed?.Cate_of_Flight,
      mdEmbed?.cate_of_flight,
      mdEmbed?.flightCategory,
    );
  }

  /** "Unknown" and ops labels are not a flight category. */
  private static firstFlightCategory(...values: unknown[]): string {
    const skip = new Set([
      'unknown',
      'turnaround',
      'transit',
      'arrival',
      'departure',
    ]);
    for (const v of values) {
      if (v == null) continue;
      const t = String(v).trim();
      if (!t || skip.has(t.toLowerCase())) continue;
      return t;
    }
    return '';
  }

  private static nonEmpty(...values: unknown[]): string {
    for (const v of values) {
      if (v == null) continue;
      const t = String(v).trim();
      if (t) return t;
    }
    return '';
  }

  /**
   * Main-details arrival + departure legs as one display flight number.
   * Prefer {@link displayFlightNoFromScheduleData} when schedule/split context exists.
   * If both are set and equal (trim, case-insensitive), returns a single value (not "X/X").
   */
  private static flightNoFromMainArrivalDeparture(
    arrivalRaw: unknown,
    departureRaw: unknown,
  ): string {
    return displayFlightNoFromScheduleData({
      ArrivalFltNo: arrivalRaw,
      DepartureFltNo: departureRaw,
      ifOperationSplit: true,
    });
  }

  /** First non-empty date-like field: supports Mongo `Date` and string labels. */
  private static firstScheduleDateString(...candidates: unknown[]): string {
    for (const v of candidates) {
      if (v == null) continue;
      const s =
        v instanceof Date
          ? RawFlightDataService.dateToYmd(v)
          : String(v).trim();
      if (s) return s;
    }
    return '';
  }

  /** Normalize schedule dates to DD/MM/YYYY (filter + UI expect slashes). */
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

  private static parseDdMmYyyy(input: string): Date | null {
    const s = RawFlightDataService.normalizeDateDdMmYyyy(input);
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

  /** Operating calendar date as YYYY-MM-DD from schedule label (dd/MM/yyyy or yyyy-MM-dd). */
  private static scheduleLabelToYmd(input: string): string | null {
    const raw = String(input ?? '').trim();
    if (!raw) return null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parsed = RawFlightDataService.parseDdMmYyyy(raw);
    if (!parsed) return null;
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private static dateToYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private static addDays(base: Date, days: number): Date {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  private static formatDateDdMmYyyy(d: Date): string {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private static scheduleDateTimeMs(
    dateStr: string,
    timeStr: string,
  ): number | null {
    const d = RawFlightDataService.parseDdMmYyyy(dateStr);
    if (!d) return null;
    return (
      d.getTime() + RawFlightDataService.timeToMinutes(timeStr) * 60 * 1000
    );
  }

  private static validateCreationStaStdTiming(
    body: Record<string, unknown>,
  ): void {
    const staDate = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(body.staDate, body['STA Date'], body.date),
    );
    const stdDate = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(body.stdDate, body['STD Date']),
    );
    const staTime = RawFlightDataService.normalizeTimeHhMm(
      RawFlightDataService.nonEmpty(body.staTime, body['STA Time'], '00:00'),
    );
    const stdTime = RawFlightDataService.normalizeTimeHhMm(
      RawFlightDataService.nonEmpty(body.stdTime, body['STD Time'], '00:00'),
    );
    const staMs = RawFlightDataService.scheduleDateTimeMs(staDate, staTime);
    const stdMs = RawFlightDataService.scheduleDateTimeMs(stdDate, stdTime);
    if (staMs == null || stdMs == null) {
      throw new BadRequestException('STA and STD dates must be valid.');
    }
    if (stdMs >= staMs) return;

    const sta = RawFlightDataService.parseDdMmYyyy(staDate);
    const std = RawFlightDataService.parseDdMmYyyy(stdDate);
    const staMins = RawFlightDataService.timeToMinutes(staTime);
    const stdMins = RawFlightDataService.timeToMinutes(stdTime);
    if (
      sta &&
      std &&
      sta.getTime() === std.getTime() &&
      staMins > 0 &&
      stdMins > 0 &&
      stdMins < staMins
    ) {
      const suggested = RawFlightDataService.formatDateDdMmYyyy(
        RawFlightDataService.addDays(sta, 1),
      );
      throw new BadRequestException(
        `STD must be after STA. With STA ${staDate} ${staTime} and STD time ${stdTime}, use STD date ${suggested} or later.`,
      );
    }
    throw new BadRequestException(
      'STD date and time must be on or after STA date and time.',
    );
  }

  private static weekdayKey(date: Date): string {
    const map = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return map[date.getDay()] ?? '';
  }

  private static isTruthyFlag(v: unknown): boolean {
    if (v === true || v === 1) return true;
    const s = String(v ?? '')
      .trim()
      .toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'y';
  }

  private static readonly SCHEDULE_DAY_KEYS = [
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ] as const;

  /** Always persist all seven weekdays — selected days true, others false. */
  private static normalizeScheduleDays(
    input: unknown,
  ): Record<string, boolean> {
    const raw =
      input && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const out: Record<string, boolean> = {};
    for (const day of RawFlightDataService.SCHEDULE_DAY_KEYS) {
      out[day] = RawFlightDataService.isTruthyFlag(raw[day]);
    }
    return out;
  }

  /**
   * True if `scheduleDays` enables this weekday (`weekdayKey` = Sun..Sat from `weekdayKey()`).
   * Accepts common aliases (Monday, MON, etc.) and case-insensitive keys.
   */
  private static scheduleDayEnabled(
    days: Record<string, unknown>,
    weekdayKey: string,
  ): boolean {
    if (!weekdayKey) return false;
    const truthy = (k: string) =>
      !!k &&
      Object.prototype.hasOwnProperty.call(days, k) &&
      RawFlightDataService.isTruthyFlag(days[k]);

    if (truthy(weekdayKey)) return true;

    const aliases: Record<string, string[]> = {
      Sun: ['Sunday', 'SUN', 'sun', 'Su', 'SU'],
      Mon: ['Monday', 'MON', 'mon', 'Mo', 'MO'],
      Tue: ['Tuesday', 'TUES', 'Tues', 'tue', 'Tu', 'TU'],
      Wed: ['Wednesday', 'WED', 'Wed', 'wed', 'We', 'WE'],
      Thu: ['Thursday', 'THU', 'Thu', 'thu', 'Th', 'TH'],
      Fri: ['Friday', 'FRI', 'Fri', 'fri', 'Fr', 'FR'],
      Sat: ['Saturday', 'SAT', 'Sat', 'sat', 'Sa', 'SA'],
    };
    for (const k of aliases[weekdayKey] ?? []) {
      if (truthy(k)) return true;
    }
    const lower = weekdayKey.toLowerCase();
    for (const key of Object.keys(days)) {
      if (
        key.toLowerCase() === lower &&
        RawFlightDataService.isTruthyFlag(days[key])
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Build scheduled table rows **only** from `fhr_collection`: one row per operational
   * `SerialNo` / `flightSerialNumber` whose STA (or STD) calendar day falls in [start, end].
   * Data is taken from FHR embeds (`mainDetails`, `terminalDetails`, `rampDetails*`) — no other
   * collections participate in this path.
   */
  /**
   * Generate every dd/MM/yyyy string between two Date objects (inclusive).
   * Used to build a targeted `$in` filter for `fhr_collection` so we don't
   * fetch the entire collection over the Atlas network for every request.
   */
  private static dateRangeToDdMmYyyyList(start: Date, end: Date): string[] {
    const list: string[] = [];
    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);
    while (cur <= endDay) {
      const d = String(cur.getDate()).padStart(2, '0');
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const y = cur.getFullYear();
      list.push(`${d}/${m}/${y}`);
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }

  /**
   * Expand one advance schedule master into in-range operating dates.
   * Falls back to validFrom when no weekday is selected.
   */
  private static enumerateAdvanceOperatingDates(
    validFromRaw: unknown,
    validToRaw: unknown,
    scheduleDaysRaw: unknown,
    fromYmd: string,
    toYmd: string,
  ): string[] {
    const validFrom = RawFlightDataService.parseDdMmYyyy(
      RawFlightDataService.normalizeDateDdMmYyyy(String(validFromRaw ?? '')),
    );
    const validTo = RawFlightDataService.parseDdMmYyyy(
      RawFlightDataService.normalizeDateDdMmYyyy(String(validToRaw ?? '')),
    );
    if (!validFrom || !validTo || validFrom > validTo) return [];

    const scheduleDays =
      scheduleDaysRaw &&
      typeof scheduleDaysRaw === 'object' &&
      !Array.isArray(scheduleDaysRaw)
        ? (scheduleDaysRaw as Record<string, unknown>)
        : {};

    const out: string[] = [];
    const cur = new Date(validFrom.getTime());
    while (cur <= validTo) {
      const ymd = RawFlightDataService.dateToYmd(cur);
      if (ymd >= fromYmd && ymd <= toYmd) {
        const enabled = RawFlightDataService.scheduleDayEnabled(
          scheduleDays,
          RawFlightDataService.weekdayKey(cur),
        );
        if (enabled) {
          out.push(
            RawFlightDataService.normalizeDateDdMmYyyy(
              `${String(cur.getDate()).padStart(2, '0')}/${String(
                cur.getMonth() + 1,
              ).padStart(2, '0')}/${cur.getFullYear()}`,
            ),
          );
        }
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (out.length > 0) return out;
    const fallback = RawFlightDataService.normalizeDateDdMmYyyy(
      String(validFromRaw ?? ''),
    );
    const fallbackYmd = fallback
      ? RawFlightDataService.scheduleLabelToYmd(fallback)
      : null;
    if (
      fallback &&
      fallbackYmd &&
      fallbackYmd >= fromYmd &&
      fallbackYmd <= toYmd
    ) {
      return [fallback];
    }
    return [];
  }

  /**
   * Append Scheduled Airlines rows from `advance_schedule_setup` masters that opted into
   * the forward-only sync flow. Existing schedules remain untouched in FHR path.
   */
  /**
   * Schedule Setup masters that list exclusively via advance expansion
   * (`dailySyncSource = advance_schedule_setup`). Their FHR docs must not
   * also expand into daily rows.
   */
  private async loadForwardOnlyAdvanceScheduleIds(
    station: StationScopeContext,
  ): Promise<Set<string>> {
    const docs = await this.advanceScheduleModel
      .find(
        StationScope.filter(
          { 'data.dailySyncSource': ADVANCE_DAILY_SYNC_SOURCE },
          station,
        ),
        { serialNo: 1 },
      )
      .lean();
    const ids = new Set<string>();
    for (const d of docs) {
      const sn = String(d?.serialNo ?? '').trim();
      if (sn) ids.add(sn);
    }
    return ids;
  }

  /**
   * Collapse duplicate airline + flight + STA day rows before serial assignment.
   *
   * Closed/worked FHR instance rows use `scheduleId = fhr_collection_<serial>`,
   * while Schedule Setup expansion uses the 6-digit master serial — so scheduleId
   * alone cannot dedupe them. Prefer FHR rows (keep Closed SL.NO) and overlay
   * edited STA/STD from the advance expansion onto that existing flight.
   */
  private dedupeDailyRowsByScheduleDay(
    out: Array<{ data: Record<string, unknown> }>,
  ): void {
    const sourceRank = (data: Record<string, unknown>): number => {
      const src = RawFlightDataService.nonEmpty(data.scheduleSource);
      if (src === 'fhr_collection') return 100;
      if (src.includes('fhr_collection')) return 90;
      // Master expand via FHR still tagged advance_schedule_setup but already
      // materialised — slightly above pure virtual advance expansion.
      const sid = RawFlightDataService.nonEmpty(
        data.scheduleId,
        data.scheduleMasterSerial,
      );
      if (
        (src === ADVANCE_DAILY_SYNC_SOURCE ||
          src === 'advance_schedule_setup') &&
        sid.startsWith('fhr_collection_')
      ) {
        return 80;
      }
      if (src === ADVANCE_DAILY_SYNC_SOURCE || src === 'advance_schedule_setup') {
        return 10;
      }
      // One-time Additional Flights sit above pure advance expansion so they
      // are not dropped when natural keys collide with a stale master row.
      if (isAdditionalFlightScheduleSource(src) || data.isAdditionalFlight === true) {
        return 12;
      }
      return 5;
    };

    const overlayScheduleFields = (
      keep: Record<string, unknown>,
      from: Record<string, unknown>,
    ) => {
      const copyKeys = [
        'staTime',
        'STA Time',
        'stdTime',
        'STD Time',
        'staDate',
        'STA Date',
        'stdDate',
        'STD Date',
        'scheduleDate',
        'aircraft',
        'Aircraft',
        'route',
        'Routing',
        'typeOfHandling',
        'Type of Handling',
        'TypeofHandling',
        '_staSortMinutes',
        '_stdSortMinutes',
      ] as const;
      for (const k of copyKeys) {
        const v = from[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          keep[k] = v;
        }
      }
    };

    const winnerByKey = new Map<string, number>();
    const losersByKey = new Map<string, number[]>();

    for (let i = 0; i < out.length; i++) {
      const data = out[i]?.data;
      if (!data) continue;
      const key = RawFlightDataService.scheduleRowNaturalKey(data);
      if (!key) continue;
      const prev = winnerByKey.get(key);
      if (prev === undefined) {
        winnerByKey.set(key, i);
        continue;
      }
      const prevRank = sourceRank(out[prev].data);
      const curRank = sourceRank(data);
      if (curRank > prevRank) {
        const losers = losersByKey.get(key) ?? [];
        losers.push(prev);
        losersByKey.set(key, losers);
        winnerByKey.set(key, i);
      } else {
        const losers = losersByKey.get(key) ?? [];
        losers.push(i);
        losersByKey.set(key, losers);
      }
    }

    if (winnerByKey.size === 0) return;

    // Overlay advance schedule field edits onto the kept FHR / Closed row.
    for (const [key, winnerIdx] of winnerByKey) {
      const winner = out[winnerIdx]?.data;
      if (!winner) continue;
      const loserIdxs = losersByKey.get(key) ?? [];
      for (const li of loserIdxs) {
        const loser = out[li]?.data;
        if (!loser) continue;
        if (sourceRank(loser) <= sourceRank(winner)) {
          // Loser is lower-rank (usually advance Open). Copy its schedule fields.
          if (sourceRank(loser) < sourceRank(winner)) {
            overlayScheduleFields(winner, loser);
          }
        }
      }
    }

    const keep = new Set<number>();
    for (let i = 0; i < out.length; i++) {
      const data = out[i]?.data;
      if (!data) continue;
      const key = RawFlightDataService.scheduleRowNaturalKey(data);
      if (!key) {
        keep.add(i);
        continue;
      }
      if (winnerByKey.get(key) === i) {
        keep.add(i);
      }
    }

    if (keep.size === out.length) return;
    const next = out.filter((_, i) => keep.has(i));
    out.length = 0;
    out.push(...next);
  }

  /**
   * Schedule Setup is the source of truth for STA/STD. After FHR finalize
   * (which may re-apply stale loadControl times), overlay current advance
   * master times onto matching daily rows by airline + flight + day.
   */
  private async applyAdvanceScheduleTimesToDailyRows(
    rows: Array<{ data: Record<string, unknown> }>,
    station: StationScopeContext,
  ): Promise<void> {
    if (rows.length === 0) return;

    const docs = await this.advanceScheduleModel
      .find(
        StationScope.filter(
          { 'data.dailySyncSource': ADVANCE_DAILY_SYNC_SOURCE },
          station,
        ),
        { serialNo: 1, data: 1, updatedAt: 1 },
      )
      .sort({ updatedAt: -1 })
      .lean();

    type MasterTimes = {
      scheduleSerial: string;
      airline: string;
      flightTokens: Set<string>;
      staTime: string;
      stdTime: string;
      aircraft: string;
      routing: string;
    };
    const masters: MasterTimes[] = [];

    for (const doc of docs) {
      const d =
        doc?.data && typeof doc.data === 'object' && !Array.isArray(doc.data)
          ? (doc.data as Record<string, unknown>)
          : null;
      if (!d) continue;
      const airline = RawFlightDataService.normTokenAirline(
        RawFlightDataService.nonEmpty(d.airline, d.Airline),
      );
      const flightRaw = RawFlightDataService.nonEmpty(
        d.flightNo,
        d['Flight No'],
        d.FlightNo,
      );
      const flightTokens = new Set(
        RawFlightDataService.scheduleFlightNatTokens(flightRaw),
      );
      if (!airline || flightTokens.size === 0) continue;
      const staTime = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(d.staTime, d['STA Time'], d.STATime),
      );
      const stdTime = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(d.stdTime, d['STD Time'], d.STDTime),
      );
      if (!staTime && !stdTime) continue;
      masters.push({
        scheduleSerial: String(doc.serialNo ?? '').trim(),
        airline,
        flightTokens,
        staTime,
        stdTime,
        aircraft: RawFlightDataService.nonEmpty(
          d.aircraft,
          d.Aircraft,
          d.TypeCraft,
        ),
        routing: RawFlightDataService.nonEmpty(d.routing, d.route, d.Routing),
      });
    }

    if (masters.length === 0) return;

    const healPayloads: Array<{
      scheduleSerial: string;
      airline: string;
      flightNo: string;
      staTime: string;
      stdTime: string;
      aircraft: string;
      routing: string;
      day: string;
    }> = [];

    for (const row of rows) {
      const data = row.data;
      // Creation → Schedule Airlines daily overrides win over season master times.
      // Do not heal/patch these rows back to Advance → Schedule Setup values.
      if (
        data.hasScheduledAirlinesCreation === true ||
        data.dailyFlightOverride === true ||
        data.isAdditionalFlight === true ||
        String(data.scheduleSource ?? '').includes('scheduled_airlines_creation') ||
        isAdditionalFlightScheduleSource(data.scheduleSource) ||
        isAdditionalFlightScheduleId(data.scheduleId) ||
        isAdditionalFlightScheduleId(data.scheduleMasterSerial)
      ) {
        continue;
      }
      const airline = RawFlightDataService.normTokenAirline(
        RawFlightDataService.nonEmpty(data.airline, data.Airline),
      );
      const flightRaw = RawFlightDataService.nonEmpty(
        data.flightNo,
        data['Flight No'],
        data.FlightNo,
      );
      const rowTokens = new Set(
        RawFlightDataService.scheduleFlightNatTokens(flightRaw),
      );
      if (!airline || rowTokens.size === 0) continue;

      const master = masters.find((m) => {
        if (m.airline !== airline) return false;
        for (const tok of rowTokens) {
          if (m.flightTokens.has(tok)) return true;
        }
        return false;
      });
      if (!master) continue;

      const curSta = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(
          data.staTime,
          data['STA Time'],
          data.STATime,
        ),
      );
      const curStd = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(
          data.stdTime,
          data['STD Time'],
          data.STDTime,
        ),
      );
      const day = RawFlightDataService.nonEmpty(
        data.scheduleDate,
        data.staDate,
        data['STA Date'],
      );

      if (
        (master.staTime && curSta && master.staTime !== curSta) ||
        (master.stdTime && curStd && master.stdTime !== curStd)
      ) {
        healPayloads.push({
          scheduleSerial: master.scheduleSerial,
          airline: RawFlightDataService.nonEmpty(data.airline, data.Airline),
          flightNo: flightRaw,
          staTime: master.staTime,
          stdTime: master.stdTime,
          aircraft: master.aircraft,
          routing: master.routing,
          day,
        });
      }

      if (master.staTime) {
        data.staTime = master.staTime;
        data['STA Time'] = master.staTime;
        data.STATime = master.staTime;
        data._staSortMinutes = RawFlightDataService.timeToMinutes(
          master.staTime,
        );
      }
      if (master.stdTime) {
        data.stdTime = master.stdTime;
        data['STD Time'] = master.stdTime;
        data.STDTime = master.stdTime;
        data._stdSortMinutes = RawFlightDataService.timeToMinutes(
          master.stdTime,
        );
      }
      if (master.aircraft) {
        data.aircraft = master.aircraft;
        data.Aircraft = master.aircraft;
      }
      if (master.routing) {
        data.route = master.routing;
        data.Routing = master.routing;
      }
    }

    // Persist corrected STA/STD into FHR when list still had stale form embeds.
    if (healPayloads.length > 0) {
      const unique = new Map<string, (typeof healPayloads)[number]>();
      for (const h of healPayloads) {
        unique.set(
          `${h.scheduleSerial}|${h.airline}|${h.flightNo}|${h.day}`,
          h,
        );
      }
      const attempts = [...unique.values()];
      void Promise.all(
        attempts.map((h) =>
          this.fhrCollectionService.patchExistingInstanceScheduleTimes(
            {
              airline: h.airline,
              flightNo: h.flightNo,
              staTime: h.staTime,
              stdTime: h.stdTime,
              aircraft: h.aircraft,
              routing: h.routing,
            },
            h.day ? [h.day] : [],
            station,
            h.scheduleSerial || undefined,
            { quiet: true },
          ),
        ),
      )
        .then((counts) => {
          let patched = 0;
          let unmatched = 0;
          const sample: string[] = [];
          for (let i = 0; i < counts.length; i += 1) {
            const n = counts[i] ?? 0;
            if (n > 0) {
              patched += n;
              continue;
            }
            unmatched += 1;
            if (sample.length < 5) {
              const h = attempts[i];
              sample.push(
                `${h.airline} ${h.flightNo} schedule=${h.scheduleSerial || '?'} day=${h.day || '?'}`,
              );
            }
          }
          if (patched === 0 && unmatched === 0) return;
          this.logger.log(
            `[advance_edit heal] attempts=${attempts.length} patchedInstances=${patched} unmatched=${unmatched}` +
              (sample.length
                ? ` sample=[${sample.join('; ')}]`
                : ''),
          );
        })
        .catch((err: unknown) => {
          this.logger.error(
            '[RawFlightData] advance STA/STD heal patch failed',
            err instanceof Error ? err.stack : String(err),
          );
        });
    }
  }

  private async appendAdvanceScheduleRowsToDaily(
    out: Array<{ data: Record<string, unknown> }>,
    start: Date,
    end: Date,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<void> {
    const fromYmd = RawFlightDataService.dateToYmd(start);
    const toYmd = RawFlightDataService.dateToYmd(end);
    if (!fromYmd || !toYmd) return;

    const docs = await this.advanceScheduleModel
      .find(StationScope.filter({}, station), { serialNo: 1, data: 1 })
      .lean();
    const seenRowKey = new Set<string>();

    for (const doc of docs) {
      const scheduleSerial = String(doc?.serialNo ?? '').trim();
      const d =
        doc?.data && typeof doc.data === 'object' && !Array.isArray(doc.data)
          ? (doc.data as Record<string, unknown>)
          : {};
      if (!scheduleSerial) continue;
      if (
        RawFlightDataService.nonEmpty(d.dailySyncSource) !==
        ADVANCE_DAILY_SYNC_SOURCE
      ) {
        continue;
      }

      // Repair legacy bug: instance cancel used to mark the whole schedule master cancelled.
      const masterMarkedCancelled =
        this.normalizeFlightStatus(d.flightStatus, 'Open') === 'Cancelled' ||
        d.flightCancelled === true ||
        d.isCancelled === true ||
        RawFlightDataService.isScheduleFlightNoMarkedCancelled(d);
      if (masterMarkedCancelled) {
        await this.clearScheduleMasterCancelFlags(scheduleSerial);
        d.flightStatus = 'Open';
        d.flightCancelled = false;
        d.isCancelled = false;
        const fn = RawFlightDataService.nonEmpty(
          d.flightNo,
          d['Flight No'],
          d.FlightNo,
        ).replace(/^CANC[\s-]*/i, '');
        if (fn) {
          d.flightNo = fn;
          d['Flight No'] = fn;
        }
      }

      const airline = RawFlightDataService.nonEmpty(d.airline, d.Airline, '');
      const flightNo = RawFlightDataService.nonEmpty(
        displayFlightNoFromScheduleData(d),
      );
      if (!airline || !flightNo) continue;

      const validFrom = RawFlightDataService.nonEmpty(
        d.validFrom,
        d['Valid From'],
        d.staDate,
        d['STA Date'],
      );
      const validTo = RawFlightDataService.nonEmpty(
        d.validTo,
        d['Valid To'],
        d.stdDate,
        d['STD Date'],
        validFrom,
      );
      const staDatesInRange =
        RawFlightDataService.enumerateAdvanceOperatingDates(
          validFrom,
          validTo,
          d.scheduleDays,
          fromYmd,
          toYmd,
        );
      if (staDatesInRange.length === 0) continue;

      const staTime = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(
          d.staTime,
          d['STA Time'],
          d.STATime,
          '00:00',
        ) || '00:00',
      );
      const stdTime = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(
          d.stdTime,
          d['STD Time'],
          d.STDTime,
          '00:00',
        ) || '00:00',
      );
      const stdDateNormDefault = staDatesInRange[0] ?? '';
      const route = RawFlightDataService.nonEmpty(
        d.routing,
        d.route,
        d.Routing,
        '',
      );
      const aircraft = RawFlightDataService.nonEmpty(
        d.aircraft,
        d.Aircraft,
        d.TypeCraft,
        '',
      );
      const typeOfHandling = RawFlightDataService.nonEmpty(
        d.typeOfHandling,
        d['Type of Handling'],
        d.TypeofHandling,
        '',
      );
      const category = RawFlightDataService.nonEmpty(
        d.flightType,
        d['Flight Type'],
        d['Type of flight'],
        d.flight,
        d.categoryOfFlight,
        d.category_of_flight,
        d.Cate_of_Flight,
        d.cate_of_flight,
        '',
      );
      // Per-day cancel state comes from `flight_cancellations` in finalize — not master schedule flags.
      const status: FlightStatus = 'Open';
      const isCancelled = false;

      for (const staDateNorm of staDatesInRange) {
        const rowKey = `${scheduleSerial}|${staDateNorm}`;
        if (seenRowKey.has(rowKey)) continue;
        seenRowKey.add(rowKey);
        const stdDateNorm = RawFlightDataService.resolveStdDateForOperatingDay(
          staDateNorm,
          staTime,
          stdTime,
          stdDateNormDefault,
        );

        out.push({
          data: {
            scheduleDate: staDateNorm,
            scheduleId: scheduleSerial,
            scheduleSource: ADVANCE_DAILY_SYNC_SOURCE,
            scheduleMasterSerial: scheduleSerial,
            legacySlNo: scheduleSerial,
            flightNo,
            'Flight No': flightNo,
            airline,
            Airline: airline,
            airlineCode: RawFlightDataService.nonEmpty(
              d.airlineCode,
              d['Airline Code'],
            ),
            'Airline Code': RawFlightDataService.nonEmpty(
              d.airlineCode,
              d['Airline Code'],
            ),
            ifOperationSplit:
              d.ifOperationSplit === true ||
              String(d['Operation Split'] ?? '')
                .trim()
                .toLowerCase() === 'yes',
            ArrivalFltNo: RawFlightDataService.nonEmpty(
              d.ArrivalFltNo,
              d.arrivalFlightNo,
              d['Arrival Flight No'],
            ),
            DepartureFltNo: RawFlightDataService.nonEmpty(
              d.DepartureFltNo,
              d.departureFlightNo,
              d['Departure Flight No'],
            ),
            aircraft,
            Aircraft: aircraft,
            route,
            Routing: route,
            ...(typeOfHandling
              ? {
                  typeOfHandling,
                  TypeofHandling: typeOfHandling,
                  'Type of Handling': typeOfHandling,
                }
              : {}),
            ...(category
              ? {
                  category_of_flight: category,
                  Cate_of_Flight: category,
                  categoryOfFlight: category,
                  'Type of flight': category,
                  'Flight Type': category,
                  flightType: category,
                  flight: category,
                }
              : {}),
            staDate: staDateNorm,
            'STA Date': staDateNorm,
            stdDate: stdDateNorm,
            'STD Date': stdDateNorm,
            staTime,
            'STA Time': staTime,
            stdTime,
            'STD Time': stdTime,
            _staSortMinutes: RawFlightDataService.timeToMinutes(
              staTime || '00:00',
            ),
            _stdSortMinutes: RawFlightDataService.timeToMinutes(
              stdTime || '00:00',
            ),
            _inRequestedRange: true,
            flightStatus: status,
            flightCancelled: isCancelled,
            isCancelled,
          },
        });
      }
    }
  }

  private static scheduleMasterSerialFromDailyRow(
    data: Record<string, unknown>,
  ): string {
    return RawFlightDataService.nonEmpty(
      data.scheduleMasterSerial,
      data.scheduleId,
      data.legacySlNo,
      data.SlNo,
      data.slNo,
      data.serialNo,
      data.SerialNo,
    );
  }

  private static dailyRowDateYmds(data: Record<string, unknown>): Set<string> {
    const ymds = new Set<string>();
    for (const raw of [
      data.scheduleDate,
      data['STA Date'],
      data.staDate,
      data['STD Date'],
      data.stdDate,
      data.date,
      data.date2,
    ]) {
      const lbl = RawFlightDataService.nonEmpty(String(raw ?? ''));
      const y = lbl ? RawFlightDataService.scheduleLabelToYmd(lbl) : null;
      if (y) ymds.add(y);
    }
    return ymds;
  }

  /**
   * Apply Creation → Scheduled Airlines edits onto an existing daily row (advance / FHR).
   */
  private applyCreationDataToDailyRow(
    target: Record<string, unknown>,
    c: Record<string, unknown>,
  ): void {
    const airline = RawFlightDataService.nonEmpty(
      c.airlines,
      c.airline,
      c.Airline,
    );
    if (airline) {
      target.airline = airline;
      target.Airline = airline;
    }

    const flightNo = RawFlightDataService.nonEmpty(
      c.flightNo,
      c['Flight No'],
      c.FlightNo,
    );
    if (flightNo) {
      target.flightNo = flightNo;
      target['Flight No'] = flightNo;
    }

    const aircraft = RawFlightDataService.nonEmpty(
      c.acType,
      c.Aircraft,
      c.TypeCraft,
      c.aircraft,
    );
    if (aircraft && aircraft !== '0') {
      target.aircraft = aircraft;
      target.Aircraft = aircraft;
      target.TypeCraft = aircraft;
      target.acType = aircraft;
    }

    const routing = RawFlightDataService.nonEmpty(
      c.routing,
      c.Routing,
      c.route,
    );
    if (routing) {
      target.route = routing;
      target.Routing = routing;
      target.routing = routing;
    }

    const opsType = RawFlightDataService.nonEmpty(
      c.opsType,
      c['Type of Handling'],
      c.typeOfHandling,
      c.TypeofHandling,
    );
    if (opsType) {
      target.operations = opsType;
      target.ops = opsType;
      target.typeOfHandling = opsType;
      target.TypeofHandling = opsType;
      target['Type of Handling'] = opsType;
    }

    const category = RawFlightDataService.nonEmpty(
      c.categoryOfFlight,
      c['Flight Type'],
      c['Type of flight'],
      c.flightType,
    );
    if (category) {
      target.category_of_flight = category;
      target.Cate_of_Flight = category;
      target.categoryOfFlight = category;
      target['Type of flight'] = category;
      target['Flight Type'] = category;
      target.flightType = category;
    }

    const staDate = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(c.staDate, c['STA Date'], c.date),
    );
    const stdDate = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(
        c.stdDate,
        c['STD Date'],
        c.date2,
        staDate,
        c.date,
      ),
    );
    const staTime = RawFlightDataService.normalizeTimeHhMm(
      RawFlightDataService.nonEmpty(c.staTime, c['STA Time']),
    );
    const stdTime = RawFlightDataService.normalizeTimeHhMm(
      RawFlightDataService.nonEmpty(c.stdTime, c['STD Time']),
    );

    if (staDate) {
      target.staDate = staDate;
      target['STA Date'] = staDate;
      target.STADate = staDate;
      target.scheduleDate = staDate;
    }
    if (staTime) {
      target.staTime = staTime;
      target['STA Time'] = staTime;
      target.STATime = staTime;
      target._staSortMinutes = RawFlightDataService.timeToMinutes(staTime);
    }
    if (stdTime) {
      target.stdTime = stdTime;
      target['STD Time'] = stdTime;
      target.STDTime = stdTime;
      target._stdSortMinutes = RawFlightDataService.timeToMinutes(stdTime);
    }

    const effectiveStaDate = RawFlightDataService.nonEmpty(
      staDate,
      String(target.staDate ?? ''),
      String(target['STA Date'] ?? ''),
    );
    const effectiveStaTime = RawFlightDataService.nonEmpty(
      staTime,
      String(target.staTime ?? ''),
      String(target['STA Time'] ?? ''),
      '00:00',
    );
    const effectiveStdTime = RawFlightDataService.nonEmpty(
      stdTime,
      String(target.stdTime ?? ''),
      String(target['STD Time'] ?? ''),
      '00:00',
    );
    if (effectiveStaDate) {
      const resolvedStd = RawFlightDataService.resolveStdDateForOperatingDay(
        RawFlightDataService.normalizeDateDdMmYyyy(effectiveStaDate),
        effectiveStaTime,
        effectiveStdTime,
        stdDate || effectiveStaDate,
      );
      if (resolvedStd) {
        target.stdDate = resolvedStd;
        target['STD Date'] = resolvedStd;
        target.STDDate = resolvedStd;
      }
    } else if (stdDate) {
      target.stdDate = stdDate;
      target['STD Date'] = stdDate;
      target.STDDate = stdDate;
    }

    const code = RawFlightDataService.nonEmpty(
      c.airlineCode,
      c['Airline Code'],
    );
    if (code) {
      target['Airline Code'] = code;
      target.airlineCode = code;
    }

    const skd = RawFlightDataService.nonEmpty(c.skdNonSkd);
    if (skd) target.skdNonSkd = skd;

    const body = RawFlightDataService.nonEmpty(c.aBody, c['Aircraft Body']);
    if (body) {
      target['Aircraft Body'] = body;
      target.aircraftBody = body;
    }

    const status = this.normalizeFlightStatus(c.flightStatus, 'Open');
    target.flightStatus = status;
    target.flightCancelled = status === 'Cancelled';
    target.isCancelled = status === 'Cancelled';

    const prevSource = RawFlightDataService.nonEmpty(target.scheduleSource);
    target.scheduleSource = prevSource
      ? prevSource.includes('scheduled_airlines_creation')
        ? prevSource
        : `${prevSource}+scheduled_airlines_creation`
      : 'scheduled_airlines_creation';
    target.hasScheduledAirlinesCreation = true;
  }

  /**
   * Append additional/open creation rows from `scheduled_airlines_creation`, and overlay
   * saved **daily** creation edits onto advance/FHR daily rows for the matching
   * instance serial and/or (schedule master + operating day) only.
   * Never mutates `advance_schedule_setup`.
   */
  private async appendScheduledCreationRowsToDaily(
    out: Array<{ data: Record<string, unknown> }>,
    start: Date,
    end: Date,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<void> {
    const fromYmd = RawFlightDataService.dateToYmd(start);
    const toYmd = RawFlightDataService.dateToYmd(end);
    if (!fromYmd || !toYmd) return;

    const creationDocs = await this.scheduledCreationModel
      .find(StationScope.filter({}, station), {
        serialNo: 1,
        data: 1,
        scheduleMasterSerial: 1,
        operationDate: 1,
        instanceSerial: 1,
      })
      .lean();
    const seenRowKey = new Set<string>();

    for (const doc of creationDocs) {
      const serial = String(doc?.serialNo ?? '').trim();
      if (!serial) continue;
      const d =
        doc?.data && typeof doc.data === 'object' && !Array.isArray(doc.data)
          ? (doc.data as Record<string, unknown>)
          : {};
      const airline = RawFlightDataService.nonEmpty(
        d.airlines,
        d.airline,
        d.Airline,
      );
      const flightNo = RawFlightDataService.nonEmpty(
        d.flightNo,
        d['Flight No'],
        d.FlightNo,
      );
      if (!airline || !flightNo) continue;

      // Prefer top-level daily-override fields; fall back to payload / legacy keying.
      const operationDate = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(
          (doc as { operationDate?: string }).operationDate,
          d.operationDate,
          d.staDate,
          d['STA Date'],
          d.date,
        ),
      );
      const scheduleMasterSerial = RawFlightDataService.nonEmpty(
        (doc as { scheduleMasterSerial?: string }).scheduleMasterSerial,
        d.scheduleMasterSerial,
        // Legacy docs used master serial as `serialNo` (6-digit).
        /^\d{6}$/.test(serial) ? serial : '',
        serial.includes('|') ? serial.split('|')[0] : '',
      );
      const instanceSerial = RawFlightDataService.nonEmpty(
        (doc as { instanceSerial?: string }).instanceSerial,
        d.instanceSerial,
        // New daily overrides key the document by the generated instance serial.
        /^\d{6}$/.test(serial) ? '' : serial.includes('|') ? '' : serial,
      );

      const staDate = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(
          operationDate,
          d.staDate,
          d['STA Date'],
          d.date,
          d.date2,
        ),
      );
      const stdDate = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(
          d.stdDate,
          d['STD Date'],
          d.date2,
          staDate,
          d.date,
        ),
      );
      const opYmd = RawFlightDataService.scheduleLabelToYmd(operationDate || staDate);
      const staYmd = RawFlightDataService.scheduleLabelToYmd(staDate);
      const stdYmd = RawFlightDataService.scheduleLabelToYmd(stdDate);
      // Daily override: apply only to the operating day (not the whole season).
      const creationYmds = new Set<string>();
      if (opYmd) creationYmds.add(opYmd);
      else {
        if (staYmd) creationYmds.add(staYmd);
        if (stdYmd) creationYmds.add(stdYmd);
      }

      let overlaid = 0;
      if (creationYmds.size > 0) {
        for (const row of out) {
          const rowMaster =
            RawFlightDataService.scheduleMasterSerialFromDailyRow(row.data);
          const rowInstance = RawFlightDataService.nonEmpty(
            row.data.SlNo,
            row.data.slNo,
            row.data.serialNo,
            row.data.SerialNo,
            row.data.flightSerialNumber,
          );
          const instanceMatch =
            !!instanceSerial &&
            (rowInstance === instanceSerial || serial === rowInstance);
          const masterMatch =
            !!scheduleMasterSerial && rowMaster === scheduleMasterSerial;
          // Legacy: document keyed by master serial alone.
          const legacyMasterKeyMatch =
            /^\d{6}$/.test(serial) && rowMaster === serial;
          const rowAirline = RawFlightDataService.nonEmpty(
            row.data.airline,
            row.data.Airline,
            row.data.airlines,
          ).toLowerCase();
          const rowFlight = RawFlightDataService.normalizeFlightNoForFind(
            RawFlightDataService.nonEmpty(
              row.data.flightNo,
              row.data['Flight No'],
              row.data.FlightNo,
            ),
          );
          const creationFlight = RawFlightDataService.normalizeFlightNoForFind(
            flightNo,
          );
          const airlineFlightMatch =
            !!airline &&
            !!flightNo &&
            rowAirline === airline.toLowerCase() &&
            !!rowFlight &&
            rowFlight === creationFlight;
          if (
            !instanceMatch &&
            !masterMatch &&
            !legacyMasterKeyMatch &&
            !airlineFlightMatch
          ) {
            continue;
          }
          const rowYmds = RawFlightDataService.dailyRowDateYmds(row.data);
          let dateMatch = false;
          for (const y of creationYmds) {
            if (rowYmds.has(y)) {
              dateMatch = true;
              break;
            }
          }
          if (!dateMatch) continue;
          this.applyCreationDataToDailyRow(row.data, d);
          if (scheduleMasterSerial) {
            row.data.scheduleMasterSerial = scheduleMasterSerial;
            row.data.scheduleId = scheduleMasterSerial;
          }
          if (instanceSerial) {
            row.data.hasScheduledAirlinesCreation = true;
          }
          overlaid += 1;
        }
      }
      if (overlaid > 0) continue;

      const ymd = opYmd || staYmd || stdYmd;
      if (!ymd || ymd < fromYmd || ymd > toYmd) continue;
      const masterForVirtual = scheduleMasterSerial || serial;
      const rowKey = `${masterForVirtual}|${staDate || stdDate || operationDate}`;
      if (seenRowKey.has(rowKey)) continue;
      seenRowKey.add(rowKey);

      const staTime = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(d.staTime, d['STA Time'], '00:00') ||
          '00:00',
      );
      const stdTime = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(d.stdTime, d['STD Time'], '00:00') ||
          '00:00',
      );
      const aircraft = RawFlightDataService.nonEmpty(
        d.acType,
        d.Aircraft,
        d.TypeCraft,
      );
      const routing = RawFlightDataService.nonEmpty(
        d.routing,
        d.Routing,
        d.route,
      );
      const opsType = RawFlightDataService.nonEmpty(
        d.opsType,
        d['Type of Handling'],
        d.typeOfHandling,
        d.TypeofHandling,
      );
      const category = RawFlightDataService.nonEmpty(
        d.categoryOfFlight,
        d['Type of flight'],
        d['Flight Type'],
      );

      const staDateNorm = staDate || stdDate;
      const stdDateResolved =
        RawFlightDataService.resolveStdDateForOperatingDay(
          staDateNorm,
          staTime,
          stdTime,
          stdDate || staDateNorm,
        );

      out.push({
        data: {
          scheduleDate: staDateNorm,
          scheduleId: masterForVirtual,
          scheduleSource: 'scheduled_airlines_creation',
          scheduleMasterSerial: masterForVirtual,
          SlNo: instanceSerial || serial,
          serialNo: instanceSerial || serial,
          legacySlNo: masterForVirtual,
          flightNo,
          'Flight No': flightNo,
          airline,
          Airline: airline,
          aircraft,
          Aircraft: aircraft,
          route: routing,
          Routing: routing,
          routing,
          operations: opsType,
          ops: opsType,
          'Type of Handling': opsType,
          typeOfHandling: opsType,
          TypeofHandling: opsType,
          Typeofflight: opsType,
          acType: aircraft,
          staDate: staDateNorm,
          'STA Date': staDateNorm,
          STADate: staDateNorm,
          stdDate: stdDateResolved,
          'STD Date': stdDateResolved,
          STDDate: stdDateResolved,
          staTime,
          'STA Time': staTime,
          STATime: staTime,
          stdTime,
          'STD Time': stdTime,
          STDTime: stdTime,
          category_of_flight: category,
          Cate_of_Flight: category,
          categoryOfFlight: category,
          'Type of flight': category,
          'Flight Type': category,
          skdNonSkd: RawFlightDataService.nonEmpty(d.skdNonSkd),
          'Airline Code': RawFlightDataService.nonEmpty(d.airlineCode),
          'Aircraft Body': RawFlightDataService.nonEmpty(d.aBody),
          _staSortMinutes: RawFlightDataService.timeToMinutes(
            staTime || '00:00',
          ),
          _stdSortMinutes: RawFlightDataService.timeToMinutes(
            stdTime || '00:00',
          ),
          _inRequestedRange: true,
          flightStatus: 'Open',
          flightCancelled: false,
          isCancelled: false,
        },
      });
    }
  }

  /**
   * Append one-time Creation → Additional Flights into the daily Schedule Airlines list.
   * Does not invent advance_schedule_setup masters. Identity uses synthetic `ADD|…` scheduleId.
   */
  private async appendAdditionalFlightsToDaily(
    out: Array<{ data: Record<string, unknown> }>,
    start: Date,
    end: Date,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<void> {
    const fromYmd = RawFlightDataService.dateToYmd(start);
    const toYmd = RawFlightDataService.dateToYmd(end);
    if (!fromYmd || !toYmd) return;

    const docs = await this.creationAdditionalFlightsModel
      .find(StationScope.filter({}, station))
      .lean();
    if (!docs.length) return;

    const seen = new Set<string>();
    for (const doc of docs) {
      const airline = RawFlightDataService.nonEmpty(
        doc.airlines,
        (doc as { airline?: string }).airline,
      );
      const flightNo = RawFlightDataService.nonEmpty(doc.flightNo);
      if (!airline || !flightNo) continue;

      const operationDate = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(
          doc.operationDate,
          doc.date,
          doc.date2,
        ),
      );
      const opYmd = RawFlightDataService.scheduleLabelToYmd(operationDate);
      if (!opYmd || opYmd < fromYmd || opYmd > toYmd) continue;

      const scheduleId =
        RawFlightDataService.nonEmpty(doc.scheduleId) ||
        buildAdditionalFlightScheduleId({
          airline,
          flightNo,
          operationDateDdMmYyyy: operationDate,
        });
      if (!scheduleId) continue;

      // Skip if an advance/FHR/creation row already covers this airline+flight+day.
      const flightNorm = RawFlightDataService.normalizeFlightNoForFind(flightNo);
      let alreadyPresent = false;
      for (const row of out) {
        const rowYmds = RawFlightDataService.dailyRowDateYmds(row.data);
        if (!rowYmds.has(opYmd)) continue;
        const rowFlight = RawFlightDataService.normalizeFlightNoForFind(
          RawFlightDataService.nonEmpty(
            row.data.flightNo,
            row.data['Flight No'],
            row.data.FlightNo,
          ),
        );
        if (rowFlight !== flightNorm) continue;
        if (
          !RawFlightDataService.airlineMatchesFind(airline, '', row.data)
        ) {
          continue;
        }
        alreadyPresent = true;
        // Stamp additional markers if this row already came from additional source.
        if (
          isAdditionalFlightScheduleId(
            RawFlightDataService.nonEmpty(
              row.data.scheduleId,
              row.data.scheduleMasterSerial,
            ),
          ) ||
          isAdditionalFlightScheduleSource(row.data.scheduleSource)
        ) {
          row.data.isAdditionalFlight = true;
          row.data.flightType = 'Additional';
          if (!RawFlightDataService.nonEmpty(row.data.skdNonSkd)) {
            row.data.skdNonSkd = 'Additional';
          }
        }
        break;
      }
      if (alreadyPresent) continue;

      const rowKey = `${scheduleId}|${operationDate}`;
      if (seen.has(rowKey)) continue;
      seen.add(rowKey);

      const staDate = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(doc.date, operationDate),
      );
      const stdDate = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(doc.date2, staDate),
      );
      const staTime = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(doc.staTime, '00:00') || '00:00',
      );
      const stdTime = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(doc.stdTime, '00:00') || '00:00',
      );
      const aircraft = RawFlightDataService.nonEmpty(doc.acType);
      const routing = RawFlightDataService.nonEmpty(doc.routing);
      const opsType = RawFlightDataService.nonEmpty(doc.opsType);
      const category = RawFlightDataService.nonEmpty(doc.categoryOfFlight);
      const instanceSerial = RawFlightDataService.nonEmpty(doc.serialNo);
      const stdDateResolved =
        RawFlightDataService.resolveStdDateForOperatingDay(
          staDate,
          staTime,
          stdTime,
          stdDate || staDate,
        );

      out.push({
        data: {
          scheduleDate: staDate,
          scheduleId,
          scheduleSource: ADDITIONAL_FLIGHT_SCHEDULE_SOURCE,
          scheduleMasterSerial: scheduleId,
          isAdditionalFlight: true,
          flightType: 'Additional',
          SlNo: instanceSerial,
          serialNo: instanceSerial,
          legacySlNo: scheduleId,
          flightNo,
          'Flight No': flightNo,
          airline,
          Airline: airline,
          airlines: airline,
          aircraft,
          Aircraft: aircraft,
          route: routing,
          Routing: routing,
          routing,
          operations: opsType,
          ops: opsType,
          'Type of Handling': opsType,
          typeOfHandling: opsType,
          TypeofHandling: opsType,
          acType: aircraft,
          staDate,
          'STA Date': staDate,
          STADate: staDate,
          stdDate: stdDateResolved,
          'STD Date': stdDateResolved,
          STDDate: stdDateResolved,
          staTime,
          'STA Time': staTime,
          STATime: staTime,
          stdTime,
          'STD Time': stdTime,
          STDTime: stdTime,
          category_of_flight: category,
          Cate_of_Flight: category,
          categoryOfFlight: category,
          'Type of flight': category,
          'Flight Type': 'Additional',
          skdNonSkd: RawFlightDataService.nonEmpty(doc.skdNonSkd, 'Additional'),
          'Airline Code': RawFlightDataService.nonEmpty(doc.airlineCode),
          'Aircraft Body': RawFlightDataService.nonEmpty(doc.aBody),
          createdBy: RawFlightDataService.nonEmpty(doc.createdBy),
          modifiedBy: RawFlightDataService.nonEmpty(doc.modifiedBy),
          _staSortMinutes: RawFlightDataService.timeToMinutes(staTime || '00:00'),
          _stdSortMinutes: RawFlightDataService.timeToMinutes(stdTime || '00:00'),
          _inRequestedRange: true,
          flightStatus: 'Open',
          flightCancelled: false,
          isCancelled: false,
        },
      });
    }
  }

  /**
   * Final overlay pass for Creation → Schedule Airlines daily overrides.
   * Runs after master-time heal / FHR finalize so overrides populate
   * Flights → Scheduled Airlines. Does not invent new virtual rows.
   */
  private async reapplyScheduledCreationOverlaysToDaily(
    out: Array<{ data: Record<string, unknown> }>,
    start: Date,
    end: Date,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<void> {
    const fromYmd = RawFlightDataService.dateToYmd(start);
    const toYmd = RawFlightDataService.dateToYmd(end);
    if (!fromYmd || !toYmd || out.length === 0) return;

    const creationDocs = await this.scheduledCreationModel
      .find(StationScope.filter({}, station), {
        serialNo: 1,
        data: 1,
        scheduleMasterSerial: 1,
        operationDate: 1,
        instanceSerial: 1,
      })
      .lean();

    for (const doc of creationDocs) {
      const serial = String(doc?.serialNo ?? '').trim();
      if (!serial) continue;
      const d =
        doc?.data && typeof doc.data === 'object' && !Array.isArray(doc.data)
          ? (doc.data as Record<string, unknown>)
          : {};
      const airline = RawFlightDataService.nonEmpty(
        d.airlines,
        d.airline,
        d.Airline,
      );
      const flightNo = RawFlightDataService.nonEmpty(
        d.flightNo,
        d['Flight No'],
        d.FlightNo,
      );
      if (!airline || !flightNo) continue;

      const operationDate = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(
          (doc as { operationDate?: string }).operationDate,
          d.operationDate,
          d.staDate,
          d['STA Date'],
          d.date,
        ),
      );
      const scheduleMasterSerial = RawFlightDataService.nonEmpty(
        (doc as { scheduleMasterSerial?: string }).scheduleMasterSerial,
        d.scheduleMasterSerial,
        /^\d{6}$/.test(serial) ? serial : '',
        serial.includes('|') ? serial.split('|')[0] : '',
      );
      const instanceSerial = RawFlightDataService.nonEmpty(
        (doc as { instanceSerial?: string }).instanceSerial,
        d.instanceSerial,
        /^\d{6}$/.test(serial) ? '' : serial.includes('|') ? '' : serial,
      );

      const opYmd = RawFlightDataService.scheduleLabelToYmd(operationDate);
      if (!opYmd || opYmd < fromYmd || opYmd > toYmd) continue;

      const creationFlight = RawFlightDataService.normalizeFlightNoForFind(
        flightNo,
      );

      for (const row of out) {
        const rowYmds = RawFlightDataService.dailyRowDateYmds(row.data);
        if (!rowYmds.has(opYmd)) continue;

        const rowMaster =
          RawFlightDataService.scheduleMasterSerialFromDailyRow(row.data);
        const rowInstance = RawFlightDataService.nonEmpty(
          row.data.SlNo,
          row.data.slNo,
          row.data.serialNo,
          row.data.SerialNo,
          row.data.flightSerialNumber,
        );
        const rowAirline = RawFlightDataService.nonEmpty(
          row.data.airline,
          row.data.Airline,
          row.data.airlines,
        ).toLowerCase();
        const rowFlight = RawFlightDataService.normalizeFlightNoForFind(
          RawFlightDataService.nonEmpty(
            row.data.flightNo,
            row.data['Flight No'],
            row.data.FlightNo,
          ),
        );

        const matched =
          (!!instanceSerial &&
            (rowInstance === instanceSerial || serial === rowInstance)) ||
          (!!scheduleMasterSerial && rowMaster === scheduleMasterSerial) ||
          (/^\d{6}$/.test(serial) && rowMaster === serial) ||
          (rowAirline === airline.toLowerCase() &&
            !!rowFlight &&
            rowFlight === creationFlight);

        if (!matched) continue;

        this.applyCreationDataToDailyRow(row.data, d);
        row.data.hasScheduledAirlinesCreation = true;
        row.data.dailyFlightOverride = true;
        if (scheduleMasterSerial) {
          row.data.scheduleMasterSerial = scheduleMasterSerial;
        }
        if (instanceSerial) {
          row.data.instanceSerial = instanceSerial;
        }
      }
    }
  }

  /**
   * Append `fhr_collection` rows for the requested date window to `out`.
   * Returns the pre-fetched `fhrBySerial` map so `finalizeDailyFhrCollectionOnly`
   * can reuse it without a second round-trip to Atlas.
   */
  private async appendFhrCollectionRowsToDaily(
    out: Array<{ data: Record<string, unknown> }>,
    start: Date,
    end: Date,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    forwardOnlyScheduleIds: Set<string> = new Set(),
  ): Promise<Map<number, Record<string, unknown>>> {
    const fromYmd = RawFlightDataService.dateToYmd(start);
    const toYmd = RawFlightDataService.dateToYmd(end);
    const fhrBySerial = new Map<number, Record<string, unknown>>();
    if (!fromYmd || !toYmd) return fhrBySerial;

    /** One table row per FHR serial + STA calendar day. */
    const seenRowKey = new Set<string>();

    const dateStrings = RawFlightDataService.dateRangeToDdMmYyyyList(
      start,
      end,
    );
    const perfTimers = process.env.FHR_PERF_TIMERS === '1';

    const fhrRows =
      await this.fhrCollectionService.findAllLeanForScheduledTableMerge(
        dateStrings,
        station,
      );
    if (perfTimers) console.time('mapBuild');
    for (const doc of fhrRows) {
      const sn = fhrCollectionServiceClass().leanDocInstanceSerial(
        doc as { SerialNo?: unknown; flightSerialNumber?: unknown },
      );
      if (sn == null) continue;
      const m = doc.mainDetails ?? {};
      // NS bookings share fhr_collection — keep them off Scheduled Airlines table.
      if (RawFlightDataService.isNonScheduledMainDetails(m)) continue;
      const t = doc.terminalDetails ?? {};
      const r1 = doc.rampDetails1 ?? {};
      const r3 = doc.rampDetails3 ?? {};

      const staScheduleRaw = RawFlightDataService.firstScheduleDateString(
        t.STADate,
        t.staDate,
        r1.STADate,
        r1.staDate,
        r3.STADate,
        m.STADate,
        m.staDate,
      );
      const stdScheduleRaw = RawFlightDataService.firstScheduleDateString(
        t.STDDate,
        t.stdDate,
        r1.STDDate,
        r1.stdDate,
        r3.STDDate,
        m.STDDate,
        m.stdDate,
      );

      const indexedStaDates = Array.isArray(
        (doc as { staDates?: unknown }).staDates,
      )
        ? ((doc as { staDates: unknown[] }).staDates ?? [])
        : [];
      const staDatesInRange: string[] = [];
      for (const rawDdMm of indexedStaDates) {
        const staDateNorm = RawFlightDataService.normalizeDateDdMmYyyy(
          String(rawDdMm ?? ''),
        );
        if (!staDateNorm) continue;
        const ymd = RawFlightDataService.scheduleLabelToYmd(staDateNorm);
        if (!ymd || ymd < fromYmd || ymd > toYmd) continue;
        staDatesInRange.push(staDateNorm);
      }

      if (staDatesInRange.length === 0) {
        const anchorRaw = staScheduleRaw || stdScheduleRaw;
        if (!anchorRaw) continue;
        const staDateNorm = RawFlightDataService.normalizeDateDdMmYyyy(
          staScheduleRaw || anchorRaw,
        );
        if (!staDateNorm) continue;
        const ymd = RawFlightDataService.scheduleLabelToYmd(staDateNorm);
        if (!ymd || ymd < fromYmd || ymd > toYmd) continue;
        staDatesInRange.push(staDateNorm);
      }

      const uniqueStaDates = [...new Set(staDatesInRange)];

      let stdDateRaw = RawFlightDataService.firstScheduleDateString(
        t.STDDate,
        t.stdDate,
        r1.STDDate,
        r1.stdDate,
        r3.STDDate,
        m.STDDate,
        m.stdDate,
        m.ATDDate,
      );
      if (!stdDateRaw) stdDateRaw = stdScheduleRaw || staScheduleRaw || '';
      const stdDateNormDefault = RawFlightDataService.nonEmpty(
        RawFlightDataService.normalizeDateDdMmYyyy(String(stdDateRaw)),
        uniqueStaDates[0] ?? '',
      );

      const airline = RawFlightDataService.nonEmpty(
        t.airlinesOperator,
        t.Airline,
        m.Airline,
        m.airline,
        r1.airlinesOperator,
        r1.Airline,
        r3.Airline,
        r3.airlinesOperator,
        '',
      );
      const arr = RawFlightDataService.nonEmpty(
        m.ArrivalFltNo,
        m.arrivalFlightNo,
        '',
      );
      const dep = RawFlightDataService.nonEmpty(
        m.DepartureFltNo,
        m.departureFlightNo,
        '',
      );
      const tFn = RawFlightDataService.nonEmpty(
        t.FlightNo,
        t.flightNo,
        m.FlightNo,
        m.flightNo,
        m['Flight No'],
        r1.FlightNo,
        r1.flightNo,
        r3.FlightNo,
        r3.flightNo,
        '',
      );
      const airlineCode = RawFlightDataService.nonEmpty(
        m['Airline Code'],
        m.airlineCode,
        t.airlineCode,
        t['Airline Code'],
        '',
      );
      const flightNo = RawFlightDataService.nonEmpty(
        displayFlightNoFromScheduleData({
          flightNo: tFn,
          'Flight No': tFn,
          ArrivalFltNo: arr,
          DepartureFltNo: dep,
          arrivalFlightNo: arr,
          departureFlightNo: dep,
          airlineCode,
          'Airline Code': airlineCode,
          ifOperationSplit: m.ifOperationSplit ?? m['Operation Split'],
          'Operation Split': m['Operation Split'] ?? m.ifOperationSplit,
        }),
      );
      if (!airline || !flightNo) {
        this.logger.debug(
          `[listDailyFromAdvance] skip serial=${sn}: missing airline or flightNo (scheduleId=${String((doc as { scheduleId?: unknown }).scheduleId ?? '')})`,
        );
        continue;
      }

      const staTime = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(
          t.STATime,
          t.sta,
          r1.STATime,
          r1.sta,
          m.ATATime,
          '00:00',
        ) || '00:00',
      );
      const stdTime = RawFlightDataService.normalizeTimeHhMm(
        RawFlightDataService.nonEmpty(
          t.STDTime,
          t.std,
          r1.STDTime,
          r1.std,
          m.ATDTime,
          '00:00',
        ) || '00:00',
      );

      if (!fhrBySerial.has(sn)) {
        fhrBySerial.set(sn, doc as unknown as Record<string, unknown>);
      }

      const masterScheduleId = String(
        (doc as { scheduleId?: unknown }).scheduleId ?? '',
      ).trim();
      /** Advance schedule masters: one setup serial, many operating days → instance serials via index. */
      const assignPerDayInstanceSerial = masterScheduleId.length > 0;

      // Forward-only Schedule Setup masters are listed by
      // `appendAdvanceScheduleRowsToDaily`. Expanding the same days from a
      // stale FHR master creates a second occurrence (new operational serial).
      if (
        assignPerDayInstanceSerial &&
        forwardOnlyScheduleIds.has(masterScheduleId)
      ) {
        continue;
      }

      for (const staDateNorm of uniqueStaDates) {
        const rowKey = `${sn}|${staDateNorm}`;
        if (seenRowKey.has(rowKey)) continue;
        seenRowKey.add(rowKey);

        const stdDateNorm = RawFlightDataService.resolveStdDateForOperatingDay(
          staDateNorm,
          staTime,
          stdTime,
          stdDateNormDefault,
        );

        if (assignPerDayInstanceSerial) {
          out.push({
            data: {
              scheduleDate: staDateNorm,
              scheduleId: masterScheduleId,
              flightNo,
              'Flight No': flightNo,
              airline,
              Airline: airline,
              airlineCode,
              'Airline Code': airlineCode,
              ifOperationSplit:
                m.ifOperationSplit === true ||
                String(m['Operation Split'] ?? '')
                  .trim()
                  .toLowerCase() === 'yes',
              ArrivalFltNo: arr,
              DepartureFltNo: dep,
              aircraft: RawFlightDataService.nonEmpty(
                m.TypeCraft,
                t.TypeCraft,
                '',
              ),
              Aircraft: RawFlightDataService.nonEmpty(
                m.TypeCraft,
                t.TypeCraft,
                '',
              ),
              route: RawFlightDataService.nonEmpty(m.Route, t.routing, ''),
              Routing: RawFlightDataService.nonEmpty(m.Route, t.routing, ''),
              staDate: staDateNorm,
              'STA Date': staDateNorm,
              stdDate: stdDateNorm,
              'STD Date': stdDateNorm,
              staTime,
              'STA Time': staTime,
              stdTime,
              'STD Time': stdTime,
              _staSortMinutes: RawFlightDataService.timeToMinutes(
                staTime || '00:00',
              ),
              _stdSortMinutes: RawFlightDataService.timeToMinutes(
                stdTime || '00:00',
              ),
              _inRequestedRange: true,
              flightStatus: 'Open',
              flightCancelled: false,
              isCancelled: false,
              scheduleSource: 'advance_schedule_setup',
              /** 6-digit advance setup serial — FHR enrich only; instance `slNo` assigned in attachStableSerials. */
              legacySlNo: String(sn),
              scheduleMasterSerial: String(sn),
            },
          });
          continue;
        }

        const scheduleIdFhr = `fhr_collection_${String(sn)}`;
        const instanceKey = RawFlightDataService.buildInstanceKey({
          date: staDateNorm,
          scheduleId: scheduleIdFhr,
          occurrenceIndex: 0,
        });
        out.push({
          data: {
            scheduleDate: staDateNorm,
            scheduleId: scheduleIdFhr,
            instanceKey,
            sequenceNumber: sn,
            serialNo: String(sn),
            SlNo: String(sn),
            'Serial No': String(sn),
            serialLabel: `FL-${String(sn)}`,
            flightNo,
            'Flight No': flightNo,
            airline,
            Airline: airline,
            aircraft: RawFlightDataService.nonEmpty(
              m.TypeCraft,
              t.TypeCraft,
              '',
            ),
            Aircraft: RawFlightDataService.nonEmpty(
              m.TypeCraft,
              t.TypeCraft,
              '',
            ),
            route: RawFlightDataService.nonEmpty(m.Route, t.routing, ''),
            Routing: RawFlightDataService.nonEmpty(m.Route, t.routing, ''),
            staDate: staDateNorm,
            'STA Date': staDateNorm,
            stdDate: stdDateNorm,
            'STD Date': stdDateNorm,
            staTime,
            'STA Time': staTime,
            stdTime,
            'STD Time': stdTime,
            _staSortMinutes: RawFlightDataService.timeToMinutes(
              staTime || '00:00',
            ),
            _stdSortMinutes: RawFlightDataService.timeToMinutes(
              stdTime || '00:00',
            ),
            _inRequestedRange: true,
            flightStatus: 'Open',
            flightCancelled: false,
            isCancelled: false,
            scheduleSource: 'fhr_collection',
            TypeofHandling: RawFlightDataService.nonEmpty(
              m.TypeofHandling,
              m.typeOfHandling,
              m['Type of Handling'],
            ),
            typeOfHandling: RawFlightDataService.nonEmpty(
              m.TypeofHandling,
              m.typeOfHandling,
              m['Type of Handling'],
            ),
            Typeofflight: RawFlightDataService.nonEmpty(
              m.Typeofflight,
              m['Type of flight'],
              m.flightType,
            ),
            bookingNo: RawFlightDataService.nonEmpty(
              m.bookingNo,
              m.BookingNo,
              m['Booking No'],
            ),
            challanNo: RawFlightDataService.nonEmpty(
              m.challanNo,
              m.ChallanNo,
              m['Challan No'],
            ),
          },
        });
      }
    }
    if (perfTimers) console.timeEnd('mapBuild');
    return fhrBySerial;
  }

  private normalizeFlightStatus(
    value: unknown,
    fallback: FlightStatus = 'Open',
  ): FlightStatus {
    const s = String(value ?? '')
      .trim()
      .toLowerCase();
    if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
    if (s === 'closed' || s === 'close') return 'Closed';
    if (s === 'open') return 'Open';
    return fallback;
  }

  /** Staging document (`advance_schedule_setup` / `scheduled_airlines_creation`) is editable on Creation. */
  private isStagingScheduleOpen(
    data: Record<string, unknown> | null | undefined,
  ): boolean {
    if (!data || typeof data !== 'object') return true;
    if (data.flightCancelled === true || data.isCancelled === true) {
      return false;
    }
    const status = this.normalizeFlightStatus(data.flightStatus, 'Open');
    return status === 'Open';
  }

  /** Convert time strings like 09:05 / 9.5 into sortable minutes-of-day. */
  private static timeToMinutes(input: unknown): number {
    const s = String(input ?? '')
      .trim()
      .replace(/\./g, ':');
    const m = /^(\d{1,2}):(\d{1,2})$/.exec(s);
    if (!m) return 0;
    const hh = Math.max(0, Math.min(23, Number(m[1])));
    const mm = Math.max(0, Math.min(59, Number(m[2])));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
    return hh * 60 + mm;
  }

  /**
   * Per operating-day STD date for expanded schedule rows.
   * When STA and STD times are both after 00:00, STD is on the same calendar day as STA
   * (each enumerated operating date), not the schedule validity end (`validTo`).
   */
  private static resolveStdDateForOperatingDay(
    staDateNorm: string,
    staTime: string,
    stdTime: string,
    masterStdDateFallback: string,
  ): string {
    const staMins = RawFlightDataService.timeToMinutes(staTime || '00:00');
    const stdMins = RawFlightDataService.timeToMinutes(stdTime || '00:00');
    const fallbackNorm = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(masterStdDateFallback, staDateNorm),
    );
    const staDateParsed = RawFlightDataService.parseDdMmYyyy(staDateNorm);

    const fallbackWithinOneDayOfSta = (): boolean => {
      if (!fallbackNorm || !staDateParsed) return false;
      const fallbackParsed = RawFlightDataService.parseDdMmYyyy(fallbackNorm);
      if (!fallbackParsed) return false;
      const dayDiff = Math.round(
        (fallbackParsed.getTime() - staDateParsed.getTime()) / 86400000,
      );
      return dayDiff >= 0 && dayDiff <= 1;
    };

    if (staMins > 0 && stdMins > 0 && staDateParsed) {
      if (
        fallbackNorm &&
        fallbackWithinOneDayOfSta() &&
        RawFlightDataService.scheduleDateTimeMs(fallbackNorm, stdTime) !=
          null &&
        RawFlightDataService.scheduleDateTimeMs(fallbackNorm, stdTime)! >=
          RawFlightDataService.scheduleDateTimeMs(staDateNorm, staTime)!
      ) {
        return fallbackNorm;
      }
      if (stdMins >= staMins) {
        return staDateNorm;
      }
      return RawFlightDataService.formatDateDdMmYyyy(
        RawFlightDataService.addDays(staDateParsed, 1),
      );
    }
    if (
      fallbackNorm &&
      staDateParsed &&
      fallbackWithinOneDayOfSta() &&
      RawFlightDataService.parseDdMmYyyy(fallbackNorm) &&
      RawFlightDataService.parseDdMmYyyy(fallbackNorm)!.getTime() >=
        staDateParsed.getTime()
    ) {
      return fallbackNorm;
    }
    return staDateNorm;
  }

  /** Align creation/find schedule payload STA+STD dates with daily list rules. */
  private finalizeCreationScheduleDates(
    schedule: Record<string, unknown>,
  ): void {
    const staDate = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(
        schedule.staDate,
        schedule['STA Date'],
        schedule.STADate,
        schedule.date,
      ),
    );
    if (!staDate) return;
    const staTime = RawFlightDataService.normalizeTimeHhMm(
      RawFlightDataService.nonEmpty(
        schedule.staTime,
        schedule['STA Time'],
        schedule.STATime,
        '00:00',
      ),
    );
    const stdTime = RawFlightDataService.normalizeTimeHhMm(
      RawFlightDataService.nonEmpty(
        schedule.stdTime,
        schedule['STD Time'],
        schedule.STDTime,
        '00:00',
      ),
    );
    const fallbackStd = RawFlightDataService.nonEmpty(
      schedule.stdDate,
      schedule['STD Date'],
      schedule.STDDate,
      schedule['Valid To'],
      schedule.validTo,
    );
    const stdDate = RawFlightDataService.resolveStdDateForOperatingDay(
      staDate,
      staTime,
      stdTime,
      fallbackStd,
    );
    schedule.staDate = staDate;
    schedule['STA Date'] = staDate;
    schedule.STADate = staDate;
    schedule.stdDate = stdDate;
    schedule['STD Date'] = stdDate;
    schedule.STDDate = stdDate;
  }

  private static normalizeTimeHhMm(input: unknown): string {
    const s = String(input ?? '')
      .trim()
      .replace(/\./g, ':');
    const m = /^(\d{1,2}):(\d{1,2})$/.exec(s);
    if (!m) return '00:00';
    const hh = Math.max(0, Math.min(23, Number(m[1])));
    const mm = Math.max(0, Math.min(59, Number(m[2])));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return '00:00';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  /** yyyy-MM-dd query param → YYYYMMDD int for range checks. */
  private static queryYmdToIntKey(s?: string): number | null {
    if (!s?.trim()) return null;
    const t = s.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (!iso) return null;
    return Number(`${iso[1]}${iso[2]}${iso[3]}`);
  }

  /**
   * Normalize STA/ATA clock strings for equality (HH:mm, HH:mm:ss, H.mm, HHMM, HMM).
   */
  private static clockNormalizedForStaAtaCompare(input: unknown): string {
    const s = String(input ?? '')
      .trim()
      .replace(/\./g, ':');
    if (!s) return '';
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
    if (m) {
      const hh = Math.max(0, Math.min(23, Number(m[1])));
      const mm = Math.max(0, Math.min(59, Number(m[2])));
      const ss = Math.max(0, Math.min(59, Number(m[3] ?? 0)));
      if (Number.isNaN(hh) || Number.isNaN(mm) || Number.isNaN(ss)) return '';
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }
    const digits = s.replace(/\D/g, '');
    if (digits.length === 4) {
      const hh = Number(digits.slice(0, 2));
      const mm = Number(digits.slice(2, 4));
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:00`;
      }
    }
    if (digits.length === 3) {
      const h = Number(digits[0]);
      const mm = Number(digits.slice(1, 3));
      if (h >= 0 && h <= 9 && mm >= 0 && mm <= 59) {
        return `${String(h).padStart(2, '0')}:${digits.slice(1, 3)}:00`;
      }
    }
    return '';
  }

  private static naiveIsoFromDdMmYyyyAndHms(
    dateDdMmYyyy: string,
    hhmmss: string,
  ): string {
    const parsed = RawFlightDataService.parseDdMmYyyy(dateDdMmYyyy);
    if (!parsed || !hhmmss) return '';
    const y = parsed.getFullYear();
    const mo = String(parsed.getMonth() + 1).padStart(2, '0');
    const da = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}T${hhmmss}`;
  }

  /**
   * Count operative main-details rows where **terminal/ramp STA date & time** equal **main ATA date & time**
   * (same normalization as dashboard performance report). Scoped by **STA calendar date** in [fromDate, tillDate]
   * inclusive (`yyyy-MM-dd`).
   */
  async countDidFlyOnTimeExactStaEqualsAta(
    fromDate?: string,
    tillDate?: string,
  ): Promise<{
    count: number;
    matches: Array<{
      SerialNo: number;
      airlineName: string;
      flightNo: string;
      staIso: string;
      ataIso: string;
    }>;
  }> {
    const fromKey = RawFlightDataService.queryYmdToIntKey(fromDate);
    const tillKey = RawFlightDataService.queryYmdToIntKey(tillDate);
    if (fromKey == null || tillKey == null || fromKey > tillKey) {
      return { count: 0, matches: [] };
    }

    const mains = await this.mainDetailsModel
      .find({ flightCancelled: { $ne: true } })
      .select({
        SerialNo: 1,
        ATADate: 1,
        ATATime: 1,
        Airline: 1,
        ArrivalFltNo: 1,
        DepartureFltNo: 1,
      })
      .lean()
      .exec();

    if (mains.length === 0) {
      return { count: 0, matches: [] };
    }

    const serials = [
      ...new Set(
        mains.map((m) => Number(m.SerialNo)).filter((n) => Number.isFinite(n)),
      ),
    ];

    const [terminalRows, rampRows] = await Promise.all([
      this.terminalDetailsModel
        .find({ serialNo: { $in: serials } })
        .select({ serialNo: 1, STADate: 1, STATime: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .lean()
        .exec(),
      this.rampDetails1Model
        .find({ serialNo: { $in: serials } })
        .select({ serialNo: 1, STADate: 1, STATime: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .lean()
        .exec(),
    ]);

    const terminalBySerial = new Map<
      number,
      { STADate?: string; STATime?: string }
    >();
    for (const r of terminalRows) {
      const k = Number((r as { serialNo?: number }).serialNo);
      if (!Number.isFinite(k) || terminalBySerial.has(k)) continue;
      terminalBySerial.set(k, {
        STADate: (r as { STADate?: string }).STADate,
        STATime: (r as { STATime?: string }).STATime,
      });
    }
    const rampBySerial = new Map<
      number,
      { STADate?: string; STATime?: string }
    >();
    for (const r of rampRows) {
      const k = Number((r as { serialNo?: number }).serialNo);
      if (!Number.isFinite(k) || rampBySerial.has(k)) continue;
      rampBySerial.set(k, {
        STADate: (r as { STADate?: string }).STADate,
        STATime: (r as { STATime?: string }).STATime,
      });
    }

    const matches: Array<{
      SerialNo: number;
      airlineName: string;
      flightNo: string;
      staIso: string;
      ataIso: string;
    }> = [];
    let count = 0;

    for (const main of mains) {
      const sn = Number(main.SerialNo);
      if (!Number.isFinite(sn)) continue;
      const term = terminalBySerial.get(sn);
      const ramp = rampBySerial.get(sn);
      const staDateRaw = RawFlightDataService.nonEmpty(
        term?.STADate,
        ramp?.STADate,
      );
      const staTimeRaw = RawFlightDataService.nonEmpty(
        term?.STATime,
        ramp?.STATime,
      );
      const ataDateRaw = RawFlightDataService.nonEmpty(main.ATADate);
      const ataTimeRaw = RawFlightDataService.nonEmpty(main.ATATime);
      if (!staDateRaw || !staTimeRaw || !ataDateRaw || !ataTimeRaw) continue;

      const staD = RawFlightDataService.normalizeDateDdMmYyyy(staDateRaw);
      const ataD = RawFlightDataService.normalizeDateDdMmYyyy(ataDateRaw);
      const staT =
        RawFlightDataService.clockNormalizedForStaAtaCompare(staTimeRaw);
      const ataT =
        RawFlightDataService.clockNormalizedForStaAtaCompare(ataTimeRaw);
      if (!staD || !ataD || !staT || !ataT) continue;

      const staSortKey = RawFlightDataService.toYyyymmddFromDdMmYyyy(staD);
      const staKey = staSortKey ? Number(staSortKey) : null;
      if (staKey == null || staKey < fromKey || staKey > tillKey) continue;

      if (staD === ataD && staT === ataT) {
        count += 1;
        const staIso = RawFlightDataService.naiveIsoFromDdMmYyyyAndHms(
          staD,
          staT,
        );
        const ataIso = RawFlightDataService.naiveIsoFromDdMmYyyyAndHms(
          ataD,
          ataT,
        );
        const fn = RawFlightDataService.flightNoFromMainArrivalDeparture(
          main.ArrivalFltNo,
          main.DepartureFltNo,
        );
        matches.push({
          SerialNo: sn,
          airlineName: String(main.Airline ?? ''),
          flightNo: fn,
          staIso,
          ataIso,
        });
      }
    }

    return { count, matches };
  }

  private static timeDiffMinutes(
    fromTime: unknown,
    toTime: unknown,
  ): number | null {
    const from = RawFlightDataService.timeToMinutes(fromTime);
    const to = RawFlightDataService.timeToMinutes(toTime);
    const fromOk = String(fromTime ?? '').trim().length > 0;
    const toOk = String(toTime ?? '').trim().length > 0;
    if (!fromOk || !toOk) return null;
    const diff = to - from;
    return diff >= 0 ? diff : diff + 24 * 60;
  }

  private static bagAchievedByAta(
    ataTime: unknown,
    bagBmaTime: unknown,
    thresholdMinutes: number,
  ): 'Achieved' | 'Not Achieved' {
    const diff = RawFlightDataService.timeDiffMinutes(ataTime, bagBmaTime);
    if (diff == null) return 'Not Achieved';
    return diff <= thresholdMinutes ? 'Achieved' : 'Not Achieved';
  }

  private static toYyyymmddFromDdMmYyyy(input: string): string {
    const s = RawFlightDataService.normalizeDateDdMmYyyy(input);
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!m) return '';
    return `${m[3]}${m[2]}${m[1]}`;
  }

  private static hashSha1(input: string): string {
    return createHash('sha1').update(input).digest('hex');
  }

  private static compareLex(a: string, b: string): number {
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  }

  private static buildInstanceKey(parts: {
    date: string;
    scheduleId: string;
    occurrenceIndex: number;
  }): string {
    // Identity is master schedule + operating day only.
    // Do NOT include STA/STD/flightNo — editing those fields must update the
    // same Scheduled Airlines instance, not mint a new operational serial.
    const raw = [
      parts.date,
      parts.scheduleId,
      String(parts.occurrenceIndex),
    ].join('|');
    return RawFlightDataService.hashSha1(raw);
  }

  private static buildSerials(sequenceNumber: number): {
    serialNo: string;
    serialLabel: string;
  } {
    const seq = String(
      RawFlightDataService.GLOBAL_SERIAL_BASE + sequenceNumber,
    );
    return {
      serialNo: seq,
      serialLabel: `FL-${seq}`,
    };
  }

  private static toEpoch(value: unknown): number {
    if (value instanceof Date) return value.getTime();
    const n = new Date(String(value ?? '')).getTime();
    return Number.isNaN(n) ? 0 : n;
  }

  private static compareIndexDocsForKeep(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
  ): number {
    const createdCmp =
      RawFlightDataService.toEpoch(a.createdAt) -
      RawFlightDataService.toEpoch(b.createdAt);
    if (createdCmp !== 0) return createdCmp;
    return RawFlightDataService.compareLex(
      String(a._id ?? ''),
      String(b._id ?? ''),
    );
  }

  private async reserveGlobalSequenceBlock(size: number): Promise<number> {
    if (!Number.isInteger(size) || size <= 0) return 0;
    const counterDoc = await this.flightSerialCounterModel.findOneAndUpdate(
      { key: RawFlightDataService.GLOBAL_SERIAL_COUNTER_ID },
      {
        $setOnInsert: { key: RawFlightDataService.GLOBAL_SERIAL_COUNTER_ID },
        $inc: { seq: size },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const current = Number(counterDoc?.seq ?? 0);
    return current - size + 1;
  }

  /**
   * Allocate (or reuse) an operational serial for a scheduleId + operating day.
   * Used by Creation → Additional Flights so the serial matches Schedule Airlines.
   */
  async ensureOperationalSerialForScheduleDay(
    scheduleId: string,
    operationDateDdMmYyyy: string,
  ): Promise<{ serialNo: string; serialLabel: string; instanceKey: string }> {
    const scheduleIdNorm = String(scheduleId ?? '').trim();
    const operationDate = RawFlightDataService.normalizeDateDdMmYyyy(
      operationDateDdMmYyyy,
    );
    if (!scheduleIdNorm || !operationDate) {
      throw new BadRequestException(
        'scheduleId and operationDate are required to allocate a flight serial.',
      );
    }

    const instanceKey = RawFlightDataService.buildInstanceKey({
      date: operationDate,
      scheduleId: scheduleIdNorm,
      occurrenceIndex: 0,
    });

    const existing = await this.flightInstanceIndexModel
      .findOne({
        $or: [
          { instanceKey },
          { scheduleId: scheduleIdNorm, operationDate },
        ],
      })
      .lean();
    if (existing?.serialNo) {
      return {
        serialNo: String(existing.serialNo),
        serialLabel: String(
          existing.serialLabel ?? `FL-${existing.serialNo}`,
        ),
        instanceKey: String(existing.instanceKey ?? instanceKey),
      };
    }

    const sequenceNumber = await this.reserveGlobalSequenceBlock(1);
    const serials = RawFlightDataService.buildSerials(sequenceNumber);
    try {
      await this.flightInstanceIndexModel.create({
        operationDate,
        scheduleId: scheduleIdNorm,
        instanceKey,
        sequenceNumber,
        serialNo: serials.serialNo,
        serialLabel: serials.serialLabel,
      });
    } catch {
      const raced = await this.flightInstanceIndexModel
        .findOne({
          $or: [
            { instanceKey },
            { scheduleId: scheduleIdNorm, operationDate },
          ],
        })
        .lean();
      if (raced?.serialNo) {
        return {
          serialNo: String(raced.serialNo),
          serialLabel: String(raced.serialLabel ?? `FL-${raced.serialNo}`),
          instanceKey: String(raced.instanceKey ?? instanceKey),
        };
      }
      throw new BadRequestException(
        'Failed to allocate operational serial for additional flight.',
      );
    }

    return {
      serialNo: serials.serialNo,
      serialLabel: serials.serialLabel,
      instanceKey,
    };
  }

  /**
   * Self-heal legacy corruption:
   * 1) duplicate rows for the same instanceKey
   * 2) duplicate serialNo values across different instanceKeys
   */
  private async repairDuplicateIndexRowsForKeys(
    instanceKeys: string[],
  ): Promise<boolean> {
    if (!instanceKeys.length) return false;

    const docs = await this.flightInstanceIndexModel
      .find({ instanceKey: { $in: instanceKeys } })
      .lean();
    if (!docs.length) return false;

    let changed = false;
    const byInstanceKey = new Map<string, Record<string, unknown>[]>();
    for (const d of docs) {
      const key = String(d.instanceKey ?? '').trim();
      if (!key) continue;
      const arr = byInstanceKey.get(key) ?? [];
      arr.push(d as unknown as Record<string, unknown>);
      byInstanceKey.set(key, arr);
    }

    const duplicateIdsToDelete: string[] = [];
    const survivorByInstanceKey = new Map<string, Record<string, unknown>>();
    for (const [key, rows] of byInstanceKey.entries()) {
      rows.sort(RawFlightDataService.compareIndexDocsForKeep);
      survivorByInstanceKey.set(key, rows[0]);
      if (rows.length > 1) {
        changed = true;
        for (let i = 1; i < rows.length; i += 1) {
          duplicateIdsToDelete.push(String(rows[i]._id ?? ''));
        }
      }
    }

    if (duplicateIdsToDelete.length) {
      await this.flightInstanceIndexModel.deleteMany({
        _id: { $in: duplicateIdsToDelete },
      });
    }

    const survivors = Array.from(survivorByInstanceKey.values());
    const bySerial = new Map<string, Record<string, unknown>[]>();
    for (const d of survivors) {
      const serial = String(d.serialNo ?? '').trim();
      if (!serial) continue;
      const arr = bySerial.get(serial) ?? [];
      arr.push(d);
      bySerial.set(serial, arr);
    }

    const toReassign: Record<string, unknown>[] = [];
    for (const rows of bySerial.values()) {
      rows.sort(RawFlightDataService.compareIndexDocsForKeep);
      if (rows.length > 1) {
        changed = true;
        toReassign.push(...rows.slice(1));
      }
    }

    if (toReassign.length) {
      const start = await this.reserveGlobalSequenceBlock(toReassign.length);
      await Promise.all(
        toReassign.map(async (doc, i) => {
          const sequenceNumber = start + i;
          const serials = RawFlightDataService.buildSerials(sequenceNumber);
          await this.flightInstanceIndexModel.findByIdAndUpdate(doc._id, {
            $set: {
              sequenceNumber,
              serialNo: serials.serialNo,
              serialLabel: serials.serialLabel,
            },
          });
        }),
      );
    }

    return changed;
  }

  private static compareForStableDailyOrder(
    a: {
      staTime: string;
      airline: string;
      flightNo: string;
      scheduleId: string;
      occurrenceIndex: number;
      instanceKey: string;
    },
    b: {
      staTime: string;
      airline: string;
      flightNo: string;
      scheduleId: string;
      occurrenceIndex: number;
      instanceKey: string;
    },
  ): number {
    const timeCmp =
      RawFlightDataService.timeToMinutes(a.staTime) -
      RawFlightDataService.timeToMinutes(b.staTime);
    if (timeCmp !== 0) return timeCmp;
    const alCmp = RawFlightDataService.compareLex(a.airline, b.airline);
    if (alCmp !== 0) return alCmp;
    const fnCmp = RawFlightDataService.compareLex(a.flightNo, b.flightNo);
    if (fnCmp !== 0) return fnCmp;
    const sidCmp = RawFlightDataService.compareLex(a.scheduleId, b.scheduleId);
    if (sidCmp !== 0) return sidCmp;
    if (a.occurrenceIndex !== b.occurrenceIndex) {
      return a.occurrenceIndex - b.occurrenceIndex;
    }
    return RawFlightDataService.compareLex(a.instanceKey, b.instanceKey);
  }

  /**
   * When instanceKey format changes (legacy included STA/STD/flightNo), reuse the
   * oldest flight_instance_index row for the same scheduleId + operationDate and
   * rewrite its key so edits keep the same Scheduled Airlines serial.
   */
  private async migrateLegacyInstanceKeys(
    unresolved: Array<{
      operationDate: string;
      scheduleId: string;
      instanceKey: string;
    }>,
    existingByKey: Map<string, FlightInstanceIndexDocument>,
  ): Promise<void> {
    const scheduleIds = Array.from(
      new Set(unresolved.map((c) => c.scheduleId).filter(Boolean)),
    );
    const dates = Array.from(
      new Set(unresolved.map((c) => c.operationDate).filter(Boolean)),
    );
    if (scheduleIds.length === 0 || dates.length === 0) return;

    const legacyDocs = (await this.flightInstanceIndexModel
      .find({
        scheduleId: { $in: scheduleIds },
        operationDate: { $in: dates },
      })
      .lean()) as unknown as Array<Record<string, unknown>>;

    const byPair = new Map<string, Array<Record<string, unknown>>>();
    for (const doc of legacyDocs) {
      const sid = String(doc.scheduleId ?? '').trim();
      const od = String(doc.operationDate ?? '').trim();
      if (!sid || !od) continue;
      const pair = `${sid}|${od}`;
      const list = byPair.get(pair) ?? [];
      list.push(doc);
      byPair.set(pair, list);
    }

    const deleteIds: string[] = [];

    for (const c of unresolved) {
      if (existingByKey.has(c.instanceKey)) continue;
      const pair = `${c.scheduleId}|${c.operationDate}`;
      const docs = byPair.get(pair);
      if (!docs?.length) continue;

      docs.sort((a, b) =>
        RawFlightDataService.compareIndexDocsForKeep(a, b),
      );
      const keep = docs[0];
      const keepId = String(keep._id ?? '').trim();
      if (!keepId) continue;

      for (const extra of docs.slice(1)) {
        const id = String(extra._id ?? '').trim();
        if (id) deleteIds.push(id);
      }

      const oldKey = String(keep.instanceKey ?? '').trim();
      if (oldKey === c.instanceKey) {
        existingByKey.set(
          c.instanceKey,
          keep as unknown as FlightInstanceIndexDocument,
        );
        continue;
      }

      try {
        await this.flightInstanceIndexModel.updateOne(
          { _id: keepId },
          { $set: { instanceKey: c.instanceKey } },
        );
        keep.instanceKey = c.instanceKey;
        existingByKey.set(
          c.instanceKey,
          keep as unknown as FlightInstanceIndexDocument,
        );
      } catch {
        // New key already taken — drop the legacy duplicate.
        deleteIds.push(keepId);
      }
    }

    const uniqueDeletes = Array.from(new Set(deleteIds)).filter(Boolean);
    if (uniqueDeletes.length > 0) {
      await this.flightInstanceIndexModel.deleteMany({
        _id: { $in: uniqueDeletes },
      });
    }
  }

  private async attachStableSerials(
    rows: Array<{ data: Record<string, unknown> }>,
  ): Promise<void> {
    const candidates = rows
      .map((row) => {
        if (row.data.scheduleSource === 'fhr_collection') {
          return null;
        }
        const operationDate = RawFlightDataService.nonEmpty(
          row.data.scheduleDate ?? row.data['STA Date'] ?? row.data.staDate,
        );
        if (!operationDate) return null;
        return {
          row,
          operationDate,
          scheduleId: RawFlightDataService.nonEmpty(
            row.data.scheduleId ?? row.data.serialNo,
          ),
          airline: RawFlightDataService.nonEmpty(
            row.data.airline ?? row.data.Airline,
          ),
          flightNo: RawFlightDataService.nonEmpty(
            row.data.flightNo ?? row.data['Flight No'],
          ),
          staTime: RawFlightDataService.normalizeTimeHhMm(
            row.data.staTime ?? row.data['STA Time'],
          ),
          stdTime: RawFlightDataService.normalizeTimeHhMm(
            row.data.stdTime ?? row.data['STD Time'],
          ),
          occurrenceIndex: 0,
          instanceKey: '',
        };
      })
      .filter((v): v is NonNullable<typeof v> => v != null);

    // Assign occurrence index deterministically for duplicate natural keys.
    candidates.sort((a, b) => {
      const dtCmp = RawFlightDataService.compareLex(
        a.operationDate,
        b.operationDate,
      );
      if (dtCmp !== 0) return dtCmp;
      const timeCmp =
        RawFlightDataService.timeToMinutes(a.staTime) -
        RawFlightDataService.timeToMinutes(b.staTime);
      if (timeCmp !== 0) return timeCmp;
      const alCmp = RawFlightDataService.compareLex(a.airline, b.airline);
      if (alCmp !== 0) return alCmp;
      const fnCmp = RawFlightDataService.compareLex(a.flightNo, b.flightNo);
      if (fnCmp !== 0) return fnCmp;
      return RawFlightDataService.compareLex(a.scheduleId, b.scheduleId);
    });
    const occurrenceCounter = new Map<string, number>();
    for (const c of candidates) {
      const base = `${c.operationDate}|${c.scheduleId}`;
      const n = occurrenceCounter.get(base) ?? 0;
      c.occurrenceIndex = n;
      occurrenceCounter.set(base, n + 1);
      c.instanceKey = RawFlightDataService.buildInstanceKey({
        date: c.operationDate,
        scheduleId: c.scheduleId,
        occurrenceIndex: c.occurrenceIndex,
      });
    }

    const uniqueKeys = Array.from(
      new Set(candidates.map((c) => c.instanceKey)),
    );
    const existing = uniqueKeys.length
      ? await this.flightInstanceIndexModel
          .find({ instanceKey: { $in: uniqueKeys } })
          .lean()
      : [];
    const existingByKey = new Map<string, FlightInstanceIndexDocument>();
    for (const idx of existing) {
      existingByKey.set(
        String(idx.instanceKey),
        idx as FlightInstanceIndexDocument,
      );
    }

    // Migrate legacy keys that included flightNo/STA/STD: reuse oldest row
    // for the same scheduleId + operationDate and rewrite its instanceKey.
    const unresolved = candidates.filter(
      (c) => !existingByKey.has(c.instanceKey),
    );
    if (unresolved.length > 0) {
      await this.migrateLegacyInstanceKeys(unresolved, existingByKey);
    }

    const missingUnique = Array.from(
      new Map(
        candidates
          .filter((c) => !existingByKey.has(c.instanceKey))
          .sort((a, b) =>
            RawFlightDataService.compareForStableDailyOrder(
              {
                staTime: a.staTime,
                airline: a.airline,
                flightNo: a.flightNo,
                scheduleId: a.scheduleId,
                occurrenceIndex: a.occurrenceIndex,
                instanceKey: a.instanceKey,
              },
              {
                staTime: b.staTime,
                airline: b.airline,
                flightNo: b.flightNo,
                scheduleId: b.scheduleId,
                occurrenceIndex: b.occurrenceIndex,
                instanceKey: b.instanceKey,
              },
            ),
          )
          .map((c) => [c.instanceKey, c] as const),
      ).values(),
    );

    if (missingUnique.length > 0) {
      const start = await this.reserveGlobalSequenceBlock(missingUnique.length);
      const inserts = missingUnique.map((c, i) => {
        const sequenceNumber = start + i;
        const serials = RawFlightDataService.buildSerials(sequenceNumber);
        return {
          operationDate: c.operationDate,
          scheduleId: c.scheduleId,
          instanceKey: c.instanceKey,
          sequenceNumber,
          serialNo: serials.serialNo,
          serialLabel: serials.serialLabel,
        };
      });
      try {
        await this.flightInstanceIndexModel.insertMany(inserts, {
          ordered: false,
        });
      } catch {
        // Concurrent requests may race to insert same keys; re-read below.
      }
    }

    let finalIndex = uniqueKeys.length
      ? await this.flightInstanceIndexModel
          .find({ instanceKey: { $in: uniqueKeys } })
          .lean()
      : [];
    const repaired = await this.repairDuplicateIndexRowsForKeys(uniqueKeys);
    if (repaired) {
      finalIndex = await this.flightInstanceIndexModel
        .find({ instanceKey: { $in: uniqueKeys } })
        .lean();
    }
    const finalByKey = new Map<string, FlightInstanceIndexDocument>();
    for (const idx of finalIndex) {
      finalByKey.set(
        String(idx.instanceKey),
        idx as FlightInstanceIndexDocument,
      );
    }

    for (const c of candidates) {
      const idx = finalByKey.get(c.instanceKey);
      if (!idx) continue;
      const serialNo = String(idx.serialNo ?? '').trim();
      const serialLabel = String(idx.serialLabel ?? '').trim();
      c.row.data.sequenceNumber = Number(idx.sequenceNumber ?? 0);
      c.row.data.instanceKey = c.instanceKey;
      c.row.data.serialLabel = serialLabel;
      c.row.data.scheduleId = c.scheduleId;
      c.row.data.serialNo = serialNo;
      c.row.data.SlNo = serialNo;
      c.row.data.slNo = serialNo;
      c.row.data['Serial No'] = serialNo;
    }
  }

  private serialMatchFilter(serial: string): Record<string, string | number>[] {
    const s = String(serial).trim();
    const num = Number(s);
    const or: Record<string, string | number>[] = [
      { 'data.SlNo': s },
      { 'data.slNo': s },
      { 'data.serialNo': s },
      { 'data.Serial No': s },
      { 'data.Serial Number': s },
      { 'data.Sr No': s },
      { 'data.Sr. No': s },
      { 'data.legacySlNo': s },
    ];
    if (!Number.isNaN(num)) {
      or.push({ 'data.SerialNo': num });
      or.push({ 'data.SerialNo': s });
    }
    return or;
  }

  /** Keep advance_schedule_setup clean (single canonical key per field). */
  private normalizeAdvanceSchedulePayload(
    payload: Record<string, unknown>,
    serial: string,
  ): Record<string, unknown> {
    const pick = (...vals: unknown[]) => {
      for (const v of vals) {
        const s = RawFlightDataService.nonEmpty(v);
        if (s) return s;
      }
      return '';
    };

    const normalizedStatus = this.normalizeFlightStatus(
      payload.flightStatus,
      'Open',
    );
    const dayTimes = normalizeScheduleDayTimes(payload.dayTimes);
    const flightNoStored = normalizeScheduleFlightNoForStorage(
      pick(payload.flightNo, payload['Flight No']),
    );
    const routingStored = normalizeScheduleRoutingForStorage(
      pick(payload.routing, payload.route, payload.Routing),
    );
    const arrivalStored = normalizeScheduleFlightNoForStorage(
      pick(
        payload.arrivalFlightNo,
        payload['Arrival Flight No'],
        payload.ArrivalFltNo,
      ),
    );
    const departureStored = normalizeScheduleFlightNoForStorage(
      pick(
        payload.departureFlightNo,
        payload['Departure Flight No'],
        payload.DepartureFltNo,
      ),
    );

    return {
      serialNo: serial,
      airline: pick(payload.airline, payload.Airline),
      airlineCode: pick(payload.airlineCode, payload['Airline Code']),
      // Keep `/` as entered (identity matching still strips via normalizeFlightNoForFind).
      flightNo: flightNoStored,
      flightType: pick(
        payload.flightType,
        payload.flight,
        payload['Flight Type'],
        payload['Type of flight'],
      ),
      staTime: pick(payload.staTime, payload['STA Time'], payload.STATime),
      stdTime: pick(payload.stdTime, payload['STD Time'], payload.STDTime),
      staDate: RawFlightDataService.normalizeDateDdMmYyyy(
        pick(payload.staDate, payload['STA Date']),
      ),
      stdDate: RawFlightDataService.normalizeDateDdMmYyyy(
        pick(payload.stdDate, payload['STD Date']),
      ),
      routing: routingStored,
      aircraft: pick(payload.aircraft, payload.Aircraft, payload.TypeCraft),
      aircraftBody: pick(payload.aircraftBody, payload['Aircraft Body']),
      freighter: pick(payload.freighter, payload.Freighter),
      typeOfHandling: pick(payload.typeOfHandling, payload['Type of Handling']),
      nextDay: pick(payload.nextDay, payload['Next Day']),
      validFrom: RawFlightDataService.normalizeDateDdMmYyyy(
        pick(
          payload.validFrom,
          payload['Valid From'],
          payload.staDate,
          payload['STA Date'],
        ),
      ),
      validTo: RawFlightDataService.normalizeDateDdMmYyyy(
        pick(
          payload.validTo,
          payload['Valid To'],
          payload.stdDate,
          payload['STD Date'],
        ),
      ),
      ifOperationSplit:
        payload.ifOperationSplit === true ||
        String(payload['Operation Split'] ?? '')
          .trim()
          .toLowerCase() === 'yes',
      ArrivalFltNo: arrivalStored,
      DepartureFltNo: departureStored,
      arrivalFlightNo: arrivalStored,
      departureFlightNo: departureStored,
      scheduleDays: RawFlightDataService.normalizeScheduleDays(
        payload.scheduleDays,
      ),
      ...(dayTimes ? { dayTimes } : {}),
      active:
        payload.active === true ||
        String(payload.Active ?? '')
          .trim()
          .toLowerCase() === 'yes',
      flightStatus: normalizedStatus,
      flightCancelled: normalizedStatus === 'Cancelled',
      isCancelled: normalizedStatus === 'Cancelled',
      scheduleSource: pick(payload.scheduleSource) || 'advance_schedule_setup',
      exportedNAV: pick(payload.exportedNAV) || 'No',
      rampLocked: pick(payload.rampLocked) || 'No',
      paxLocked: pick(payload.paxLocked) || 'No',
      gsdLocked: pick(payload.gsdLocked) || 'No',
    };
  }

  private attachSeasonToAdvancePayload(
    cleanData: Record<string, unknown>,
    seasonInfo: ScheduleSeasonInfo,
    identityKey: string,
  ): void {
    cleanData.season = seasonInfo.season;
    cleanData.Season = seasonInfo.season;
    cleanData.seasonKey = seasonInfo.seasonKey;
    cleanData.identityKey = identityKey;
  }

  private extractAdvanceScheduleMatchParts(payload: Record<string, unknown>): {
    airline: string;
    flightNo: string;
    routing: string;
    validFrom: string;
    validTo: string;
  } {
    const airline = RawFlightDataService.nonEmpty(
      payload.airline,
      payload.Airline,
    );
    const flightNo = RawFlightDataService.normalizeFlightNoForFind(
      RawFlightDataService.nonEmpty(
        payload.flightNo,
        payload['Flight No'],
        payload.FlightNo,
      ),
    );
    const routing = RawFlightDataService.nonEmpty(
      payload.routing,
      payload.route,
      payload.Routing,
    );
    const validFrom = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(
        payload.validFrom,
        payload['Valid From'],
        payload.staDate,
        payload['STA Date'],
      ),
    );
    const validTo = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(
        payload.validTo,
        payload['Valid To'],
        payload.stdDate,
        payload['STD Date'],
      ),
    );
    return { airline, flightNo, routing, validFrom, validTo };
  }

  private validateAdvanceScheduleDates(validFrom: string, validTo: string): void {
    if (!validFrom || !validTo) {
      throw new BadRequestException(
        'Valid From and Valid To are required (dd/MM/yyyy).',
      );
    }
    if (!parseScheduleDateDdMmYyyy(validFrom)) {
      throw new BadRequestException(
        `Valid From must be a valid date (dd/MM/yyyy). Received: "${validFrom}"`,
      );
    }
    if (!parseScheduleDateDdMmYyyy(validTo)) {
      throw new BadRequestException(
        `Valid To must be a valid date (dd/MM/yyyy). Received: "${validTo}"`,
      );
    }
    if (compareScheduleDates(validFrom, validTo) > 0) {
      throw new BadRequestException(
        'Valid From must be on or before Valid To.',
      );
    }
  }

  /**
   * Find existing advance master for same airline + flight + routing + season.
   * Prefers indexed identityKey; falls back to legacy rows (season from Valid From).
   * When several legacy rows match, returns the newest and lists sibling serials to remove.
   */
  private async findAdvanceScheduleForSeason(
    station: StationScopeContext,
    identityKey: string,
    seasonKey: string,
    airline: string,
    flightNo: string,
    routing: string,
  ): Promise<{
    serialNo: string;
    data: Record<string, unknown>;
    _id?: Types.ObjectId;
    /** Extra same-season duplicates to delete after merge (legacy data cleanup). */
    duplicateSerials: string[];
  } | null> {
    const byKey = await this.advanceScheduleModel
      .findOne(
        StationScope.filter(
          {
            $or: [{ identityKey }, { 'data.identityKey': identityKey }],
          },
          station,
        ),
      )
      .lean();

    const airlineNorm = airline.trim().toLowerCase();
    const flightNorm =
      RawFlightDataService.normalizeFlightNoForFind(flightNo);
    const routingNorm = normalizeRoutingForMatch(routing);
    if (!airlineNorm || !flightNorm) {
      if (!byKey) return null;
      const data =
        byKey.data &&
        typeof byKey.data === 'object' &&
        !Array.isArray(byKey.data)
          ? (byKey.data as Record<string, unknown>)
          : {};
      return {
        serialNo: String(byKey.serialNo ?? '').trim(),
        data,
        _id: byKey._id as Types.ObjectId,
        duplicateSerials: [],
      };
    }

    const docs = await this.advanceScheduleModel
      .find(StationScope.filter({}, station))
      .sort({ updatedAt: -1 })
      .lean();

    type Match = {
      serialNo: string;
      data: Record<string, unknown>;
      _id?: Types.ObjectId;
      updatedAt: number;
    };
    const matches: Match[] = [];

    for (const d of docs) {
      const data =
        d?.data && typeof d.data === 'object' && !Array.isArray(d.data)
          ? (d.data as Record<string, unknown>)
          : undefined;
      if (!data) continue;

      const a = RawFlightDataService.nonEmpty(
        data.airline,
        data.Airline,
      ).toLowerCase();
      const f = RawFlightDataService.normalizeFlightNoForFind(
        RawFlightDataService.nonEmpty(
          data.flightNo,
          data['Flight No'],
          data.FlightNo,
        ),
      );
      if (a !== airlineNorm || f !== flightNorm) continue;

      const existingRouting = normalizeRoutingForMatch(
        RawFlightDataService.nonEmpty(data.routing, data.route, data.Routing),
      );
      if (existingRouting !== routingNorm) continue;

      const docIdentityKey = String(
        (d as { identityKey?: string }).identityKey ??
          data.identityKey ??
          '',
      ).toLowerCase();
      const storedSeasonKey = RawFlightDataService.nonEmpty(
        data.seasonKey,
        (d as { seasonKey?: string }).seasonKey,
      ).toLowerCase();

      const existingFrom = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(
          data.validFrom,
          data['Valid From'],
          data.staDate,
          data['STA Date'],
        ),
      );
      const detectedFromValidFrom = tryDetectScheduleSeason(existingFrom);
      const targetSeasonKey = seasonKey.toLowerCase();

      let sameSeason = false;
      if (docIdentityKey && docIdentityKey === identityKey.toLowerCase()) {
        sameSeason = true;
      } else if (detectedFromValidFrom) {
        sameSeason = detectedFromValidFrom.seasonKey === targetSeasonKey;
      } else if (storedSeasonKey) {
        sameSeason = storedSeasonKey === targetSeasonKey;
      }
      if (!sameSeason) continue;

      const serial = String(d.serialNo ?? '').trim();
      if (!serial) continue;
      matches.push({
        serialNo: serial,
        data,
        _id: d._id as Types.ObjectId,
        updatedAt: (d as { updatedAt?: Date }).updatedAt
          ? new Date((d as { updatedAt?: Date }).updatedAt!).getTime()
          : 0,
      });
    }

    if (matches.length === 0) {
      if (!byKey) return null;
      const data =
        byKey.data &&
        typeof byKey.data === 'object' &&
        !Array.isArray(byKey.data)
          ? (byKey.data as Record<string, unknown>)
          : {};
      return {
        serialNo: String(byKey.serialNo ?? '').trim(),
        data,
        _id: byKey._id as Types.ObjectId,
        duplicateSerials: [],
      };
    }

    matches.sort((a, b) => b.updatedAt - a.updatedAt);
    const primary = matches[0];

    // Fold validity + days from every same-season duplicate into primary payload.
    let foldedFrom = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(
        primary.data.validFrom,
        primary.data['Valid From'],
      ),
    );
    let foldedTo = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(
        primary.data.validTo,
        primary.data['Valid To'],
      ),
    );
    let foldedDays = primary.data.scheduleDays;
    for (let i = 1; i < matches.length; i++) {
      const other = matches[i];
      const otherFrom = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(
          other.data.validFrom,
          other.data['Valid From'],
        ),
      );
      const otherTo = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(
          other.data.validTo,
          other.data['Valid To'],
        ),
      );
      const merged = mergeScheduleValidityRange(
        foldedFrom,
        foldedTo,
        otherFrom,
        otherTo,
      );
      foldedFrom = merged.validFrom;
      foldedTo = merged.validTo;
      foldedDays = unionScheduleDays(foldedDays, other.data.scheduleDays);
    }

    return {
      serialNo: primary.serialNo,
      data: {
        ...primary.data,
        validFrom: foldedFrom,
        'Valid From': foldedFrom,
        validTo: foldedTo,
        'Valid To': foldedTo,
        scheduleDays: foldedDays,
      },
      _id: primary._id,
      duplicateSerials: matches.slice(1).map((m) => m.serialNo),
    };
  }

  private pickKeeperAdvanceSerial(serials: string[]): string {
    const unique = [
      ...new Set(serials.map((s) => String(s ?? '').trim()).filter(Boolean)),
    ];
    const sixDigit = unique.filter((s) => /^\d{6}$/.test(s));
    if (sixDigit.length > 0) {
      sixDigit.sort((a, b) => Number(a) - Number(b));
      return sixDigit[0];
    }
    return unique[0] ?? '';
  }

  private isMongoDuplicateKeyError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: number; message?: string };
    return (
      e.code === 11000 ||
      String(e.message ?? '').includes('E11000') ||
      String(e.message ?? '').includes('duplicate key')
    );
  }

  private async getNextAdvanceScheduleSerial(): Promise<string> {
    const docs = await this.advanceScheduleModel
      .find({}, { serialNo: 1 })
      .lean();
    let max = RawFlightDataService.GLOBAL_SERIAL_BASE;
    for (const d of docs) {
      const s = String(d?.serialNo ?? '').trim();
      if (!/^\d{6}$/.test(s)) continue;
      const n = Number(s);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    const next = max + 1;
    if (next > 999999) {
      throw new BadRequestException('Serial number limit reached (999999).');
    }
    return String(next).padStart(6, '0');
  }

  /**
   * Persist Advance → Schedule Setup with season-aware upsert:
   * one master per airline + flight + routing + season.
   * Same-season saves (including seeded explicit serials) merge Valid From/To.
   */
  async saveAdvanceScheduleSetup(
    payload: Record<string, unknown>,
    station: StationScopeContext,
  ) {
    const explicitSerial = RawFlightDataService.nonEmpty(
      payload.serialNo ??
        payload.SlNo ??
        payload['Serial No'] ??
        payload.SerialNo ??
        payload.slNo,
    );

    const match = this.extractAdvanceScheduleMatchParts(payload);
    this.validateAdvanceScheduleDates(match.validFrom, match.validTo);

    if (!match.airline || !match.flightNo) {
      throw new BadRequestException('Airline and Flight No are required.');
    }

    const flightNoDisplay = normalizeScheduleFlightNoForStorage(
      RawFlightDataService.nonEmpty(
        payload.flightNo,
        payload['Flight No'],
        payload.FlightNo,
      ),
    );
    if (!isValidScheduleFlightNo(flightNoDisplay)) {
      throw new BadRequestException(
        'Flight No must be letters/numbers with optional / (max 15, no spaces). Example: 6E205 or AI101/AI102.',
      );
    }

    const routingDisplay = normalizeScheduleRoutingForStorage(
      RawFlightDataService.nonEmpty(
        payload.routing,
        payload.route,
        payload.Routing,
      ),
    );
    if (!isValidScheduleRouting(routingDisplay)) {
      throw new BadRequestException(
        'Routing must be 2 or 3 airport codes like DEL-IXC or DEL-IXC-DEL.',
      );
    }

    const arrivalDisplay = normalizeScheduleFlightNoForStorage(
      RawFlightDataService.nonEmpty(
        payload.arrivalFlightNo,
        payload['Arrival Flight No'],
        payload.ArrivalFltNo,
      ),
    );
    const departureDisplay = normalizeScheduleFlightNoForStorage(
      RawFlightDataService.nonEmpty(
        payload.departureFlightNo,
        payload['Departure Flight No'],
        payload.DepartureFltNo,
      ),
    );
    const operationSplit =
      payload.ifOperationSplit === true ||
      String(payload['Operation Split'] ?? '')
        .trim()
        .toLowerCase() === 'yes';
    if (operationSplit) {
      if (!isValidScheduleFlightNo(arrivalDisplay)) {
        throw new BadRequestException(
          'Arrival Flight No must be letters/numbers with optional / (max 15, no spaces).',
        );
      }
      if (!isValidScheduleFlightNo(departureDisplay)) {
        throw new BadRequestException(
          'Departure Flight No must be letters/numbers with optional / (max 15, no spaces).',
        );
      }
    }

    let seasonInfo: ScheduleSeasonInfo;
    try {
      seasonInfo = detectScheduleSeason(match.validFrom);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Invalid Valid From date.',
      );
    }

    const identityKey = buildScheduleIdentityKey({
      seasonKey: seasonInfo.seasonKey,
      airline: match.airline,
      flightNo: match.flightNo,
      routing: match.routing,
    });

    const maxAttempts = 3;
    let scheduleAction: ScheduleSaveAction = 'created';
    let serial = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const existing = await this.findAdvanceScheduleForSeason(
        station,
        identityKey,
        seasonInfo.seasonKey,
        match.airline,
        match.flightNo,
        match.routing,
      );

      const siblingSerials = existing
        ? [
            existing.serialNo,
            ...existing.duplicateSerials,
            ...(explicitSerial && /^\d{6}$/.test(explicitSerial)
              ? [explicitSerial]
              : []),
          ]
        : explicitSerial && /^\d{6}$/.test(explicitSerial)
          ? [explicitSerial]
          : [];

      if (existing || (explicitSerial && /^\d{6}$/.test(explicitSerial))) {
        const keeper =
          this.pickKeeperAdvanceSerial(siblingSerials) ||
          (explicitSerial && /^\d{6}$/.test(explicitSerial)
            ? explicitSerial
            : '') ||
          (await this.getNextAdvanceScheduleSerial());

        serial = keeper;
        scheduleAction = existing ? 'updated' : 'created';

        const existingFrom = existing
          ? RawFlightDataService.normalizeDateDdMmYyyy(
              RawFlightDataService.nonEmpty(
                existing.data.validFrom,
                existing.data['Valid From'],
              ),
            )
          : '';
        const existingTo = existing
          ? RawFlightDataService.normalizeDateDdMmYyyy(
              RawFlightDataService.nonEmpty(
                existing.data.validTo,
                existing.data['Valid To'],
              ),
            )
          : '';
        const mergedRange = existing
          ? mergeScheduleValidityRange(
              existingFrom,
              existingTo,
              match.validFrom,
              match.validTo,
            )
          : { validFrom: match.validFrom, validTo: match.validTo };

        const cleanData = this.normalizeAdvanceSchedulePayload(
          {
            ...payload,
            validFrom: mergedRange.validFrom,
            'Valid From': mergedRange.validFrom,
            validTo: mergedRange.validTo,
            'Valid To': mergedRange.validTo,
            scheduleDays: unionScheduleDays(
              existing?.data.scheduleDays,
              payload.scheduleDays,
            ),
          },
          serial,
        );
        this.attachSeasonToAdvancePayload(cleanData, seasonInfo, identityKey);
        cleanData.dailySyncSource = ADVANCE_DAILY_SYNC_SOURCE;

        const toDelete = [
          ...new Set(
            siblingSerials.filter((s) => s && s !== serial && /^\d{6}$/.test(s)),
          ),
        ];
        // Clear siblings first so unique (stationCode, identityKey) can attach to keeper.
        if (toDelete.length > 0) {
          await this.advanceScheduleModel.deleteMany(
            StationScope.filter({ serialNo: { $in: toDelete } }, station),
          );
        }

        const updateFilter = existing?._id
          ? StationScope.filter({ _id: existing._id }, station)
          : StationScope.filter({ identityKey }, station);

        try {
          await this.advanceScheduleModel.findOneAndUpdate(
            updateFilter,
            {
              $set: {
                serialNo: serial,
                data: cleanData,
                identityKey,
                seasonKey: seasonInfo.seasonKey,
              },
              $setOnInsert: { stationCode: this.stampStationCode(station) },
            },
            { upsert: true, new: true },
          );
        } catch (err) {
          if (this.isMongoDuplicateKeyError(err) && attempt < maxAttempts - 1) {
            continue;
          }
          if (this.isMongoDuplicateKeyError(err)) {
            throw new BadRequestException(
              `A ${seasonInfo.season} schedule for this flight already exists. ` +
                'Save again without a serial number to merge into that season schedule.',
            );
          }
          throw err;
        }
        break;
      }

      serial = await this.getNextAdvanceScheduleSerial();
      scheduleAction = 'created';
      const cleanData = this.normalizeAdvanceSchedulePayload(payload, serial);
      this.attachSeasonToAdvancePayload(cleanData, seasonInfo, identityKey);
      cleanData.dailySyncSource = ADVANCE_DAILY_SYNC_SOURCE;

      try {
        await this.advanceScheduleModel.create({
          serialNo: serial,
          data: cleanData,
          identityKey,
          seasonKey: seasonInfo.seasonKey,
          stationCode: this.stampStationCode(station),
        });
        break;
      } catch (err) {
        if (this.isMongoDuplicateKeyError(err) && attempt < maxAttempts - 1) {
          continue;
        }
        throw err;
      }
    }

    if (!serial) {
      throw new BadRequestException('Failed to allocate schedule serial.');
    }

    const merged = await this.mergeStagingIntoRawFlightData(serial, station);
    const message = scheduleSaveSuccessMessage(
      seasonInfo.season,
      scheduleAction,
    );

    return {
      ...merged,
      season: seasonInfo.season as ScheduleSeason,
      seasonKey: seasonInfo.seasonKey,
      scheduleAction,
      message,
    };
  }

  /**
   * One-shot cleanup: merge every same-season duplicate in advance_schedule_setup
   * (e.g. Apr/May/Jun monthly seeds → one Summer validity window per flight).
   */
  async consolidateAdvanceSchedulesBySeason(
    station: StationScopeContext,
  ): Promise<{
    success: true;
    groupsProcessed: number;
    mastersKept: number;
    mastersRemoved: number;
    merged: Array<{
      identityKey: string;
      season: string;
      seasonKey: string;
      airline: string;
      flightNo: string;
      keptSerial: string;
      removedSerials: string[];
      validFrom: string;
      validTo: string;
    }>;
  }> {
    const docs = await this.advanceScheduleModel
      .find(StationScope.filter({}, station))
      .sort({ updatedAt: -1 })
      .lean();

    type GroupMember = {
      serialNo: string;
      _id: Types.ObjectId;
      data: Record<string, unknown>;
    };
    const groups = new Map<string, GroupMember[]>();

    for (const d of docs) {
      const data =
        d?.data && typeof d.data === 'object' && !Array.isArray(d.data)
          ? (d.data as Record<string, unknown>)
          : undefined;
      if (!data) continue;

      const airline = RawFlightDataService.nonEmpty(data.airline, data.Airline);
      const flightNo = RawFlightDataService.nonEmpty(
        data.flightNo,
        data['Flight No'],
        data.FlightNo,
      );
      if (!airline || !flightNo) continue;

      const routing = RawFlightDataService.nonEmpty(
        data.routing,
        data.route,
        data.Routing,
      );
      const validFrom = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(
          data.validFrom,
          data['Valid From'],
          data.staDate,
          data['STA Date'],
        ),
      );
      const seasonInfo = tryDetectScheduleSeason(validFrom);
      if (!seasonInfo) continue;

      const identityKey = buildScheduleIdentityKey({
        seasonKey: seasonInfo.seasonKey,
        airline,
        flightNo,
        routing,
      });

      const list = groups.get(identityKey) ?? [];
      list.push({
        serialNo: String(d.serialNo ?? '').trim(),
        _id: d._id as Types.ObjectId,
        data,
      });
      groups.set(identityKey, list);
    }

    const mergedReport: Array<{
      identityKey: string;
      season: string;
      seasonKey: string;
      airline: string;
      flightNo: string;
      keptSerial: string;
      removedSerials: string[];
      validFrom: string;
      validTo: string;
    }> = [];
    let mastersRemoved = 0;
    let mastersKept = 0;

    for (const [identityKey, members] of groups) {
      if (members.length === 0) continue;

      const keptSerial =
        this.pickKeeperAdvanceSerial(members.map((m) => m.serialNo)) ||
        members[0].serialNo;
      const keeper =
        members.find((m) => m.serialNo === keptSerial) ?? members[0];

      let foldedFrom = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(
          keeper.data.validFrom,
          keeper.data['Valid From'],
        ),
      );
      let foldedTo = RawFlightDataService.normalizeDateDdMmYyyy(
        RawFlightDataService.nonEmpty(
          keeper.data.validTo,
          keeper.data['Valid To'],
        ),
      );
      let foldedDays: unknown = keeper.data.scheduleDays;

      for (const member of members) {
        if (member.serialNo === keeper.serialNo) continue;
        const otherFrom = RawFlightDataService.normalizeDateDdMmYyyy(
          RawFlightDataService.nonEmpty(
            member.data.validFrom,
            member.data['Valid From'],
          ),
        );
        const otherTo = RawFlightDataService.normalizeDateDdMmYyyy(
          RawFlightDataService.nonEmpty(
            member.data.validTo,
            member.data['Valid To'],
          ),
        );
        const range = mergeScheduleValidityRange(
          foldedFrom,
          foldedTo,
          otherFrom,
          otherTo,
        );
        foldedFrom = range.validFrom;
        foldedTo = range.validTo;
        foldedDays = unionScheduleDays(foldedDays, member.data.scheduleDays);
      }

      const seasonInfo = detectScheduleSeason(foldedFrom);
      const airline = RawFlightDataService.nonEmpty(
        keeper.data.airline,
        keeper.data.Airline,
      );
      const flightNo = RawFlightDataService.nonEmpty(
        keeper.data.flightNo,
        keeper.data['Flight No'],
        keeper.data.FlightNo,
      );

      const cleanData = this.normalizeAdvanceSchedulePayload(
        {
          ...keeper.data,
          validFrom: foldedFrom,
          'Valid From': foldedFrom,
          validTo: foldedTo,
          'Valid To': foldedTo,
          scheduleDays: foldedDays,
        },
        keptSerial,
      );
      this.attachSeasonToAdvancePayload(cleanData, seasonInfo, identityKey);
      cleanData.dailySyncSource = ADVANCE_DAILY_SYNC_SOURCE;

      const removedSerials = members
        .map((m) => m.serialNo)
        .filter((s) => s && s !== keptSerial);

      if (removedSerials.length > 0) {
        await this.advanceScheduleModel.updateMany(
          StationScope.filter({ serialNo: { $in: removedSerials } }, station),
          { $unset: { identityKey: 1 } },
        );
        await this.advanceScheduleModel.deleteMany(
          StationScope.filter({ serialNo: { $in: removedSerials } }, station),
        );
        mastersRemoved += removedSerials.length;
      }

      await this.advanceScheduleModel.findOneAndUpdate(
        StationScope.filter(
          keeper._id ? { _id: keeper._id } : { serialNo: keptSerial },
          station,
        ),
        {
          $set: {
            serialNo: keptSerial,
            data: cleanData,
            identityKey,
            seasonKey: seasonInfo.seasonKey,
          },
        },
        { upsert: true, new: true },
      );

      await this.mergeStagingIntoRawFlightData(keptSerial, station);
      mastersKept += 1;

      if (members.length > 1) {
        mergedReport.push({
          identityKey,
          season: seasonInfo.season,
          seasonKey: seasonInfo.seasonKey,
          airline,
          flightNo,
          keptSerial,
          removedSerials,
          validFrom: foldedFrom,
          validTo: foldedTo,
        });
      }
    }

    return {
      success: true,
      groupsProcessed: groups.size,
      mastersKept,
      mastersRemoved,
      merged: mergedReport,
    };
  }

  /**
   * Advance → Cargo flight save: writes `raw_flight_data` + indexes FHR for Scheduled Airlines
   * (same listing path as schedule setup, without using `advance_schedule_setup`).
   */
  async persistAdvanceCargoFlight(
    serialNo: string,
    payload: Record<string, unknown>,
    station: StationScopeContext,
  ): Promise<{
    success: boolean;
    serialNo: string;
    fhrStaDatesCount: number;
  }> {
    let serial = RawFlightDataService.nonEmpty(serialNo);
    if (!serial || !/^\d{6}$/.test(serial)) {
      throw new BadRequestException(
        'serialNo must be a 6-digit cargo flight serial',
      );
    }
    const cleanData = this.normalizeAdvanceSchedulePayload(
      { ...payload, scheduleSource: 'advance_cargo' },
      serial,
    );
    const merged: Record<string, unknown> = { ...cleanData };
    const numSerial = Number(serial);
    merged.SerialNo = Number.isNaN(numSerial) ? Date.now() : numSerial;
    merged.SlNo = serial;
    merged['Serial No'] = serial;
    merged.serialNo = serial;
    merged.scheduleSource = 'advance_cargo';

    const or = this.serialMatchFilter(serial);
    const existing = await this.rawFlightDataModel
      .findOne(StationScope.filter({ $or: or }, station))
      .lean();
    if (existing?._id) {
      await this.rawFlightDataModel.updateOne(
        { _id: existing._id },
        { $set: { data: merged } },
      );
    } else {
      await this.rawFlightDataModel.create({
        data: merged,
        stationCode: this.stampStationCode(station),
      });
    }

    let fhrStaDatesCount = 0;
    await this.fhrCollectionService
      .upsertAdvanceScheduleMasterToFhr(serial, merged, station)
      .then((count) => {
        fhrStaDatesCount = count;
        this.bustScheduledListCaches(station, {
          reason: 'advance_cargo_upsert',
        });
      })
      .catch((err: unknown) => {
        this.logger.error(
          '[RawFlightData] fhr_collection advance cargo upsert failed',
          err instanceof Error ? err.stack : String(err),
        );
      });

    void this.fhrCollectionService
      .onScheduledAirlinesStagingMerge(serial, merged, station)
      .catch((err: unknown) => {
        this.logger.error(
          '[RawFlightData] fhr_collection snapshot (cargo merge) failed',
          err instanceof Error ? err.stack : String(err),
        );
      });

    return { success: true, serialNo: serial, fhrStaDatesCount };
  }

  /**
   * Persist Creation → Scheduled Airlines form, then merge into `raw_flight_data`.
   * If `serialNo` is not provided (e.g. Additional Flights), a new 6-digit
   * serial is allocated from the schedule serial sequence.
   */
  async saveScheduledAirlinesCreation(
    body: Record<string, unknown>,
    station: StationScopeContext,
  ) {
    RawFlightDataService.validateCreationStaStdTiming(body);
    let serial = RawFlightDataService.nonEmpty(body.serialNo);
    if (!serial) {
      serial = await this.getNextAdvanceScheduleSerial();
    }
    if (!/^\d{6}$/.test(serial)) {
      serial = await this.getNextAdvanceScheduleSerial();
    }
    const { serialNo: _sn, ...rest } = body;
    await this.scheduledCreationModel.findOneAndUpdate(
      { serialNo: serial },
      {
        $set: { serialNo: serial, data: { ...rest } },
        $setOnInsert: { stationCode: this.stampStationCode(station) },
      },
      { upsert: true, new: true },
    );
    return this.mergeStagingIntoRawFlightData(serial, station);
  }

  /** Map lean `fhr_collection` embeds into Creation → Scheduled Airlines form keys. */
  private fhrLeanToCreationSchedule(
    fhr: Record<string, unknown>,
  ): Record<string, unknown> {
    const m =
      fhr.mainDetails != null &&
      typeof fhr.mainDetails === 'object' &&
      !Array.isArray(fhr.mainDetails)
        ? (fhr.mainDetails as Record<string, unknown>)
        : {};
    const t =
      fhr.terminalDetails != null &&
      typeof fhr.terminalDetails === 'object' &&
      !Array.isArray(fhr.terminalDetails)
        ? (fhr.terminalDetails as Record<string, unknown>)
        : {};
    const airline = RawFlightDataService.nonEmpty(
      t.airlinesOperator,
      m.Airline,
      m.airline,
      m.airlineName,
    );
    const flightNo = RawFlightDataService.nonEmpty(
      t.FlightNo,
      m.FlightNo,
      m.flightCode,
      m.ArrivalFltNo,
      m.DepartureFltNo,
    );
    const acType = RawFlightDataService.nonEmpty(
      m.TypeCraft,
      m.aircraftType,
      m.Aircraft,
    );
    return {
      ...(airline ? { airlines: airline, Airline: airline, airline } : {}),
      ...(flightNo ? { flightNo, 'Flight No': flightNo } : {}),
      ...(acType ? { acType, Aircraft: acType, aircraft: acType } : {}),
      staDate: RawFlightDataService.nonEmpty(
        m.STADate,
        m.staDate,
        fhr.staDate,
        fhr['STA Date'],
      ),
      stdDate: RawFlightDataService.nonEmpty(
        m.STDDate,
        m.stdDate,
        fhr.stdDate,
        fhr['STD Date'],
      ),
      staTime: RawFlightDataService.nonEmpty(
        m.STATime,
        m.staTime,
        t.STATime,
        fhr.staTime,
        fhr['STA Time'],
      ),
      stdTime: RawFlightDataService.nonEmpty(
        m.STDTime,
        m.stdTime,
        t.STDTime,
        fhr.stdTime,
        fhr['STD Time'],
      ),
      routing: RawFlightDataService.nonEmpty(
        m.Route,
        m.routing,
        t.routing,
        fhr.route,
        fhr.Routing,
      ),
      opsType: RawFlightDataService.nonEmpty(
        m.TypeofHandling,
        m.typeOfHandling,
        fhr.typeOfHandling,
        fhr['Type of Handling'],
      ),
      categoryOfFlight: RawFlightDataService.nonEmpty(
        m.Cate_of_Flight,
        m.cate_of_flight,
        fhr.Cate_of_Flight,
        fhr.category_of_flight,
        fhr.categoryOfFlight,
      ),
      airlineCode: RawFlightDataService.nonEmpty(
        m['Airline Code'],
        m.airlineCode,
        t.airlineCode,
      ),
      skdNonSkd: RawFlightDataService.nonEmpty(fhr.skdNonSkd, m.skdNonSkd),
      aBody: RawFlightDataService.nonEmpty(
        m['Aircraft Body'],
        m.aircraftBody,
        fhr['Aircraft Body'],
      ),
    };
  }

  /** Merge advance + creation staging payloads for Creation form (creation wins). */
  private mergeStagingDocsForCreationForm(
    advData: Record<string, unknown> | null | undefined,
    creData: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    const a = advData ?? {};
    const c = creData ?? {};
    const pick = (...vals: unknown[]) => RawFlightDataService.nonEmpty(...vals);
    return {
      ...a,
      ...c,
      airlines: pick(c.airlines, c.airline, a.airline, a.Airline),
      Airline: pick(c.airlines, c.airline, a.airline, a.Airline),
      airline: pick(c.airlines, c.airline, a.airline, a.Airline),
      flightNo: pick(c.flightNo, c['Flight No'], a.flightNo, a['Flight No']),
      'Flight No': pick(c.flightNo, c['Flight No'], a.flightNo, a['Flight No']),
      acType: pick(c.acType, a.Aircraft, a.aircraft, a.TypeCraft),
      Aircraft: pick(c.acType, a.Aircraft, a.aircraft, a.TypeCraft),
      staDate: pick(
        c.staDate,
        c['STA Date'],
        c.date,
        a.staDate,
        a['STA Date'],
        a['Valid From'],
      ),
      stdDate: pick(
        c.stdDate,
        c['STD Date'],
        c.date2,
        c.date,
        a.stdDate,
        a['STD Date'],
        a['Valid To'],
      ),
      staTime: pick(c.staTime, c['STA Time'], a.staTime, a['STA Time']),
      stdTime: pick(c.stdTime, c['STD Time'], a.stdTime, a['STD Time']),
      routing: pick(c.routing, c.Routing, a.routing, a.Routing, a.route),
      opsType: pick(
        c.opsType,
        c['Type of Handling'],
        a['Type of Handling'],
        a.typeOfHandling,
      ),
      categoryOfFlight: pick(
        c.categoryOfFlight,
        c['Flight Type'],
        a['Flight Type'],
        a.flightType,
        a.flight,
      ),
      airlineCode: pick(c.airlineCode, c['Airline Code'], a['Airline Code']),
      skdNonSkd: pick(c.skdNonSkd, a.skdNonSkd),
      aBody: pick(c.aBody, c['Aircraft Body'], a['Aircraft Body']),
      date: pick(c.date, c.stdDate, c.staDate, a.date),
      date2: pick(c.date2, c.stdDate, a.date2),
      flightStatus: pick(c.flightStatus, a.flightStatus),
      flightCancelled: c.flightCancelled ?? a.flightCancelled,
      isCancelled: c.isCancelled ?? a.isCancelled,
    };
  }

  private overlayNonEmptyScheduleFields(
    target: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): void {
    for (const [key, val] of Object.entries(patch)) {
      const s = val != null ? String(val).trim() : '';
      if (s && s !== '0') target[key] = val;
    }
  }

  private async deriveFlightStatusForCreationEdit(
    operationalSerialNum: number | null,
    stagingData: Record<string, unknown> | null,
  ): Promise<FlightStatus> {
    if (stagingData) {
      if (
        stagingData.flightCancelled === true ||
        stagingData.isCancelled === true
      ) {
        return 'Cancelled';
      }
      if (RawFlightDataService.isScheduleFlightNoMarkedCancelled(stagingData)) {
        return 'Cancelled';
      }
      const staged = this.normalizeFlightStatus(
        stagingData.flightStatus,
        'Open',
      );
      if (staged === 'Cancelled') return 'Cancelled';
      if (staged === 'Closed') return 'Closed';
    }

    if (
      operationalSerialNum == null ||
      !Number.isFinite(operationalSerialNum)
    ) {
      return stagingData
        ? this.normalizeFlightStatus(stagingData.flightStatus, 'Open')
        : 'Open';
    }

    const [fhr, md, td, r1, lc] = await Promise.all([
      this.fhrCollectionService.getLeanFhrBySerial(operationalSerialNum),
      this.mainDetailsModel
        .findOne({ SerialNo: operationalSerialNum })
        .select({ flightCancelled: 1, departureStatus: 1, _id: 1 })
        .lean(),
      this.terminalDetailsModel
        .findOne({ serialNo: operationalSerialNum })
        .select({ _id: 1 })
        .lean(),
      this.rampDetails1Model
        .findOne({ serialNo: operationalSerialNum })
        .select({ _id: 1 })
        .lean(),
      this.loadControlDetailsModel
        .findOne({ serialNo: operationalSerialNum })
        .select({ _id: 1 })
        .lean(),
    ]);

    if (md && RawFlightDataService.isMainDetailsCancelled(md)) {
      return 'Cancelled';
    }

    const fhrMain =
      fhr?.mainDetails != null &&
      typeof fhr.mainDetails === 'object' &&
      !Array.isArray(fhr.mainDetails)
        ? (fhr.mainDetails as Record<string, unknown>)
        : null;
    if (fhrMain?.flightCancelled === true) return 'Cancelled';

    const fhrFn = RawFlightDataService.nonEmpty(
      fhrMain?.FlightNo,
      fhrMain?.flightCode,
      stagingData?.flightNo,
      stagingData?.['Flight No'],
    );
    if (String(fhrFn).trim().toUpperCase().startsWith('CANC')) {
      return 'Cancelled';
    }

    const hasMain =
      !!md || (fhr?.mainDetails != null && typeof fhr.mainDetails === 'object');
    const hasT =
      !!td ||
      (fhr?.terminalDetails != null && typeof fhr.terminalDetails === 'object');
    const hasR =
      !!r1 ||
      (fhr?.rampDetails1 != null && typeof fhr.rampDetails1 === 'object');
    const hasL =
      !!lc ||
      (fhr?.loadControlDetails != null &&
        typeof fhr.loadControlDetails === 'object');
    const eqE = fhr?.equipmentManpower;
    const hasG =
      eqE != null &&
      typeof eqE === 'object' &&
      !Array.isArray(eqE) &&
      (() => {
        const entries = Array.isArray((eqE as { entries?: unknown[] }).entries)
          ? (eqE as { entries: unknown[] }).entries
          : [];
        if (entries.length > 0) return true;
        return !!RawFlightDataService.nonEmpty(
          (eqE as { verifiedBy?: string }).verifiedBy,
          (eqE as { verifiedAt?: string }).verifiedAt,
        );
      })();

    return RawFlightDataService.flightStatusFromFormAndLockPresence({
      hasMain,
      hasTerminal: hasT,
      hasRamp: hasR,
      hasLoadControl: hasL,
      hasGsd: hasG,
    });
  }

  /**
   * Indexed lookup for Creation → Scheduled Airlines Find Record by serial.
   * Covers generated instance serials, schedule masters, creation staging, and `fhr_collection`.
   */
  async findEditableFlightBySerial(
    serialNo: string,
    station: StationScopeContext,
  ): Promise<{
    serialNo: string;
    searchedSerial: string;
    operationalSerial: string;
    scheduleMasterSerial: string;
    operationDate?: string;
    flightStatus: FlightStatus;
    editable: boolean;
    schedule: Record<string, unknown>;
    scheduleSource: string;
    lastModified?: string;
    modifiedBy?: string;
  } | null> {
    const searched = RawFlightDataService.normalizeInstanceSerial(serialNo);
    if (!searched) {
      throw new BadRequestException('serialNo is required');
    }

    const opSerialNum = Number(searched);
    const hasOpSerial = Number.isFinite(opSerialNum);

    const [instanceRow, advDoc, creDoc, fhrLean, rawDoc] = await Promise.all([
      this.flightInstanceIndexModel
        .findOne({ serialNo: searched })
        .select({ operationDate: 1, scheduleId: 1, serialNo: 1 })
        .lean(),
      this.advanceScheduleModel.findOne({ serialNo: searched }).lean(),
      this.scheduledCreationModel
        .findOne(
          StationScope.filter(
            {
              $or: [
                { serialNo: searched },
                { instanceSerial: searched },
              ],
            },
            station,
          ),
        )
        .sort({ updatedAt: -1 })
        .lean(),
      hasOpSerial
        ? this.fhrCollectionService.getLeanFhrBySerial(opSerialNum, station)
        : Promise.resolve(null),
      this.rawFlightDataModel
        .findOne(
          StationScope.filter(
            { $or: this.serialMatchFilter(searched) },
            station,
          ),
        )
        .select({ data: 1 })
        .lean(),
    ]);

    const scheduleCandidates = Array.from(
      new Set(
        [
          searched,
          String(instanceRow?.scheduleId ?? '').trim(),
          String(advDoc?.serialNo ?? '').trim(),
          String(creDoc?.serialNo ?? '').trim(),
        ].filter(Boolean),
      ),
    );

    let adv = advDoc;
    let cre = creDoc;
    if (!adv && scheduleCandidates.length > 1) {
      adv = await this.advanceScheduleModel
        .findOne({ serialNo: { $in: scheduleCandidates } })
        .lean();
    }
    if (!cre && scheduleCandidates.length > 1) {
      cre = await this.scheduledCreationModel
        .findOne({ serialNo: { $in: scheduleCandidates } })
        .sort({ updatedAt: -1 })
        .lean();
    }

    const advData =
      adv?.data && typeof adv.data === 'object' && !Array.isArray(adv.data)
        ? (adv.data as Record<string, unknown>)
        : null;
    const creData =
      cre?.data && typeof cre.data === 'object' && !Array.isArray(cre.data)
        ? (cre.data as Record<string, unknown>)
        : null;
    const rawData =
      rawDoc?.data &&
      typeof rawDoc.data === 'object' &&
      !Array.isArray(rawDoc.data)
        ? (rawDoc.data as Record<string, unknown>)
        : null;

    if (!instanceRow && !advData && !creData && !fhrLean && !rawData) {
      return null;
    }

    const schedule = this.mergeStagingDocsForCreationForm(advData, creData);
    if (rawData) {
      this.overlayNonEmptyScheduleFields(schedule, rawData);
    }
    if (fhrLean) {
      this.overlayNonEmptyScheduleFields(
        schedule,
        this.fhrLeanToCreationSchedule(fhrLean),
      );
    }

    const operationDate = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(
        (cre as { operationDate?: string } | null | undefined)?.operationDate,
        instanceRow?.operationDate,
        schedule.staDate,
        schedule['STA Date'],
      ),
    );
    if (operationDate) {
      schedule.staDate = operationDate;
      schedule['STA Date'] = operationDate;
      schedule.STADate = operationDate;
      schedule.date = operationDate;
      schedule.operationDate = operationDate;
    }

    this.finalizeCreationScheduleDates(schedule);

    const scheduleMasterSerial = RawFlightDataService.nonEmpty(
      (cre as { scheduleMasterSerial?: string } | null | undefined)
        ?.scheduleMasterSerial,
      adv?.serialNo,
      instanceRow?.scheduleId,
      fhrLean ? String(fhrLean.scheduleId ?? '').trim() : '',
      fhrLean ? String(fhrLean.scheduleMasterSerial ?? '').trim() : '',
      /^\d{6}$/.test(searched) ? searched : '',
    );
    const operationalSerial = RawFlightDataService.nonEmpty(
      (cre as { instanceSerial?: string } | null | undefined)?.instanceSerial,
      instanceRow?.serialNo,
      hasOpSerial && !/^\d{6}$/.test(searched) ? searched : '',
      scheduleMasterSerial,
    );

    const statusOpNum = Number(
      RawFlightDataService.nonEmpty(
        instanceRow?.serialNo,
        hasOpSerial ? searched : '',
      ),
    );
    const flightStatus = await this.deriveFlightStatusForCreationEdit(
      Number.isFinite(statusOpNum) ? statusOpNum : null,
      creData ?? advData,
    );

    const src: string[] = [];
    if (advData) src.push('advance_schedule_setup');
    if (creData) src.push('scheduled_airlines_creation');
    if (fhrLean) src.push('fhr_collection');
    if (instanceRow) src.push('flight_instance_index');
    if (rawData) src.push('raw_flight_data');

    const updatedAt =
      (cre as { updatedAt?: Date } | null | undefined)?.updatedAt ??
      (adv as { updatedAt?: Date } | null | undefined)?.updatedAt;

    return {
      // Daily override persist key = generated instance serial when available.
      serialNo: operationalSerial,
      searchedSerial: searched,
      operationalSerial,
      scheduleMasterSerial,
      operationDate: operationDate || undefined,
      flightStatus,
      editable: flightStatus === 'Open',
      schedule,
      scheduleSource: src.join('+') || 'unknown',
      lastModified: updatedAt ? new Date(updatedAt).toISOString() : undefined,
      modifiedBy:
        RawFlightDataService.nonEmpty(
          (cre as { modifiedBy?: string } | null | undefined)?.modifiedBy,
        ) || undefined,
    };
  }


  /** Normalize flight number for find matching (strip spaces/dashes/slashes, upper). */
  private static normalizeFlightNoForFind(raw: unknown): string {
    return RawFlightDataService.nonEmpty(raw)
      .toUpperCase()
      .replace(/[\s\-\/]/g, '');
  }

  /** Airline name/code loose match for Creation find. */
  private static airlineMatchesFind(
    queryAirline: string,
    queryCode: string,
    data: Record<string, unknown>,
  ): boolean {
    const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const qName = RawFlightDataService.nonEmpty(queryAirline);
    const qCode = RawFlightDataService.nonEmpty(queryCode).toUpperCase();
    const name = RawFlightDataService.nonEmpty(
      data.airline,
      data.Airline,
      data.airlines,
    );
    const code = RawFlightDataService.nonEmpty(
      data.airlineCode,
      data['Airline Code'],
    ).toUpperCase();
    if (qName && name) {
      const qn = compact(qName);
      const dn = compact(name);
      if (qn && dn && (qn === dn || dn.includes(qn) || qn.includes(dn))) {
        return true;
      }
    }
    if (qCode && code && code === qCode) return true;
    if (qName && code && compact(qName) === compact(code)) return true;
    return false;
  }

  /**
   * Creation → Schedule Airlines: find the **generated daily flight** for
   * airline + flight number + operating date (default: today).
   *
   * Resolves from Advance → Schedule Setup masters that operate on that date
   * (primary), then daily/FHR list (secondary). Never mutates the master.
   */
  async findDailyOperationalFlight(
    airline: string,
    flightNo: string,
    dateDdMmYyyy: string | undefined,
    options?: { openOnly?: boolean; airlineCode?: string },
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{
    serialNo: string;
    operationalSerial: string;
    scheduleMasterSerial: string;
    operationDate: string;
    flightStatus: FlightStatus;
    editable: boolean;
    schedule: Record<string, unknown>;
    scheduleSource: string;
    lastModified?: string;
    modifiedBy?: string;
    openFlights?: Array<{
      serialNo: string;
      operationalSerial: string;
      scheduleMasterSerial: string;
      schedule: Record<string, unknown>;
      flightStatus: FlightStatus;
    }>;
  } | null> {
    const al = RawFlightDataService.nonEmpty(airline);
    const fn = RawFlightDataService.normalizeFlightNoForFind(flightNo);
    const alCode = RawFlightDataService.nonEmpty(options?.airlineCode);
    if (!al || !fn) {
      throw new BadRequestException(
        'airline and flightNo query params are required',
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const opDate =
      RawFlightDataService.normalizeDateDdMmYyyy(dateDdMmYyyy ?? '') ||
      RawFlightDataService.normalizeDateDdMmYyyy(
        `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`,
      );
    if (!opDate) {
      throw new BadRequestException('Invalid flight date (expected dd/MM/yyyy)');
    }
    const opYmd = RawFlightDataService.scheduleLabelToYmd(opDate);
    if (!opYmd) {
      throw new BadRequestException('Invalid flight date (expected dd/MM/yyyy)');
    }

    const openOnly = options?.openOnly === true;
    type Mapped = {
      serialNo: string;
      operationalSerial: string;
      scheduleMasterSerial: string;
      schedule: Record<string, unknown>;
      flightStatus: FlightStatus;
      lastModified?: string;
      modifiedBy?: string;
      scheduleSource: string;
    };
    const mapped: Mapped[] = [];
    const seen = new Set<string>();

    const pushMapped = async (
      baseData: Record<string, unknown>,
      scheduleMasterSerial: string,
      operationalSerialHint: string,
      scheduleSource: string,
    ) => {
      const status = this.normalizeFlightStatus(
        baseData.flightStatus,
        'Open',
      ) as FlightStatus;
      if (openOnly && status !== 'Open') return;

      let operationalSerial = RawFlightDataService.nonEmpty(operationalSerialHint);
      if (!operationalSerial && scheduleMasterSerial) {
        const idx = await this.flightInstanceIndexModel
          .findOne({
            scheduleId: scheduleMasterSerial,
            operationDate: opDate,
          })
          .select({ serialNo: 1 })
          .lean();
        operationalSerial = RawFlightDataService.nonEmpty(idx?.serialNo);
      }
      if (!operationalSerial) {
        operationalSerial = scheduleMasterSerial;
      }

      const dedupeKey = `${operationalSerial}|${scheduleMasterSerial}|${opDate}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      let cre: {
        data?: unknown;
        updatedAt?: Date;
        modifiedBy?: string;
      } | null = null;
      if (operationalSerial) {
        cre = await this.scheduledCreationModel
          .findOne(
            StationScope.filter(
              {
                $or: [
                  { serialNo: operationalSerial },
                  { instanceSerial: operationalSerial },
                ],
              },
              station,
            ),
          )
          .lean();
      }
      if (!cre && scheduleMasterSerial) {
        cre = await this.scheduledCreationModel
          .findOne(
            StationScope.filter(
              {
                scheduleMasterSerial,
                operationDate: opDate,
              },
              station,
            ),
          )
          .lean();
      }

      const creData =
        cre?.data && typeof cre.data === 'object' && !Array.isArray(cre.data)
          ? (cre.data as Record<string, unknown>)
          : null;
      const schedule = this.mergeStagingDocsForCreationForm(baseData, creData);
      schedule.staDate = opDate;
      schedule['STA Date'] = opDate;
      schedule.STADate = opDate;
      schedule.date = opDate;
      schedule.operationDate = opDate;
      schedule.scheduleMasterSerial = scheduleMasterSerial;
      schedule.instanceSerial = operationalSerial;
      if (!RawFlightDataService.nonEmpty(schedule.airlines, schedule.airline)) {
        const airlineName = RawFlightDataService.nonEmpty(
          baseData.airline,
          baseData.Airline,
          baseData.airlines,
          al,
        );
        if (airlineName) {
          schedule.airlines = airlineName;
          schedule.airline = airlineName;
          schedule.Airline = airlineName;
        }
      }
      if (
        !RawFlightDataService.nonEmpty(schedule.flightNo, schedule['Flight No'])
      ) {
        const fno = RawFlightDataService.nonEmpty(
          baseData.flightNo,
          baseData['Flight No'],
          flightNo,
        );
        if (fno) {
          schedule.flightNo = fno;
          schedule['Flight No'] = fno;
        }
      }
      this.finalizeCreationScheduleDates(schedule);

      mapped.push({
        serialNo: operationalSerial,
        operationalSerial,
        scheduleMasterSerial,
        schedule,
        flightStatus: status,
        lastModified: cre?.updatedAt
          ? new Date(cre.updatedAt).toISOString()
          : undefined,
        modifiedBy: RawFlightDataService.nonEmpty(cre?.modifiedBy) || undefined,
        scheduleSource:
          RawFlightDataService.nonEmpty(
            baseData.scheduleSource,
            creData ? 'scheduled_airlines_creation' : '',
            scheduleSource,
          ) || 'advance_schedule_setup',
      });
    };

    // 1) Primary: Schedule Setup masters that operate on opDate
    const advanceDocs = await this.advanceScheduleModel
      .find(StationScope.filter({}, station))
      .sort({ updatedAt: -1 })
      .lean();

    let masterMatchedButNotToday = false;
    for (const doc of advanceDocs) {
      const masterSerial = String(doc?.serialNo ?? '').trim();
      const d =
        doc?.data && typeof doc.data === 'object' && !Array.isArray(doc.data)
          ? (doc.data as Record<string, unknown>)
          : {};
      if (!masterSerial) continue;

      const docFn = RawFlightDataService.normalizeFlightNoForFind(
        RawFlightDataService.nonEmpty(d.flightNo, d['Flight No'], d.FlightNo),
      );
      if (!docFn || docFn !== fn) continue;
      if (!RawFlightDataService.airlineMatchesFind(al, alCode, d)) continue;

      const validFrom = RawFlightDataService.nonEmpty(
        d.validFrom,
        d['Valid From'],
        d.staDate,
        d['STA Date'],
      );
      const validTo = RawFlightDataService.nonEmpty(
        d.validTo,
        d['Valid To'],
        d.stdDate,
        d['STD Date'],
        validFrom,
      );
      const operating = RawFlightDataService.enumerateAdvanceOperatingDates(
        validFrom,
        validTo,
        d.scheduleDays,
        opYmd,
        opYmd,
      );
      // If weekdays not configured but date sits inside validity window, still allow
      // daily override load (common Schedule Setup data gap).
      let operatesToday = operating.length > 0;
      if (!operatesToday && validFrom && validTo) {
        const fromY = RawFlightDataService.scheduleLabelToYmd(
          RawFlightDataService.normalizeDateDdMmYyyy(validFrom),
        );
        const toY = RawFlightDataService.scheduleLabelToYmd(
          RawFlightDataService.normalizeDateDdMmYyyy(validTo),
        );
        if (fromY && toY && opYmd >= fromY && opYmd <= toY) {
          const daysObj =
            d.scheduleDays &&
            typeof d.scheduleDays === 'object' &&
            !Array.isArray(d.scheduleDays)
              ? (d.scheduleDays as Record<string, unknown>)
              : {};
          const anyDaySet = Object.values(daysObj).some((v) =>
            RawFlightDataService.isTruthyFlag(v),
          );
          if (!anyDaySet) operatesToday = true;
        }
      }
      if (!operatesToday) {
        masterMatchedButNotToday = true;
        continue;
      }

      const composedFlightNo = RawFlightDataService.nonEmpty(
        displayFlightNoFromScheduleData(d),
      );
      const dayData: Record<string, unknown> = {
        ...d,
        scheduleMasterSerial: masterSerial,
        scheduleId: masterSerial,
        scheduleSource: 'advance_schedule_setup',
        airlines: RawFlightDataService.nonEmpty(d.airline, d.Airline, d.airlines),
        airline: RawFlightDataService.nonEmpty(d.airline, d.Airline, d.airlines),
        Airline: RawFlightDataService.nonEmpty(d.airline, d.Airline, d.airlines),
        flightNo: composedFlightNo,
        'Flight No': composedFlightNo,
        acType: RawFlightDataService.nonEmpty(d.aircraft, d.Aircraft, d.acType),
        Aircraft: RawFlightDataService.nonEmpty(d.aircraft, d.Aircraft, d.acType),
        staTime: RawFlightDataService.nonEmpty(d.staTime, d['STA Time']),
        stdTime: RawFlightDataService.nonEmpty(d.stdTime, d['STD Time']),
        routing: RawFlightDataService.nonEmpty(d.routing, d.Routing, d.route),
        opsType: RawFlightDataService.nonEmpty(
          d.typeOfHandling,
          d['Type of Handling'],
          d.opsType,
        ),
        categoryOfFlight: RawFlightDataService.nonEmpty(
          d.flightType,
          d['Flight Type'],
          d.categoryOfFlight,
        ),
        aBody: RawFlightDataService.nonEmpty(d.aircraftBody, d['Aircraft Body']),
        airlineCode: RawFlightDataService.nonEmpty(
          d.airlineCode,
          d['Airline Code'],
        ),
        staDate: opDate,
        stdDate: opDate,
        flightStatus: this.normalizeFlightStatus(d.flightStatus, 'Open'),
      };
      await pushMapped(dayData, masterSerial, '', 'advance_schedule_setup');
    }

    // 2) Secondary: daily/FHR list
    if (mapped.length === 0) {
      try {
        const dailyRows = await this.listDailyFromAdvance(
          opDate,
          opDate,
          true,
          station,
        );
        for (const row of dailyRows) {
          const data = row?.data ?? {};
          const rowFn = RawFlightDataService.normalizeFlightNoForFind(
            RawFlightDataService.nonEmpty(
              data.flightNo,
              data['Flight No'],
              data.FlightNo,
            ),
          );
          if (!rowFn || rowFn !== fn) continue;
          if (!RawFlightDataService.airlineMatchesFind(al, alCode, data)) {
            continue;
          }
          const scheduleMasterSerial = RawFlightDataService.nonEmpty(
            data.scheduleMasterSerial,
            data.scheduleId,
            data.legacySlNo,
          );
          const operationalSerial = RawFlightDataService.nonEmpty(
            data.SlNo,
            data.slNo,
            data.serialNo,
            data.SerialNo,
          );
          await pushMapped(
            data,
            scheduleMasterSerial || operationalSerial,
            operationalSerial,
            RawFlightDataService.nonEmpty(data.scheduleSource) ||
              'daily_from_advance',
          );
        }
      } catch (err) {
        this.logger.warn(
          `[findDailyOperationalFlight] daily list fallback failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (mapped.length === 0) {
      if (masterMatchedButNotToday) {
        throw new NotFoundException(
          `Flight ${RawFlightDataService.nonEmpty(flightNo)} for ${al} exists in Schedule Setup but does not operate on ${opDate}. Pick an operating day, or change STA Date and Find again.`,
        );
      }
      return null;
    }

    const primary = mapped[0];
    return {
      serialNo: primary.serialNo,
      operationalSerial: primary.operationalSerial,
      scheduleMasterSerial: primary.scheduleMasterSerial,
      operationDate: opDate,
      flightStatus: primary.flightStatus,
      editable: primary.flightStatus === 'Open',
      schedule: primary.schedule,
      scheduleSource: primary.scheduleSource,
      lastModified: primary.lastModified,
      modifiedBy: primary.modifiedBy,
      openFlights: mapped.map((m) => ({
        serialNo: m.serialNo,
        operationalSerial: m.operationalSerial,
        scheduleMasterSerial: m.scheduleMasterSerial,
        schedule: m.schedule,
        flightStatus: m.flightStatus,
      })),
    };
  }

  /**
   * Find Record for Creation → Schedule Airlines.
   * Always resolves the generated daily instance for the given (or today's) date.
   * Does not return the season master for editing.
   */
  async findLatestAdvanceByAirlineFlight(
    airline: string,
    flightNo: string,
    options?: { openOnly?: boolean; date?: string; airlineCode?: string },
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const daily = await this.findDailyOperationalFlight(
      airline,
      flightNo,
      options?.date,
      {
        openOnly: options?.openOnly === true,
        airlineCode: options?.airlineCode,
      },
      station,
    );
    if (!daily) return null;
    return {
      serialNo: daily.serialNo,
      schedule: daily.schedule,
      flightStatus: daily.flightStatus,
      operationalSerial: daily.operationalSerial,
      scheduleMasterSerial: daily.scheduleMasterSerial,
      operationDate: daily.operationDate,
      editable: daily.editable,
      scheduleSource: daily.scheduleSource,
      lastModified: daily.lastModified,
      modifiedBy: daily.modifiedBy,
      openFlights: daily.openFlights,
    };
  }

  private isAtaInstantInPast(ataDate: string, ataTime: string): boolean {
    if (!ataDate || !ataTime) return false;
    const datePart = RawFlightDataService.parseDdMmYyyy(ataDate);
    if (!datePart) return false;
    const hhmm = RawFlightDataService.normalizeTimeHhMm(ataTime);
    const tm = /^(\d{2}):(\d{2})$/.exec(hhmm);
    if (!tm) return false;
    const dt = new Date(datePart.getTime());
    dt.setHours(Number(tm[1]), Number(tm[2]), 0, 0);
    return dt.getTime() <= Date.now();
  }

  /**
   * Scheduled Airlines list: **only** `fhr_collection` documents, keyed by operational `serialNo`
   * (`SerialNo` / `flightSerialNumber`). Rows are filtered to STA (or STD) day within `from`–`to`.
   * Enrichment (locks, bags, type of handling) uses FHR embeds and batch `getLeanFhrBySerialsMap` only —
   * not the standalone `mainDetails` / other form collections.
   */
  async listDailyFromAdvance(
    from?: string,
    to?: string,
    skipCache = false,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    opts?: { forceLegacyAssembler?: boolean },
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = from ? RawFlightDataService.parseDdMmYyyy(from) : today;
    const end = to ? RawFlightDataService.parseDdMmYyyy(to) : start;
    if (!start || !end) {
      throw new BadRequestException('Invalid from/to date format');
    }
    if (start > end) {
      throw new BadRequestException('from must be <= to');
    }

    const fromYmd = RawFlightDataService.dateToYmd(start);
    const toYmd = RawFlightDataService.dateToYmd(end);
    const stationCacheKey = station.crossStation
      ? 'ALL'
      : (normalizeStationCode(station.stationCode) ?? 'NONE');
    const cacheKey = `${stationCacheKey}:${fromYmd}:${toYmd}`;
    const nowMs = Date.now();
    sweepListDailyFromAdvanceCache(nowMs);
    const hit = skipCache
      ? undefined
      : getListDailyFromAdvanceCacheEntry(cacheKey);
    if (hit && hit.expiresAt > nowMs) {
      this.logger.debug(
        `[fhr_perf] listDailyFromAdvance cacheHit key=${cacheKey}`,
      );
      return hit.payload;
    }

    const forceLegacy = opts?.forceLegacyAssembler === true;
    const readEnv = readScheduledDailyReadModelEnv();
    const stationCode = station.crossStation
      ? undefined
      : normalizeStationCode(station.stationCode);
    const readModelActive =
      !forceLegacy &&
      Boolean(stationCode) &&
      isScheduledDailyReadModelEnabledForStation(stationCode, readEnv.mode);

    // Phase 3: indexed projection read (no universe assembly).
    if (readModelActive && readEnv.mode === 'on' && stationCode) {
      const projected = await this.scheduledDailyReadService.listDailyRows({
        stationCode,
        fromYmd,
        toYmd,
      });
      const allowEmpty =
        String(process.env.SCHEDULED_DAILY_READ_MODEL_ALLOW_EMPTY ?? '')
          .trim()
          .toLowerCase() === '1' ||
        String(process.env.SCHEDULED_DAILY_READ_MODEL_ALLOW_EMPTY ?? '')
          .trim()
          .toLowerCase() === 'true';
      if (projected.length > 0 || allowEmpty) {
        this.logger.debug(
          `[fhr_perf] listDailyFromAdvance readModel key=${cacheKey} rows=${projected.length}`,
        );
        if (!skipCache) {
          try {
            setListDailyFromAdvanceCacheEntry(cacheKey, {
              expiresAt: nowMs + LIST_DAILY_ADVANCE_CACHE_TTL_MS,
              payload: JSON.parse(JSON.stringify(projected)) as Array<{
                data: Record<string, unknown>;
              }>,
            });
          } catch {
            setListDailyFromAdvanceCacheEntry(cacheKey, {
              expiresAt: nowMs + LIST_DAILY_ADVANCE_CACHE_TTL_MS,
              payload: projected,
            });
          }
        }
        sweepListDailyFromAdvanceCache(Date.now());
        return projected;
      }
      this.logger.warn(
        `[scheduled_daily_read] empty projection for ${cacheKey}; falling back to legacy assembler`,
      );
      this.logger.warn(
        `[scheduled_daily_read] LEGACY_FALLBACK mode=on key=${cacheKey} — backfill or wait for outbox drain`,
      );
    }

    const result = await this.assembleListDailyFromAdvanceLegacy(
      start,
      end,
      station,
      cacheKey,
    );

    // Phase 3 shadow: return legacy, log parity vs projection (does not change response).
    if (readModelActive && readEnv.mode === 'shadow' && stationCode) {
      try {
        const projected = await this.scheduledDailyReadService.listDailyRows({
          stationCode,
          fromYmd,
          toYmd,
        });
        const report = this.scheduledDailyReadService.compareParity(
          stationCode,
          fromYmd,
          toYmd,
          result,
          projected,
        );
        this.scheduledDailyReadService.logParityReport(report);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[scheduled_daily_parity] shadow failed: ${msg}`);
      }
    }

    if (!skipCache) {
      try {
        setListDailyFromAdvanceCacheEntry(cacheKey, {
          expiresAt: nowMs + LIST_DAILY_ADVANCE_CACHE_TTL_MS,
          payload: JSON.parse(JSON.stringify(result)) as Array<{
            data: Record<string, unknown>;
          }>,
        });
      } catch {
        setListDailyFromAdvanceCacheEntry(cacheKey, {
          expiresAt: nowMs + LIST_DAILY_ADVANCE_CACHE_TTL_MS,
          payload: result,
        });
      }
    }
    sweepListDailyFromAdvanceCache(Date.now());
    return result;
  }

  /**
   * Legacy CP-01 universe assembly (request-time). Kept for `off` / shadow /
   * empty-projection fallback until Phase 7 cutover.
   */
  private async assembleListDailyFromAdvanceLegacy(
    start: Date,
    end: Date,
    station: StationScopeContext,
    cacheKey: string,
  ): Promise<Array<{ data: Record<string, unknown> }>> {
    const perfTimers = process.env.FHR_PERF_TIMERS === '1';
    if (perfTimers) console.time('total');

    const wallStart = Date.now();

    const out: Array<{ data: Record<string, unknown> }> = [];
    const forwardOnlyScheduleIds =
      await this.loadForwardOnlyAdvanceScheduleIds(station);
    const fhrBySerial = await this.appendFhrCollectionRowsToDaily(
      out,
      start,
      end,
      station,
      forwardOnlyScheduleIds,
    );
    await this.appendAdvanceScheduleRowsToDaily(out, start, end, station);
    await this.appendScheduledCreationRowsToDaily(out, start, end, station);
    // One-time Creation → Additional Flights (never from advance_schedule_setup).
    await this.appendAdditionalFlightsToDaily(out, start, end, station);
    this.dedupeDailyRowsByScheduleDay(out);
    await this.attachStableSerials(out);

    out.forEach((row) => {
      delete row.data._staSortMinutes;
      delete row.data._stdSortMinutes;
    });

    const filtered = out.filter((row) => row.data._inRequestedRange === true);

    const result = await this.finalizeDailyFhrCollectionOnly(
      filtered,
      fhrBySerial,
      RawFlightDataService.dateToYmd(start),
      RawFlightDataService.dateToYmd(end),
      station,
    );
    await this.applyAdvanceScheduleTimesToDailyRows(result, station);
    // Final pass: Creation daily overrides must win over master-time heal / FHR embeds
    // so Flights → Scheduled Airlines reflects Creation → Schedule Airlines saves.
    await this.reapplyScheduledCreationOverlaysToDaily(
      result,
      start,
      end,
      station,
    );

    const totalMs = Date.now() - wallStart;
    let approxBytes = 0;
    try {
      approxBytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
    } catch {
      approxBytes = 0;
    }
    this.logger.debug(
      `[fhr_perf] listDailyFromAdvance totalMs=${totalMs} rows=${result.length} approxBytes=${approxBytes} key=${cacheKey}`,
    );

    if (perfTimers) console.timeEnd('total');
    return result;
  }

  /**
   * Merge `advance_schedule_setup` + `scheduled_airlines_creation` into one `raw_flight_data` document.
   */
  async mergeStagingIntoRawFlightData(
    serialNo: string,
    station: StationScopeContext,
  ) {
    const s = String(serialNo ?? '').trim();
    if (!s) {
      throw new BadRequestException('serialNo is required');
    }
    const adv = await this.advanceScheduleModel.findOne({ serialNo: s }).lean();
    const cre = await this.scheduledCreationModel
      .findOne({ serialNo: s })
      .lean();
    if (!adv && !cre) {
      return {
        success: false,
        message: 'No advance or creation record for this serial',
        serialNo: s,
      };
    }

    const a = adv?.data ?? {};
    const c = cre?.data ?? {};
    const merged: Record<string, unknown> = { ...a };
    const mergedStatus = this.normalizeFlightStatus(
      c.flightStatus ?? a.flightStatus,
      'Open',
    );
    merged.flightStatus = mergedStatus;
    merged.flightCancelled = mergedStatus === 'Cancelled';
    merged.isCancelled = mergedStatus === 'Cancelled';

    const airline =
      RawFlightDataService.nonEmpty(c.airlines) ||
      RawFlightDataService.nonEmpty(c.airline);
    if (airline) {
      merged.Airline = airline;
      merged.airline = airline;
    }
    const fromAdvance = RawFlightDataService.nonEmpty(
      a.flightNo,
      a['Flight No'],
      a.FlightNo,
    );
    const fromCreation = RawFlightDataService.nonEmpty(
      c.flightNo,
      c['Flight No'],
    );
    const pickMergedFlightNo = (): string => {
      const adv = String(fromAdvance ?? '').trim();
      const cre = String(fromCreation ?? '').trim();
      const advMark = adv.toUpperCase().startsWith('CANC');
      const creMark = cre.toUpperCase().startsWith('CANC');
      if (advMark) return adv;
      if (creMark) return cre;
      if (cre) return cre;
      return adv;
    };
    const fn = pickMergedFlightNo();
    if (fn) {
      merged['Flight No'] = fn;
      merged.flightNo = fn;
    }
    const ac = RawFlightDataService.nonEmpty(c.acType);
    if (ac && ac !== '0') {
      merged.Aircraft = ac;
      merged.TypeCraft = ac;
      merged.aircraft = ac;
    }
    const routing = RawFlightDataService.nonEmpty(c.routing);
    if (routing) {
      merged.Routing = routing;
      merged.route = routing;
    }
    const code = RawFlightDataService.nonEmpty(c.airlineCode);
    if (code) {
      merged['Airline Code'] = code;
    }
    const ops = RawFlightDataService.nonEmpty(c.opsType);
    if (ops) {
      merged['Type of Handling'] = ops;
    }
    const cat = RawFlightDataService.nonEmpty(
      c.categoryOfFlight,
      a.flightType,
      a['Flight Type'],
      a['Type of flight'],
      a.flight,
      a.Cate_of_Flight,
      a.cate_of_flight,
      a.category_of_flight,
    );
    if (cat) {
      merged['Flight Type'] = cat;
      merged['Type of flight'] = cat;
      merged.flight = cat;
      merged.flightType = cat;
      merged.Cate_of_Flight = cat;
      merged.cate_of_flight = cat;
      merged.category_of_flights = cat;
      merged.category_of_flight = cat;
      merged.categoryOfFlight = cat;
    }
    const skd = RawFlightDataService.nonEmpty(c.skdNonSkd);
    if (skd) {
      merged.skdNonSkd = skd;
    }
    const body = RawFlightDataService.nonEmpty(c.aBody);
    if (body) {
      merged['Aircraft Body'] = body;
      merged.aircraftBody = body;
    }
    const reportDate = RawFlightDataService.nonEmpty(c.date);
    if (reportDate) {
      merged.creationReportDate = reportDate;
    }

    const advValidFrom = RawFlightDataService.nonEmpty(
      a.validFrom,
      a['Valid From'],
    );
    const advValidTo = RawFlightDataService.nonEmpty(
      a.validTo,
      a['Valid To'],
    );
    const advStaDate = RawFlightDataService.nonEmpty(
      a['STA Date'],
      a.staDate,
    );
    const advStdDate = RawFlightDataService.nonEmpty(
      a['STD Date'],
      a.stdDate,
    );
    const advStaTime =
      RawFlightDataService.nonEmpty(a['STA Time']) ||
      RawFlightDataService.nonEmpty(a.staTime);
    const advStdTime =
      RawFlightDataService.nonEmpty(a['STD Time']) ||
      RawFlightDataService.nonEmpty(a.stdTime);

    const crStaDate =
      RawFlightDataService.nonEmpty(c.staDate) ||
      RawFlightDataService.nonEmpty(c['STA Date']);
    const crStdDate =
      RawFlightDataService.nonEmpty(c.stdDate) ||
      RawFlightDataService.nonEmpty(c['STD Date']);
    const crStaTime =
      RawFlightDataService.nonEmpty(c.staTime) ||
      RawFlightDataService.nonEmpty(c['STA Time']);
    const crStdTime =
      RawFlightDataService.nonEmpty(c.stdTime) ||
      RawFlightDataService.nonEmpty(c['STD Time']);

    const staDateNorm = RawFlightDataService.normalizeDateDdMmYyyy(
      crStaDate || advStaDate,
    );
    const stdDateNorm = RawFlightDataService.normalizeDateDdMmYyyy(
      crStdDate || advStdDate,
    );
    const staTimeFinal = crStaTime || advStaTime;
    const stdTimeFinal = crStdTime || advStdTime;

    if (staDateNorm) {
      merged.staDate = staDateNorm;
      merged['STA Date'] = staDateNorm;
    }
    if (stdDateNorm) {
      merged.stdDate = stdDateNorm;
      merged['STD Date'] = stdDateNorm;
    }
    const validFromNorm = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(advValidFrom, advStaDate),
    );
    const validToNorm = RawFlightDataService.normalizeDateDdMmYyyy(
      RawFlightDataService.nonEmpty(advValidTo, advStdDate),
    );
    if (validFromNorm) {
      merged['Valid From'] = validFromNorm;
      merged.validFrom = validFromNorm;
    }
    if (validToNorm) {
      merged['Valid To'] = validToNorm;
      merged.validTo = validToNorm;
    }
    if (staTimeFinal) {
      merged.staTime = staTimeFinal;
      merged['STA Time'] = staTimeFinal;
    }
    if (stdTimeFinal) {
      merged.stdTime = stdTimeFinal;
      merged['STD Time'] = stdTimeFinal;
    }

    const numSerial = Number(s);
    merged.SerialNo = Number.isNaN(numSerial) ? Date.now() : numSerial;
    merged.SlNo = s;
    merged['Serial No'] = s;
    merged.serialNo = s;

    const src: string[] = [];
    if (adv) src.push('advance_schedule_setup');
    if (cre) src.push('scheduled_airlines_creation');
    merged.scheduleSource = src.join('+');

    const or = this.serialMatchFilter(s);
    const existing = await this.rawFlightDataModel
      .findOne(StationScope.filter({ $or: or }, station))
      .lean();
    if (existing?._id) {
      await this.rawFlightDataModel.updateOne(
        { _id: existing._id },
        { $set: { data: merged } },
      );
    } else {
      await this.rawFlightDataModel.create({
        data: merged,
        stationCode: this.stampStationCode(station),
      });
    }

    const isForwardOnlyAdvanceSync =
      RawFlightDataService.nonEmpty(a.dailySyncSource) ===
      ADVANCE_DAILY_SYNC_SOURCE;
    let fhrStaDatesCount = 0;
    if (!isForwardOnlyAdvanceSync) {
      await this.fhrCollectionService
        .upsertAdvanceScheduleMasterToFhr(s, merged, station)
        .then((count) => {
          fhrStaDatesCount = count;
          this.bustScheduledListCaches(station, {
            reason: 'advance_schedule_upsert',
          });
        })
        .catch((err: unknown) => {
          this.logger.error(
            '[RawFlightData] fhr_collection advance schedule upsert failed',
            err instanceof Error ? err.stack : String(err),
          );
        });

      void this.fhrCollectionService
        .onScheduledAirlinesStagingMerge(s, merged, station)
        .catch((err: unknown) => {
          this.logger.error(
            '[RawFlightData] fhr_collection snapshot (staging merge) failed',
            err instanceof Error ? err.stack : String(err),
          );
        });
    } else {
      const validFrom = RawFlightDataService.nonEmpty(
        merged.validFrom,
        merged['Valid From'],
      );
      const validTo = RawFlightDataService.nonEmpty(
        merged.validTo,
        merged['Valid To'],
        validFrom,
      );
      const fromYmd = RawFlightDataService.scheduleLabelToYmd(validFrom);
      const toYmd = RawFlightDataService.scheduleLabelToYmd(validTo);
      const operatingDatesDdMm: string[] = [];
      if (fromYmd && toYmd) {
        operatingDatesDdMm.push(
          ...RawFlightDataService.enumerateAdvanceOperatingDates(
            validFrom,
            validTo,
            merged.scheduleDays,
            fromYmd,
            toYmd,
          ),
        );
        fhrStaDatesCount = operatingDatesDdMm.length;
      }
      // Push STA/STD edits onto existing Closed/Open FHR instance rows so the
      // Scheduled Airlines table updates the same SL.NO instead of minting a new one.
      if (operatingDatesDdMm.length > 0) {
        await this.fhrCollectionService
          .patchExistingInstanceScheduleTimes(
            merged,
            operatingDatesDdMm,
            station,
            s,
          )
          .catch((err: unknown) => {
            this.logger.error(
              '[RawFlightData] FHR instance schedule patch failed',
              err instanceof Error ? err.stack : String(err),
            );
          });
      }
      this.bustScheduledListCaches(station, {
        reason: 'advance_forward_only_patch',
      });
    }

    return {
      success: true,
      serialNo: s,
      mergedFrom: src,
      fhrStaDatesCount,
    };
  }

  /**
   * True when `serialNo` is a generated per-day instance (not the 6-digit schedule master).
   */
  private async isInstanceOperationalSerial(
    serialNo: string,
  ): Promise<boolean> {
    const s = RawFlightDataService.normalizeInstanceSerial(serialNo);
    if (!s) return false;
    const n = Number(s);
    if (Number.isFinite(n) && n >= RawFlightDataService.GLOBAL_SERIAL_BASE) {
      return true;
    }
    const idx = await this.flightInstanceIndexModel
      .findOne({ serialNo: s })
      .select({ _id: 1 })
      .lean();
    return !!idx;
  }

  /**
   * Undo mistaken master-level cancel flags on `advance_schedule_setup` when only one
   * operating-day instance was cancelled.
   */
  async clearScheduleMasterCancelFlags(scheduleSerial: string): Promise<void> {
    const sid = String(scheduleSerial ?? '').trim();
    if (!sid) return;
    const doc = await this.advanceScheduleModel
      .findOne({ serialNo: sid })
      .lean();
    const data =
      doc?.data && typeof doc.data === 'object' && !Array.isArray(doc.data)
        ? (doc.data as Record<string, unknown>)
        : null;
    if (!data) return;

    const rawFn = RawFlightDataService.nonEmpty(
      data.flightNo,
      data['Flight No'],
      data.FlightNo,
    );
    const flightNo = rawFn.replace(/^CANC[\s-]*/i, '').trim();

    await this.advanceScheduleModel.updateOne(
      { serialNo: sid },
      {
        $set: {
          'data.flightStatus': 'Open',
          'data.flightCancelled': false,
          'data.isCancelled': false,
          ...(flightNo
            ? { 'data.flightNo': flightNo, 'data.Flight No': flightNo }
            : {}),
        },
      },
    );

    const or = this.serialMatchFilter(sid);
    await this.rawFlightDataModel.updateMany(
      { $or: or },
      {
        $set: {
          'data.flightStatus': 'Open',
          'data.flightCancelled': false,
          'data.isCancelled': false,
          ...(flightNo
            ? {
                'data.flightNo': flightNo,
                'data.Flight No': flightNo,
              }
            : {}),
        },
      },
    );
    // No station scope on this helper — cache bust only; projection catch-up via admin/backfill.
    invalidateListDailyFromAdvanceCache();
  }

  async updateFlightStatusBySerial(
    serialNo: string,
    status: FlightStatus,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{
    success: true;
    serialNo: string;
    flightStatus: FlightStatus;
    updated: {
      rawFlightData: number;
      advanceScheduleSetup: number;
      scheduledAirlinesCreation: number;
    };
  }> {
    const s = String(serialNo ?? '').trim();
    if (!s) {
      throw new BadRequestException('serialNo is required');
    }
    const normalizedStatus = this.normalizeFlightStatus(status, 'Open');
    const cancelled = normalizedStatus === 'Cancelled';

    const isInstanceSerial = await this.isInstanceOperationalSerial(s);

    // Per-day instance cancel/reopen: only touch raw rows keyed by this instance serial.
    // Do not mark the whole advance schedule master (would cancel every operating day).
    if (isInstanceSerial) {
      const rawSerialOr = this.serialMatchFilter(s);
      const rawRes = await this.rawFlightDataModel.updateMany(
        { $or: rawSerialOr },
        {
          $set: {
            'data.flightStatus': normalizedStatus,
            'data.flightCancelled': cancelled,
            'data.isCancelled': cancelled,
          },
        },
      );
      return {
        success: true,
        serialNo: s,
        flightStatus: normalizedStatus,
        updated: {
          rawFlightData: rawRes.modifiedCount ?? 0,
          advanceScheduleSetup: 0,
          scheduledAirlinesCreation: 0,
        },
      };
    }

    // Schedule master serial: update staging collections for legacy flows.
    const scheduleSerialCandidates = [s];
    const rawSerialOr = scheduleSerialCandidates.flatMap((serial) =>
      this.serialMatchFilter(serial),
    );

    const [rawRes, advRes, creRes] = await Promise.all([
      this.rawFlightDataModel.updateMany(
        { $or: rawSerialOr },
        {
          $set: {
            'data.flightStatus': normalizedStatus,
            'data.flightCancelled': cancelled,
            'data.isCancelled': cancelled,
          },
        },
      ),
      this.advanceScheduleModel.updateMany(
        { serialNo: { $in: scheduleSerialCandidates } },
        {
          $set: {
            'data.flightStatus': normalizedStatus,
            'data.flightCancelled': cancelled,
            'data.isCancelled': cancelled,
          },
        },
      ),
      this.scheduledCreationModel.updateMany(
        { serialNo: { $in: scheduleSerialCandidates } },
        {
          $set: {
            'data.flightStatus': normalizedStatus,
            'data.flightCancelled': cancelled,
            'data.isCancelled': cancelled,
          },
        },
      ),
    ]);

    if (normalizedStatus === 'Closed') {
      void this.fhrCollectionService
        .onFlightStatusClosed(s, station)
        .catch((err: unknown) => {
          this.logger.error(
            '[RawFlightData] fhr_collection snapshot (flight closed) failed',
            err instanceof Error ? err.stack : String(err),
          );
        });
    }

    return {
      success: true,
      serialNo: s,
      flightStatus: normalizedStatus,
      updated: {
        rawFlightData: rawRes.modifiedCount ?? 0,
        advanceScheduleSetup: advRes.modifiedCount ?? 0,
        scheduledAirlinesCreation: creRes.modifiedCount ?? 0,
      },
    };
  }
}
