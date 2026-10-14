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
import { AdvanceEquipmentService } from '../services/advance-equipment.service';
import { CreateAdvanceEquipmentDto } from '../dto/create-advance-equipment.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'Equipment')
@Controller('advance-equipment')
export class AdvanceEquipmentController {
  constructor(
    private readonly advanceEquipmentService: AdvanceEquipmentService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateAdvanceEquipmentDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceEquipmentService.create(dto, station);
  }

  @Post('bulk')
  createBulk(
    @Body()
    body: CreateAdvanceEquipmentDto[] | { rows: CreateAdvanceEquipmentDto[] },
    @CurrentStation() station: StationScopeContext,
  ) {
    const rows = Array.isArray(body)
      ? body
      : ((body as { rows: CreateAdvanceEquipmentDto[] }).rows ?? []);
    return this.advanceEquipmentService.createBulk(rows, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceEquipmentService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceEquipmentService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceEquipmentDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceEquipmentService.update(id, dto, station);
  }

  @Delete('all')
  removeAll(@CurrentStation() station: StationScopeContext) {
    return this.advanceEquipmentService.removeAll(station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceEquipmentService.remove(id, station);
  }
}
