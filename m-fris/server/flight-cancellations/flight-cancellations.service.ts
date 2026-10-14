import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import type { RawFlightDataService } from '../raw-flight-data/services/raw-flight-data.service';
import { lazyService } from '../common/nestjs/lazy-service.util';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as nodemailer from 'nodemailer';
import {
  FlightCancellation,
  FlightCancellationDocument,
} from './schema/flight-cancellation.schema';
import {
  CancelFlightDto,
  SendCancellationInfoByDetailsDto,
  normalizeCancelFlightKind,
  type CancelFlightKind,
} from './dto/cancel-flight.dto';
import {
  AdminEmail,
  type AdminEmailDocument,
} from '../auth/schema/admin-email.schema';
import { AdvanceAirlineLogoService } from '../advance-airline-logo/services/advance-airline-logo.service';
import {
  type CancellationEmailLogoAttachment,
  resolveAirlineLogoEmailAsset,
  resolveStationLogoEmailAsset,
} from './utils/station-logo.util';
import {
  buildCancellationInfoEmailHtml,
  buildCancellationInfoEmailPlainText,
  type CancellationInfoEmailRow,
} from './utils/cancellation-info-email.template';
import { resolveCancellationFhrEmailContext } from './utils/cancellation-fhr-context.util';
import { FhrCollectionService } from '../fhr-collection/services/fhr-collection.service';
import {
  StationScope,
  type StationScopeContext,
} from '../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from '../common/station/station.constants';
import {
  CANCELLATION_ATTACHMENT_MAX_BYTES,
  asNodeBuffer,
  decodeAttachmentBase64,
  isMongoCancellationId,
  sanitizeAttachmentFileName,
  sanitizeAttachmentMimeType,
} from './utils/cancellation-attachment.util';

export type CancellationRow = {
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
  intimationMode: string;
  intimatedBy: string;
  intimationPersonEmail: string;
  intimationMedia: string;
  intimationTime: string;
  cancelledByUserId: string;
  flightKind: string;
  stationCode: string;
  hasAttachment: boolean;
  attachmentFileName: string;
  attachmentMimeType: string;
  createdAt?: Date;
};

@Injectable()
export class FlightCancellationsService {
  private readonly logger = new Logger(FlightCancellationsService.name);

  /** Display name on the From header; address is always the authenticated SMTP mailbox. */
  private static readonly BIRD_SENDER_NAME = 'Bird Group';

  constructor(
    @InjectModel(FlightCancellation.name)
    private readonly model: Model<FlightCancellationDocument>,
    @InjectModel(AdminEmail.name)
    private readonly adminEmailModel: Model<AdminEmailDocument>,
    @Inject(
      forwardRef(
        lazyService(
          () =>
            require('../raw-flight-data/services/raw-flight-data.service')
              .RawFlightDataService as typeof import('../raw-flight-data/services/raw-flight-data.service').RawFlightDataService,
        ),
      ),
    )
    private readonly rawFlightDataService: RawFlightDataService,
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly advanceAirlineLogoService: AdvanceAirlineLogoService,
  ) {}

  private normalizeSerial(raw: string): string {
    return String(raw ?? '')
      .trim()
      .replace(/^FL-/i, '');
  }

  /**
   * Resolve the stationCode to stamp on a new cancellation. A scoped FRIS user
   * (or an admin with an active station) stamps that station; a cross-station
   * admin without an active station falls back to the legacy station (MAA),
   * matching current single-station production.
   */
  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  /**
   * `scheduled` (default) excludes NS OTP rows so daily schedule / scheduled history
   * stay clean. Legacy docs with no `flightKind` count as scheduled.
   */
  private flightKindMongoFilter(
    kind?: CancelFlightKind | 'all' | string,
  ): Record<string, unknown> {
    const k = String(kind ?? '')
      .trim()
      .toLowerCase();
    if (k === 'all') return {};
    if (k === 'non-scheduled') return { flightKind: 'non-scheduled' };
    return {
      $or: [
        { flightKind: { $exists: false } },
        { flightKind: null },
        { flightKind: '' },
        { flightKind: 'scheduled' },
      ],
    };
  }

