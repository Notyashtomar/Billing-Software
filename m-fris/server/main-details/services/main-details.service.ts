import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MainDetails,
  MainDetailsDocument,
} from '../schema/main-details.schema';
import { CreateMainDetailsDto } from '../dto/create-main-details.dto';
import {
  RawFlightDataService,
  type FlightStatus,
} from 'src/raw-flight-data/services/raw-flight-data.service';
import { FlightInstanceStateService } from 'src/flight-instance-state/flight-instance-state.service';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';

@Injectable()
export class MainDetailsService {
  constructor(
    @InjectModel(MainDetails.name)
    private mainDetailsModel: Model<MainDetailsDocument>,
    private rawFlightDataService: RawFlightDataService,
    private flightInstanceStateService: FlightInstanceStateService,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  private async syncFlightInstanceStateFromDetails(
    serial: number,
    details: Partial<CreateMainDetailsDto>,
    station: StationScopeContext,
  ): Promise<void> {
    if (this.deriveFlightStatusFromMainDetails(details) === 'Cancelled') {
      await this.flightInstanceStateService.markCancelled(
        String(serial),
        station,
      );
    } else {
      await this.flightInstanceStateService.markReopened(
        String(serial),
        station,
      );
    }
  }

  private deriveFlightStatusFromMainDetails(
    details: Partial<CreateMainDetailsDto>,
  ): FlightStatus {
    if (details.flightCancelled === true) return 'Cancelled';
    const departureStatus = String(details.departureStatus ?? '')
      .trim()
      .toLowerCase();
    if (departureStatus === 'cancelled') return 'Cancelled';

    const hasDepartureMoment =
      String(details.ATDDate ?? '').trim().length > 0 ||
      String(details.ATDTime ?? '').trim().length > 0;
    const indicatesClosed =
      departureStatus === 'on time' ||
      departureStatus === 'delay' ||
      departureStatus === 'early';
    if (hasDepartureMoment || indicatesClosed) {
      return 'Closed';
    }
    return 'Open';
  }

  // CREATE (Only one per flight)
  async create(
    serial: number,
    dto: CreateMainDetailsDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const existing = await this.mainDetailsModel.findOne(
      StationScope.filter({ SerialNo: serial }, station),
    );

    if (existing) {
      throw new ConflictException('Main details already exist for this flight');
    }

    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const doc = new this.mainDetailsModel({
      ...payload,
      SerialNo: serial,
      stationCode,
    });
    const saved = await doc.save();
    await this.rawFlightDataService.updateFlightStatusBySerial(
      String(serial),
      this.deriveFlightStatusFromMainDetails(saved),
      station,
    );
    await this.syncFlightInstanceStateFromDetails(
      serial,
      saved.toObject(),
      station,
    );
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'mainDetails',
      saved,
      'main_details_form_save',
      station,
    );
    return saved;
  }

  // GET ALL FLIGHTS (for reports listing)
  async findAll(station: StationScopeContext) {
    return this.mainDetailsModel
      .find(StationScope.filter({}, station))
      .sort({ SerialNo: 1 })
      .exec();
  }

  /**
   * Parse query dates to YYYYMMDD for range compare.
   * Accepts `yyyy-MM-dd`, `dd/MM/yyyy`, or `dd-MM-yyyy`.
   */
  private static queryDateToKey(s: string | undefined): number | null {
    if (!s?.trim()) return null;
    const t = s.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (iso) {
      return Number(`${iso[1]}${iso[2]}${iso[3]}`);
    }
    const parts = t.split(/[/\-]/);
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map((p) => p.trim());
    if (!y || !m || !d || y.length < 4) return null;
    return Number(
      `${y.padStart(4, '0')}${m.padStart(2, '0')}${d.padStart(2, '0')}`,
    );
  }

  /** Best-effort date on a main-details doc for filtering (ATA / ATD / IPOS / ETD). */
  private static mainDocumentDateKey(doc: {
    ATADate?: string;
    ATDDate?: string;
    IPosDate?: string;
    etdDate?: string;
  }): number | null {
    for (const raw of [doc.ATADate, doc.ATDDate, doc.IPosDate, doc.etdDate]) {
      const k = MainDetailsService.flexibleStoredDateKey(raw);
      if (k != null) return k;
    }
    return null;
  }

