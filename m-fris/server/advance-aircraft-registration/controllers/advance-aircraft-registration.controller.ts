import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
} from '@nestjs/common';
import { FrisPagePermission } from '../../auth/decorators/fris-page-permission.decorator';
import { AdvanceAircraftRegistrationService } from '../services/advance-aircraft-registration.service';
import { AdvanceAirlineService } from '../../advance-airline/services/advance-airline.service';
import { AdvanceAircraftService } from '../../advance-aircraft/services/advance-aircraft.service';
import { CreateAdvanceAircraftRegistrationDto } from '../dto/create-advance-aircraft-registration.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'Aircraft Registration')
@Controller('advance-aircraft-registration')
export class AdvanceAircraftRegistrationController {
  constructor(
    private readonly advanceAircraftRegistrationService: AdvanceAircraftRegistrationService,
    private readonly advanceAirlineService: AdvanceAirlineService,
    private readonly advanceAircraftService: AdvanceAircraftService,
  ) {}

  /** Station-scoped airlines for registration dropdowns. */
  @Get('reference/airlines')
  listAirlinesForRegistration(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAirlineService.findAll(filter, station);
  }

  /** Aircraft catalog for registration dropdowns (global master). */
  @Get('reference/aircraft')
  listAircraftForRegistration(
    @CurrentStation() station: StationScopeContext,
    @Query('search') search?: string,
  ) {
    return this.advanceAircraftService.findAll(search, station);
  }

  @Post()
  create(
    @Body() dto: CreateAdvanceAircraftRegistrationDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAircraftRegistrationService.create(dto, station);
  }

  @Post('bulk')
  createBulk(
    @Body()
    body:
      | CreateAdvanceAircraftRegistrationDto[]
      | { rows: CreateAdvanceAircraftRegistrationDto[] },
    @CurrentStation() station: StationScopeContext,
  ) {
    const rows = Array.isArray(body)
      ? body
      : ((body as { rows: CreateAdvanceAircraftRegistrationDto[] }).rows ?? []);
    return this.advanceAircraftRegistrationService.createBulk(rows, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAircraftRegistrationService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAircraftRegistrationService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceAircraftRegistrationDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAircraftRegistrationService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAircraftRegistrationService.remove(id, station);
  }
}
