import { Body, Controller, Get, Post, Query, ValidationPipe } from '@nestjs/common';
import { FrisPagePermission } from '../auth/decorators/fris-page-permission.decorator';
import { AdvanceInvoicingService } from './advance-invoicing.service';
import { QueryScheduledFlightDataDto } from './dto/query-scheduled-flight-data.dto';
import { ExportNavDto } from './dto/export-nav.dto';
import { CurrentStation } from '../common/station/current-station.decorator';
import type { StationScopeContext } from '../common/station/station-scope';

const queryPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

@FrisPagePermission('advance', 'Invoicing')
@Controller('advance-invoicing')
export class AdvanceInvoicingController {
  constructor(private readonly advanceInvoicingService: AdvanceInvoicingService) {}

  @Get('scheduled-flight-data')
  listScheduledFlightData(
    @Query(queryPipe) query: QueryScheduledFlightDataDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceInvoicingService.listScheduledFlightReportData(
      {
        from: query.from,
        to: query.to,
        dateBasis: query.dateBasis ?? 'atd-date',
        dataMode: query.dataMode ?? 'flight-report',
      },
      station,
    );
  }

  @Post('export-nav')
  exportNav(
    @Body(queryPipe) body: ExportNavDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceInvoicingService.exportSelectedToNav(
      body.serialNos,
      station,
    );
  }
}