  /** Stored values may be `dd/MM/yyyy`, `dd-MM-yyyy`, or `yyyy-MM-dd`. */
  private static flexibleStoredDateKey(
    s: string | undefined | null,
  ): number | null {
    if (s == null || String(s).trim() === '') return null;
    const t = String(s).trim();
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return Number(`${iso[1]}${iso[2]}${iso[3]}`);
    }
    const parts = t.split(/[/\-]/);
    if (parts.length === 3) {
      const [a, b, c] = parts.map((p) => p.trim());
      if (c.length >= 4) {
        return Number(
          `${c.padStart(4, '0')}${b.padStart(2, '0')}${a.padStart(2, '0')}`,
        );
      }
    }
    return null;
  }

  /**
   * Count `reasonOfDelay` across `departureDelays` and `arrivalDelays` for all main-details docs.
   * When `fromDate` and `tillDate` are both set (dd/MM/yyyy), only flights whose reference date
   * falls in that inclusive range are included.
   */
  async getTopDelayReasons(
    fromDate?: string,
    tillDate?: string,
    limit = 5,
    station?: StationScopeContext,
  ): Promise<{ reason: string; count: number }[]> {
    const fromKey = MainDetailsService.queryDateToKey(fromDate);
    const tillKey = MainDetailsService.queryDateToKey(tillDate);
    const rangeActive =
      fromDate?.trim() &&
      tillDate?.trim() &&
      fromKey != null &&
      tillKey != null &&
      fromKey <= tillKey;

    const docs = await this.mainDetailsModel
      .find(station ? StationScope.filter({}, station) : {})
      .lean()
      .exec();
    const counts = new Map<string, number>();

    for (const doc of docs) {
      if (rangeActive) {
        const flightKey = MainDetailsService.mainDocumentDateKey(doc);
        if (flightKey == null || flightKey < fromKey || flightKey > tillKey) {
          continue;
        }
      }

      const bump = (reason: string) => {
        const r = reason.trim();
        if (!r) return;
        counts.set(r, (counts.get(r) ?? 0) + 1);
      };

      for (const e of doc.departureDelays ?? []) {
        bump(String((e as { ReasonofDelay?: string }).ReasonofDelay ?? ''));
      }
      for (const e of doc.arrivalDelays ?? []) {
        bump(String((e as { ReasonofDelay?: string }).ReasonofDelay ?? ''));
      }
    }

    const lim = Math.min(50, Math.max(1, Number(limit) || 5));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, lim)
      .map(([reason, count]) => ({ reason, count }));
  }
  /**
   * Count main-details docs in date range: handled (not cancelled) vs cancelled (`flightCancelled`).
   * Same reference-date rules as `getTopDelayReasons` (ATA / ATD / IPOS / ETD).
   */
  async getHandledAndCancelledCounts(
    fromDate?: string,
    tillDate?: string,
    station?: StationScopeContext,
  ): Promise<{ handled: number; cancelled: number }> {
    const fromKey = MainDetailsService.queryDateToKey(fromDate);
    const tillKey = MainDetailsService.queryDateToKey(tillDate);
    const rangeActive =
      fromDate?.trim() &&
      tillDate?.trim() &&
      fromKey != null &&
      tillKey != null &&
      fromKey <= tillKey;

    const docs = await this.mainDetailsModel
      .find(station ? StationScope.filter({}, station) : {})
      .lean()
      .exec();
    let handled = 0;
    let cancelled = 0;

    for (const doc of docs) {
      if (rangeActive) {
        const flightKey = MainDetailsService.mainDocumentDateKey(doc);
        if (flightKey == null || flightKey < fromKey || flightKey > tillKey) {
          continue;
        }
      }

      if (doc.flightCancelled === true) {
        cancelled += 1;
      } else {
        handled += 1;
      }
    }

    return { handled, cancelled };
  }

  /**
   * Cancelled non-scheduled flights (`flightCancelled`) from main-details, optional date range.
   * Same reference-date rules as `getHandledAndCancelledCounts`.
   */
  async getCancelledFlightRows(
    fromDate?: string,
    tillDate?: string,
    station?: StationScopeContext,
  ): Promise<
    Array<{
      serialNo: number;
      airline: string;
      arrivalFlightNo: string;
      departureFlightNo: string;
      route: string;
      ataDate: string;
      ataTime: string;
      atdDate: string;
      atdTime: string;
      aircraft: string;
      updatedAt?: Date;
    }>
  > {
    const fromKey = MainDetailsService.queryDateToKey(fromDate);
    const tillKey = MainDetailsService.queryDateToKey(tillDate);
    const rangeActive =
      fromDate?.trim() &&
      tillDate?.trim() &&
      fromKey != null &&
      tillKey != null &&
      fromKey <= tillKey;

    const docs = await this.mainDetailsModel
      .find({
        ...(station ? StationScope.filter({}, station) : {}),
        flightCancelled: true,
      })
      .lean()
      .exec();

    const rows: Array<{
      serialNo: number;
      airline: string;
      arrivalFlightNo: string;
      departureFlightNo: string;
      route: string;
      ataDate: string;
      ataTime: string;
      atdDate: string;
      atdTime: string;
      aircraft: string;
      updatedAt?: Date;
    }> = [];

    for (const doc of docs) {
      if (rangeActive) {
        const flightKey = MainDetailsService.mainDocumentDateKey(doc);
        if (flightKey == null || flightKey < fromKey || flightKey > tillKey) {
          continue;
        }
      }

      rows.push({
        serialNo: Number(doc.SerialNo) || 0,
        airline: String(doc.Airline ?? '').trim(),
        arrivalFlightNo: String(doc.ArrivalFltNo ?? '').trim(),
        departureFlightNo: String(doc.DepartureFltNo ?? '').trim(),
        route: String(doc.Route ?? '').trim(),
        ataDate: String(doc.ATADate ?? '').trim(),
        ataTime: String(doc.ATATime ?? '').trim(),
        atdDate: String(doc.ATDDate ?? '').trim(),
        atdTime: String(doc.ATDTime ?? '').trim(),
        aircraft: String(doc.Regn ?? '').trim(),
        updatedAt: (doc as { updatedAt?: Date }).updatedAt,
      });
    }

    rows.sort((a, b) => {
      const serialCmp = b.serialNo - a.serialNo;
      if (serialCmp !== 0) return serialCmp;
      return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
    });

    return rows;
  }

  /**
   * Flight-type breakdown from main details in date range:
   * - Turnaround: `ops` equals "Turnaround" (case-insensitive)
   * - Cargo: `flightCategory` contains "cargo" (e.g. International-Cargo, Domestic-Cargo)
   */
  async getFlightTypeCounts(
    fromDate?: string,
    tillDate?: string,
    station?: StationScopeContext,
  ): Promise<{ turnaround: number; cargo: number }> {
    const fromKey = MainDetailsService.queryDateToKey(fromDate);
    const tillKey = MainDetailsService.queryDateToKey(tillDate);
    const rangeActive =
      fromDate?.trim() &&
      tillDate?.trim() &&
      fromKey != null &&
      tillKey != null &&
      fromKey <= tillKey;

    const docs = await this.mainDetailsModel
      .find(station ? StationScope.filter({}, station) : {})
      .lean()
      .exec();
    let turnaround = 0;
    let cargo = 0;

    for (const doc of docs) {
      if (rangeActive) {
        const flightKey = MainDetailsService.mainDocumentDateKey(doc);
        if (flightKey == null || flightKey < fromKey || flightKey > tillKey) {
          continue;
        }
      }

      const ops = String(doc.Typeofflight ?? '')
        .trim()
        .toLowerCase();
      if (ops === 'turnaround') {
        turnaround += 1;
      }

      const cat = String(doc.Cate_of_Flight ?? '')
        .trim()
        .toLowerCase();
      if (cat.includes('cargo')) {
        cargo += 1;
      }
    }

    return { turnaround, cargo };
  }

  /**
   * Scheduled flight mix from main details `flightCategory` (scheduled airlines form).
   * SIP/SIF/SDP/SDF = intl/domestic × passenger/cargo. Cancelled flights excluded.
   */
  async getScheduledCategoryBreakdown(
    fromDate?: string,
    tillDate?: string,
    station?: StationScopeContext,
  ): Promise<{
    SIP: number;
    SIF: number;
    SDP: number;
    SDF: number;
    other: number;
    total: number;
  }> {
    const fromKey = MainDetailsService.queryDateToKey(fromDate);
    const tillKey = MainDetailsService.queryDateToKey(tillDate);
    const rangeActive =
      fromDate?.trim() &&
      tillDate?.trim() &&
      fromKey != null &&
      tillKey != null &&
      fromKey <= tillKey;

    const docs = await this.mainDetailsModel
      .find(station ? StationScope.filter({}, station) : {})
      .lean()
      .exec();
    let SIP = 0;
    let SIF = 0;
    let SDP = 0;
    let SDF = 0;
    let other = 0;

    for (const doc of docs) {
      if (doc.flightCancelled === true) continue;

      if (rangeActive) {
        const flightKey = MainDetailsService.mainDocumentDateKey(doc);
        if (flightKey == null || flightKey < fromKey || flightKey > tillKey) {
          continue;
        }
      }

      const bucket = MainDetailsService.bucketScheduledFlightCategory(
        doc.Cate_of_Flight,
      );
      if (bucket === 'SIP') SIP += 1;
      else if (bucket === 'SIF') SIF += 1;
      else if (bucket === 'SDP') SDP += 1;
      else if (bucket === 'SDF') SDF += 1;
      else other += 1;
    }

    const total = SIP + SIF + SDP + SDF + other;
    return { SIP, SIF, SDP, SDF, other, total };
  }

  /** Maps MainDetailsForm flightCategory values to SIP | SIF | SDP | SDF. */
  private static bucketScheduledFlightCategory(
    flightCategory: string | undefined,
  ): 'SIP' | 'SIF' | 'SDP' | 'SDF' | null {
    const raw = String(flightCategory ?? '').trim();
    if (!raw) return null;
    const n = raw.toLowerCase().replace(/\s+/g, ' ');
    if (n.includes('cargo')) {
      if (n.includes('domestic')) return 'SDF';
      return 'SIF';
    }
    if (n.startsWith('domestic')) return 'SDP';
    if (n.includes('international')) return 'SIP';
    return null;
  }

  private static pickDocString(
    doc: Record<string, unknown>,
    ...keys: string[]
  ): string {
    for (const key of keys) {
      const value = doc[key];
      if (value != null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
    return '';
  }

  /** Reference date for list filters — STA first, then ATA / ATD / IPOS / ETD. */
  private static listFilterDateKey(doc: Record<string, unknown>): number | null {
    for (const key of [
      'STADate',
      'staDate',
      'ATADate',
      'ataDate',
      'ATDDate',
      'atdDate',
      'IPosDate',
      'etdDate',
    ]) {
      const k = MainDetailsService.flexibleStoredDateKey(
        MainDetailsService.pickDocString(doc, key),
      );
      if (k != null) return k;
    }
    return MainDetailsService.mainDocumentDateKey(doc as {
      ATADate?: string;
      ATDDate?: string;
      IPosDate?: string;
      etdDate?: string;
    });
  }

  filterListedFlights(
    docs: Array<Record<string, unknown>>,
    opts: {
      filterBy?: string;
      serialNo?: string;
      challanNo?: string;
      bookingNo?: string;
      airline?: string;
      fromDate?: string;
      tillDate?: string;
    },
  ): Array<Record<string, unknown>> {
    const mode = String(opts.filterBy ?? '').trim();
    let filtered = docs;

    if (mode === 'SerialNo' && opts.serialNo?.trim()) {
      const q = opts.serialNo.trim().toLowerCase();
      filtered = filtered.filter((doc) =>
        MainDetailsService.pickDocString(
          doc,
          'SerialNo',
          'serialNo',
          'flightSerialNumber',
        )
          .toLowerCase()
          .includes(q),
      );
    }

    if (mode === 'ChallanNo' && opts.challanNo?.trim()) {
      const q = opts.challanNo.trim().toLowerCase();
      filtered = filtered.filter((doc) =>
        MainDetailsService.pickDocString(
          doc,
          'Challan No',
          'ChallanNo',
          'challanNo',
        )
          .toLowerCase()
          .includes(q),
      );
    }

    if (mode === 'BookingNo' && opts.bookingNo?.trim()) {
      const q = opts.bookingNo.trim().toLowerCase();
      filtered = filtered.filter((doc) =>
        MainDetailsService.pickDocString(
          doc,
          'Booking No',
          'BookingNo',
          'bookingNo',
        )
          .toLowerCase()
          .includes(q),
      );
    }

    if (mode === 'AirlineDate' || mode === 'Airline') {
      const airline = opts.airline?.trim();
      if (airline && airline !== 'All') {
        const aq = airline.toLowerCase();
        filtered = filtered.filter((doc) =>
          MainDetailsService.pickDocString(doc, 'Airline', 'airlineName', 'airline')
            .toLowerCase()
            .includes(aq),
        );
      }
    }

    const fromKey = MainDetailsService.queryDateToKey(opts.fromDate);
    const tillKey = MainDetailsService.queryDateToKey(opts.tillDate);
    const rangeActive =
      opts.fromDate?.trim() &&
      opts.tillDate?.trim() &&
      fromKey != null &&
      tillKey != null &&
      fromKey <= tillKey;

    if (rangeActive) {
      filtered = filtered.filter((doc) => {
        const flightKey = MainDetailsService.listFilterDateKey(doc);
        if (flightKey == null) return false;
        return flightKey >= fromKey! && flightKey <= tillKey!;
      });
    }

    return filtered;
  }

  /** True when a real `mainDetails` collection row exists (not FHR-only embed). */
  async existsInCollection(
    serial: number,
    station: StationScopeContext,
  ): Promise<boolean> {
    const hit = await this.mainDetailsModel
      .exists(StationScope.filter({ SerialNo: serial }, station))
      .exec();
    return hit != null;
  }

  /** Batch existence check for Non-Scheduled airline list promote gating. */
  async existingSerialsInCollection(
    serials: number[],
    station: StationScopeContext,
  ): Promise<Set<number>> {
    const unique = [
      ...new Set(
        serials.filter((n) => Number.isFinite(n) && n > 0).map((n) => Number(n)),
      ),
    ];
    if (unique.length === 0) return new Set();
    const docs = await this.mainDetailsModel
      .find(StationScope.filter({ SerialNo: { $in: unique } }, station), {
        SerialNo: 1,
        _id: 0,
      })
      .lean()
      .exec();
    const out = new Set<number>();
    for (const doc of docs) {
      const n = Number((doc as { SerialNo?: unknown }).SerialNo ?? 0);
      if (Number.isFinite(n) && n > 0) out.add(n);
    }
    return out;
  }

  // GET
  async findBySerial(serial: number, station: StationScopeContext) {
    const record = await this.mainDetailsModel.findOne(
      StationScope.filter({ SerialNo: serial }, station),
    );

    if (record) return record;

    const fhr = await this.fhrCollectionService.getLeanFhrBySerial(
      serial,
      station,
    );
    const embed = fhr?.mainDetails;
    if (embed && typeof embed === 'object' && !Array.isArray(embed)) {
      return embed as MainDetailsDocument;
    }

    throw new NotFoundException('Main details not found');
  }

  /**
   * Seed mainDetails from a non-scheduled booking without wiping Open-form edits.
   * - Missing row: insert full booking seed (+ FHR mirror).
   * - Existing row: only refresh bookingNo / challanNo, leave ATA/ATD/delays/etc. intact.
   */
  async ensureBookingSeedBySerial(
    serial: number,
    dto: CreateMainDetailsDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const bookingNo = String(payload.bookingNo ?? '').trim();
    const challanNo = String(payload.challanNo ?? '').trim();
    const {
      bookingNo: _b,
      challanNo: _c,
      Airline: _airline,
      CompanyName: _company,
      operator: _operator,
      SerialNo: _serial,
      flightSerialNumber: _flightSerial,
      stationCode: _station,
      ...seedOnInsert
    } = payload;

    const updated = await this.mainDetailsModel.findOneAndUpdate(
      StationScope.filter({ SerialNo: serial }, station),
      {
        $set: {
          SerialNo: serial,
          flightSerialNumber: serial,
          ...(bookingNo ? { bookingNo } : {}),
          ...(challanNo ? { challanNo } : {}),
          ...('Airline' in seedOnInsert
            ? { Airline: String(seedOnInsert.Airline ?? '').trim() }
            : {}),
          ...('CompanyName' in seedOnInsert
            ? { CompanyName: String(seedOnInsert.CompanyName ?? '').trim() }
            : {}),
          ...('operator' in seedOnInsert
            ? { operator: String(seedOnInsert.operator ?? '').trim() }
            : {}),
        },
        $setOnInsert: {
          ...seedOnInsert,
          stationCode,
        },
      },
      { new: true, upsert: true },
    );

    await this.rawFlightDataService.updateFlightStatusBySerial(
      String(serial),
      this.deriveFlightStatusFromMainDetails(updated),
      station,
    );
    await this.syncFlightInstanceStateFromDetails(
      serial,
      updated.toObject(),
      station,
    );
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'mainDetails',
      updated,
      'main_details_booking_seed',
      station,
    );
    return updated;
  }

  /**
   * Planned STD from a non-scheduled booking → fields the airlines table, Open form, and reports read.
   * Actual ATD is updated only while it still matches the previous planned STD/ETD.
   */
  async syncPlannedStdFromBooking(
    serial: number,
    schedule: { stdDate: string; stdTime: string },
    station: StationScopeContext,
  ) {
    const stdDate = String(schedule.stdDate ?? '').trim();
    if (!stdDate) return null;
    const stdTime = String(schedule.stdTime ?? '').trim() || '00:00';

    const existing = await this.mainDetailsModel
      .findOne(StationScope.filter({ SerialNo: serial }, station))
      .exec();
    if (!existing) return null;

    const key = MainDetailsService.scheduleDateKey;
    const stdKey = key(existing.STDDate);
    const etdKey = key(existing.etdDate);
    const plannedKey = stdKey ?? etdKey;
    const atdKey = key(existing.ATDDate);
    const nextKey = key(stdDate);
    const atdStillPlanned =
      !String(existing.ATDDate ?? '').trim() ||
      atdKey == null ||
      (plannedKey != null && atdKey === plannedKey) ||
      (stdKey == null && etdKey == null) ||
      (nextKey != null && atdKey === nextKey);

    if (
      plannedKey != null &&
      nextKey != null &&
      plannedKey === nextKey &&
      (!atdStillPlanned || atdKey === nextKey)
    ) {
      return existing;
    }

    const patch: Partial<CreateMainDetailsDto> = {
      STDDate: stdDate,
      STDTime: stdTime,
      etdDate: stdDate,
      ETDtime: stdTime,
    };
    if (atdStillPlanned) {
      patch.ATDDate = stdDate;
      patch.ATDTime = stdTime;
    }
    return this.updateBySerial(serial, patch, station);
  }

  /** YYYYMMDD for DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD. */
  private static scheduleDateKey(raw: string | undefined | null): number | null {
    const t = String(raw ?? '').trim();
    if (!t) return null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (iso) return Number(`${iso[1]}${iso[2]}${iso[3]}`);
    const parts = t.split(/[/-]/).map((p) => p.trim());
    if (parts.length !== 3) return null;
    const [a, b, y] = parts;
    if (!y || y.length < 4) return null;
    const day = Number(a);
    const month = Number(b);
    if (Number.isNaN(day) || Number.isNaN(month)) return null;
    return Number(
      `${y.padStart(4, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
    );
  }

  // UPDATE (upsert: scheduled UI may hydrate from `fhr_collection` only — first save must create `mainDetails`)
  async updateBySerial(
    serial: number,
    dto: Partial<CreateMainDetailsDto>,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const { stationCode: _ignored, ...payload } = dto as Record<
      string,
      unknown
    >;
    const updated = await this.mainDetailsModel.findOneAndUpdate(
      StationScope.filter({ SerialNo: serial }, station),
      {
        $set: { ...payload, SerialNo: serial, flightSerialNumber: serial },
        $setOnInsert: { stationCode },
      },
      { new: true, upsert: true },
    );
    if (!updated) {
      throw new NotFoundException('Main details not found');
    }
    await this.rawFlightDataService.updateFlightStatusBySerial(
      String(serial),
      this.deriveFlightStatusFromMainDetails(updated),
      station,
    );
    await this.syncFlightInstanceStateFromDetails(
      serial,
      updated.toObject(),
      station,
    );
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'mainDetails',
      updated,
      'main_details_form_save',
      station,
    );
    return updated;
  }

  /** Upsert main details by flight serial (create or update). Used by spreadsheet import + non-scheduled save. */
  async upsertBySerial(
    serial: number,
    dto: CreateMainDetailsDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.mainDetailsModel.findOneAndUpdate(
      StationScope.filter({ SerialNo: serial }, station),
      {
        $set: { ...payload, SerialNo: serial, flightSerialNumber: serial },
        $setOnInsert: { stationCode },
      },
      { new: true, upsert: true },
    );
    await this.rawFlightDataService.updateFlightStatusBySerial(
      String(serial),
      this.deriveFlightStatusFromMainDetails(updated),
      station,
    );
    await this.syncFlightInstanceStateFromDetails(
      serial,
      updated.toObject(),
      station,
    );
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'mainDetails',
      updated,
      'main_details_form_save',
      station,
    );
    return updated;
  }

  /**
   * Mark a flight as cancelled in `mainDetails` so scheduled-airlines hydration
   * (GET main-details) restores cancelled state after refresh without relying only on schedule expansion.
   */
  async setFlightCancelledBySerial(
    serial: number,
    identity: { Airline: string; Arline_Code: string },
    station: StationScopeContext,
  ): Promise<void> {
    const Airline = String(identity.Airline ?? '').trim() || '-';
    const Arline_Code = String(identity.Arline_Code ?? '').trim() || '-';
    // Only update an existing main-details row. Upserting placeholder docs breaks the
    // unique `flightSerialNumber` index when forms were never filled (schedule-only flights).
    const doc = await this.mainDetailsModel.findOneAndUpdate(
      StationScope.filter({ SerialNo: serial }, station),
      {
        $set: {
          flightCancelled: true,
          flightSerialNumber: serial,
          Airline,
          Arline_Code,
        },
      },
      { new: true },
    );
    if (!doc) return;
    await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
      serial,
      'mainDetails',
      doc,
      'main_details_cancel_flag',
      station,
    );
  }

  /**
   * Clear cancellation marker persisted in `mainDetails` for scheduled-airlines hydration.
   * Also resets `departureStatus` when it is exactly "Cancelled" to prevent stale refresh state.
   */
  async clearFlightCancelledBySerial(
    serial: number,
    station: StationScopeContext,
  ): Promise<void> {
    const existing = await this.mainDetailsModel
      .findOne(StationScope.filter({ SerialNo: serial }, station))
      .lean();
    if (!existing) return;
    const departureStatus = String(existing.departureStatus ?? '')
      .trim()
      .toLowerCase();
    const cleared = await this.mainDetailsModel.findOneAndUpdate(
      StationScope.filter({ SerialNo: serial }, station),
      {
        $set: {
          flightCancelled: false,
          ...(departureStatus === 'cancelled' ? { departureStatus: '' } : {}),
        },
      },
      { new: true },
    );
    await this.flightInstanceStateService.markReopened(String(serial), station);
    if (cleared) {
      await this.fhrCollectionService.mirrorFormSaveToFhrCollection(
        serial,
        'mainDetails',
        cleared,
        'main_details_reopen',
        station,
      );
    }
  }

  // DELETE
  async deleteBySerial(serial: number, station: StationScopeContext) {
    const deleted = await this.mainDetailsModel.findOneAndDelete(
      StationScope.filter({ SerialNo: serial }, station),
    );

    if (!deleted) {
      throw new NotFoundException('Main details not found');
    }

    await this.flightInstanceStateService.markReopened(String(serial), station);

    return {
      success: true,
      message: 'Deleted successfully',
    };
  }
}
