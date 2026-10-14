import { Controller, Get, Query } from '@nestjs/common';
import { FrisPagePermissionAny } from '../auth/decorators/fris-page-permission.decorator';
import { AdvanceAirlineService } from '../advance-airline/services/advance-airline.service';
import { AdvanceAircraftService } from '../advance-aircraft/services/advance-aircraft.service';
import { AdvanceEquipmentService } from '../advance-equipment/services/advance-equipment.service';
import { AdvanceTerminalService } from '../advance-terminal/services/advance-terminal.service';
import { CurrentStation } from '../common/station/current-station.decorator';
import type { StationScopeContext } from '../common/station/station-scope';

/**
 * Station-scoped master dropdowns for Flights / Reports screens.
 * Avoids requiring Advance → Airline / Aircraft / Equipment / Terminal page permissions.
 */
@Controller('flights-reference')
export class FlightsReferenceController {
  constructor(
    private readonly advanceAirlineService: AdvanceAirlineService,
    private readonly advanceAircraftService: AdvanceAircraftService,
    private readonly advanceEquipmentService: AdvanceEquipmentService,
    private readonly advanceTerminalService: AdvanceTerminalService,
  ) {}

  @Get('airlines')
  @FrisPagePermissionAny(
    { tab: 'flights', pageLabel: 'Scheduled Airlines' },
    { tab: 'flights', pageLabel: 'Scheduled Data Export' },
    { tab: 'flights', pageLabel: 'Flight Schedule' },
    { tab: 'flights', pageLabel: 'Peak Flights' },
    { tab: 'flights', pageLabel: 'Non-Scheduled Airlines' },
    { tab: 'flights', pageLabel: 'Non scheduled Booking' },
    { tab: 'reports', pageLabel: 'Pax Shift Report' },
  )
  listAirlines(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAirlineService.findAll(filter, station);
  }

  @Get('aircraft')
  @FrisPagePermissionAny(
    { tab: 'flights', pageLabel: 'Scheduled Airlines' },
    { tab: 'flights', pageLabel: 'Scheduled Data Export' },
    { tab: 'flights', pageLabel: 'Flight Schedule' },
    { tab: 'flights', pageLabel: 'Peak Flights' },
    { tab: 'flights', pageLabel: 'Non-Scheduled Airlines' },
    { tab: 'flights', pageLabel: 'Non scheduled Booking' },
    { tab: 'reports', pageLabel: 'Pax Shift Report' },
  )
  listAircraft(
    @CurrentStation() station: StationScopeContext,
    @Query('search') search?: string,
  ) {
    return this.advanceAircraftService.findAll(search, station);
  }

  @Get('equipment')
  @FrisPagePermissionAny(
    { tab: 'flights', pageLabel: 'Scheduled Airlines' },
    { tab: 'flights', pageLabel: 'Non-Scheduled Airlines' },
  )
  listEquipment(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceEquipmentService.findAll(filter, station);
  }

  /** Terminal codes for Main Details / Open forms without Advance → Terminal. */
  @Get('terminals')
  @FrisPagePermissionAny(
    { tab: 'flights', pageLabel: 'Scheduled Airlines' },
    { tab: 'flights', pageLabel: 'Non-Scheduled Airlines' },
    { tab: 'flights', pageLabel: 'Non scheduled Booking' },
  )
  listTerminals(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceTerminalService.findAll(filter, station);
  }
}