  private parseProofAttachment(dto: {
    attachmentFileName?: string;
    intimationMedia?: string;
    attachmentMimeType?: string;
    attachmentBase64?: string;
  }): {
    hasAttachment: boolean;
    fileName: string;
    mimeType: string;
    data?: Buffer;
  } {
    const named = String(
      dto.attachmentFileName ?? dto.intimationMedia ?? '',
    ).trim();
    const data = decodeAttachmentBase64(String(dto.attachmentBase64 ?? ''));
    if (!data) {
      return {
        hasAttachment: false,
        fileName: '',
        mimeType: '',
      };
    }
    if (data.length > CANCELLATION_ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('Attachment is too large.');
    }
    return {
      hasAttachment: true,
      fileName: sanitizeAttachmentFileName(named),
      mimeType: sanitizeAttachmentMimeType(String(dto.attachmentMimeType ?? '')),
      data,
    };
  }

  async create(
    dto: CancelFlightDto,
    station: StationScopeContext,
  ): Promise<CancellationRow> {
    const instanceSerial = this.normalizeSerial(dto.flightId);
    if (!instanceSerial) {
      throw new BadRequestException('flightId is required');
    }
    const cancelledDate = dto.date.trim();
    const stationCode = this.stampStationCode(station);
    const proof = this.parseProofAttachment(dto);
    const intimationMedia =
      String(dto.intimationMedia ?? '').trim() || proof.fileName;

    try {
      const doc = await this.model.create({
        instanceSerial,
        cancelledDate,
        stationCode,
        reason: String(dto.reason ?? '').trim(),
        airlineName: String(dto.airlineName ?? '').trim(),
        flightNo: String(dto.flightNo ?? '').trim(),
        route: String(dto.route ?? '').trim(),
        source: String(dto.source ?? '').trim(),
        destination: String(dto.destination ?? '').trim(),
        staDate: String(dto.staDate ?? '').trim(),
        staTime: String(dto.staTime ?? '').trim(),
        stdDate: String(dto.stdDate ?? '').trim(),
        stdTime: String(dto.stdTime ?? '').trim(),
        aircraft: String(dto.aircraft ?? '').trim(),
        intimationMode: String(dto.intimationMode ?? '').trim(),
        intimatedBy: String(dto.intimatedBy ?? '').trim(),
        intimationPersonEmail: String(dto.intimationPersonEmail ?? '').trim(),
        intimationMedia,
        intimationTime: String(dto.intimationTime ?? '').trim(),
        cancelledByUserId: String(dto.cancelledByUserId ?? '').trim(),
        flightKind: normalizeCancelFlightKind(dto.flightKind),
        hasAttachment: proof.hasAttachment,
        attachmentFileName: proof.fileName,
        attachmentMimeType: proof.mimeType,
        ...(proof.data ? { attachmentData: proof.data } : {}),
      });
      return this.toRow(doc);
    } catch (e: unknown) {
      const code = (e as { code?: number })?.code;
      if (code === 11000) {
        throw new ConflictException(
          'This flight is already cancelled for the selected date.',
        );
      }
      throw e;
    }
  }

  /**
   * Persist the same proof bytes the confirmation email attaches.
   * Runs after create so a missed DTO field still lands on the row.
   */
  async attachProofFromEmailPayload(
    cancellationId: string,
    proof: { fileName?: string; mimeType?: string; base64?: string },
    station: StationScopeContext,
  ): Promise<boolean> {
    const id = String(cancellationId ?? '').trim();
    if (!isMongoCancellationId(id)) return false;
    const parsed = this.parseProofAttachment({
      attachmentFileName: proof.fileName,
      intimationMedia: proof.fileName,
      attachmentMimeType: proof.mimeType,
      attachmentBase64: proof.base64,
    });
    if (!parsed.hasAttachment || !parsed.data) return false;
    const res = await this.model.updateOne(
      StationScope.filter({ _id: id }, station),
      {
        $set: {
          hasAttachment: true,
          attachmentFileName: parsed.fileName,
          attachmentMimeType: parsed.mimeType,
          attachmentData: parsed.data,
          intimationMedia:
            String(proof.fileName ?? '').trim() || parsed.fileName,
        },
      },
    );
    return (res.matchedCount ?? 0) > 0;
  }

