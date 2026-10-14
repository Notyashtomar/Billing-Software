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
import { AdvanceAirlineService } from '../services/advance-airline.service';
import { CreateAdvanceAirlineDto } from '../dto/create-advance-airline.dto';
import { UpdateAdvanceAirlineDto } from '../dto/update-advance-airline.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

// Server enforces page flags via @FrisPagePermission (not only the frontend).
@FrisPagePermission('advance', 'Airline')
@Controller('advance-airline')
export class AdvanceAirlineController {
  constructor(private readonly advanceAirlineService: AdvanceAirlineService) {}

  @Post()
  create(
    @Body() dto: CreateAdvanceAirlineDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAirlineService.create(dto, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAirlineService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAirlineService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdvanceAirlineDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAirlineService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAirlineService.remove(id, station);
  }
}
