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
import { PsrFlightDetailsService } from '../services/psr-flight-details.service';
import { UpsertPsrFlightDetailsDto } from '../dto/upsert-psr-flight-details.dto';

const upsertPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
});

@Roles(...REPORT_VIEW_ROLES)
@FrisPagePermission('reports', 'Pax Shift Report')
@Controller('pax-shift/psr-flight-details')
export class PsrFlightDetailsController {
  constructor(
    private readonly psrFlightDetailsService: PsrFlightDetailsService,
  ) {}

  @Get()
  getByFlightSerial(@Query('flightSerial') flightSerial?: string) {
    const fs = String(flightSerial ?? '').trim();
    if (!fs) {
      throw new BadRequestException(
        'Query parameter flightSerial is required.',
      );
    }
    return this.psrFlightDetailsService.getByFlightSerial(fs);
  }

  @Put()
  upsert(@Body(upsertPipe) dto: UpsertPsrFlightDetailsDto) {
    return this.psrFlightDetailsService.upsert({
      flightSerial: dto.flightSerial,
      data: dto.data ?? {},
    });
  }
}
