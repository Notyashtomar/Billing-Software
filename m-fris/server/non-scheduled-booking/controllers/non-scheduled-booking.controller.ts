import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { FrisPagePermission, FrisPagePermissionAny } from '../../auth/decorators/fris-page-permission.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import { AdvanceAircraftService } from '../../advance-aircraft/services/advance-aircraft.service';
import { AdvanceNonScheduledAirlineService } from '../../advance-non-scheduled-airline/services/advance-non-scheduled-airline.service';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';
import { CreateNonScheduledBookingDto } from '../dto/create-non-scheduled-booking.dto';
import { SaveChallanDto } from '../dto/save-challan.dto';
import { SavePassengersDto } from '../dto/save-passengers.dto';
import { UpdateNonScheduledBookingDto } from '../dto/update-non-scheduled-booking.dto';
import { NonScheduledBookingService } from '../services/non-scheduled-booking.service';

@FrisPagePermission('flights', 'Non scheduled Booking')
@Controller('non-scheduled-booking')
export class NonScheduledBookingController {
  constructor(
    private readonly nonScheduledBookingService: NonScheduledBookingService,
    private readonly advanceNonScheduledAirlineService: AdvanceNonScheduledAirlineService,
    private readonly advanceAircraftService: AdvanceAircraftService,
  ) {}

  /**
   * Read-only non-scheduled airline master for booking Bill To + NS Airlines filter.
   * Allowed with Booking or Non-Scheduled Airlines — no Advance page required.
   */
  @Get('reference/airlines')
  @FrisPagePermissionAny(
    { tab: 'flights', pageLabel: 'Non scheduled Booking' },
    { tab: 'flights', pageLabel: 'Non-Scheduled Airlines' },
  )
  listAirlinesForBooking(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceNonScheduledAirlineService.findAll(filter, station);
  }

  /**
   * Read-only aircraft master for booking + NS Open forms.
   * Allowed with Booking or Non-Scheduled Airlines — no Advance page required.
   */
  @Get('reference/aircraft')
  @FrisPagePermissionAny(
    { tab: 'flights', pageLabel: 'Non scheduled Booking' },
    { tab: 'flights', pageLabel: 'Non-Scheduled Airlines' },
  )
  listAircraftForBooking(
    @CurrentStation() station: StationScopeContext,
    @Query('search') search?: string,
  ) {
    return this.advanceAircraftService.findAll(search, station);
  }

  @Post()
  create(
    @Body() dto: CreateNonScheduledBookingDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.nonScheduledBookingService.create(dto, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('pendingChallan') pendingChallan?: string,
    @Query('challanNo') challanNo?: string,
    @Query('challanDate') challanDate?: string,
    @Query('flightNo') flightNo?: string,
    @Query('bookingNo') bookingNo?: string,
    @Query('fromDate') fromDate?: string,
    @Query('flightReady') flightReady?: string,
  ) {
    return this.nonScheduledBookingService.findAll(
      {
        filter,
        channel,
        status,
        pendingChallan:
          pendingChallan === '1' ||
          pendingChallan === 'true' ||
          pendingChallan === 'yes',
        challanNo,
        challanDate,
        flightNo,
        bookingNo,
        bookingDateFrom: fromDate,
        flightReady:
          flightReady === '1' ||
          flightReady === 'true' ||
          flightReady === 'yes',
      },
      station,
    );
  }

  /** Lookup by challan number (exact, case-insensitive via stored uppercase). */
  @Get('by-challan')
  findByChallan(
    @Query('challanNo') challanNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.nonScheduledBookingService.findByChallanNo(challanNo, station);
  }

  /**
   * Non-Scheduled Airlines table source: bookings with challan (+ promote backfill).
   * Must stay above `:bookingKey` routes.
   */
  @Get('airline-flights')
  @FrisPagePermission('flights', 'Non-Scheduled Airlines')
  listAirlineFlights(
    @CurrentStation() station: StationScopeContext,
    @Query('serialNo') serialNo?: string,
    @Query('challanNo') challanNo?: string,
    @Query('bookingNo') bookingNo?: string,
    @Query('airline') airline?: string,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    return this.nonScheduledBookingService.listAirlineFlights(
      {
        serialNo,
        challanNo,
        bookingNo,
        airline,
        fromDate,
        tillDate,
      },
      station,
    );
  }

  /**
   * Path uses bookingKey (`/` → `_`) so Nest/Express never split on `/`.
   * Display bookingNo with slashes is also accepted (normalized in service).
   */
  @Post(':bookingKey/challan')
  saveChallan(
    @Param('bookingKey') bookingKey: string,
    @Body() dto: SaveChallanDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.nonScheduledBookingService.saveChallan(
      bookingKey,
      dto,
      station,
    );
  }

  @Post(':bookingKey/passengers')
  savePassengers(
    @Param('bookingKey') bookingKey: string,
    @Body() dto: SavePassengersDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.nonScheduledBookingService.savePassengers(
      bookingKey,
      dto,
      station,
    );
  }

  @Get(':bookingKey')
  findOne(
    @Param('bookingKey') bookingKey: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.nonScheduledBookingService.findByBookingNo(
      bookingKey,
      station,
    );
  }

  @Patch(':bookingKey')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  update(
    @Param('bookingKey') bookingKey: string,
    @Body() dto: UpdateNonScheduledBookingDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.nonScheduledBookingService.update(bookingKey, dto, station);
  }

  @Delete(':bookingKey')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  remove(
    @Param('bookingKey') bookingKey: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.nonScheduledBookingService.remove(bookingKey, station);
  }
}
