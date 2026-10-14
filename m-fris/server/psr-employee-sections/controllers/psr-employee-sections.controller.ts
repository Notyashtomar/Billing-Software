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
import { PsrEmployeeSectionsService } from '../services/psr-employee-sections.service';
import { UpsertPsrEmployeeSectionDto } from '../dto/upsert-psr-employee-section.dto';

const upsertPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
});

@Roles(...REPORT_VIEW_ROLES)
@FrisPagePermission('reports', 'Pax Shift Report')
@Controller('pax-shift/psr-employee-sections')
export class PsrEmployeeSectionsController {
  constructor(
    private readonly psrEmployeeSectionsService: PsrEmployeeSectionsService,
  ) {}

  @Get()
  getByFlightSerialAndSection(
    @Query('flightSerial') flightSerial?: string,
    @Query('section') section?: string,
  ) {
    const fs = String(flightSerial ?? '').trim();
    const sec = String(section ?? '').trim();
    if (!fs) {
      throw new BadRequestException(
        'Query parameter flightSerial is required.',
      );
    }
    if (!sec) {
      throw new BadRequestException('Query parameter section is required.');
    }
    return this.psrEmployeeSectionsService.getByFlightSerialAndSection(fs, sec);
  }

  @Put()
  upsert(@Body(upsertPipe) dto: UpsertPsrEmployeeSectionDto) {
    return this.psrEmployeeSectionsService.upsert({
      flightSerial: dto.flightSerial,
      section: dto.section,
      rows: dto.rows ?? [],
    });
  }
}
