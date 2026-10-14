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
import { AdvanceOtherServicesService } from '../services/advance-other-services.service';
import { CreateAdvanceOtherServiceDto } from '../dto/create-advance-other-services.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'Other Services')
@Controller('advance-other-services')
export class AdvanceOtherServicesController {
  constructor(
    private readonly advanceOtherServicesService: AdvanceOtherServicesService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateAdvanceOtherServiceDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceOtherServicesService.create(dto, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceOtherServicesService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceOtherServicesService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceOtherServiceDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceOtherServicesService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceOtherServicesService.remove(id, station);
  }
}
