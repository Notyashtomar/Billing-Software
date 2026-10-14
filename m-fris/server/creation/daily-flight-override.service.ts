import {
  BadRequestException,
  Injectable,
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
import {
  ScheduledAirlinesCreation,
  ScheduledAirlinesCreationDocument,
} from '../raw-flight-data/schema/scheduled-airlines-creation.schema';
import { invalidateListDailyFromAdvanceCache } from '../raw-flight-data/utils/list-daily-from-advance-cache.util';
import {
  buildDailyOverrideSerialKey,
  normalizeOperationDateDdMmYyyy,
} from './utils/daily-flight-override.util';
import { AdditionalFlightService } from './additional-flight.service';
import { isAdditionalFlightScheduleId } from './utils/additional-flight.util';

export type DailyFlightOverrideFindResult = {
  serialNo: string;
  operationalSerial: string;
  scheduleMasterSerial: string;
  operationDate: string;
  flightStatus: string;
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
    flightStatus: string;
  }>;
};

/**
 * Creation → Schedule Airlines: day-scoped operational overrides.
 * Never writes to `advance_schedule_setup` (master season schedule).
 */
@Injectable()
export class DailyFlightOverrideService {
  constructor(
    private readonly rawFlightDataService: RawFlightDataService,
    @InjectModel(ScheduledAirlinesCreation.name)
    private readonly scheduledCreationModel: Model<ScheduledAirlinesCreationDocument>,
    private readonly additionalFlightService: AdditionalFlightService,
  ) {}

  /**
   * Find the generated flight for airline + flight number + date (default today).
   */
  async findDailyFlight(
    airline: string,
    flightNo: string,
    dateDdMmYyyy: string | undefined,
    station: StationScopeContext,
    options?: { openOnly?: boolean; airlineCode?: string },
  ): Promise<DailyFlightOverrideFindResult | null> {
    return this.rawFlightDataService.findDailyOperationalFlight(
      airline,
      flightNo,
      dateDdMmYyyy,
      options,
      station,
    );
  }

  /**
   * Persist a **daily** operational override for one generated flight instance.
   * Isolates changes to that instance + operating date only.
   */
  async saveDailyOverride(
    body: Record<string, unknown>,
    station: StationScopeContext,
    user?: AuthenticatedPrincipal | null,
  ) {
    const airline = this.nonEmpty(body.airlines, body.airline, body.Airline);
    const flightNo = this.nonEmpty(
      body.flightNo,
      body['Flight No'],
    )
      .toUpperCase()
      .replace(/\s/g, '');
    const operationDate = normalizeOperationDateDdMmYyyy(
      this.nonEmpty(body.staDate, body['STA Date'], body.date, body.operationDate),
    );

    if (!airline || !flightNo) {
      throw new BadRequestException(
        'airlines and flightNo are required to save a daily flight override.',
      );
    }
    if (!operationDate) {
      throw new BadRequestException(
        'Flight date (STA Date) is required and must be dd/MM/yyyy.',
      );
    }

    // Resolve the generated instance for this day — do not create a new master.
    const found = await this.rawFlightDataService.findDailyOperationalFlight(
      airline,
      flightNo,
      operationDate,
      {
        openOnly: false,
        airlineCode: this.nonEmpty(body.airlineCode, body['Airline Code']),
      },
      station,
    );
    if (!found) {
      throw new NotFoundException(
        'No scheduled flight found for the selected airline, flight number, and date.',
      );
    }
    if (!found.editable) {
      throw new BadRequestException(
        `Flight serial ${found.operationalSerial} is ${found.flightStatus} and cannot be edited.`,
      );
    }

    const scheduleMasterSerial = this.nonEmpty(
      body.scheduleMasterSerial,
      found.scheduleMasterSerial,
    );
    const instanceSerial = this.nonEmpty(
      body.instanceSerial,
      body.operationalSerial,
      found.operationalSerial,
    );
    if (!scheduleMasterSerial) {
      throw new BadRequestException(
        'Could not resolve schedule master serial for this daily flight.',
      );
    }

    const overrideKey = buildDailyOverrideSerialKey({
      instanceSerial,
      scheduleMasterSerial,
      operationDateDdMmYyyy: operationDate,
    });

    const {
      serialNo: _sn,
      scheduleMasterSerial: _ms,
      operationDate: _od,
      instanceSerial: _is,
      operationalSerial: _os,
      modifiedBy: _mb,
      ...rest
    } = body;

    const modifiedBy = this.nonEmpty(
      user?.email,
      user?.name,
      body.modifiedBy,
    );

    const data: Record<string, unknown> = {
      ...rest,
      airlines: airline,
      airline,
      Airline: airline,
      flightNo,
      'Flight No': flightNo,
      staDate: operationDate,
      'STA Date': operationDate,
      date: operationDate,
      operationDate,
      scheduleMasterSerial,
      instanceSerial,
      // Marker so list overlays know this is a day override, not a season edit.
      dailyFlightOverride: true,
      ...(isAdditionalFlightScheduleId(scheduleMasterSerial)
        ? {
            isAdditionalFlight: true,
            flightType: 'Additional',
            skdNonSkd: this.nonEmpty(rest.skdNonSkd, 'Additional'),
          }
        : {}),
    };

    const stationCode =
      !station.crossStation && station.stationCode
        ? station.stationCode
        : undefined;

    await this.scheduledCreationModel.findOneAndUpdate(
      { serialNo: overrideKey },
      {
        $set: {
          serialNo: overrideKey,
          scheduleMasterSerial,
          operationDate,
          instanceSerial: instanceSerial || undefined,
          modifiedBy: modifiedBy || undefined,
          data,
          ...(stationCode ? { stationCode } : {}),
        },
      },
      { upsert: true, new: true },
    );

    // Drop legacy master-keyed docs for the same day so they cannot bleed
    // overrides onto other dates via the old unique-serial model.
    if (/^\d{6}$/.test(scheduleMasterSerial) && scheduleMasterSerial !== overrideKey) {
      await this.scheduledCreationModel.deleteMany(
        StationScope.filter(
          {
            serialNo: scheduleMasterSerial,
            $or: [
              { operationDate },
              { 'data.staDate': operationDate },
              { 'data.date': operationDate },
            ],
          },
          station,
        ),
      );
    }

    // Mirror ops edits onto Additional Flights source when this day came from that module.
    if (isAdditionalFlightScheduleId(scheduleMasterSerial)) {
      await this.additionalFlightService.syncFromDailyOverride({
        scheduleMasterSerial,
        operationDate,
        instanceSerial,
        data,
        modifiedBy,
        station,
      });
    }

    invalidateListDailyFromAdvanceCache();

    return {
      success: true,
      serialNo: overrideKey,
      operationalSerial: instanceSerial || overrideKey,
      scheduleMasterSerial,
      operationDate,
      fhrStaDatesCount: 0,
      message: isAdditionalFlightScheduleId(scheduleMasterSerial)
        ? 'Additional flight updated for this operating day only. Master schedule was not changed.'
        : 'Daily flight override saved for this operating day only. Master schedule was not changed.',
    };
  }

  private nonEmpty(...vals: unknown[]): string {
    for (const v of vals) {
      const t = String(v ?? '').trim();
      if (t) return t;
    }
    return '';
  }
}
