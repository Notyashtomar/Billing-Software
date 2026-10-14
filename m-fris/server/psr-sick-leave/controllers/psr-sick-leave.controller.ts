import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FrisPagePermission } from '../../auth/decorators/fris-page-permission.decorator';
import { REPORT_VIEW_ROLES } from '../../auth/enums/roles.enum';
import { PsrSickLeaveService } from '../services/psr-sick-leave.service';
import { UpsertPsrSickLeaveDto } from '../dto/upsert-psr-sick-leave.dto';

const upsertPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
});

@Roles(...REPORT_VIEW_ROLES)
@FrisPagePermission('reports', 'Pax Shift Report')
@Controller('pax-shift/psr-sick-leave')
export class PsrSickLeaveController {
  constructor(private readonly psrSickLeaveService: PsrSickLeaveService) {}

  @Get()
  getByFlightSerial(@Query('flightSerial') flightSerial?: string) {
    const fs = String(flightSerial ?? '').trim();
    if (!fs) {
      throw new BadRequestException(
        'Query parameter flightSerial is required.',
      );
    }
    return this.psrSickLeaveService.getByFlightSerial(fs);
  }

  @Put()
  upsert(@Body(upsertPipe) dto: UpsertPsrSickLeaveDto) {
    return this.psrSickLeaveService.upsert({
      flightSerial: dto.flightSerial,
      rows: dto.rows ?? [],
    });
  }
}
