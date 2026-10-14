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
import { AdvanceAmsServicesService } from '../services/advance-ams-services.service';
import { CreateAdvanceAmsServiceDto } from '../dto/create-advance-ams-services.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'AMS Services')
@Controller('advance-ams-services')
export class AdvanceAmsServicesController {
  constructor(
    private readonly advanceAmsServicesService: AdvanceAmsServicesService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateAdvanceAmsServiceDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAmsServicesService.create(dto, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAmsServicesService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAmsServicesService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceAmsServiceDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAmsServicesService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAmsServicesService.remove(id, station);
  }
}