  async getAttachment(
    cancellationId: string,
    station: StationScopeContext,
  ): Promise<{ fileName: string; mimeType: string; data: Buffer }> {
    const id = String(cancellationId ?? '').trim();
    if (!isMongoCancellationId(id)) {
      throw new BadRequestException('Invalid cancellation id.');
    }
    const doc = await this.model
      .findOne(StationScope.filter({ _id: id }, station))
      .select('+attachmentData')
      .exec();
    if (!doc) {
      throw new NotFoundException('Cancellation record not found.');
    }
    const data = asNodeBuffer(doc.attachmentData);
    if (!data || data.length === 0) {
      throw new NotFoundException('No attachment for this cancellation.');
    }
    return {
      fileName: sanitizeAttachmentFileName(
        doc.attachmentFileName || doc.intimationMedia || 'attachment',
      ),
      mimeType: sanitizeAttachmentMimeType(doc.attachmentMimeType),
      data,
    };
  }

  async remove(
    flightId: string,
    date: string,
    station: StationScopeContext,
  ): Promise<{ deleted: boolean }> {
    const instanceSerial = this.normalizeSerial(flightId);
    const cancelledDate = String(date ?? '').trim();
    const res = await this.model.deleteOne(
      StationScope.filter({ instanceSerial, cancelledDate }, station),
    );
    if (!res.deletedCount) {
      throw new NotFoundException(
        'No cancellation record for this flight and date.',
      );
    }
    return { deleted: true };
  }

  private static readonly YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

  private pickStr(stored: string, fallback: string): string {
    const s = String(stored ?? '').trim();
    if (s) return s;
    return String(fallback ?? '').trim();
  }

  /**
   * Fill empty denormalized fields from `advance_schedule_setup` via instance serial.
   */
  private mergeScheduleIntoRow(
    row: CancellationRow,
    identity: {
      airlineName: string;
      flightNo: string;
      aircraftType: string;
      airlineRepresentativeName: string;
    },
    schedule: {
      staDate: string;
      stdDate: string;
      staTime: string;
      stdTime: string;
      route?: string;
    } | null,
  ): CancellationRow {
    const route = schedule?.route ?? '';
    return {
      ...row,
      airlineName: this.pickStr(row.airlineName, identity.airlineName),
      flightNo: this.pickStr(row.flightNo, identity.flightNo),
      aircraft: this.pickStr(row.aircraft, identity.aircraftType),
      route: this.pickStr(row.route, route),
      staDate: this.pickStr(row.staDate, schedule?.staDate ?? ''),
      staTime: this.pickStr(row.staTime, schedule?.staTime ?? ''),
      stdDate: this.pickStr(row.stdDate, schedule?.stdDate ?? ''),
      stdTime: this.pickStr(row.stdTime, schedule?.stdTime ?? ''),
    };
  }

  private async enrichRowsFromSchedule(
    rows: CancellationRow[],
  ): Promise<CancellationRow[]> {
    const cache = new Map<
      string,
      {
        identity: Awaited<
          ReturnType<RawFlightDataService['getBasicFlightIdentityBySerial']>
        >;
        schedule: Awaited<
          ReturnType<RawFlightDataService['findScheduleBySerial']>
        >;
      }
    >();

    const out: CancellationRow[] = [];
    for (const row of rows) {
      const serial = String(row.instanceSerial ?? '').trim();
      if (!serial) {
        out.push(row);
        continue;
      }
      try {
        let pack = cache.get(serial);
        if (!pack) {
          const [identity, schedule] = await Promise.all([
            this.rawFlightDataService.getBasicFlightIdentityBySerial(serial),
            this.rawFlightDataService.findScheduleBySerial(serial),
          ]);
          pack = { identity, schedule };
          cache.set(serial, pack);
        }
        out.push(this.mergeScheduleIntoRow(row, pack.identity, pack.schedule));
      } catch (e) {
        this.logger.warn(
          `Cancellation enrichment skipped for serial ${serial}: ${e instanceof Error ? e.message : String(e)}`,
        );
        out.push(row);
      }
    }
    return out;
  }

  /**
   * All rows from `flight_cancellations` sorted oldest -> newest.
   */
  async findAll(
    station: StationScopeContext,
    kind?: CancelFlightKind | 'all' | string,
  ): Promise<CancellationRow[]> {
    const docs = await this.model
      .find(StationScope.filter(this.flightKindMongoFilter(kind), station))
      .sort({
        cancelledDate: -1,
        staTime: -1,
        flightNo: 1,
        instanceSerial: 1,
      })
      .limit(100)
      .lean()
      .exec();
    const rows = docs.map((d) => this.leanToRow(d));
    return this.enrichRowsFromSchedule(rows);
  }

