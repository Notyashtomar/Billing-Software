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
import { AdvanceAirlineLogoService } from '../services/advance-airline-logo.service';
import { AdvanceAirlineService } from '../../advance-airline/services/advance-airline.service';
import { CreateAdvanceAirlineLogoDto } from '../dto/create-advance-airline-logo.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'Logo of Airline')
@Controller('advance-airline-logo')
export class AdvanceAirlineLogoController {
  constructor(
    private readonly advanceAirlineLogoService: AdvanceAirlineLogoService,
    private readonly advanceAirlineService: AdvanceAirlineService,
  ) {}

  /** Station-scoped airlines for logo dropdowns. */
  @Get('reference/airlines')
  listAirlinesForLogo(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAirlineService.findAll(filter, station);
  }

  @Post()
  create(
    @Body() dto: CreateAdvanceAirlineLogoDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAirlineLogoService.create(dto, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAirlineLogoService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAirlineLogoService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceAirlineLogoDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAirlineLogoService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAirlineLogoService.remove(id, station);
  }
}
