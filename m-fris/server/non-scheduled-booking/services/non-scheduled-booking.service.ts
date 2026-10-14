import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
import { EquipmentManpower } from '../../equipment-manpower/schema/equipment-manpower.schema';
import { MainDetailsService } from '../../main-details/services/main-details.service';
import { NsFhrCollection } from '../../ns-fhr-collection/schema/ns-fhr-collection.schema';
import { NsFhrCollectionService } from '../../ns-fhr-collection/services/ns-fhr-collection.service';
import { RampDetails1 } from '../../ramp-details-1/schema/ramp-details-1.schema';
import { TerminalDetails } from '../../terminal-details/schema/terminal-details.schema';
import {
  FlightSerialCounter,
  FlightSerialCounterDocument,
} from '../../raw-flight-data/schema/flight-serial-counter.schema';
import { CreateNonScheduledBookingDto } from '../dto/create-non-scheduled-booking.dto';
import { SaveChallanDto } from '../dto/save-challan.dto';
import { SavePassengersDto } from '../dto/save-passengers.dto';
import { UpdateNonScheduledBookingDto } from '../dto/update-non-scheduled-booking.dto';
import {
  NonScheduledBooking,
  NonScheduledBookingDocument,
} from '../schema/non-scheduled-booking.schema';
import {
  FLIGHT_TYPE_FIXED,
  formatNsDocumentNo,
  normalizeBookingNo,
  NS_BOOKING_SERIAL_COUNTER_KEY,
  NS_FHR_SERIAL_COUNTER_KEY,
  NS_FHR_SERIAL_MAX,
  NS_FHR_SERIAL_MIN,
  SERVICE_TYPE_FIXED,
  toNsBookingKey,
  type BookingChannel,
  type BookingStatus,
} from '../utils/booking-no.util';