  /**
   * Parse display dates (ISO yyyy-MM-dd or dd/MM/yyyy, dd-MM-yyyy) to yyyy-MM-dd for range checks.
   */
  private tryParseToYmd(input: string): string | null {
    const raw = String(input ?? '').trim();
    if (!raw) return null;
    if (FlightCancellationsService.YMD_RE.test(raw)) return raw;
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
    if (m) {
      const d = m[1].padStart(2, '0');
      const mo = m[2].padStart(2, '0');
      const y = m[3];
      return `${y}-${mo}-${d}`;
    }
    return null;
  }

  /**
   * True when the cancellation belongs in `[fromYmd, toYmd]` inclusive.
   * Uses stored `cancelledDate` (history Cancellation date column). STA / STD
   * only if `cancelledDate` is empty, so schedule backfill cannot leak other months.
   */
  private rowMatchesDateRange(
    row: CancellationRow,
    fromYmd: string,
    toYmd: string,
  ): boolean {
    const from = String(fromYmd ?? '').trim();
    const to = String(toYmd ?? '').trim();
    const inRange = (ymd: string | null): boolean =>
      Boolean(ymd && ymd >= from && ymd <= to);

    const cancelY = this.tryParseToYmd(row.cancelledDate);
    if (cancelY) return inRange(cancelY);

    const staY = this.tryParseToYmd(row.staDate);
    if (staY) return inRange(staY);

    const stdY = this.tryParseToYmd(row.stdDate);
    if (stdY) return inRange(stdY);

    return false;
  }

  private sortCancellationRows(rows: CancellationRow[]): CancellationRow[] {
    return [...rows].sort((a, b) => {
      const d = a.cancelledDate.localeCompare(b.cancelledDate);
      if (d !== 0) return d;
      const t = a.staTime.localeCompare(b.staTime);
      if (t !== 0) return t;
      return a.flightNo.localeCompare(b.flightNo);
    });
  }

  /**
   * Cancellations for list/history views: every row whose `cancelledDate`
   * (Cancellation date) falls in `[fromYmd, toYmd]` inclusive.
   */
  async findByDateRange(
    fromYmd: string,
    toYmd: string,
    station: StationScopeContext,
    kind?: CancelFlightKind | 'all' | string,
  ): Promise<CancellationRow[]> {
    const from = String(fromYmd ?? '').trim();
    const to = String(toYmd ?? '').trim();
    if (!FlightCancellationsService.YMD_RE.test(from)) {
      throw new BadRequestException('from must be YYYY-MM-DD');
    }
    if (!FlightCancellationsService.YMD_RE.test(to)) {
      throw new BadRequestException('to must be YYYY-MM-DD');
    }
    if (from > to) {
      throw new BadRequestException('from must be on or before to');
    }
    const docs = await this.model
      .find(StationScope.filter(this.flightKindMongoFilter(kind), station))
      .sort({
        cancelledDate: 1,
        staTime: 1,
        flightNo: 1,
        instanceSerial: 1,
      })
      .lean()
      .exec();
    const rows = docs.map((d) => this.leanToRow(d));
    const enriched = await this.enrichRowsFromSchedule(rows);
    const inRange = enriched.filter((r) =>
      this.rowMatchesDateRange(r, from, to),
    );
    return this.sortCancellationRows(inRange);
  }

  /**
   * Lightweight range lookup for billing scheduled-flight enrichment.
   * Uses stored cancelledDate bounds directly and skips schedule backfill/enrichment.
   */
  async findByCancelledDateRange(
    fromYmd: string,
    toYmd: string,
    station: StationScopeContext,
  ): Promise<CancellationRow[]> {
    const from = String(fromYmd ?? '').trim();
    const to = String(toYmd ?? '').trim();
    if (!FlightCancellationsService.YMD_RE.test(from)) {
      throw new BadRequestException('from must be YYYY-MM-DD');
    }
    if (!FlightCancellationsService.YMD_RE.test(to)) {
      throw new BadRequestException('to must be YYYY-MM-DD');
    }
    if (from > to) {
      throw new BadRequestException('from must be on or before to');
    }

    const docs = await this.model
      .find(
        StationScope.filter(
          {
            cancelledDate: { $gte: from, $lte: to },
            ...this.flightKindMongoFilter('scheduled'),
          },
          station,
        ),
      )
      .select({
        instanceSerial: 1,
        cancelledDate: 1,
        intimationTime: 1,
        staDate: 1,
      })
      .lean()
      .exec();

    return docs.map((d) => this.leanToRow(d));
  }

