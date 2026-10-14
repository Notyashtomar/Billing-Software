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
import { AdvanceRafAirlineService } from '../services/advance-raf-airline.service';
import { CreateAdvanceRafAirlineDto } from '../dto/create-advance-raf-airline.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'Raf Airline')
@Controller('advance-raf-airline')
export class AdvanceRafAirlineController {
  constructor(
    private readonly advanceRafAirlineService: AdvanceRafAirlineService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateAdvanceRafAirlineDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceRafAirlineService.create(dto, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceRafAirlineService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceRafAirlineService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceRafAirlineDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceRafAirlineService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceRafAirlineService.remove(id, station);
  }
}
