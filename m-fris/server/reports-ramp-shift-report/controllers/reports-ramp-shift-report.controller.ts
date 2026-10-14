import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { OPERATIONAL_ROLES } from '../../auth/enums/roles.enum';
import { ReportsRampShiftReportService } from '../services/reports-ramp-shift-report.service';
import { UpsertRampShiftReportDto } from '../dto/upsert-ramp-shift-report.dto';
import type { RampShiftBand } from '../constants/reports-ramp-shift-report.constants';

const bodyPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
});

@Roles(...OPERATIONAL_ROLES)
@Controller('reports-ramp-shift-report')
export class ReportsRampShiftReportController {
  constructor(private readonly service: ReportsRampShiftReportService) {}

  @Get('new-id')
  newReportId() {
    return { reportId: this.service.createReportId() };
  }

  @Get('scheduled-flights')
  scheduledFlights(
    @Query('reportDate') reportDate?: string,
    @Query('shift') shift?: string,
  ) {
    const d = String(reportDate ?? '').trim();
    const s = String(shift ?? '').trim() as RampShiftBand;
    if (!d) throw new BadRequestException('reportDate is required (yyyy-MM-dd)');
    if (s !== 'day' && s !== 'night') {
      throw new BadRequestException('shift must be day or night');
    }
    return this.service.getScheduledFlightsFromFhr(d, s);
  }

  @Get()
  list(
    @Query('reportDate') reportDate?: string,
    @Query('shift') shift?: string,
  ) {
    const d = String(reportDate ?? '').trim();
    const s = String(shift ?? '').trim() as RampShiftBand;
    if (!d) throw new BadRequestException('reportDate is required');
    if (s !== 'day' && s !== 'night') {
      throw new BadRequestException('shift must be day or night');
    }
    return this.service.listByDateAndShift(d, s);
  }

  @Get(':reportId')
  getOne(@Param('reportId') reportId: string) {
    return this.service.getByReportId(reportId);
  }

  @Put()
  upsert(@Body(bodyPipe) dto: UpsertRampShiftReportDto) {
    return this.service.upsert(dto);
  }
}
