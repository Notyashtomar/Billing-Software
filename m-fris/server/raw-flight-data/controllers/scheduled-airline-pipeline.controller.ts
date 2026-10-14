import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ROLES, Role } from '../../auth/enums/roles.enum';
import { RawFlightDataService } from '../services/raw-flight-data.service';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { SkipTimeout } from '../../protection/decorators/skip-timeout.decorator';
import { FrisPagePermissionAny } from '../../auth/decorators/fris-page-permission.decorator';
import type { FrisPagePermissionMeta } from '../../auth/decorators/fris-page-permission.decorator';

const looseBodyPipe = new ValidationPipe({
  whitelist: false,
  forbidNonWhitelisted: false,
  transform: true,
});

const PIPELINE_PAGE_PERMISSIONS: FrisPagePermissionMeta[] = [
  { tab: 'advance', pageLabel: 'Schedule Setup' },
  { tab: 'creation', pageLabel: 'Scheduled Airlines' },
  { tab: 'flights', pageLabel: 'Scheduled Airlines' },
];

/**
 * Advance Schedule Setup + Creation forms → staging collections → merged `raw_flight_data`.
 */
@FrisPagePermissionAny(...PIPELINE_PAGE_PERMISSIONS)
@Controller('scheduled-airline-pipeline')
export class ScheduledAirlinePipelineController {
  constructor(private readonly rawFlightDataService: RawFlightDataService) {}

  // Access follows page permissions (assigned from the admin panel), not role:
  // any authenticated user granted the Schedule Setup page can save. Station is
  // taken from the JWT (@CurrentStation) and stamped server-side, so data stays
  // isolated per station regardless of what the client sends.
  @Post('advance-schedule')
  @UsePipes(looseBodyPipe)
  saveAdvanceSchedule(
    @Body() body: Record<string, unknown>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rawFlightDataService.saveAdvanceScheduleSetup(body, station);
  }

  /**
   * Creation → Scheduled Airlines: indexed lookup by serial (instance, schedule master, or FHR).
   */
  @Get('find-by-serial/:serialNo')
  @Header('Cache-Control', 'no-store')
  async findBySerial(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const result = await this.rawFlightDataService.findEditableFlightBySerial(
      serialNo ?? '',
      station,
    );
    if (!result) {
      throw new NotFoundException(
        `No flight found for serial ${String(serialNo ?? '').trim()}`,
      );
    }
    return result;
  }

  /**
   * Creation → Schedule Airlines Find Record by airline + flight.
   * Resolves the **generated daily instance** for `date` (default: today).
   * Does not return the season master for editing.
   */
  @Get('find-advance')
  findAdvance(
    @CurrentStation() station: StationScopeContext,
    @Query('airline') airline: string,
    @Query('flightNo') flightNo: string,
    @Query('date') date?: string,
    @Query('airlineCode') airlineCode?: string,
    @Query('openOnly') openOnly?: string,
  ) {
    const onlyOpen =
      openOnly === '1' ||
      String(openOnly ?? '')
        .trim()
        .toLowerCase() === 'true';
    return this.rawFlightDataService.findLatestAdvanceByAirlineFlight(
      airline ?? '',
      flightNo ?? '',
      { openOnly: onlyOpen, date, airlineCode },
      station,
    );
  }

  /**
   * Scheduled Airlines table: **only** `fhr_collection` documents, keyed by `SerialNo` /
   * `flightSerialNumber` (STA/STD day must fall in `from`–`to`). Legacy route name unchanged.
   */
  @Get('daily-from-advance')
  @SkipTimeout()
  @Header('Cache-Control', 'no-store')
  listDailyFromAdvance(
    @CurrentStation() station: StationScopeContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('nocache') nocache?: string,
  ) {
    const skipCache =
      nocache === '1' ||
      String(nocache ?? '')
        .trim()
        .toLowerCase() === 'true';
    return this.rawFlightDataService.listDailyFromAdvance(
      from,
      to,
      skipCache,
      station,
    );
  }

  /**
   * Airline labels derived from saved schedule-setup payloads (same collection as Advance → Schedule Setup).
   */
  @Get('advance-schedule-setup/airlines')
  listAdvanceScheduleSetupAirlines(
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rawFlightDataService.listDistinctAirlinesFromAdvanceScheduleSetup(
      station,
    );
  }

  /** Master rows saved in `advance_schedule_setup` (not daily expanded). */
  @Get('advance-schedule-setup')
  listAdvanceScheduleSetupMasters(
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rawFlightDataService.listAdvanceScheduleSetupMasters(station);
  }

  /**
   * Stretch Valid To on this station's masters. Does not mint daily FHR rows.
   */
  @Post('advance-schedule-setup/extend-validity')
  @UsePipes(looseBodyPipe)
  extendAdvanceScheduleValidity(
    @Body() body: { validTo?: string },
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rawFlightDataService.extendAdvanceScheduleValidityTo(
      String(body?.validTo ?? ''),
      station,
    );
  }

  @Delete('advance-schedule-setup/:id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  removeAdvanceScheduleSetupMaster(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rawFlightDataService.removeAdvanceScheduleSetupMaster(id, station);
  }

  /** Admin utility: reset persistent global serial mappings for clean regeneration. */
  @Post('reset-serial-mapping')
  @Roles(...ADMIN_ROLES)
  resetSerialMapping(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() body?: { allStations?: boolean },
  ) {
    return this.rawFlightDataService.resetGlobalSerialMapping({
      allStations: body?.allStations ?? false,
      isGlobalAdmin: user?.isGlobalAdmin === true,
    });
  }

  /**
   * One-time cleanup: delete `raw_flight_data` rows keyed by exactly six-digit serials
   * (global instance / padded schedule serial strings / FL-######), which duplicate
   * schedule truth in `advance_schedule_setup` and confuse scheduled-airlines metrics.
   */
  @Post('prune-six-digit-serial-raw-flights')
  @Roles(...ADMIN_ROLES)
  pruneSixDigitSerialRawFlights(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() body?: { allStations?: boolean },
  ) {
    return this.rawFlightDataService.pruneRawFlightDataSixDigitSerialRows({
      allStations: body?.allStations ?? false,
      isGlobalAdmin: user?.isGlobalAdmin === true,
    });
  }

  /**
   * Merge same-season duplicate advance schedule masters for the current station
   * (e.g. Apr/May/Jun monthly rows → one Summer validity window per flight).
   */
  @Post('advance-schedule-setup/consolidate-seasons')
  @Roles(...ADMIN_ROLES)
  @SkipTimeout()
  consolidateAdvanceScheduleSeasons(
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rawFlightDataService.consolidateAdvanceSchedulesBySeason(
      station,
    );
  }
}
