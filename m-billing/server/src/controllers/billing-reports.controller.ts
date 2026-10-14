import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BillingReportsService } from '../services/billing-reports.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import { successResponse } from '../common/station-scope';
import { GenerateReportDto, ListInvoicesQueryDto } from '../dto/billing-invoice.dto';

import { BillingPageAccess } from '../common/billing-page-access.decorator';

@BillingPageAccess()
@Controller('billing/reports')
export class BillingReportsController {
  constructor(private readonly reportsService: BillingReportsService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.reportsService.list(station, query);
  }

  @Get(':id')
  findOne(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.reportsService.findOne(station, id);
  }

  @Get(':id/download')
  download(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.reportsService.download(station, id).then((f) => successResponse(f));
  }

  @Post('revenue-summary')
  revenueSummary(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: GenerateReportDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.reportsService.generate(station, 'revenue-summary', dto, actor);
  }

  @Post('schedule-reconciliation')
  scheduleReconciliation(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: GenerateReportDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.reportsService.generate(station, 'schedule-reconciliation', dto, actor);
  }

  @Post('delay-charges')
  delayCharges(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: GenerateReportDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.reportsService.generate(station, 'delay-charges', dto, actor);
  }

  @Post('xxld-decisions')
  xxldDecisions(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: GenerateReportDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.reportsService.generate(station, 'xxld-decisions', dto, actor);
  }

  @Post('tax-summary')
  taxSummary(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: GenerateReportDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.reportsService.generate(station, 'tax-summary', dto, actor);
  }
}

