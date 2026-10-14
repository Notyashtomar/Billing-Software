import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/services/identity.service';
import {
  StationScope,
  type StationScopeContext,
} from '../common/station/station-scope';
import { RawFlightDataService } from '../raw-flight-data/services/raw-flight-data.service';
import { invalidateListDailyFromAdvanceCache } from '../raw-flight-data/utils/list-daily-from-advance-cache.util';
import {
  CreationAdditionalFlights,
  CreationAdditionalFlightsDocument,
} from './schema/creation-additional-flights.schema';
import {
  ADDITIONAL_FLIGHT_SCHEDULE_SOURCE,
  buildAdditionalFlightScheduleId,
  isAdditionalFlightScheduleId,
  normalizeAirlineKey,
  normalizeFlightKey,
} from './utils/additional-flight.util';
import { normalizeOperationDateDdMmYyyy } from './utils/daily-flight-override.util';
import {
  enumerateDdMmYyyyRange,
  normalizeCreationDateRange,
} from './utils/creation-date-range.util';

/**
 * Creation → Additional Flights: one-time operational flight create/list.
 * Bridges into Schedule Airlines daily list without touching Schedule Setup.
 */
@Injectable()
export class AdditionalFlightService {
  private readonly logger = new Logger(AdditionalFlightService.name);

  constructor(
    @InjectModel(CreationAdditionalFlights.name)
    private readonly additionalFlightsModel: Model<CreationAdditionalFlightsDocument>,
    private readonly rawFlightDataService: RawFlightDataService,
  ) {}

  /**
   * Create a one-time additional flight for the selected operating day.
   * Allocates an operational serial from the global counter and invalidates
   * the Schedule Airlines daily cache so the flight appears immediately.
   */
  async saveAdditionalFlight(
    body: Record<string, unknown>,
    station: StationScopeContext,
    user?: AuthenticatedPrincipal | null,
  ) {
    const payload = this.normalizePayload(body);
    const airline = payload.airlines;
    const flightNo = payload.flightNo;
    const operationDate = payload.operationDate || payload.date;

    if (!airline) {
      throw new BadRequestException('airlines is required.');
    }
    if (!flightNo) {
      throw new BadRequestException('flightNo is required.');
    }
    if (!operationDate) {
      throw new BadRequestException(
        'Flight date (STA Date) is required and must be dd/MM/yyyy.',
      );
    }

    await this.assertNoDuplicate(airline, flightNo, operationDate, station);
    await this.assertNoScheduledConflict(
      airline,
      flightNo,
      operationDate,
      station,
      payload.airlineCode,
    );

    const scheduleId = buildAdditionalFlightScheduleId({
      airline,
      flightNo,
      operationDateDdMmYyyy: operationDate,
    });
    if (!scheduleId) {
      throw new BadRequestException(
        'Could not build additional-flight schedule identity.',
      );
    }

    // Operational serial = same numbering family as Schedule Airlines daily list.
    const allocated =
      await this.rawFlightDataService.ensureOperationalSerialForScheduleDay(
        scheduleId,
        operationDate,
      );

    const createdBy = this.nonEmpty(user?.email, user?.name, body.createdBy);
    const stationCode =
      !station.crossStation && station.stationCode
        ? station.stationCode
        : undefined;

    const docPayload: Record<string, unknown> = {
      ...payload,
      serialNo: allocated.serialNo,
      scheduleId,
      operationDate,
      date: payload.date || operationDate,
      date2: payload.date2 || payload.date || operationDate,
      skdNonSkd: payload.skdNonSkd || 'Additional',
      flightType: 'Additional',
      isAdditionalFlight: true,
      createdBy: createdBy || undefined,
      modifiedBy: createdBy || undefined,
      ...(stationCode ? { stationCode } : {}),
    };

    let doc: CreationAdditionalFlightsDocument;
    try {
      doc = await this.additionalFlightsModel.create(docPayload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/E11000|duplicate/i.test(msg)) {
        throw new ConflictException(
          'An additional flight with the same airline, flight number, and date already exists.',
        );
      }
      throw err;
    }

    invalidateListDailyFromAdvanceCache();
    this.logger.log(
      `[additional-flight] created serial=${allocated.serialNo} scheduleId=${scheduleId} date=${operationDate}`,
    );

    const lean = doc.toObject();
    return {
      success: true,
      id: String(lean._id ?? ''),
      serialNo: allocated.serialNo,
      scheduleId,
      operationDate,
      scheduleSource: ADDITIONAL_FLIGHT_SCHEDULE_SOURCE,
      record: lean,
      message:
        'Additional flight created for this date only. It is now available in Schedule Airlines. Master schedule was not changed.',
    };
  }