  /**
   * Same as findByCancelledDateRange but restricted to a serial subset for
   * scheduled-flight page enrichment.
   */
  async findByCancelledDateRangeForSerials(
    fromYmd: string,
    toYmd: string,
    instanceSerials: string[],
    station: StationScopeContext,
  ): Promise<CancellationRow[]> {
    const from = String(fromYmd ?? '').trim();
    const to = String(toYmd ?? '').trim();
    if (!FlightCancellationsService.YMD_RE.test(from)) {
      throw new BadRequestException('from must be YYYY-MM-DD');
    }
    if (!FlightCancellationsService.YMD_RE.test(to)) {
      throw new BadRequestException('to must be YYYY-MM-DD');
    }
    if (from > to) {
      throw new BadRequestException('from must be on or before to');
    }
    const serials = [...new Set(instanceSerials.map((s) => this.normalizeSerial(s)).filter(Boolean))];
    if (serials.length === 0) return [];

    const docs = await this.model
      .find(
        StationScope.filter(
          {
            cancelledDate: { $gte: from, $lte: to },
            instanceSerial: { $in: serials },
            ...this.flightKindMongoFilter('scheduled'),
          },
          station,
        ),
      )
      .select({
        instanceSerial: 1,
        cancelledDate: 1,
        intimationTime: 1,
        staDate: 1,
      })
      .lean()
      .exec();

    return docs.map((d) => this.leanToRow(d));
  }

  /**
   * Keys `instanceSerial|YYYY-MM-DD` for rows to exclude from daily schedule lists.
   */
  async getCancelledKeysInRange(
    fromYmd: string,
    toYmd: string,
    station: StationScopeContext,
  ): Promise<Set<string>> {
    const from = String(fromYmd ?? '').trim();
    const to = String(toYmd ?? '').trim();
    if (!from || !to) return new Set();

    const docs = await this.model
      .find(
        StationScope.filter(
          {
            cancelledDate: { $gte: from, $lte: to },
            ...this.flightKindMongoFilter('scheduled'),
          },
          station,
        ),
      )
      .select({ instanceSerial: 1, cancelledDate: 1 })
      .lean()
      .exec();

    const set = new Set<string>();
    for (const d of docs) {
      const serial = String(d.instanceSerial ?? '').trim();
      const date = String(d.cancelledDate ?? '').trim();
      if (serial && date) set.add(`${serial}|${date}`);
    }
    return set;
  }

  async exists(
    instanceSerial: string,
    dateYmd: string,
    station: StationScopeContext,
  ): Promise<boolean> {
    const serial = this.normalizeSerial(instanceSerial);
    const date = String(dateYmd ?? '').trim();
    if (!serial || !date) return false;
    const n = await this.model.countDocuments(
      StationScope.filter(
        { instanceSerial: serial, cancelledDate: date },
        station,
      ),
    );
    return n > 0;
  }

