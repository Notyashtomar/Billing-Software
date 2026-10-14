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
import { AdvanceDcsMasterService } from '../services/advance-dcs-master.service';
import { CreateAdvanceDcsMasterDto } from '../dto/create-advance-dcs-master.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'DCS Master')
@Controller('advance-dcs-master')
export class AdvanceDcsMasterController {
  constructor(
    private readonly advanceDcsMasterService: AdvanceDcsMasterService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateAdvanceDcsMasterDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceDcsMasterService.create(dto, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceDcsMasterService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceDcsMasterService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceDcsMasterDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceDcsMasterService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceDcsMasterService.remove(id, station);
  }
}
