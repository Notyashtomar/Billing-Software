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
import { FrisPagePermission } from '../../auth/decorators/fris-page-permission.decorator';
import { AdvanceGatewayScheduledAirlineService } from '../services/advance-gateway-scheduled-airline.service';
import { CreateAdvanceGatewayScheduledAirlineDto } from '../dto/create-advance-gateway-scheduled-airline.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'Gateway')
@Controller('advance-gateway-scheduled-airline')
export class AdvanceGatewayScheduledAirlineController {
  constructor(
    private readonly service: AdvanceGatewayScheduledAirlineService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateAdvanceGatewayScheduledAirlineDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.service.create(dto, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.service.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.service.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceGatewayScheduledAirlineDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.service.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.service.remove(id, station);
  }
}
