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
import { AdvanceManpowerService } from '../services/advance-manpower.service';
import { CreateAdvanceManpowerDto } from '../dto/create-advance-manpower.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'Manpower')
@Controller('advance-manpower')
export class AdvanceManpowerController {
  constructor(
    private readonly advanceManpowerService: AdvanceManpowerService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateAdvanceManpowerDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceManpowerService.create(dto, station);
  }

  @Post('bulk')
  createBulk(
    @Body()
    body: CreateAdvanceManpowerDto[] | { rows: CreateAdvanceManpowerDto[] },
    @CurrentStation() station: StationScopeContext,
  ) {
    const rows = Array.isArray(body)
      ? body
      : ((body as { rows: CreateAdvanceManpowerDto[] }).rows ?? []);
    return this.advanceManpowerService.createBulk(rows, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceManpowerService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceManpowerService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceManpowerDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceManpowerService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceManpowerService.remove(id, station);
  }
}
