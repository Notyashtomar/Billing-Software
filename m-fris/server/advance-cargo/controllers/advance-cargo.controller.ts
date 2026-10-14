import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FrisPagePermission } from '../../auth/decorators/fris-page-permission.decorator';
import { AdvanceCargoService } from '../services/advance-cargo.service';
import { AdvanceAirlineService } from '../../advance-airline/services/advance-airline.service';
import { AdvanceAircraftService } from '../../advance-aircraft/services/advance-aircraft.service';
import { UpsertAdvanceCargoSectionDto } from '../dto/upsert-advance-cargo-section.dto';
import { SaveAdvanceCargoFlightDto } from '../dto/save-advance-cargo-flight.dto';
import { AppendAdvanceCargoServiceDto } from '../dto/append-advance-cargo-service.dto';
import { AppendAdvanceCargoUnitMasterDto } from '../dto/append-advance-cargo-unit-master.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

const bodyPipe = new ValidationPipe({
  whitelist: false,
  forbidNonWhitelisted: false,
  transform: true,
});

@FrisPagePermission('advance', 'Cargo')
@Controller('advance-cargo')
export class AdvanceCargoController {
  constructor(
    private readonly advanceCargoService: AdvanceCargoService,
    private readonly advanceAirlineService: AdvanceAirlineService,
    private readonly advanceAircraftService: AdvanceAircraftService,
  ) {}

  /** Station-scoped airlines for Cargo dropdowns. */
  @Get('reference/airlines')
  listAirlinesForCargo(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAirlineService.findAll(filter, station);
  }

  /** Aircraft catalog for Cargo dropdowns. */
  @Get('reference/aircraft')
  listAircraftForCargo(
    @CurrentStation() station: StationScopeContext,
    @Query('search') search?: string,
  ) {
    return this.advanceAircraftService.findAll(search, station);
  }

  @Get()
  findAll(@CurrentStation() station: StationScopeContext) {
    return this.advanceCargoService.findAll(station);
  }

  @Get('services')
  listServices(@CurrentStation() station: StationScopeContext) {
    return this.advanceCargoService.listServices(station);
  }

  @Post('services')
  @UsePipes(bodyPipe)
  appendService(
    @Body() dto: AppendAdvanceCargoServiceDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceCargoService.appendService(dto, station);
  }

  @Get('unit-master')
  listUnitMaster(@CurrentStation() station: StationScopeContext) {
    return this.advanceCargoService.listUnitMaster(station);
  }

  @Post('unit-master')
  @UsePipes(bodyPipe)
  appendUnitMaster(
    @Body() dto: AppendAdvanceCargoUnitMasterDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceCargoService.appendUnitMaster(dto, station);
  }

  @Get(':entryKey')
  findOne(
    @Param('entryKey') entryKey: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceCargoService.findByEntryKey(entryKey, station);
  }

  @Post('section')
  @UsePipes(bodyPipe)
  upsertSection(
    @Body() dto: UpsertAdvanceCargoSectionDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceCargoService.upsertSection(dto, station);
  }

  @Post('flight')
  @UsePipes(bodyPipe)
  saveFlight(
    @Body() dto: SaveAdvanceCargoFlightDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceCargoService.saveFlight(dto, station);
  }

  @Delete(':entryKey')
  remove(
    @Param('entryKey') entryKey: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceCargoService.removeByEntryKey(entryKey, station);
  }
}
