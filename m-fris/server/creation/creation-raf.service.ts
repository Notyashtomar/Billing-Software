import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/services/identity.service';
import {
  StationScope,
  type StationScopeContext,
} from '../common/station/station-scope';
import { RawFlightDataService } from '../raw-flight-data/services/raw-flight-data.service';
import { CreationRaf, CreationRafDocument } from './schema/creation-raf.schema';
import { AdvanceRafAirlineService } from '../advance-raf-airline/services/advance-raf-airline.service';
import {
  enumerateDdMmYyyyRange,
  normalizeCreationDateRange,
} from './utils/creation-date-range.util';
import { normalizeOperationDateDdMmYyyy } from './utils/daily-flight-override.util';
import {
  normalizeAirlineKey,
  normalizeFlightKey,
} from './utils/additional-flight.util';
import {
  buildCreationRafScheduleId,
  CREATION_RAF_SCHEDULE_SOURCE,
} from './utils/creation-raf.util';

/**
 * Creation → RAF: non-customer ramp assistance flights.
 * Station-scoped; allocates operational serial for FHR / equipment / ramp forms.
 */
@Injectable()
export class CreationRafService {
  private readonly logger = new Logger(CreationRafService.name);

  constructor(
    @InjectModel(CreationRaf.name)
    private readonly creationRafModel: Model<CreationRafDocument>,
    private readonly rawFlightDataService: RawFlightDataService,
    private readonly advanceRafAirlineService: AdvanceRafAirlineService,
  ) {}

  async saveCreationRaf(
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

    const scheduleId = buildCreationRafScheduleId({
      airline,
      flightNo,
      operationDateDdMmYyyy: operationDate,
    });
    if (!scheduleId) {
      throw new BadRequestException(
        'Could not build RAF flight schedule identity.',
      );
    }

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
      skdNonSkd: payload.skdNonSkd || 'Non-Schedule',
      flightType: 'RAF',
      isRafFlight: true,
      scheduleSource: CREATION_RAF_SCHEDULE_SOURCE,
      createdBy: createdBy || undefined,
      modifiedBy: createdBy || undefined,
      ...(stationCode ? { stationCode } : {}),
    };

    let doc: CreationRafDocument;
    try {
      doc = await this.creationRafModel.create(docPayload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/E11000|duplicate/i.test(msg)) {
        throw new ConflictException(
          'A RAF flight with the same airline, flight number, and date already exists for this station.',
        );
      }
      throw err;
    }

    await this.advanceRafAirlineService.ensureAirline(
      airline,
      String(payload.airlineCode ?? ''),
      station,
    );

    this.logger.log(
      `[creation-raf] created serial=${allocated.serialNo} scheduleId=${scheduleId} date=${operationDate} station=${stationCode ?? 'cross'}`,
    );

    const lean = doc.toObject();
    return {
      success: true,
      id: String(lean._id ?? ''),
      serialNo: allocated.serialNo,
      scheduleId,
      operationDate,
      scheduleSource: CREATION_RAF_SCHEDULE_SOURCE,
      record: lean,
      message:
        'RAF flight saved for this station. It is now available in Ramp Assistance Forms.',
    };
  }

  async listByDate(dateDdMmYyyy: string, station: StationScopeContext) {
    const date = normalizeOperationDateDdMmYyyy(dateDdMmYyyy);
    if (!date) {
      throw new BadRequestException(
        'date query parameter is required (dd/MM/yyyy).',
      );
    }
    const rows = await this.creationRafModel
      .find(
        StationScope.filter(
          { $or: [{ date }, { date2: date }, { operationDate: date }] },
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
    serialNo?: string,
  ) {
    const { fromDate, toDate } = normalizeCreationDateRange(
      fromDdMmYyyy,
      toDdMmYyyy,
    );
    const dates = enumerateDdMmYyyyRange(fromDate, toDate);
    const filter: Record<string, unknown> = {
      $or: [
        { date: { $in: dates } },
        { date2: { $in: dates } },
        { operationDate: { $in: dates } },
      ],
    };
    const serial = String(serialNo ?? '').trim();
    if (serial) {
      filter.serialNo = serial;
    }
    const rows = await this.creationRafModel
      .find(StationScope.filter(filter, station))
      .sort({ serialNo: -1, createdAt: -1 })
      .lean();
    return { success: true, fromDate, toDate, rows };
  }

  private async assertNoDuplicate(
    airline: string,
    flightNo: string,
    operationDate: string,
    station: StationScopeContext,
  ): Promise<void> {
    const airlineKey = normalizeAirlineKey(airline);
    const flightKey = normalizeFlightKey(flightNo);
    const candidates = await this.creationRafModel
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
        { airlines: 1, flightNo: 1 },
      )
      .lean();

    for (const doc of candidates) {
      const docAirline = normalizeAirlineKey(String(doc.airlines ?? ''));
      const docFlight = normalizeFlightKey(String(doc.flightNo ?? ''));
      if (docAirline === airlineKey && docFlight === flightKey) {
        throw new ConflictException(
          'A RAF flight with the same airline, flight number, and date already exists for this station.',
        );
      }
    }
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
      'operationDate',
      'scheduleId',
    ] as const;
    const out: Record<string, string> = {};
    for (const key of fields) {
      const v = body[key];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) out[key] = s;
    }
    if (staDate) {
      out.date = staDate;
      out.operationDate = staDate;
    }
    if (stdDate) out.date2 = stdDate;
    out.skdNonSkd = 'Non-Scheduled';
    return out;
  }

  private nonEmpty(...values: unknown[]): string {
    for (const v of values) {
      const s = String(v ?? '').trim();
      if (s) return s;
    }
    return '';
  }
}