  /**
   * True when this instance serial has any cancellation row in `flight_cancellations`.
   * Used by UI button state to stay consistent across reload/login.
   */
  async isSerialCancelled(
    instanceSerial: string,
    station: StationScopeContext,
    kind?: CancelFlightKind | 'all' | string,
  ): Promise<boolean> {
    const serial = this.normalizeSerial(instanceSerial);
    if (!serial) return false;
    const n = await this.model.countDocuments(
      StationScope.filter(
        { instanceSerial: serial, ...this.flightKindMongoFilter(kind) },
        station,
      ),
    );
    return n > 0;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private normalizeAppPassword(raw: string): string {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/^['"]|['"]$/g, '').replace(/\s+/g, '');
  }

  private async getSenderCredentials(): Promise<{
    email: string;
    appPassword: string;
  }> {
    const envEmail = String(process.env.EMAIL_USER || '')
      .trim()
      .toLowerCase();
    const envPass = this.normalizeAppPassword(process.env.EMAIL_PASS || '');
    if (this.isValidEmail(envEmail) && envPass) {
      return { email: envEmail, appPassword: envPass };
    }
    const active = await this.adminEmailModel
      .findOne({ isActive: true })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    if (active?.email && active?.appPassword) {
      const appPassword = this.normalizeAppPassword(String(active.appPassword));
      if (appPassword) {
        return {
          email: String(active.email).trim().toLowerCase(),
          appPassword,
        };
      }
    }
    throw new UnauthorizedException(
      'No sender email configured. Set EMAIL_USER and EMAIL_PASS in .env, or add an active record in adminEmails.',
    );
  }

  private toCancellationInfoEmailRow(
    row: Pick<
      CancellationRow,
      | 'instanceSerial'
      | 'cancelledDate'
      | 'flightNo'
      | 'airlineName'
      | 'staDate'
      | 'staTime'
      | 'stdDate'
      | 'stdTime'
      | 'route'
      | 'reason'
      | 'intimatedBy'
      | 'intimationPersonEmail'
      | 'intimationMedia'
      | 'intimationTime'
      | 'intimationMode'
    >,
  ): CancellationInfoEmailRow {
    return {
      instanceSerial: row.instanceSerial,
      cancelledDate: row.cancelledDate,
      flightNo: row.flightNo,
      airlineName: row.airlineName,
      staDate: row.staDate,
      staTime: row.staTime,
      stdDate: row.stdDate,
      stdTime: row.stdTime,
      route: row.route,
      reason: row.reason,
      intimatedBy: row.intimatedBy,
      intimationPersonEmail: row.intimationPersonEmail,
      intimationMedia: row.intimationMedia,
      intimationTime: row.intimationTime,
      intimationMode: row.intimationMode,
    };
  }

  private async deliverCancellationInfoEmail(
    row: CancellationInfoEmailRow,
    recipients: string[],
    options?: {
      subject?: string;
      extraAttachments?: Array<{
        filename: string;
        content: string;
        encoding: 'base64';
        contentType?: string;
      }>;
    },
  ): Promise<{ sent: true; toEmails: string[] }> {
    const sender = await this.getSenderCredentials();
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: sender.email, pass: sender.appPassword },
    });

    const fhrCtx = await resolveCancellationFhrEmailContext(
      String(row.instanceSerial ?? '').trim(),
      this.fhrCollectionService,
    );
    const emailRow: CancellationInfoEmailRow = {
      ...row,
      route: String(row.route ?? '').trim() || fhrCtx.route,
    };

    const logoAsset = resolveStationLogoEmailAsset(fhrCtx.stationLogoSrc);
    const airlineLogoDataUrl =
      await this.advanceAirlineLogoService.findLogoDataUrlByAirlineName(
        String(emailRow.airlineName ?? ''),
      );
    const airlineLogoAsset = resolveAirlineLogoEmailAsset(airlineLogoDataUrl);
    const text = buildCancellationInfoEmailPlainText(emailRow);
    const html = buildCancellationInfoEmailHtml(emailRow, {
      senderBrandName: FlightCancellationsService.BIRD_SENDER_NAME,
      stationLogoSrc: logoAsset?.imgSrc ?? null,
      airlineLogoSrc: airlineLogoAsset?.imgSrc ?? null,
    });
    const attachments: Array<
      | CancellationEmailLogoAttachment
      | {
          filename: string;
          content: string;
          encoding: 'base64';
          contentType?: string;
        }
    > = [];
    if (logoAsset?.attachment) attachments.push(logoAsset.attachment);
    if (airlineLogoAsset?.attachment)
      attachments.push(airlineLogoAsset.attachment);
    if (options?.extraAttachments?.length) {
      attachments.push(...options.extraAttachments);
    }

