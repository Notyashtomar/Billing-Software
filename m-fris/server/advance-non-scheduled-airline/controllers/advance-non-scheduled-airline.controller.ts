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
import { AdvanceNonScheduledAirlineService } from '../services/advance-non-scheduled-airline.service';
import { CreateAdvanceNonScheduledAirlineDto } from '../dto/create-advance-non-scheduled-airline.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'Non Scheduled Airline')
@Controller('advance-non-scheduled-airline')
export class AdvanceNonScheduledAirlineController {
  constructor(
    private readonly advanceNonScheduledAirlineService: AdvanceNonScheduledAirlineService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateAdvanceNonScheduledAirlineDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceNonScheduledAirlineService.create(dto, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceNonScheduledAirlineService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceNonScheduledAirlineService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceNonScheduledAirlineDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceNonScheduledAirlineService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceNonScheduledAirlineService.remove(id, station);
  }
}
