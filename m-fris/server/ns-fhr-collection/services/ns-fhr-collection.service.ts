import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NsFhrCollection,
  NsFhrCollectionDocument,
} from '../schema/ns-fhr-collection.schema';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from '../../common/station/station.constants';
import type { UpsertFhrCollectionDto } from '../../fhr-collection/dto/upsert-fhr-collection.dto';
import { normalizeFhrEquipmentDetailItems } from 'src/common/billing-trackable-equipment-name';
import {
  fhrStaDatesRangeFilter,
  normalizeDateDdMmYyyy,
  ymdFromDdMmYyyy,
} from '../../fhr-collection/utils/sta-dates.util';
import { looksNonScheduledFhrPayload } from '../utils/looks-non-scheduled-payload.util';

function stripMongoMetaForEmbed(
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

export type NsAirlineListQuery = {
  serialNo?: string;
  airline?: string;
  fromDate?: string;
  tillDate?: string;
};

function nonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function hasObjectPayload(value: unknown): boolean {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Same rules as scheduled `partialFlightRowFromFhrApiDoc` for GSD lock. */
function hasEquipmentManpowerPayload(value: unknown): boolean {
  if (!hasObjectPayload(value)) return false;
  const e = value as Record<string, unknown>;
  const entries = Array.isArray(e.entries) ? e.entries : [];
  if (entries.length > 0) return true;
  for (const k of [
    'verifiedBy',
    'verifiedAt',
    'verifiedByCode',
    'flightNo',
    'airlinesOperator',
    'sta',
    'staDate',
    'std',
    'stdDate',
    'acType',
    'routing',
    'operations',
  ]) {
    if (String(e[k] ?? '').trim()) return true;
  }
  return false;
}

function truthyCancelFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'cancelled';
}

/** Match scheduled airlines Open/Closed/Cancelled derivation for NS table rows. */
function nsAirlineFlightStatus(input: {
  cancelled: boolean;
  hasMain: boolean;
  hasTerminal: boolean;
  hasRamp: boolean;
  hasLoadControl: boolean;
}): 'Open' | 'Closed' | 'Cancelled' {
  if (input.cancelled) return 'Cancelled';
  if (
    input.hasMain &&
    input.hasTerminal &&
    input.hasRamp &&
    input.hasLoadControl
  ) {
    return 'Closed';
  }
  return 'Open';
}

function bookingDateToKey(raw?: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const ymd = /^\d{4}-\d{2}-\d{2}/.test(s)
    ? s.slice(0, 10)
    : ymdFromDdMmYyyy(normalizeDateDdMmYyyy(s));
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return Number(ymd.replace(/-/g, ''));
}

function toYmd(raw?: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return ymdFromDdMmYyyy(normalizeDateDdMmYyyy(s));
}

/** Inclusive yyyy-MM-dd → dd/MM/yyyy list for indexed `staDates` queries. */
function ymdRangeToDdMmYyyyList(fromYmd: string, toYmd: string): string[] {
  const list: string[] = [];
  const cur = new Date(`${fromYmd}T00:00:00Z`);
  const endMs = new Date(`${toYmd}T00:00:00Z`).getTime();
  if (Number.isNaN(cur.getTime()) || Number.isNaN(endMs) || cur.getTime() > endMs) {
    return list;
  }
  while (cur.getTime() <= endMs) {
    const d = String(cur.getUTCDate()).padStart(2, '0');
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const y = cur.getUTCFullYear();
    list.push(`${d}/${m}/${y}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return list;
}

@Injectable()
export class NsFhrCollectionService {
  private readonly logger = new Logger(NsFhrCollectionService.name);

  private static readonly DASHBOARD_BUNDLE_PROJECTION = {
    _id: 0,
    stationCode: 1,
    staDates: 1,
    SerialNo: 1,
    flightSerialNumber: 1,
    isCancelled: 1,
    updatedAt: 1,
    mainDetails: 1,
    terminalDetails: 1,
    rampDetails1: 1,
    rampDetails3: 1,
    loadControlDetails: 1,
    equipmentManpower: 1,
    equipmentDetails: 1,
    'remarks.airlineRemarksRating': 1,
    'remarks.AirlineRemarksRating': 1,
    'remarks.flightStaDateIso': 1,
    'remarks.airlineRemarks': 1,
    'remarks.AirRepRem': 1,
    'remarks.airrep': 1,
  } as const;

  private static readonly STA_WINDOW_CACHE_TTL_MS = 5 * 60 * 1000;
  private static readonly STA_WINDOW_CACHE_MAX = 12;

  private readonly staWindowRowsCache = new Map<
    string,
    { expiresAt: number; rows: Array<Record<string, unknown>>; wallMs: number }
  >();
  private readonly staWindowRowsInflight = new Map<
    string,
    Promise<{ rows: Array<Record<string, unknown>>; wallMs: number }>
  >();

  private readonly nsFhrMutateCallbacks: Array<
    (ctx?: {
      serialNo?: number;
      slice?: string;
      affectedDates?: string[];
    }) => void | Promise<void>
  > = [];

  constructor(
    @InjectModel(NsFhrCollection.name)
    private readonly nsFhrModel: Model<NsFhrCollectionDocument>,
  ) {}

  /** Dashboard (and others) react to NS FHR merges without circular Nest imports. */
  registerNsFhrMutateCallback(
    cb: (ctx?: {
      serialNo?: number;
      slice?: string;
      affectedDates?: string[];
    }) => void | Promise<void>,
  ): void {
    this.nsFhrMutateCallbacks.push(cb);
  }

  private scheduleNsFhrMutateCallbacks(ctx?: {
    serialNo?: number;
    slice?: string;
    affectedDates?: string[];
  }): void {
    setImmediate(() => {
      for (const cb of this.nsFhrMutateCallbacks) {
        void Promise.resolve(cb(ctx)).catch((err) => {
          this.logger.debug(
            `[ns_fhr_collection] mutate callback failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    });
  }

  private stampStationCode(station: StationScopeContext): string {
    if (station.crossStation) {
      return normalizeStationCode('MAA') ?? 'MAA';
    }
    return normalizeStationCode(station.stationCode) ?? 'MAA';
  }

  async existsBySerial(
    SerialNo: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<boolean> {
    if (!Number.isFinite(SerialNo) || SerialNo <= 0) return false;
    const n = await this.nsFhrModel
      .countDocuments(
        StationScope.filter(
          { $or: [{ SerialNo }, { flightSerialNumber: SerialNo }] },
          station,
        ),
      )
      .exec();
    return n > 0;
  }

  /**
   * Station-agnostic NS check. Scheduled snapshot/mirror must not write
   * `fhr_collection` when the serial already lives on Non-Scheduled Airlines.
   */
  async existsBySerialAnyStation(SerialNo: number): Promise<boolean> {
    if (!Number.isFinite(SerialNo) || SerialNo <= 0) return false;
    const n = await this.nsFhrModel
      .countDocuments({
        $or: [{ SerialNo }, { flightSerialNumber: SerialNo }],
      })
      .exec();
    return n > 0;
  }

  /**
   * Keep signatures captured on a stray scheduled `fhr_collection` stub
   * when that stub is deleted (NS Open writes used the scheduled store).
   */
  async adoptEmbeddedSignaturesIfEmpty(
    SerialNo: number,
    stray: {
      signatures?: Record<string, unknown> | null;
      status?: string;
      finalizedAt?: Date | null;
      finalizedByUserId?: string;
    },
  ): Promise<void> {
    if (!Number.isFinite(SerialNo) || SerialNo <= 0) return;
    const incoming = stray.signatures;
    if (!incoming || typeof incoming !== 'object') return;
    const ns = await this.nsFhrModel
      .findOne({ $or: [{ SerialNo }, { flightSerialNumber: SerialNo }] })
      .lean()
      .exec();
    if (!ns) return;
    const cur = ((ns as unknown as { signatures?: Record<string, unknown> })
      .signatures ?? {}) as Record<string, unknown>;
    const hasNsInk = Boolean(
      cur.ghSignatureUrl ||
        cur.ghSignatureId ||
        cur.airlineSignatureUrl ||
        cur.airlineSignatureId,
    );
    const hasStrayInk = Boolean(
      incoming.ghSignatureUrl ||
        incoming.ghSignatureId ||
        incoming.airlineSignatureUrl ||
        incoming.airlineSignatureId,
    );
    if (hasNsInk || !hasStrayInk) return;
    const set: Record<string, unknown> = { signatures: incoming };
    if (stray.status === 'FINALIZED') {
      set.status = 'FINALIZED';
      if (stray.finalizedAt) set.finalizedAt = stray.finalizedAt;
      if (stray.finalizedByUserId) set.finalizedByUserId = stray.finalizedByUserId;
    }
    await this.nsFhrModel
      .updateOne(
        { $or: [{ SerialNo }, { flightSerialNumber: SerialNo }] },
        { $set: set },
      )
      .exec();
  }

  /** Batch existence check for airline-list promote gating. */
  async existingSerials(
    serials: number[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Set<number>> {
    const unique = [
      ...new Set(
        serials.filter((n) => Number.isFinite(n) && n > 0).map((n) => Number(n)),
      ),
    ];
    if (unique.length === 0) return new Set();
    const docs = await this.nsFhrModel
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
        { SerialNo: 1, flightSerialNumber: 1, _id: 0 },
      )
      .lean()
      .exec();
    const out = new Set<number>();
    for (const doc of docs) {
      const a = Number((doc as { SerialNo?: unknown }).SerialNo ?? 0);
      const b = Number((doc as { flightSerialNumber?: unknown }).flightSerialNumber ?? 0);
      if (Number.isFinite(a) && a > 0) out.add(a);
      if (Number.isFinite(b) && b > 0) out.add(b);
    }
    return out;
  }

  async existingSerialsAnyStation(serials: number[]): Promise<Set<number>> {
    const unique = [
      ...new Set(
        serials.filter((n) => Number.isFinite(n) && n > 0).map((n) => Number(n)),
      ),
    ];
    if (unique.length === 0) return new Set();
    const docs = await this.nsFhrModel
      .find(
        {
          $or: [
            { SerialNo: { $in: unique } },
            { flightSerialNumber: { $in: unique } },
          ],
        },
        { SerialNo: 1, flightSerialNumber: 1, _id: 0 },
      )
      .lean()
      .exec();
    const out = new Set<number>();
    for (const doc of docs) {
      const a = Number((doc as { SerialNo?: unknown }).SerialNo ?? 0);
      const b = Number(
        (doc as { flightSerialNumber?: unknown }).flightSerialNumber ?? 0,
      );
      if (Number.isFinite(a) && a > 0) out.add(a);
      if (Number.isFinite(b) && b > 0) out.add(b);
    }
    return out;
  }

  /**
   * True when payload marks Non-Scheduled (first write before ns doc exists).
   * Ops `Typeofflight` is often Turnaround — also honour handling + NS BKG/CLN nos.
   */
  static payloadLooksNonScheduled(dto: UpsertFhrCollectionDto): boolean {
    return looksNonScheduledFhrPayload(dto);
  }

  async findBySerial(
    SerialNo: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.getLeanBySerial(SerialNo, station);
    if (!doc) {
      throw new NotFoundException(
        `No ns_fhr_collection document for serial ${SerialNo}`,
      );
    }
    return doc;
  }

  /** Lean NS FHR row or null (no throw) — FHR report / PDF hydration. */
  async getLeanBySerial(
    SerialNo: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Record<string, unknown> | null> {
    if (!Number.isFinite(SerialNo) || SerialNo <= 0) return null;
    const doc = await this.nsFhrModel
      .findOne(
        StationScope.filter(
          { $or: [{ SerialNo }, { flightSerialNumber: SerialNo }] },
          station,
        ),
      )
      .lean()
      .exec();
    return doc != null ? (doc as unknown as Record<string, unknown>) : null;
  }

  /** Batch lean NS FHR rows keyed by matching serial tokens. */
  async getLeanDocsBatch(
    serials: number[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Map<number, Record<string, unknown>>> {
    const unique = Array.from(
      new Set(serials.filter((n) => Number.isFinite(n) && n > 0)),
    );
    const out = new Map<number, Record<string, unknown>>();
    if (unique.length === 0) return out;

    const docs = await this.nsFhrModel
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
      .exec();

    for (const doc of docs) {
      const d = doc as unknown as Record<string, unknown>;
      const candidates = [d.SerialNo, d.flightSerialNumber]
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0);
      for (const n of candidates) {
        if (unique.includes(n) && !out.has(n)) out.set(n, d);
      }
    }
    return out;
  }

  async upsertMerge(
    SerialNo: number,
    dto: UpsertFhrCollectionDto,
    reason: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    extra?: { exportedNAV?: string },
  ): Promise<NsFhrCollectionDocument> {
    const prior = await this.nsFhrModel
      .findOne(
        StationScope.filter(
          { $or: [{ SerialNo }, { flightSerialNumber: SerialNo }] },
          station,
        ),
      )
      .select({ staDates: 1 })
      .lean()
      .exec();
    const priorStaDates = Array.isArray(prior?.staDates)
      ? (prior!.staDates as string[])
      : [];

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
      'rafCleaningServices',
      'rafAdhocDetails',
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
        continue;
      }
      set[k] = dto[k] as object;
    }
    if (dto.rampDetails2 !== undefined) {
      set.rampDetails2 = dto.rampDetails2;
    }
    if (extra?.exportedNAV != null) {
      set.exportedNAV = extra.exportedNAV;
    }

    const md = (set.mainDetails ?? dto.mainDetails ?? {}) as Record<
      string,
      unknown
    >;
    const staDates = this.computeStaDates(md, set);
    if (staDates.length > 0) {
      set.staDates = staDates;
    }

    const updated = await this.nsFhrModel
      .findOneAndUpdate(
        { SerialNo },
        {
          $set: { SerialNo, flightSerialNumber: SerialNo, ...set },
          $setOnInsert: { stationCode: this.stampStationCode(station) },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!updated) {
      throw new NotFoundException('ns_fhr_collection upsert failed');
    }
    // Form saves change lock / presence flags — drop cached airline-table rows.
    this.invalidateStaWindowRowsCache();

    const nextStaDates = Array.isArray(updated.staDates)
      ? (updated.staDates as string[])
      : staDates;
    const affectedYmd = new Set<string>();
    for (const ddMm of [...priorStaDates, ...nextStaDates]) {
      const ymd = ymdFromDdMmYyyy(String(ddMm ?? '').trim());
      if (ymd) affectedYmd.add(ymd);
    }
    this.scheduleNsFhrMutateCallbacks({
      serialNo: SerialNo,
      slice: NsFhrCollectionService.primaryMutateSliceFromDto(dto),
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
      'rampDetails2',
      'attachments',
      'reports',
      'rafCleaningServices',
      'rafAdhocDetails',
    ];
    for (const k of order) {
      if (dto[k] !== undefined) return k;
    }
    return undefined;
  }

  private computeStaDates(
    md: Record<string, unknown>,
    set: Record<string, unknown>,
  ): string[] {
    const t = (set.terminalDetails ?? {}) as Record<string, unknown>;
    const r1 = (set.rampDetails1 ?? {}) as Record<string, unknown>;
    const candidates = [
      md.STADate,
      md.staDate,
      md.IPosDate,
      t.STADate,
      t.staDate,
      r1.STADate,
      r1.staDate,
    ];
    const out = new Set<string>();
    for (const c of candidates) {
      const n = normalizeDateDdMmYyyy(String(c ?? ''));
      if (n) out.add(n);
    }
    return [...out];
  }

  async mirrorFormSave(
    SerialNo: number,
    slice: string,
    doc: { toObject?: () => object } | Record<string, unknown>,
    reason: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<void> {
    try {
      const plain =
        typeof (doc as { toObject?: () => object }).toObject === 'function'
          ? (doc as { toObject: () => object }).toObject()
          : (doc as object);
      const payload = {
        [slice]: stripMongoMetaForEmbed(plain as Record<string, unknown>),
      } as UpsertFhrCollectionDto;
      await this.upsertMerge(SerialNo, payload, reason, station);
    } catch (err) {
      this.logger.warn(
        `ns_fhr_collection merge (${slice}) failed for serial ${SerialNo}: ${err}`,
      );
    }
  }

  /**
   * Rows for Non-Scheduled Airlines table + data-export.
   * Date-range queries use indexed `staDates` (`fhrStaDatesRangeFilter`).
   */
  async listAirlineFlights(
    opts: NsAirlineListQuery = {},
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Array<Record<string, unknown>>> {
    const serialQ = String(opts.serialNo ?? '')
      .trim()
      .toLowerCase();
    const fromYmd = toYmd(opts.fromDate);
    const tillYmd = toYmd(opts.tillDate);

    let filter: Record<string, unknown>;
    if (serialQ) {
      const n = Number(serialQ);
      if (!Number.isFinite(n) || n <= 0) return [];
      filter = StationScope.filter(
        { $or: [{ SerialNo: n }, { flightSerialNumber: n }] },
        station,
      );
    } else if (fromYmd && tillYmd && fromYmd <= tillYmd) {
      // Indexed path: `staDates` + station compound indexes.
      filter = StationScope.filter(
        fhrStaDatesRangeFilter(ymdRangeToDdMmYyyyList(fromYmd, tillYmd)),
        station,
      );
    } else {
      filter = StationScope.filter({}, station);
    }

    const docs = await this.nsFhrModel
      .find(filter)
      .select({
        _id: 0,
        stationCode: 1,
        staDates: 1,
        SerialNo: 1,
        flightSerialNumber: 1,
        isCancelled: 1,
        exportedNAV: 1,
        mainDetails: 1,
        terminalDetails: 1,
        rampDetails1: 1,
        rampDetails3: 1,
        loadControlDetails: 1,
        equipmentManpower: 1,
      })
      .sort({ SerialNo: -1 })
      .lean()
      .exec();

    const airlineQ = String(opts.airline ?? '')
      .trim()
      .toLowerCase();
    const fromKey = bookingDateToKey(opts.fromDate);
    const toKey = bookingDateToKey(opts.tillDate);
    // When Mongo already applied `staDates` window, skip redundant in-memory STA filter.
    const usedStaDatesIndex = Boolean(
      !serialQ && fromYmd && tillYmd && fromYmd <= tillYmd,
    );

    const out: Array<Record<string, unknown>> = [];
    for (const doc of docs) {
      const m = (doc.mainDetails ?? {}) as Record<string, unknown>;
      const t = (doc.terminalDetails ?? {}) as Record<string, unknown>;
      const r1 = (doc.rampDetails1 ?? {}) as Record<string, unknown>;
      const r3 = (doc.rampDetails3 ?? {}) as Record<string, unknown>;
      const serial = Number(doc.SerialNo ?? doc.flightSerialNumber ?? 0);
      if (!Number.isFinite(serial) || serial <= 0) continue;

      const airline = nonEmpty(m.Airline, m.airline);
      const airlineCode = nonEmpty(
        m.Arline_Code,
        m.airlineCode,
        m.AirlineCode,
      ).toUpperCase();
      if (
        airlineQ &&
        airlineQ !== 'all' &&
        !airline.toLowerCase().includes(airlineQ) &&
        !airlineCode.toLowerCase().includes(airlineQ)
      ) {
        continue;
      }

      const staFromIndex = Array.isArray(doc.staDates)
        ? nonEmpty(...(doc.staDates as unknown[]))
        : '';
      const staDate = nonEmpty(
        m.STADate,
        m.staDate,
        m.IPosDate,
        t.STADate,
        r1.STADate,
        staFromIndex,
      );
      const stdDate = nonEmpty(
        m.STDDate,
        m.stdDate,
        m.etdDate,
        t.STDDate,
        r3.STDDate,
      );
      const ataDate = nonEmpty(m.ATADate, m.ataDate, t.ATADate, r1.ATADate);
      const atdDate = nonEmpty(m.ATDDate, m.atdDate, t.ATDDate, r3.ATDDate);

      if (!usedStaDatesIndex) {
        const dateKey =
          bookingDateToKey(staDate) ?? bookingDateToKey(stdDate);
        if (fromKey != null && (dateKey == null || dateKey < fromKey)) continue;
        if (toKey != null && (dateKey == null || dateKey > toKey)) continue;
      }

      const flightNo = nonEmpty(
        m.ArrivalFltNo,
        m.DepartureFltNo,
        m.FlightNo,
        m.flightNo,
        m.Regn,
      ).toUpperCase();

      const navRaw = nonEmpty(
        (doc as { exportedNAV?: unknown }).exportedNAV,
        m.exportedNAV,
        m['Exported NAV'],
        m.Nav_Data_Status,
      );
      const exportedNAV = /^y(es)?$/i.test(navRaw)
        ? 'Yes'
        : /^n(o)?$/i.test(navRaw)
          ? 'No'
          : navRaw || 'No';

      const lc = (doc.loadControlDetails ?? {}) as Record<string, unknown>;
      const hasMainDetails = hasObjectPayload(doc.mainDetails);
      const hasTerminalDetails = hasObjectPayload(doc.terminalDetails);
      const hasRampDetails = hasObjectPayload(doc.rampDetails1);
      const hasLoadControlDetails = hasObjectPayload(doc.loadControlDetails);
      const hasEquipmentManpowerDetails = hasEquipmentManpowerPayload(
        doc.equipmentManpower,
      );
      const isCancelled =
        truthyCancelFlag((doc as { isCancelled?: unknown }).isCancelled) ||
        truthyCancelFlag(m.flightCancelled) ||
        truthyCancelFlag(m.fltcancelled) ||
        /^canc/i.test(flightNo);
      const flightStatus = nsAirlineFlightStatus({
        cancelled: isCancelled,
        hasMain: hasMainDetails,
        hasTerminal: hasTerminalDetails,
        hasRamp: hasRampDetails,
        hasLoadControl: hasLoadControlDetails,
      });

      out.push({
        SerialNo: serial,
        flightSerialNumber: serial,
        ArrivalFltNo: flightNo,
        DepartureFltNo: flightNo,
        FlightNo: flightNo,
        Airline: airline,
        Arline_Code: airlineCode,
        operator: nonEmpty(m.operator, m.Operator),
        TypeCraft: nonEmpty(m.TypeCraft, m.typeCraft, m.Aircraft),
        Route: nonEmpty(m.Route, m.Routing, m.routing, m.route).toUpperCase(),
        Routing: nonEmpty(m.Route, m.Routing, m.routing, m.route).toUpperCase(),
        Typeofflight: 'Non-Scheduled',
        TypeofHandling:
          nonEmpty(m.TypeofHandling, m.Typeofflight) || 'Non-Scheduled',
        opsType: nonEmpty(m.Typeofflight, m.TypeofHandling),
        STADate: staDate,
        STATime: nonEmpty(m.STATime, m.staTime, m.IPosTime, t.STATime, r1.STATime),
        STDDate: stdDate,
        STDTime: nonEmpty(m.STDTime, m.stdTime, m.ETDtime, t.STDTime, r3.STDTime),
        ATADate: ataDate,
        ATATime: nonEmpty(m.ATATime, m.ataTime, t.ATATime, r1.ATATime),
        ATDDate: atdDate,
        ATDTime: nonEmpty(m.ATDTime, m.atdTime, t.ATDTime, r3.ATDTime),
        exportedNAV,
        'Exported NAV': exportedNAV,
        bookingNo: nonEmpty(m.bookingNo, m.BookingNo),
        challanNo: nonEmpty(m.challanNo, m.ChallanNo),
        'Booking No': nonEmpty(m.bookingNo, m.BookingNo),
        'Challan No': nonEmpty(m.challanNo, m.ChallanNo),
        MTOW: nonEmpty(m.MTOW, m.mtow),
        stationCode: (doc as { stationCode?: string }).stationCode,
        hasMainDetails,
        hasTerminalDetails,
        hasRampDetails,
        hasLoadControlDetails,
        hasEquipmentManpowerDetails,
        isCancelled,
        flightStatus,
        'Flight Status': flightStatus,
        // Match scheduled airlines: lock when the corresponding form embed exists.
        rampLocked: hasRampDetails ? 'Yes' : 'No',
        paxLocked: hasTerminalDetails ? 'Yes' : 'No',
        gsdLocked: hasEquipmentManpowerDetails ? 'Yes' : 'No',
        hClose: nonEmpty(lc.hClose, lc['H Close'], m.hClose),
        fBag: nonEmpty(lc.fBag, lc['F Bag'], m.fBag),
        lBag: nonEmpty(lc.lBag, lc['L Bag'], m.lBag),
      });
    }
    return out;
  }

  invalidateStaWindowRowsCache(dateStrings?: string[]): void {
    if (!dateStrings?.length) {
      this.staWindowRowsCache.clear();
      this.staWindowRowsInflight.clear();
      return;
    }
    const key = NsFhrCollectionService.staWindowCacheKey(dateStrings);
    this.staWindowRowsCache.delete(key);
    this.staWindowRowsInflight.delete(key);
  }

  /**
   * Bird dashboard bundle read from `ns_fhr_collection` (same projection shape as scheduled).
   */
  async findAllLeanForDashboardBundle(
    dateStrings: string[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{
    rows: Array<Record<string, unknown>>;
    queryMs: number;
    cacheHit: boolean;
  }> {
    const effective =
      dateStrings?.length > 0
        ? dateStrings
        : ['28/02/2026']; // unused fallback; callers always pass dates
    const { rows, wallMs, cacheHit } =
      await this.loadStaWindowRowsCached(effective);
    const scoped = NsFhrCollectionService.filterRowsByStation(rows, station);
    this.logger.debug(
      `[ns_dash] bundleRowsReturned=${scoped.length}/${rows.length} wallMs=${wallMs} cacheHit=${cacheHit}`,
    );
    return { rows: scoped, queryMs: wallMs, cacheHit };
  }

  /**
   * Earliest / latest STA ymd in `ns_fhr_collection` for this station.
   * Used when the selected calendar window has zero NS rows.
   */
  async findStaYmdCoverage(
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{ earliestYmd: string | null; latestYmd: string | null }> {
    const docs = await this.nsFhrModel
      .find(StationScope.filter({}, station))
      .select({
        staDates: 1,
        'mainDetails.STADate': 1,
        'terminalDetails.STADate': 1,
      })
      .lean()
      .exec();

    let earliestYmd: string | null = null;
    let latestYmd: string | null = null;
    for (const raw of docs) {
      const doc = raw as unknown as Record<string, unknown>;
      const m = (doc.mainDetails ?? {}) as Record<string, unknown>;
      const t = (doc.terminalDetails ?? {}) as Record<string, unknown>;
      const dates: unknown[] = [
        ...(Array.isArray(doc.staDates) ? doc.staDates : []),
        m.STADate,
        t.STADate,
      ];
      for (const d of dates) {
        const ymd = ymdFromDdMmYyyy(String(d ?? ''));
        if (!ymd) continue;
        if (!earliestYmd || ymd < earliestYmd) earliestYmd = ymd;
        if (!latestYmd || ymd > latestYmd) latestYmd = ymd;
      }
    }
    return { earliestYmd, latestYmd };
  }

  private static staWindowCacheKey(dateStrings: string[]): string {
    if (dateStrings.length === 0) return '';
    if (dateStrings.length === 1) return dateStrings[0];
    return `${dateStrings[0]}..${dateStrings[dateStrings.length - 1]}:${dateStrings.length}`;
  }

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

  private sweepStaWindowCache(now = Date.now()): void {
    for (const [key, entry] of this.staWindowRowsCache) {
      if (entry.expiresAt <= now) this.staWindowRowsCache.delete(key);
    }
    while (this.staWindowRowsCache.size > NsFhrCollectionService.STA_WINDOW_CACHE_MAX) {
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

  private async loadStaWindowRowsCached(dateStrings: string[]): Promise<{
    rows: Array<Record<string, unknown>>;
    wallMs: number;
    cacheHit: boolean;
  }> {
    const key = NsFhrCollectionService.staWindowCacheKey(dateStrings);
    const now = Date.now();
    this.sweepStaWindowCache(now);
    const cached = this.staWindowRowsCache.get(key);
    if (cached && cached.expiresAt > now) {
      return { rows: cached.rows, wallMs: cached.wallMs, cacheHit: true };
    }
    const inflight = this.staWindowRowsInflight.get(key);
    if (inflight) {
      const joined = await inflight;
      return { rows: joined.rows, wallMs: joined.wallMs, cacheHit: true };
    }

    const loadPromise = (async () => {
      const wallStart = Date.now();
      const filter = fhrStaDatesRangeFilter(dateStrings);
      const rows: Array<Record<string, unknown>> = [];
      const cursor = this.nsFhrModel
        .find(filter)
        .select(NsFhrCollectionService.DASHBOARD_BUNDLE_PROJECTION)
        .lean()
        .cursor();
      for await (const doc of cursor) {
        rows.push(doc as unknown as Record<string, unknown>);
      }
      const wallMs = Date.now() - wallStart;
      this.staWindowRowsCache.set(key, {
        expiresAt: Date.now() + NsFhrCollectionService.STA_WINDOW_CACHE_TTL_MS,
        rows,
        wallMs,
      });
      this.sweepStaWindowCache();
      this.logger.log(
        `[ns_fhr_perf] staWindowRows cacheMiss key=${key} rows=${rows.length} wallMs=${wallMs}`,
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
}
