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
import { AdvanceStaffService } from '../services/advance-staff.service';
import { CreateAdvanceStaffDto } from '../dto/create-advance-staff.dto';
import { UpdateAdvanceStaffDto } from '../dto/update-advance-staff.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

/**
 * NOTE: @FrisPagePermission is intentionally NOT set at class level here.
 * GET endpoints must be accessible to all authenticated users (e.g. customer
 * service agents) so that the staff dropdown in Equipment/Manpower form works.
 * Only write operations (POST, PATCH, DELETE) require the Advance→Staff page
 * permission to prevent unauthorised data mutations.
 */
@Controller('advance-staff')
export class AdvanceStaffController {
  constructor(private readonly advanceStaffService: AdvanceStaffService) {}

  @FrisPagePermission('advance', 'Staff')
  @Post()
  create(
    @Body() dto: CreateAdvanceStaffDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceStaffService.create(dto, station);
  }

  @FrisPagePermission('advance', 'Staff')
  @Post('bulk')
  createBulk(
    @Body()
    body: CreateAdvanceStaffDto[] | { rows: CreateAdvanceStaffDto[] },
    @CurrentStation() station: StationScopeContext,
  ) {
    const rows = Array.isArray(body)
      ? body
      : ((body as { rows: CreateAdvanceStaffDto[] }).rows ?? []);
    return this.advanceStaffService.createBulk(rows, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceStaffService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceStaffService.findOne(id, station);
  }

  @FrisPagePermission('advance', 'Staff')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdvanceStaffDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceStaffService.update(id, dto, station);
  }

  @FrisPagePermission('advance', 'Staff')
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceStaffService.remove(id, station);
  }
}