  async bulkSaveAdditionalFlights(
    rows: Record<string, unknown>[],
    station: StationScopeContext,
    user?: AuthenticatedPrincipal | null,
  ) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException(
        'rows array is required and must not be empty.',
      );
    }

    const saved: Record<string, unknown>[] = [];
    const errors: { index: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const result = await this.saveAdditionalFlight(rows[i], station, user);
        saved.push(result.record as Record<string, unknown>);
      } catch (err) {
        errors.push({
          index: i,
          message: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }

    return {
      success: errors.length === 0,
      savedCount: saved.length,
      errorCount: errors.length,
      records: saved,
      errors,
    };
  }

  async listByDate(dateDdMmYyyy: string, station: StationScopeContext) {
    const date = normalizeOperationDateDdMmYyyy(dateDdMmYyyy);
    if (!date) {
      throw new BadRequestException(
        'date query parameter is required (dd/MM/yyyy).',
      );
    }
    const rows = await this.additionalFlightsModel
      .find(
        StationScope.filter(
          {
            $or: [{ date }, { date2: date }, { operationDate: date }],
          },
          station,
        ),
      )
      .sort({ createdAt: -1 })
      .lean();
    return { success: true, date, rows };
  }

  async listByDateRange(
    fromDdMmYyyy: string,
    toDdMmYyyy: string,
    station: StationScopeContext,
  ) {
    const { fromDate, toDate } = normalizeCreationDateRange(
      fromDdMmYyyy,
      toDdMmYyyy,
    );
    const dates = enumerateDdMmYyyyRange(fromDate, toDate);
    const rows = await this.additionalFlightsModel
      .find(
        StationScope.filter(
          {
            $or: [
              { date: { $in: dates } },
              { date2: { $in: dates } },
              { operationDate: { $in: dates } },
            ],
          },
          station,
        ),
      )
      .sort({ createdAt: -1 })
      .lean();
    return { success: true, fromDate, toDate, rows };
  }

  /**
   * When Schedule Airlines saves a daily override for an additional flight,
   * mirror operational fields back onto the Additional Flights source doc.
   */
  async syncFromDailyOverride(input: {
    scheduleMasterSerial: string;
    operationDate: string;
    instanceSerial?: string;
    data: Record<string, unknown>;
    modifiedBy?: string;
    station: StationScopeContext;
  }): Promise<void> {
    if (!isAdditionalFlightScheduleId(input.scheduleMasterSerial)) return;

    const airline = this.nonEmpty(
      input.data.airlines,
      input.data.airline,
      input.data.Airline,
    );
    const flightNo = this.nonEmpty(
      input.data.flightNo,
      input.data['Flight No'],
    );
    const filter = StationScope.filter(
      {
        $or: [
          { scheduleId: input.scheduleMasterSerial },
          ...(input.instanceSerial
            ? [{ serialNo: input.instanceSerial }]
            : []),
          ...(airline && flightNo
            ? [
                {
                  operationDate: input.operationDate,
                  airlines: new RegExp(
                    `^${escapeRegex(airline)}$`,
                    'i',
                  ),
                  flightNo: new RegExp(
                    `^${escapeRegex(flightNo)}$`,
                    'i',
                  ),
                },
              ]
            : []),
        ],
      },
      input.station,
    );

    const update: Record<string, unknown> = {
      modifiedBy: input.modifiedBy || undefined,
    };
    const acType = this.nonEmpty(input.data.acType, input.data.Aircraft);
    const routing = this.nonEmpty(
      input.data.routing,
      input.data.Routing,
      input.data.route,
    );
    const staTime = this.nonEmpty(input.data.staTime, input.data['STA Time']);
    const stdTime = this.nonEmpty(input.data.stdTime, input.data['STD Time']);
    const opsType = this.nonEmpty(input.data.opsType, input.data['Type of Handling']);
    if (acType) update.acType = acType;
    if (routing) update.routing = routing;
    if (staTime) update.staTime = staTime;
    if (stdTime) update.stdTime = stdTime;
    if (opsType) update.opsType = opsType;
    if (input.instanceSerial) update.serialNo = input.instanceSerial;

    await this.additionalFlightsModel.updateOne(filter, { $set: update });
  }

  private async assertNoDuplicate(
    airline: string,
    flightNo: string,
    operationDate: string,
    station: StationScopeContext,
  ): Promise<void> {
    const airlineKey = normalizeAirlineKey(airline);
    const flightKey = normalizeFlightKey(flightNo);
    const candidates = await this.additionalFlightsModel
      .find(
        StationScope.filter(
          {
            $or: [
              { operationDate },
              { date: operationDate },
              { date2: operationDate },
            ],
          },
          station,
        ),
        { airlines: 1, flightNo: 1, operationDate: 1, date: 1 },
      )
      .lean();

    for (const doc of candidates) {
      const docAirline = normalizeAirlineKey(String(doc.airlines ?? ''));
      const docFlight = normalizeFlightKey(String(doc.flightNo ?? ''));
      if (docAirline === airlineKey && docFlight === flightKey) {
        throw new ConflictException(
          'An additional flight with the same airline, flight number, and date already exists.',
        );
      }
    }
  }

  /**
   * Reject create when a master-scheduled (or already listed) flight already
   * operates that airline + flight + day — Additional Flights is for gaps only.
   */
  private async assertNoScheduledConflict(
    airline: string,
    flightNo: string,
    operationDate: string,
    station: StationScopeContext,
    airlineCode?: string,
  ): Promise<void> {
    let found: Awaited<
      ReturnType<RawFlightDataService['findDailyOperationalFlight']>
    > = null;
    try {
      found = await this.rawFlightDataService.findDailyOperationalFlight(
        airline,
        flightNo,
        operationDate,
        { openOnly: false, airlineCode },
        station,
      );
    } catch (err) {
      // Master exists but not on this operating day → Additional Flight is allowed.
      if (err instanceof NotFoundException) {
        const msg = err.message || '';
        if (/does not operate on/i.test(msg)) return;
        return;
      }
      this.logger.warn(
        `[additional-flight] schedule conflict check failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    if (!found) return;

    const src = String(found.scheduleSource ?? '');
    if (
      src.includes(ADDITIONAL_FLIGHT_SCHEDULE_SOURCE) ||
      isAdditionalFlightScheduleId(found.scheduleMasterSerial)
    ) {
      throw new ConflictException(
        'An additional flight with the same airline, flight number, and date already exists.',
      );
    }

    throw new ConflictException(
      `A scheduled flight already exists for ${airline} ${flightNo} on ${operationDate}. Use Creation → Schedule Airlines to edit that day instead.`,
    );
  }

  private normalizePayload(body: Record<string, unknown>): Record<string, string> {
    const staDate = normalizeOperationDateDdMmYyyy(
      this.nonEmpty(body.date, body.staDate, body.operationDate),
    );
    const stdDate = normalizeOperationDateDdMmYyyy(
      this.nonEmpty(body.date2, body.stdDate, staDate),
    );
    const fields = [
      'serialNo',
      'airlines',
      'flightNo',
      'acType',
      'aBody',
      'airlineCode',
      'routing',
      'staTime',
      'stdTime',
      'opsType',
      'skdNonSkd',
      'categoryOfFlight',
      'freighter',
    ] as const;
    const out: Record<string, string> = {};
    for (const key of fields) {
      const v = body[key];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) out[key] = s;
    }
    if (out.flightNo) {
      out.flightNo = out.flightNo.toUpperCase().replace(/\s/g, '');
    }
    if (out.airlineCode) {
      out.airlineCode = out.airlineCode.toUpperCase();
    }
    if (staDate) {
      out.date = staDate;
      out.operationDate = staDate;
    }
    if (stdDate) out.date2 = stdDate;
    if (!out.skdNonSkd) out.skdNonSkd = 'Additional';
    return out;
  }

  private nonEmpty(...vals: unknown[]): string {
    for (const v of vals) {
      const t = String(v ?? '').trim();
      if (t) return t;
    }
    return '';
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
