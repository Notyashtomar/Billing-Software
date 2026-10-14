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
import { AdvanceAircraftService } from '../services/advance-aircraft.service';
import { CreateAdvanceAircraftDto } from '../dto/create-advance-aircraft.dto';
import { UpdateAdvanceAircraftDto } from '../dto/update-advance-aircraft.dto';
import { BulkCreateAdvanceAircraftItemDto } from '../dto/bulk-create-advance-aircraft.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'Aircraft')
@Controller('advance-aircraft')
export class AdvanceAircraftController {
  constructor(
    private readonly advanceAircraftService: AdvanceAircraftService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateAdvanceAircraftDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAircraftService.create(dto, station);
  }

  @Post('bulk')
  createBulk(
    @Body()
    body:
      | BulkCreateAdvanceAircraftItemDto[]
      | { rows: BulkCreateAdvanceAircraftItemDto[] },
    @CurrentStation() station: StationScopeContext,
  ) {
    const rows = Array.isArray(body)
      ? body
      : ((body as { rows: BulkCreateAdvanceAircraftItemDto[] }).rows ?? []);
    return this.advanceAircraftService.createBulk(rows, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('search') search?: string,
  ) {
    return this.advanceAircraftService.findAll(search, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAircraftService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdvanceAircraftDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAircraftService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceAircraftService.remove(id, station);
  }
}
