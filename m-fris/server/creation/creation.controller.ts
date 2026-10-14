import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FrisPagePermission, FrisPagePermissionAny } from '../auth/decorators/fris-page-permission.decorator';
import { AdvanceAirlineService } from '../advance-airline/services/advance-airline.service';
import { AdvanceAircraftService } from '../advance-aircraft/services/advance-aircraft.service';
import { AdvanceNonScheduledAirlineService } from '../advance-non-scheduled-airline/services/advance-non-scheduled-airline.service';
import { CurrentStation } from '../common/station/current-station.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { StationScopeContext } from '../common/station/station-scope';
import type { AuthenticatedPrincipal } from '../auth/services/identity.service';
import { CreationService } from './creation.service';
import { DailyFlightOverrideService } from './daily-flight-override.service';
import { RawFlightDataService } from '../raw-flight-data/services/raw-flight-data.service';

const looseBodyPipe = new ValidationPipe({
  whitelist: false,
  forbidNonWhitelisted: false,
  transform: true,
});

@Controller('scheduled-airline-pipeline')
export class CreationController {
  constructor(
    private readonly creationService: CreationService,
    private readonly dailyFlightOverrideService: DailyFlightOverrideService,
    private readonly rawFlightDataService: RawFlightDataService,
    private readonly advanceAirlineService: AdvanceAirlineService,
    private readonly advanceAircraftService: AdvanceAircraftService,
    private readonly advanceNonScheduledAirlineService: AdvanceNonScheduledAirlineService,
  ) {}

  /** Read-only airline master for Creation → Scheduled Airlines dropdowns. */
  @Get('creation-reference/airlines')
  @FrisPagePermission('creation', 'Scheduled Airlines')
  listAirlinesForCreation(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAirlineService.findAll(filter, station);
  }

  /**
   * Flight numbers from Schedule Setup for the selected airline
   * (Creation → Schedule Airlines Flight No dropdown).
   */
  @Get('creation-reference/flights')
  @FrisPagePermission('creation', 'Scheduled Airlines')
  listFlightsForAirline(
    @CurrentStation() station: StationScopeContext,
    @Query('airline') airline?: string,
    @Query('airlineCode') airlineCode?: string,
  ) {
    return this.rawFlightDataService.listFlightNosFromAdvanceScheduleSetup(
      airline ?? '',
      airlineCode,
      station,
    );
  }

  /** Read-only aircraft master for Creation → Scheduled Airlines dropdowns. */
  @Get('creation-reference/aircraft')
  @FrisPagePermission('creation', 'Scheduled Airlines')
  listAircraftForCreation(
    @CurrentStation() station: StationScopeContext,
    @Query('search') search?: string,
  ) {
    return this.advanceAircraftService.findAll(search, station);
  }

  /** Station-scoped airlines for Advance → Schedule Setup dropdowns. */
  @Get('advance-schedule-setup/reference/airlines')
  @FrisPagePermission('advance', 'Schedule Setup')
  listAirlinesForScheduleSetup(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAirlineService.findAll(filter, station);
  }

  /** Aircraft catalog for Advance → Schedule Setup dropdowns. */
  @Get('advance-schedule-setup/reference/aircraft')
  @FrisPagePermission('advance', 'Schedule Setup')
  listAircraftForScheduleSetup(
    @CurrentStation() station: StationScopeContext,
    @Query('search') search?: string,
  ) {
    return this.advanceAircraftService.findAll(search, station);
  }

  /** Station-scoped airlines for Creation → Additional Flights dropdowns. */
  @Get('creation-reference/additional-flights/airlines')
  @FrisPagePermission('creation', 'Additional Flights')
  listAirlinesForAdditionalFlights(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAirlineService.findAll(filter, station);
  }

  /** Aircraft catalog for Creation → Additional Flights dropdowns. */
  @Get('creation-reference/additional-flights/aircraft')
  @FrisPagePermission('creation', 'Additional Flights')
  listAircraftForAdditionalFlights(
    @CurrentStation() station: StationScopeContext,
    @Query('search') search?: string,
  ) {
    return this.advanceAircraftService.findAll(search, station);
  }

  /**
   * Creation → Schedule Airlines: save a **daily operational override** only.
   * Does not mutate Advance → Schedule Setup.
   */
  @Post('creation')
  @FrisPagePermission('creation', 'Scheduled Airlines')
  @UsePipes(looseBodyPipe)
  saveCreation(
    @Body() body: Record<string, unknown>,
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.creationService.saveCreation(body, station, user);
  }

  /**
   * Creation → Schedule Airlines: find today's (or selected date's) generated flight.
   * GET /scheduled-airline-pipeline/find-daily?airline=&flightNo=&date=dd/MM/yyyy
   */
  @Get('find-daily')
  @FrisPagePermission('creation', 'Scheduled Airlines')
  findDailyFlight(
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
    return this.dailyFlightOverrideService.findDailyFlight(
      airline ?? '',
      flightNo ?? '',
      date,
      station,
      { openOnly: onlyOpen, airlineCode },
    );
  }

  /** Read-only Advance → Non Scheduled Airline master for Creation → RAF. */
  @Get('creation-reference/raf/airlines')
  @FrisPagePermission('creation', 'RAF')
  listAirlinesForCreationRaf(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceNonScheduledAirlineService.findAll(filter, station);
  }

  @Post('creation-raf')
  @FrisPagePermission('creation', 'RAF')
  @UsePipes(looseBodyPipe)
  saveCreationRaf(
    @Body() body: Record<string, unknown>,
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.creationService.saveCreationRaf(body, station, user);
  }

  @Get('creation-raf')
  @FrisPagePermissionAny(
    { tab: 'creation', pageLabel: 'RAF' },
    { tab: 'flights', pageLabel: 'RAF (Ramp Assistance Forms)' },
  )
  listCreationRaf(
    @CurrentStation() station: StationScopeContext,
    @Query('date') date?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('serialNo') serialNo?: string,
  ) {
    if (fromDate?.trim() && toDate?.trim()) {
      return this.creationService.listCreationRafByDateRange(
        fromDate,
        toDate,
        station,
        serialNo,
      );
    }
    return this.creationService.listCreationRafByDate(date ?? '', station);
  }

  /**
   * Creation → Additional Flights: create a one-time flight for a specific date.
   * Does not mutate Advance → Schedule Setup; appears on Schedule Airlines immediately.
   */
  @Post('creation-additional-flights')
  @FrisPagePermission('creation', 'Additional Flights')
  @UsePipes(looseBodyPipe)
  saveCreationAdditionalFlight(
    @Body() body: Record<string, unknown>,
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.creationService.saveCreationAdditionalFlight(
      body,
      station,
      user,
    );
  }

  @Post('creation-additional-flights/bulk')
  @FrisPagePermission('creation', 'Additional Flights')
  @UsePipes(looseBodyPipe)
  bulkSaveCreationAdditionalFlights(
    @Body() body: { rows?: Record<string, unknown>[] },
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.creationService.bulkSaveCreationAdditionalFlights(
      body?.rows ?? [],
      station,
      user,
    );
  }

  @Get('creation-additional-flights')
  @FrisPagePermission('creation', 'Additional Flights')
  listCreationAdditionalFlights(
    @CurrentStation() station: StationScopeContext,
    @Query('date') date?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    if (fromDate?.trim() && toDate?.trim()) {
      return this.creationService.listCreationAdditionalFlightsByDateRange(
        fromDate,
        toDate,
        station,
      );
    }
    return this.creationService.listCreationAdditionalFlightsByDate(
      date ?? '',
      station,
    );
  }
}
