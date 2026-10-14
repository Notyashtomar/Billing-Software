import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FrisPagePermission } from '../../auth/decorators/fris-page-permission.decorator';
import { REPORT_VIEW_ROLES } from '../../auth/enums/roles.enum';
import { ReportsPaxShiftReportService } from '../services/reports-pax-shift-report.service';
import { PaxShiftReportEmailService } from '../services/pax-shift-report-email.service';
import { SendPaxShiftReportEmailDto } from '../dto/send-pax-shift-report-email.dto';
import { UpsertFlightReportSectionDto } from '../dto/upsert-flight-report-section.dto';
import { UpsertFlightDetailsDto } from '../dto/upsert-flight-details.dto';
import { UpsertShortShippedBagsDto } from '../dto/upsert-short-shipped-bags.dto';
import { CreateDutyAllocationDto } from '../dto/create-duty-allocation.dto';
import { QueryFlightSerialsDto } from '../dto/query-flight-serials.dto';
import { BatchFlightReportsDto } from '../dto/batch-flight-reports.dto';

const bodyPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
});

/**
 * Unified Pax Shift Report persistence in MongoDB `reports-pax-shift-report`.
 *
 * Replaces separate collections over time:
 * - psr-flight-details, psr-employee-sections, psr-sick-leave → flight_report
 * - shipped-bags → short_shipped_bags
 * - psr-duty-allocation → duty_allocation
 *
 * Open-button forms + duty allocation: any FRIS/admin role with
 * Reports → Pax Shift Report (manager and employee included).
 */
@Roles(...REPORT_VIEW_ROLES)
@FrisPagePermission('reports', 'Pax Shift Report')
@Controller('pax-shift/reports-pax-shift-report')
export class ReportsPaxShiftReportController {
  constructor(
    private readonly service: ReportsPaxShiftReportService,
    private readonly emailService: PaxShiftReportEmailService,
  ) {}

  /** Flight serials that have Open-button data (for collection listing). */
  @Get('flight-reports')
  listFlightReportsWithData() {
    return this.service.listFlightReportsWithData();
  }

  @Get('flight-report')
  getFlightReport(@Query('flightSerial') flightSerial?: string) {
    const fs = String(flightSerial ?? '').trim();
    if (!fs) {
      throw new BadRequestException(
        'Query parameter flightSerial is required.',
      );
    }
    return this.service.getFlightReport(fs);
  }

  @Post('flight-reports-batch')
  async getBatchFlightReports(@Body(bodyPipe) dto: BatchFlightReportsDto) {
    if (!Array.isArray(dto.flightSerials) || dto.flightSerials.length === 0) {
      return {};
    }
    return this.service.getBatchFlightReports(dto.flightSerials);
  }

  @Put('flight-report/section')
  upsertFlightReportSection(@Body(bodyPipe) dto: UpsertFlightReportSectionDto) {
    return this.service.upsertFlightReportSection(dto);
  }

  @Put('flight-report/flight-details')
  upsertFlightDetails(@Body(bodyPipe) dto: UpsertFlightDetailsDto) {
    return this.service.upsertFlightDetails(dto);
  }

  /** Send Pax Shift report PDF to selected recipients (same flow as cancellation Shoot email). */
  @Post('flight-report/send-email')
  sendFlightReportEmail(@Body(bodyPipe) dto: SendPaxShiftReportEmailDto) {
    return this.emailService.sendReportEmail(dto);
  }

  @Get('short-shipped-bags/all')
  findAllShortShippedBags() {
    return this.service.findAllShortShippedBags();
  }

  @Post('short-shipped-bags/query')
  queryShortShippedBags(@Body(bodyPipe) dto: QueryFlightSerialsDto) {
    const list = Array.isArray(dto.flightSerials) ? dto.flightSerials : [];
    return this.service.getShortShippedBagsByFlightSerials(list);
  }

  @Get('short-shipped-bags')
  getShortShippedBags(@Query('flightSerial') flightSerial?: string) {
    const fs = String(flightSerial ?? '').trim();
    if (!fs) {
      throw new BadRequestException(
        'Query parameter flightSerial is required.',
      );
    }
    return this.service.getShortShippedBags(fs);
  }

  @Put('short-shipped-bags')
  upsertShortShippedBags(@Body(bodyPipe) dto: UpsertShortShippedBagsDto) {
    return this.service.upsertShortShippedBags(dto);
  }

  @Post('duty-allocation')
  createDutyAllocation(@Body(bodyPipe) dto: CreateDutyAllocationDto) {
    return this.service.createDutyAllocation(dto);
  }

  @Get('duty-allocation')
  listDutyAllocations(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const f = (from ?? '').trim();
    const t = (to ?? '').trim();
    if (!f || !t) return [];
    return this.service.listDutyAllocations(f, t);
  }

  @Get('duty-allocation/:id')
  findOneDutyAllocation(@Param('id') id: string) {
    return this.service.findOneDutyAllocation(id);
  }

  @Patch('duty-allocation/:id')
  updateDutyAllocation(
    @Param('id') id: string,
    @Body(bodyPipe) dto: CreateDutyAllocationDto,
  ) {
    return this.service.updateDutyAllocation(id, dto);
  }

  @Delete('duty-allocation/:id')
  removeDutyAllocation(@Param('id') id: string) {
    return this.service.removeDutyAllocation(id);
  }
}