    try {
      await transporter.sendMail({
        from: `"${FlightCancellationsService.BIRD_SENDER_NAME}" <${sender.email}>`,
        replyTo: sender.email,
        to: recipients.join(', '),
        subject:
          String(options?.subject ?? '').trim() ||
          `Cancellation info: ${String(row.flightNo ?? row.instanceSerial ?? '')}`,
        text,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'SMTP send failed';
      this.logger.error(`Cancellation info email failed: ${msg}`);
      throw new InternalServerErrorException(
        `Could not send email (${msg}). Check EMAIL_USER/EMAIL_PASS, app password, and that the From address matches the Gmail account.`,
      );
    }

    return { sent: true, toEmails: recipients };
  }

  async sendCancellationInfoEmail(
    cancellationId: string,
    toEmails: string[],
    station: StationScopeContext,
    options?: {
      subject?: string;
      extraAttachments?: Array<{
        filename: string;
        content: string;
        encoding: 'base64';
        contentType?: string;
      }>;
    },
  ): Promise<{ sent: true; toEmails: string[] }> {
    const id = String(cancellationId ?? '').trim();
    const recipients = Array.from(
      new Set(
        (Array.isArray(toEmails) ? toEmails : [])
          .map((v) =>
            String(v ?? '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    );
    if (!id) throw new BadRequestException('cancellationId is required.');
    if (
      recipients.length === 0 ||
      recipients.some((e) => !this.isValidEmail(e))
    ) {
      throw new BadRequestException(
        'Provide one or more valid recipient emails.',
      );
    }
    const row = await this.model
      .findOne(StationScope.filter({ _id: id }, station))
      .lean()
      .exec();
    if (!row) throw new NotFoundException('Cancellation record not found.');
    const r = this.leanToRow(row);

    return this.deliverCancellationInfoEmail(
      this.toCancellationInfoEmailRow(r),
      recipients,
      options,
    );
  }

  /** Same email template as {@link sendCancellationInfoEmail}, without a DB row (e.g. FHR-only list). */
  async sendCancellationInfoEmailByDetails(
    dto: SendCancellationInfoByDetailsDto,
  ): Promise<{ sent: true; toEmails: string[] }> {
    const recipients = Array.from(
      new Set(
        dto.emails.map((v) =>
          String(v ?? '')
            .trim()
            .toLowerCase(),
        ),
      ),
    ).filter(Boolean);
    if (
      recipients.length === 0 ||
      recipients.some((e) => !this.isValidEmail(e))
    ) {
      throw new BadRequestException(
        'Provide one or more valid recipient emails.',
      );
    }
    return this.deliverCancellationInfoEmail(
      this.toCancellationInfoEmailRow({
        instanceSerial: String(dto.instanceSerial ?? '').trim(),
        cancelledDate: String(dto.cancelledDate ?? '').trim(),
        flightNo: String(dto.flightNo ?? '').trim(),
        airlineName: String(dto.airlineName ?? '').trim(),
        staDate: String(dto.staDate ?? '').trim(),
        staTime: String(dto.staTime ?? '').trim(),
        stdDate: String(dto.stdDate ?? '').trim(),
        stdTime: String(dto.stdTime ?? '').trim(),
        route: String(dto.route ?? '').trim(),
        reason: String(dto.reason ?? '').trim(),
        intimatedBy: String(dto.intimatedBy ?? '').trim(),
        intimationPersonEmail: String(dto.intimationPersonEmail ?? '').trim(),
        intimationMedia: String(dto.intimationMedia ?? '').trim(),
        intimationTime: String(dto.intimationTime ?? '').trim(),
        intimationMode: String(dto.intimationMode ?? '').trim(),
      }),
      recipients,
    );
  }

  private toRow(doc: FlightCancellationDocument): CancellationRow {
    return this.leanToRow(doc.toObject());
  }

  private leanToRow(d: unknown): CancellationRow {
    const r = d as Record<string, unknown>;
    const id = r._id;
    return {
      _id: String(id),
      instanceSerial: String(r.instanceSerial ?? ''),
      cancelledDate: String(r.cancelledDate ?? ''),
      reason: String(r.reason ?? ''),
      airlineName: String(r.airlineName ?? ''),
      flightNo: String(r.flightNo ?? ''),
      route: String(r.route ?? ''),
      source: String(r.source ?? ''),
      destination: String(r.destination ?? ''),
      staDate: String(r.staDate ?? ''),
      staTime: String(r.staTime ?? ''),
      stdDate: String(r.stdDate ?? ''),
      stdTime: String(r.stdTime ?? ''),
      aircraft: String(r.aircraft ?? ''),
      intimationMode: String(r.intimationMode ?? ''),
      intimatedBy: String(r.intimatedBy ?? ''),
      intimationPersonEmail: String(r.intimationPersonEmail ?? ''),
      intimationMedia: String(r.intimationMedia ?? ''),
      intimationTime: String(r.intimationTime ?? ''),
      cancelledByUserId: String(r.cancelledByUserId ?? ''),
      flightKind: String(r.flightKind ?? ''),
      stationCode: String(r.stationCode ?? ''),
      hasAttachment:
        Boolean(r.hasAttachment) ||
        Boolean(String(r.attachmentFileName ?? '').trim()),
      attachmentFileName: String(r.attachmentFileName ?? '').trim(),
      attachmentMimeType: String(r.attachmentMimeType ?? '').trim(),
      createdAt: r.createdAt instanceof Date ? r.createdAt : undefined,
    };
  }
}
