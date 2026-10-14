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
import { AdvanceScheduleEquipmentService } from '../services/advance-schedule-equipment.service';
import { AdvanceAirlineService } from '../../advance-airline/services/advance-airline.service';
import { AdvanceEquipmentService } from '../../advance-equipment/services/advance-equipment.service';
import { CreateAdvanceScheduleEquipmentDto } from '../dto/create-advance-schedule-equipment.dto';
import { UpdateAdvanceScheduleEquipmentDto } from '../dto/update-advance-schedule-equipment.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'Schedule Equipment Setup')
@Controller('advance-schedule-equipment')
export class AdvanceScheduleEquipmentController {
  constructor(
    private readonly advanceScheduleEquipmentService: AdvanceScheduleEquipmentService,
    private readonly advanceAirlineService: AdvanceAirlineService,
    private readonly advanceEquipmentService: AdvanceEquipmentService,
  ) {}

  /**
   * Station-scoped airline options for this page's dropdowns.
   * Avoids requiring Advance → Airline page permission.
   */
  @Get('reference/airlines')
  listAirlinesForSetup(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAirlineService.findAll(filter, station);
  }

  /**
   * Station-scoped equipment options for this page's dropdowns.
   * Avoids requiring Advance → Equipment page permission.
   */
  @Get('reference/equipment')
  listEquipmentForSetup(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceEquipmentService.findAll(filter, station);
  }

  @Post()
  create(
    @Body() dto: CreateAdvanceScheduleEquipmentDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceScheduleEquipmentService.create(dto, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceScheduleEquipmentService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceScheduleEquipmentService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdvanceScheduleEquipmentDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceScheduleEquipmentService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceScheduleEquipmentService.remove(id, station);
  }
}