@Injectable()
export class NonScheduledBookingService {
  private readonly logger = new Logger(NonScheduledBookingService.name);
  constructor(
    @InjectModel(NonScheduledBooking.name)
    private readonly bookingModel: Model<NonScheduledBookingDocument>,
    @InjectModel(FlightSerialCounter.name)
    private readonly counterModel: Model<FlightSerialCounterDocument>,
    private readonly mainDetailsService: MainDetailsService,
    private readonly nsFhrCollectionService: NsFhrCollectionService,
    @InjectModel(TerminalDetails.name)
    private readonly terminalModel: Model<TerminalDetails>,
    @InjectModel(RampDetails1.name)
    private readonly rampModel: Model<RampDetails1>,
    @InjectModel(EquipmentManpower.name)
    private readonly equipmentModel: Model<EquipmentManpower>,
    @InjectModel(NsFhrCollection.name)
    private readonly nsFhrModel: Model<NsFhrCollection>,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  private trim(value: string | undefined | null, fallback = ''): string {
    const v = String(value ?? '').trim();
    return v.length ? v : fallback;
  }

  /** Allocate next unique per-flight document serial (1, 2, 3, …). */
  private async nextDocumentSerial(): Promise<number> {
    const counterDoc = await this.counterModel.findOneAndUpdate(
      { key: NS_BOOKING_SERIAL_COUNTER_KEY },
      {
        $setOnInsert: { key: NS_BOOKING_SERIAL_COUNTER_KEY },
        $inc: { seq: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const seq = Number(counterDoc?.seq ?? 0);
    if (!Number.isFinite(seq) || seq <= 0) {
      throw new BadRequestException('Failed to allocate booking serial.');
    }
    if (seq > 899999) {
      throw new BadRequestException('Booking serial limit reached.');
    }
    return seq;
  }

  /**
   * Allocate the four-digit identity shared by the non-scheduled table, forms,
   * FHR collection, and report PDFs. Existing legacy six-digit identities stay
   * unchanged; this counter only serves new or previously unassigned flights.
   */
  private async nextFlightSerialNo(): Promise<number> {
    const existingCounter = await this.counterModel
      .findOne({ key: NS_FHR_SERIAL_COUNTER_KEY })
      .lean()
      .exec();

    if (!existingCounter) {
      const [highestFourDigit, highestDocument] = await Promise.all([
        this.bookingModel
          .findOne({
            flightSerialNo: {
              $gte: NS_FHR_SERIAL_MIN,
              $lte: NS_FHR_SERIAL_MAX,
            },
          })
          .sort({ flightSerialNo: -1 })
          .select({ flightSerialNo: 1 })
          .lean()
          .exec(),
        this.bookingModel
          .findOne({
            documentSerial: {
              $gte: 1,
              $lte: NS_FHR_SERIAL_MAX,
            },
          })
          .sort({ documentSerial: -1 })
          .select({ documentSerial: 1 })
          .lean()
          .exec(),
      ]);
      const seed = Math.max(
        NS_FHR_SERIAL_MIN - 1,
        Number(highestFourDigit?.flightSerialNo ?? 0),
        Number(highestDocument?.documentSerial ?? 0),
      );
      try {
        await this.counterModel.updateOne(
          { key: NS_FHR_SERIAL_COUNTER_KEY },
          {
            $setOnInsert: {
              key: NS_FHR_SERIAL_COUNTER_KEY,
              seq: seed,
            },
          },
          { upsert: true },
        );
      } catch (error) {
        const duplicateKey =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          Number((error as { code?: number }).code) === 11000;
        if (!duplicateKey) throw error;
      }
    }

    while (true) {
      const counterDoc = await this.counterModel.findOneAndUpdate(
        { key: NS_FHR_SERIAL_COUNTER_KEY },
        { $inc: { seq: 1 } },
        { new: true },
      );
      const candidate = Number(counterDoc?.seq ?? 0);
      if (
        !Number.isInteger(candidate) ||
        candidate < NS_FHR_SERIAL_MIN ||
        candidate > NS_FHR_SERIAL_MAX
      ) {
        throw new BadRequestException(
          'Four-digit non-scheduled Serial/FHR number limit reached.',
        );
      }

      // findBySerial throws NotFoundException when no flight owns the serial —
      // that free serial is exactly what a new booking should claim.
      let occupied: unknown = null;
      try {
        occupied = await this.mainDetailsService.findBySerial(
          candidate,
          CROSS_STATION_SYSTEM_SCOPE,
        );
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
        occupied = null;
      }
      if (!occupied) return candidate;
    }
  }

  private mapCreateDto(
    dto: CreateNonScheduledBookingDto,
    opts: {
      bookingNo: string;
      bookingKey: string;
      documentSerial: number;
      flightSerialNo: number;
      stationCode: string;
    },
  ): Partial<NonScheduledBooking> {
    const channel = dto.channel as BookingChannel;
    const advance = dto.advance === 'yes' ? 'yes' : 'no';
    return {
      bookingNo: opts.bookingNo,
      bookingKey: opts.bookingKey,
      documentSerial: opts.documentSerial,
      flightSerialNo: opts.flightSerialNo,
      channel,
      operator: this.trim(dto.operator),
      mailReceivedFrom:
        channel === 'mail' ? this.trim(dto.mailReceivedFrom) : '',
      mailReceivedBy: channel === 'mail' ? this.trim(dto.mailReceivedBy) : '',
      mailSubject: channel === 'mail' ? this.trim(dto.mailSubject) : '',
      bookingDate: this.trim(dto.bookingDate),
      airlineBillTo: this.trim(dto.airlineBillTo),
      companyName: this.trim(dto.companyName),
      airlineCode: this.trim(dto.airlineCode).toUpperCase(),
      flightNo: this.trim(dto.flightNo).toUpperCase(),
      registrationNo: this.trim(dto.registrationNo).toUpperCase(),
      routing: this.trim(dto.routing).toUpperCase(),
      staDate: this.trim(dto.staDate),
      staTime: this.trim(dto.staTime, '00:00'),
      stdDate: this.trim(dto.stdDate),
      stdTime: this.trim(dto.stdTime, '00:00'),
      aircraftType: this.trim(dto.aircraftType),
      aircraftBody: dto.aircraftBody === 'WB' ? 'WB' : 'NB',
      mtow: this.trim(dto.mtow, '0'),
      terminalCode: this.trim(dto.terminalCode).toUpperCase(),
      opsType: this.trim(dto.opsType),
      categoryOfFlight: this.trim(dto.categoryOfFlight),
      flightType: FLIGHT_TYPE_FIXED,
      serviceType: SERVICE_TYPE_FIXED,
      advance,
      amount: advance === 'yes' ? this.trim(dto.amount, '0') : '0',
      attachmentName: this.trim(dto.attachmentName),
      status: 'booking_created' as BookingStatus,
      challanNo: '',
      passengers: [],
      stationCode: opts.stationCode,
    };
  }

  async create(
    dto: CreateNonScheduledBookingDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const stationCode = this.stampStationCode(station);
    const documentSerial = await this.nextDocumentSerial();
    const flightSerialNo = await this.nextFlightSerialNo();
    const airlineCode = this.trim(dto.airlineCode).toUpperCase();
    const flightNo = this.trim(dto.flightNo).toUpperCase();
    const bookingDate = this.trim(dto.bookingDate);
    if (!bookingDate) {
      throw new BadRequestException('Booking date is required.');
    }
    if (!airlineCode) {
      throw new BadRequestException('Airline code is required.');
    }
    if (!flightNo) {
      throw new BadRequestException('Flight no is required.');
    }
    const bookingNo = formatNsDocumentNo({
      stationCode,
      kind: 'BKG',
      serial: documentSerial,
      bookingDate,
      airlineCode,
      flightNo,
    });
    const bookingKey = toNsBookingKey(bookingNo);

    const doc = new this.bookingModel(
      this.mapCreateDto(dto, {
        bookingNo,
        bookingKey,
        documentSerial,
        flightSerialNo,
        stationCode,
      }),
    );
    return doc.save();
  }

  /** Parse FRIS date strings to YYYYMMDD for range compare. */
  private static bookingDateToKey(raw: string | undefined | null): number | null {
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

  async findAll(
    opts: {
      filter?: string;
      channel?: string;
      status?: string;
      pendingChallan?: boolean;
      /** Only rows that already have a challan number (airline table source). */
      withChallan?: boolean;
      challanNo?: string;
      challanDate?: string;
      bookingDateFrom?: string;
      bookingDateTo?: string;
      flightNo?: string;
      bookingNo?: string;
      flightReady?: boolean;
    } = {},
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const query: Record<string, unknown> = {};

    if (opts.channel === 'mail' || opts.channel === 'direct') {
      query.channel = opts.channel;
    }
    if (opts.status?.trim()) {
      query.status = opts.status.trim();
    }
    if (opts.pendingChallan) {
      query.$or = [
        { challanNo: { $in: [null, ''] } },
        { status: { $in: ['booking_created', 'challan_pending'] } },
      ];
    }
    if (opts.withChallan) {
      query.challanNo = { $nin: [null, ''] };
    }
    if (opts.flightReady) {
      query.status = { $in: ['passengers_added', 'flight_ready'] };
      query.challanNo = { $nin: [null, ''] };
    }
    if (opts.challanDate?.trim()) {
      query.challanDate = opts.challanDate.trim();
    }
    if (opts.flightNo?.trim()) {
      query.flightNo = new RegExp(escapeRegex(opts.flightNo.trim()), 'i');
    }

    /** Match slash and underscore forms of document numbers. */
    const docNoVariants = (raw: string): string[] => {
      const t = raw.trim();
      if (!t) return [];
      return [...new Set([t, t.replace(/\//g, '_'), t.replace(/_/g, '/')])];
    };

    const andClauses: Record<string, unknown>[] = [];

    if (opts.challanNo?.trim()) {
      andClauses.push({
        $or: docNoVariants(opts.challanNo).map((v) => ({
          challanNo: new RegExp(escapeRegex(v), 'i'),
        })),
      });
    }
    if (opts.bookingNo?.trim()) {
      andClauses.push({
        $or: docNoVariants(opts.bookingNo).flatMap((v) => [
          { bookingNo: new RegExp(escapeRegex(v), 'i') },
          { bookingKey: new RegExp(escapeRegex(toNsBookingKey(v)), 'i') },
        ]),
      });
    }
    if (opts.filter?.trim()) {
      const textOr: Record<string, RegExp>[] = [];
      for (const v of docNoVariants(opts.filter)) {
        const regex = new RegExp(escapeRegex(v), 'i');
        textOr.push(
          { bookingNo: regex },
          { bookingKey: regex },
          { challanNo: regex },
          { flightNo: regex },
          { airlineBillTo: regex },
          { airlineCode: regex },
          { operator: regex },
          { registrationNo: regex },
        );
      }
      andClauses.push({ $or: textOr });
    }

    if (query.$or) {
      andClauses.unshift({ $or: query.$or as unknown[] });
      delete query.$or;
    }
    if (andClauses.length === 1) {
      Object.assign(query, andClauses[0]);
    } else if (andClauses.length > 1) {
      query.$and = andClauses;
    }

    let rows = await this.bookingModel
      .find(StationScope.filter(query, station))
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const fromKey = NonScheduledBookingService.bookingDateToKey(
      opts.bookingDateFrom,
    );
    const toKey = NonScheduledBookingService.bookingDateToKey(
      opts.bookingDateTo,
    );
    if (fromKey != null || toKey != null) {
      rows = rows.filter((doc) => {
        const key = NonScheduledBookingService.bookingDateToKey(
          String(doc.bookingDate ?? ''),
        );
        if (key == null) return false;
        if (fromKey != null && key < fromKey) return false;
        if (toKey != null && key > toKey) return false;
        return true;
      });
    }

    return rows;
  }

  /**
   * Remove a booking. If already promoted to Non-Scheduled Airlines (challan
   * saved / flight ready), also drop the mainDetails row.
   */
  async remove(
    bookingNoRaw: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.findByBookingNo(bookingNoRaw, station);

    const serial = Number(existing.flightSerialNo);
    if (
      Number.isFinite(serial) &&
      serial > 0 &&
      (existing.challanNo?.trim() || existing.status === 'flight_ready')
    ) {
      await this.mainDetailsService.deleteBySerial(serial, station);
    }

    await this.bookingModel.deleteOne({ _id: existing._id }).exec();
    return { deleted: true, bookingNo: existing.bookingNo };
  }

  async findByBookingNo(
    bookingNoRaw: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const bookingNo = normalizeBookingNo(bookingNoRaw);
    if (!bookingNo) {
      throw new BadRequestException('bookingNo is required');
    }
    const bookingKey = toNsBookingKey(bookingNo);
    const doc = await this.bookingModel
      .findOne(
        StationScope.filter(
          {
            $or: [{ bookingNo }, { bookingKey }],
          },
          station,
        ),
      )
      .exec();
    if (!doc) {
      throw new NotFoundException(`Booking ${bookingNo} not found`);
    }
    return doc;
  }

  async findByChallanNo(
    challanNoRaw: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const challanNo = this.trim(challanNoRaw).toUpperCase();
    if (!challanNo) {
      throw new BadRequestException('challanNo is required');
    }
    const doc = await this.bookingModel
      .findOne(
        StationScope.filter(
          {
            challanNo: new RegExp(`^${escapeRegex(challanNo)}$`, 'i'),
          },
          station,
        ),
      )
      .exec();
    if (!doc) {
      throw new NotFoundException(`Challan ${challanNo} not found`);
    }
    return doc;
  }

  async update(
    bookingNoRaw: string,
    dto: UpdateNonScheduledBookingDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.findByBookingNo(bookingNoRaw, station);
    if (existing.status === 'cancelled') {
      throw new BadRequestException('Cancelled booking cannot be updated.');
    }

    const patch: Record<string, unknown> = {};
    const setIf = (
      key: keyof UpdateNonScheduledBookingDto,
      transform?: (v: string) => string,
    ) => {
      const raw = dto[key];
      if (raw === undefined) return;
      const value = transform ? transform(String(raw)) : this.trim(String(raw));
      patch[key] = value;
    };

    setIf('operator');
    setIf('mailReceivedFrom');
    setIf('mailReceivedBy');
    setIf('mailSubject');
    setIf('bookingDate');
    setIf('airlineBillTo');
    setIf('companyName');
    setIf('airlineCode', (v) => this.trim(v).toUpperCase());
    setIf('flightNo', (v) => this.trim(v).toUpperCase());
    setIf('registrationNo', (v) => this.trim(v).toUpperCase());
    setIf('routing', (v) => this.trim(v).toUpperCase());
    setIf('staDate');
    setIf('staTime');
    setIf('stdDate');
    setIf('stdTime');
    setIf('aircraftType');
    if (dto.aircraftBody !== undefined) {
      patch.aircraftBody = dto.aircraftBody === 'WB' ? 'WB' : 'NB';
    }
    setIf('mtow');
    setIf('terminalCode', (v) => this.trim(v).toUpperCase());
    setIf('opsType');
    setIf('categoryOfFlight');
    if (dto.advance !== undefined) {
      patch.advance = dto.advance === 'yes' ? 'yes' : 'no';
      if (patch.advance === 'no') patch.amount = '0';
    }
    if (
      dto.amount !== undefined &&
      (patch.advance ?? existing.advance) === 'yes'
    ) {
      patch.amount = this.trim(dto.amount, '0');
    }
    setIf('attachmentName');

    // Rebuild bookingNo only before challan — keep BKG/CLN numbers stable after.
    if (!existing.challanNo?.trim()) {
      const nextAirline = String(
        patch.airlineCode ?? existing.airlineCode ?? '',
      ).toUpperCase();
      const nextFlight = String(
        patch.flightNo ?? existing.flightNo ?? '',
      ).toUpperCase();
      const nextDate = String(patch.bookingDate ?? existing.bookingDate ?? '');
      if (
        patch.airlineCode !== undefined ||
        patch.flightNo !== undefined ||
        patch.bookingDate !== undefined
      ) {
        const bookingNo = formatNsDocumentNo({
          stationCode: existing.stationCode || this.stampStationCode(station),
          kind: 'BKG',
          serial: existing.documentSerial,
          bookingDate: nextDate,
          airlineCode: nextAirline,
          flightNo: nextFlight,
        });
        patch.bookingNo = bookingNo;
        patch.bookingKey = toNsBookingKey(bookingNo);
      }
    }

    const updated = await this.bookingModel
      .findByIdAndUpdate(existing._id, { $set: patch }, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Booking ${existing.bookingNo} not found`);
    }

    // Keep NS airlines row in sync when booking details change after challan.
    // A flight-row sync problem must not fail the booking save itself.
    if (updated.challanNo?.trim()) {
      try {
        await this.promoteToMainDetails(updated, station, {
          syncSchedule: true,
        });
        await this.syncBookingOntoFlightCopies(updated, station);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Booking ${updated.bookingNo} saved, flight STD sync failed: ${message}`,
        );
      }
    }

    return updated;
  }

  /**
   * Saves challan form fields and allocates a unique challan number:
   * `{station}/CLN/{serial}/{DD-MM-YYYY}/{airlineCode}/{flightNo}`
   *
   * Challan date is always the booking date (same calendar day as booking).
   */
  async saveChallan(
    bookingNoRaw: string,
    dto: SaveChallanDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.findByBookingNo(bookingNoRaw, station);
    if (existing.status === 'cancelled') {
      throw new BadRequestException('Cancelled booking cannot get a challan.');
    }

    const stationCode =
      existing.stationCode || this.stampStationCode(station);
    let documentSerial = Number(existing.documentSerial);
    if (!Number.isFinite(documentSerial) || documentSerial <= 0) {
      documentSerial = await this.nextDocumentSerial();
    }

    const airlineCode = this.trim(existing.airlineCode).toUpperCase();
    const flightNo = this.trim(existing.flightNo).toUpperCase();
    const bookingDate = this.trim(existing.bookingDate);
    if (!bookingDate) {
      throw new BadRequestException(
        'Booking date is required before generating challan.',
      );
    }
    if (!airlineCode || !flightNo) {
      throw new BadRequestException(
        'Airline code and flight no are required before generating challan.',
      );
    }

    // Challan date = booking date (source of truth; ignore client override).
    const challanDate = bookingDate;

    const challanNo =
      existing.challanNo?.trim() ||
      formatNsDocumentNo({
        stationCode,
        kind: 'CLN',
        serial: documentSerial,
        bookingDate,
        airlineCode,
        flightNo,
      });

    const bookingKey =
      existing.bookingKey?.trim() || toNsBookingKey(existing.bookingNo);
    const existingFlightSerial = Number(existing.flightSerialNo);
    const flightSerialNo =
      Number.isInteger(existingFlightSerial) && existingFlightSerial > 0
        ? existingFlightSerial
        : await this.nextFlightSerialNo();

    const patch: Record<string, unknown> = {
      challanNo,
      documentSerial,
      flightSerialNo,
      bookingKey,
      challanDate,
      bayNo: this.trim(dto.bayNo),
      noOfFerryIssued: this.trim(dto.noOfFerryIssued),
      noOfPax: this.trim(dto.noOfPax),
      ghRepresentative: this.trim(dto.ghRepresentative),
      airlineRepresentative: this.trim(dto.airlineRepresentative),
      remarks: this.trim(dto.remarks),
      status: 'challan_generated' as BookingStatus,
    };

    const updated = await this.bookingModel
      .findByIdAndUpdate(existing._id, { $set: patch }, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Booking ${existing.bookingNo} not found`);
    }

    // Booking + challan ready → appear on Non-Scheduled Airlines (Open flow).
    await this.promoteToMainDetails(updated, station);
    return updated;
  }

  /**
   * Persist passenger names. Re-upserts mainDetails (already promoted on challan).
   */
  async savePassengers(
    bookingNoRaw: string,
    dto: SavePassengersDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const existing = await this.findByBookingNo(bookingNoRaw, station);
    if (existing.status === 'cancelled') {
      throw new BadRequestException(
        'Cancelled booking cannot receive passengers.',
      );
    }
    if (!existing.challanNo?.trim()) {
      throw new BadRequestException(
        'Save challan before adding passengers.',
      );
    }

    const incoming = (dto.passengers ?? [])
      .map((p) => this.trim(p?.name))
      .filter(Boolean)
      .map((name) => ({
        name,
        addedAt: new Date().toISOString(),
      }));

    if (incoming.length === 0) {
      throw new BadRequestException('At least one passenger name is required.');
    }

    const passengers = dto.append
      ? [...(existing.passengers ?? []), ...incoming]
      : incoming;

    const patch: Record<string, unknown> = {
      passengers,
      noOfPax: String(passengers.length),
      status: 'flight_ready' as BookingStatus,
    };

    const updated = await this.bookingModel
      .findByIdAndUpdate(existing._id, { $set: patch }, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Booking ${existing.bookingNo} not found`);
    }

    await this.promoteToMainDetails(updated, station);
    return updated;
  }

  /** Keep dd/MM/yyyy or yyyy-MM-dd shape of the field being overwritten. */
  private formatLikeStoredDate(sample: string, key: number): string {
    const raw = String(key).padStart(8, '0');
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    if (/^\d{4}-\d{2}-\d{2}/.test(sample)) return `${y}-${m}-${d}`;
    if (sample.includes('-') && !sample.includes('/')) return `${d}-${m}-${y}`;
    return `${d}/${m}/${y}`;
  }

  /**
   * Booking details are the source for the non-scheduled table, Open form,
   * and FHR / GSE / Team report headers.
   */
  private async syncBookingOntoFlightCopies(
    booking: NonScheduledBookingDocument,
    station: StationScopeContext,
  ) {
    const serial = Number(booking.flightSerialNo);
    if (!Number.isFinite(serial) || serial <= 0) return;

    const flightNo = this.trim(booking.flightNo).toUpperCase();
    const airline = this.trim(booking.airlineBillTo);
    const route = this.trim(booking.routing).toUpperCase();
    const aircraft = this.trim(booking.aircraftType);
    const ops = this.trim(booking.opsType) || 'Non-Scheduled';
    const category = this.trim(booking.categoryOfFlight);
    const regn = this.trim(booking.registrationNo).toUpperCase();
    const terminal = this.trim(booking.terminalCode).toUpperCase();
    const staDate = this.trim(booking.staDate);
    const staTime = this.trim(booking.staTime, '00:00');
    const stdDate = this.trim(booking.stdDate);
    const stdTime = this.trim(booking.stdTime, '00:00');
    const nextStdKey = NonScheduledBookingService.bookingDateToKey(stdDate);
    const nextStaKey = NonScheduledBookingService.bookingDateToKey(staDate);

    const ns = await this.nsFhrModel.findOne({ SerialNo: serial }).exec();
    const main = (ns?.mainDetails ?? {}) as Record<string, unknown>;
    const term = (ns?.terminalDetails ?? {}) as Record<string, unknown>;
    const ramp = (ns?.rampDetails1 ?? {}) as Record<string, unknown>;
    const oldStdKey =
      NonScheduledBookingService.bookingDateToKey(String(main.etdDate ?? '')) ??
      NonScheduledBookingService.bookingDateToKey(String(main.STDDate ?? '')) ??
      NonScheduledBookingService.bookingDateToKey(String(term.STDDate ?? '')) ??
      NonScheduledBookingService.bookingDateToKey(String(ramp.STDDate ?? ''));
    const oldStaKey =
      NonScheduledBookingService.bookingDateToKey(String(main.STADate ?? '')) ??
      NonScheduledBookingService.bookingDateToKey(String(main.IPosDate ?? '')) ??
      NonScheduledBookingService.bookingDateToKey(String(term.STADate ?? '')) ??
      NonScheduledBookingService.bookingDateToKey(String(ramp.STADate ?? ''));

    const asStored = (current: unknown, nextKey: number | null, bookingText: string) => {
      if (nextKey == null) return bookingText;
      const text = String(current ?? '').trim();
      return text ? this.formatLikeStoredDate(text, nextKey) : bookingText;
    };
    const shiftIfPlanned = (
      current: unknown,
      oldKey: number | null,
      nextKey: number | null,
      bookingText: string,
    ) => {
      if (nextKey == null) return String(current ?? '');
      const text = String(current ?? '').trim();
      const currentKey = NonScheduledBookingService.bookingDateToKey(text);
      if (!text || oldKey == null || currentKey == null || currentKey !== oldKey) {
        return text;
      }
      return this.formatLikeStoredDate(text, nextKey);
    };

    const identity = {
      Airline: airline,
      CompanyName: this.trim(booking.companyName),
      operator: this.trim(booking.operator),
      Arline_Code: this.trim(booking.airlineCode).toUpperCase(),
      ArrivalFltNo: flightNo,
      DepartureFltNo: flightNo,
      FlightNo: flightNo,
      Regn: regn,
      Route: route,
      Routing: route,
      Terminal: terminal,
      TypeCraft: aircraft,
      TypeofHandling: ops,
      Typeofflight: ops,
      Cate_of_Flight: category,
      STADate: staDate,
      STATime: staTime,
      IPosDate: staDate,
      IPosTime: staTime,
      STDDate: stdDate,
      STDTime: stdTime,
      etdDate: stdDate,
      ETDtime: stdTime,
    };

    const atdKey = NonScheduledBookingService.bookingDateToKey(String(main.ATDDate ?? ''));
    const atdStillPlanned = atdKey == null || oldStdKey == null || atdKey === oldStdKey;
    await this.mainDetailsService.syncPlannedStdFromBooking(
      serial,
      { stdDate, stdTime },
      station,
    );
    await this.mainDetailsService.updateBySerial(
      serial,
      {
        ...identity,
        ...(atdStillPlanned ? { ATDDate: stdDate, ATDTime: stdTime } : {}),
      } as Parameters<MainDetailsService['updateBySerial']>[1],
      station,
    );

    const header = {
      airlinesOperator: airline,
      Airline: airline,
      FlightNo: flightNo,
      flightNo,
      routing: route,
      Route: route,
      TypeCraft: aircraft,
      Typeofflight: ops,
      STADate: asStored(term.STADate, nextStaKey, staDate),
      STATime: staTime,
      STDDate: asStored(term.STDDate, nextStdKey, stdDate),
      STDTime: stdTime,
    };
    const rampPatch = {
      ...header,
      STADate: asStored(ramp.STADate, nextStaKey, staDate),
      STDDate: asStored(ramp.STDDate, nextStdKey, stdDate),
      etdDate: asStored(ramp.etdDate, nextStdKey, stdDate),
    };

    if (ns) {
      const equipment = {
        ...((ns.equipmentManpower ?? {}) as Record<string, unknown>),
      };
      equipment.flightNo = flightNo;
      equipment.airlinesOperator = airline;
      equipment.std = stdTime;
      equipment.sta = staTime;
      equipment.stdDate = asStored(equipment.stdDate, nextStdKey, stdDate);
      equipment.staDate = asStored(equipment.staDate, nextStaKey, staDate);
      if (Array.isArray(equipment.entries)) {
        equipment.entries = equipment.entries.map((entry) => {
          if (!entry || typeof entry !== 'object') return entry;
          const row = { ...(entry as Record<string, unknown>) };
          row.fromDate = shiftIfPlanned(row.fromDate, oldStdKey, nextStdKey, stdDate);
          row.toDate = shiftIfPlanned(row.toDate, oldStdKey, nextStdKey, stdDate);
          return row;
        });
      }
      await this.nsFhrModel.updateOne(
        { _id: ns._id },
        {
          $set: {
            mainDetails: { ...main, ...identity },
            terminalDetails: { ...term, ...header },
            rampDetails1: { ...ramp, ...rampPatch },
            equipmentManpower: equipment,
            ...(staDate ? { staDates: [staDate] } : {}),
          } as Record<string, unknown>,
        },
      );
    }

    const serialFilter = { $or: [{ serialNo: serial }, { SerialNo: serial }] };
    await this.terminalModel.updateMany(serialFilter, { $set: header });
    await this.rampModel.updateMany(serialFilter, { $set: rampPatch });
    const equipmentRows = await this.equipmentModel.find(serialFilter).exec();
    for (const row of equipmentRows) {
      const doc = row as unknown as {
        stdDate?: string;
        staDate?: string;
        entries?: Array<Record<string, unknown>>;
        flightNo?: string;
        airlinesOperator?: string;
        std?: string;
        sta?: string;
        save: () => Promise<unknown>;
      };
      doc.flightNo = flightNo;
      doc.airlinesOperator = airline;
      doc.std = stdTime;
      doc.sta = staTime;
      doc.stdDate = asStored(doc.stdDate, nextStdKey, stdDate);
      doc.staDate = asStored(doc.staDate, nextStaKey, staDate);
      if (Array.isArray(doc.entries)) {
        for (const entry of doc.entries) {
          entry.fromDate = shiftIfPlanned(entry.fromDate, oldStdKey, nextStdKey, stdDate);
          entry.toDate = shiftIfPlanned(entry.toDate, oldStdKey, nextStdKey, stdDate);
        }
      }
      await doc.save();
    }
  }

  /**
   * Seed mainDetails for Open/FHR without wiping saved form fields.
   * Uses insert-only seed + bookingNo/challanNo refresh (see MainDetailsService.ensureBookingSeedBySerial).
   * Previous upsertBySerial on every list load reset ATA/ATD/etc. to booking STA/STD.
   */
  private async promoteToMainDetails(
    booking: NonScheduledBookingDocument,
    station: StationScopeContext,
    opts: { syncSchedule?: boolean } = {},
  ) {
    const serial = Number(booking.flightSerialNo);
    if (!Number.isFinite(serial) || serial <= 0) {
      throw new BadRequestException('Invalid flight serial for promotion.');
    }

    const flightNo = this.trim(booking.flightNo).toUpperCase();
    const staDate = this.trim(booking.staDate);
    const staTime = this.trim(booking.staTime, '00:00');
    const stdDate = this.trim(booking.stdDate);
    const stdTime = this.trim(booking.stdTime, '00:00');
    await this.mainDetailsService.ensureBookingSeedBySerial(
      serial,
      {
        Airline: this.trim(booking.airlineBillTo),
        CompanyName: this.trim(booking.companyName),
        operator: this.trim(booking.operator),
        Arline_Code: this.trim(booking.airlineCode).toUpperCase(),
        ArrivalFltNo: flightNo,
        DepartureFltNo: flightNo,
        // Do not seed ATA from STA — NS Open has no ATA fields; schedule lives in STA/IPOS/ETD.
        ATADate: '',
        ATATime: '',
        ATDDate: stdDate,
        ATDTime: stdTime,
        STDDate: stdDate,
        STDTime: stdTime,
        STADate: staDate,
        STATime: staTime,
        // STA lives in IPosDate for NS booking seed (DTO has no STADate); ns_fhr indexes IPosDate.
        IPosDate: staDate,
        IPosTime: staTime,
        etdDate: stdDate,
        ETDtime: stdTime,
        Regn: this.trim(booking.registrationNo).toUpperCase(),
        Terminal: this.trim(booking.terminalCode).toUpperCase(),
        Route: this.trim(booking.routing).toUpperCase(),
        Typeofflight: FLIGHT_TYPE_FIXED,
        TypeofHandling: this.trim(booking.opsType) || FLIGHT_TYPE_FIXED,
        Cate_of_Flight: this.trim(booking.categoryOfFlight),
        TypeCraft: this.trim(booking.aircraftType),
        aircraftBody: booking.aircraftBody === 'WB' ? 'WB' : 'NB',
        MTOW: this.trim(booking.mtow, '0'),
        bookingNo: booking.bookingNo,
        challanNo: booking.challanNo,
      },
      station,
    );
    if (opts.syncSchedule) {
      await this.mainDetailsService.syncPlannedStdFromBooking(
        serial,
        { stdDate, stdTime },
        station,
      );
    }
  }

  private bookingToAirlineRow(
    doc: NonScheduledBookingDocument,
    serial: number,
    challanNo: string,
  ): Record<string, unknown> {
    const airline = String(doc.airlineBillTo ?? '').trim();
    const flightNo = String(doc.flightNo ?? '').trim().toUpperCase();
    return {
      SerialNo: Number.isFinite(serial) && serial > 0 ? serial : 0,
      flightSerialNumber: Number.isFinite(serial) && serial > 0 ? serial : 0,
      ArrivalFltNo: flightNo,
      DepartureFltNo: flightNo,
      Airline: airline,
      operator: String(doc.operator ?? '').trim(),
      Arline_Code: String(doc.airlineCode ?? '').trim().toUpperCase(),
      TypeCraft: String(doc.aircraftType ?? '').trim(),
      Route: String(doc.routing ?? '').trim().toUpperCase(),
      Routing: String(doc.routing ?? '').trim().toUpperCase(),
      routing: String(doc.routing ?? '').trim().toUpperCase(),
      route: String(doc.routing ?? '').trim().toUpperCase(),
      Typeofflight: FLIGHT_TYPE_FIXED,
      TypeofHandling: String(doc.opsType ?? '').trim() || FLIGHT_TYPE_FIXED,
      ATADate: '',
      ATATime: '',
      ATDDate: String(doc.stdDate ?? '').trim(),
      ATDTime: String(doc.stdTime ?? '').trim(),
      STADate: String(doc.staDate ?? '').trim(),
      STATime: String(doc.staTime ?? '').trim(),
      STDDate: String(doc.stdDate ?? '').trim(),
      STDTime: String(doc.stdTime ?? '').trim(),
      bookingNo: String(doc.bookingNo ?? '').trim(),
      challanNo,
      bookingKey: String(doc.bookingKey ?? '').trim(),
      Regn: String(doc.registrationNo ?? '').trim(),
      Terminal: String(doc.terminalCode ?? '').trim(),
      Cate_of_Flight: String(doc.categoryOfFlight ?? '').trim(),
      MTOW: String(doc.mtow ?? '').trim(),
      aircraftBody: String(doc.aircraftBody ?? '').trim(),
      exportedNAV: 'No',
      flightStatus: 'Open',
      hasMainDetails: false,
      hasTerminalDetails: false,
      hasRampDetails: false,
      hasLoadControlDetails: false,
      isCancelled: false,
      stationCode: String(doc.stationCode ?? '').trim(),
    };
  }

  /**
   * Station-scoped challan bookings → airline table rows (IXC / any station).
   * Filter first, then batch-promote missing FHR/main seeds (avoids N+1 on full station).
   */
  private async listBookingAirlineRows(
    opts: {
      serialNo?: string;
      challanNo?: string;
      bookingNo?: string;
      airline?: string;
      fromDate?: string;
      tillDate?: string;
    },
    station: StationScopeContext,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.findAll(
      {
        withChallan: true,
        challanNo: opts.challanNo,
        bookingNo: opts.bookingNo,
      },
      station,
    );

    const serialQ = opts.serialNo?.trim().toLowerCase() ?? '';
    const airlineQ = opts.airline?.trim().toLowerCase() ?? '';
    const fromKey = NonScheduledBookingService.bookingDateToKey(opts.fromDate);
    const toKey = NonScheduledBookingService.bookingDateToKey(opts.tillDate);

    type Candidate = {
      doc: NonScheduledBookingDocument;
      serial: number;
      challanNo: string;
    };
    const candidates: Candidate[] = [];

    for (const doc of rows) {
      const challanNo = String(doc.challanNo ?? '').trim();
      if (!challanNo) continue;

      let serial = Number(doc.flightSerialNo);
      if (!Number.isFinite(serial) || serial <= 0) {
        const documentSerial = Number(doc.documentSerial);
        if (Number.isFinite(documentSerial) && documentSerial > 0) {
          serial = await this.nextFlightSerialNo();
          await this.bookingModel
            .updateOne({ _id: doc._id }, { $set: { flightSerialNo: serial } })
            .exec();
          (doc as { flightSerialNo?: number }).flightSerialNo = serial;
        }
      }

      if (serialQ) {
        if (!Number.isFinite(serial) || !String(serial).includes(serialQ)) {
          continue;
        }
      }

      const airline = String(doc.airlineBillTo ?? '').trim();
      if (
        airlineQ &&
        airlineQ !== 'all' &&
        !airline.toLowerCase().includes(airlineQ)
      ) {
        continue;
      }

      const dateKey =
        NonScheduledBookingService.bookingDateToKey(String(doc.staDate ?? '')) ??
        NonScheduledBookingService.bookingDateToKey(
          String(doc.bookingDate ?? ''),
        );
      if (fromKey != null && (dateKey == null || dateKey < fromKey)) continue;
      if (toKey != null && (dateKey == null || dateKey > toKey)) continue;

      candidates.push({
        doc: doc as NonScheduledBookingDocument,
        serial,
        challanNo,
      });
    }

    const serialsNeedingCheck = candidates
      .map((c) => c.serial)
      .filter((n) => Number.isFinite(n) && n > 0);

    if (serialsNeedingCheck.length > 0) {
      const [mainExisting, nsExisting] = await Promise.all([
        this.mainDetailsService.existingSerialsInCollection(
          serialsNeedingCheck,
          station,
        ),
        this.nsFhrCollectionService.existingSerials(
          serialsNeedingCheck,
          station,
        ),
      ]);

      const toPromote = candidates.filter(
        (c) =>
          Number.isFinite(c.serial) &&
          c.serial > 0 &&
          (!mainExisting.has(c.serial) || !nsExisting.has(c.serial)),
      );

      // Cap concurrency so large date windows don't stampede Mongo.
      const PROMOTE_CONCURRENCY = 8;
      for (let i = 0; i < toPromote.length; i += PROMOTE_CONCURRENCY) {
        const chunk = toPromote.slice(i, i + PROMOTE_CONCURRENCY);
        await Promise.all(
          chunk.map(async (c) => {
            try {
              await this.promoteToMainDetails(c.doc, station);
            } catch {
              // Still list the booking row so the table is not empty.
            }
          }),
        );
      }
    }

    return candidates.map((c) =>
      this.bookingToAirlineRow(c.doc, c.serial, c.challanNo),
    );
  }

  /**
   * Booking STD is source for the airlines table, Open, and reports.
   * Rewrite stored STD/ETD (and ATD only if it still equals the old plan) when they differ.
   */
  private async alignStoredStdWithBookings(
    bookingBySerial: Map<number, Record<string, unknown>>,
    shownBySerial: Map<number, Record<string, unknown>>,
    station: StationScopeContext,
  ) {
    const mismatches: Array<{ serial: number; stdDate: string; stdTime: string }> =
      [];
    for (const [serial, booking] of bookingBySerial) {
      const shown = shownBySerial.get(serial);
      if (!shown || shown === booking) continue;
      const bookingStd = String(booking.STDDate ?? '').trim();
      const bookingKey = NonScheduledBookingService.bookingDateToKey(bookingStd);
      const shownKey =
        NonScheduledBookingService.bookingDateToKey(String(shown.STDDate ?? '')) ??
        NonScheduledBookingService.bookingDateToKey(String(shown.etdDate ?? '')) ??
        NonScheduledBookingService.bookingDateToKey(String(shown.ATDDate ?? ''));
      if (bookingKey == null || bookingKey === shownKey) continue;
      mismatches.push({
        serial,
        stdDate: bookingStd,
        stdTime: String(booking.STDTime ?? '').trim() || '00:00',
      });
    }

    const CONCURRENCY = 8;
    for (let i = 0; i < mismatches.length; i += CONCURRENCY) {
      const chunk = mismatches.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (item) => {
          try {
            await this.mainDetailsService.syncPlannedStdFromBooking(
              item.serial,
              { stdDate: item.stdDate, stdTime: item.stdTime },
              station,
            );
            const shown = shownBySerial.get(item.serial);
            if (!shown) return;
            const previousStdKey =
              NonScheduledBookingService.bookingDateToKey(
                String(shown.STDDate ?? ''),
              ) ??
              NonScheduledBookingService.bookingDateToKey(
                String(shown.etdDate ?? ''),
              );
            const atdKey = NonScheduledBookingService.bookingDateToKey(
              String(shown.ATDDate ?? ''),
            );
            shown.STDDate = item.stdDate;
            shown.STDTime = item.stdTime;
            shown.etdDate = item.stdDate;
            shown.ETDtime = item.stdTime;
            if (
              !String(shown.ATDDate ?? '').trim() ||
              atdKey == null ||
              (previousStdKey != null && atdKey === previousStdKey)
            ) {
              shown.ATDDate = item.stdDate;
              shown.ATDTime = item.stdTime;
            }
          } catch {
            // Leave the stored row; booking details still hold the new STD.
          }
        }),
      );
    }
  }

  /**
   * Non-Scheduled Airlines table rows (station-scoped).
   *
   * Merges:
   * 1. `ns_fhr_collection` (MAA Excel seed + form saves)
   * 2. Station challan bookings (Chandigarh/IXC and any station without FHR seed)
   *
   * Prefer FHR row when both exist for the same serial.
   */
  async listAirlineFlights(
    opts: {
      serialNo?: string;
      challanNo?: string;
      bookingNo?: string;
      airline?: string;
      fromDate?: string;
      tillDate?: string;
    } = {},
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const challanQ = String(opts.challanNo ?? '').trim();
    const bookingQ = String(opts.bookingNo ?? '').trim();

    // Booking + FHR in parallel — previously serial; each path is independent.
    const [bookingRows, fhrRows] = await Promise.all([
      this.listBookingAirlineRows(opts, station),
      this.nsFhrCollectionService.listAirlineFlights(
        {
          serialNo: opts.serialNo,
          airline: opts.airline,
          fromDate: opts.fromDate,
          tillDate: opts.tillDate,
        },
        station,
      ),
    ]);

    const bySerial = new Map<number, Record<string, unknown>>();
    const bookingBySerial = new Map<number, Record<string, unknown>>();
    for (const row of bookingRows) {
      const serial = Number(row.SerialNo ?? row.flightSerialNumber ?? 0);
      if (!Number.isFinite(serial) || serial <= 0) continue;
      bookingBySerial.set(serial, row);
    }
    for (const row of fhrRows) {
      const serial = Number(row.SerialNo ?? row.flightSerialNumber ?? 0);
      if (!Number.isFinite(serial) || serial <= 0) continue;
      const booking = bookingBySerial.get(serial);
      const operator =
        this.trim(String(row.operator ?? '')) ||
        this.trim(String(booking?.operator ?? ''));
      bySerial.set(serial, operator ? { ...row, operator } : row);
    }
    for (const row of bookingRows) {
      const serial = Number(row.SerialNo ?? row.flightSerialNumber ?? 0);
      if (!Number.isFinite(serial) || serial <= 0) continue;
      if (!bySerial.has(serial)) {
        bySerial.set(serial, row);
      }
    }

    await this.alignStoredStdWithBookings(bookingBySerial, bySerial, station);

    // Challan / booking lookup: keep only rows that matched booking filter,
    // but use FHR payload (locks) when available for that serial.
    if (challanQ || bookingQ) {
      const bookingSerials = new Set(
        bookingRows
          .map((r) => Number(r.SerialNo ?? r.flightSerialNumber ?? 0))
          .filter((n) => Number.isFinite(n) && n > 0),
      );
      return [...bySerial.values()]
        .filter((r) =>
          bookingSerials.has(Number(r.SerialNo ?? r.flightSerialNumber ?? 0)),
        )
        .sort(
          (a, b) =>
            Number(b.SerialNo ?? b.flightSerialNumber ?? 0) -
            Number(a.SerialNo ?? a.flightSerialNumber ?? 0),
        );
    }

    return [...bySerial.values()].sort(
      (a, b) =>
        Number(b.SerialNo ?? b.flightSerialNumber ?? 0) -
        Number(a.SerialNo ?? a.flightSerialNumber ?? 0),
    );
  }
}
