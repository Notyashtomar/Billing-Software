import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FrisPagePermission } from '../../auth/decorators/fris-page-permission.decorator';
import { REPORT_VIEW_ROLES } from '../../auth/enums/roles.enum';
import { PaxDutyAllocationService } from '../services/pax-duty-allocation.service';
import { CreatePaxDutyAllocationDto } from '../dto/create-pax-duty-allocation.dto';

const bodyPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
});

/** Legacy collection — same access as reports-pax-shift-report duty-allocation. */
@Roles(...REPORT_VIEW_ROLES)
@FrisPagePermission('reports', 'Pax Shift Report')
@Controller('pax-shift/pax-duty-allocation')
export class PaxDutyAllocationController {
  constructor(private readonly service: PaxDutyAllocationService) {}

  @Post()
  create(@Body(bodyPipe) dto: CreatePaxDutyAllocationDto) {
    return this.service.create(dto);
  }

  @Get()
  list(@Query('from') from?: string, @Query('to') to?: string) {
    const f = (from ?? '').trim();
    const t = (to ?? '').trim();
    if (!f || !t) return [];
    return this.service.findInDateRange(f, t);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(bodyPipe) dto: CreatePaxDutyAllocationDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
