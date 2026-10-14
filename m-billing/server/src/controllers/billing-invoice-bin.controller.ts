import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BillingInvoiceBinService } from '../services/billing-invoice-bin.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import { BulkDeleteInvoicesDto, ListInvoicesQueryDto } from '../dto/billing-invoice.dto';
import { BillingPageAccess } from '../common/billing-page-access.decorator';

@BillingPageAccess()
@Controller('billing/invoice-bin')
export class BillingInvoiceBinController {
  constructor(private readonly binService: BillingInvoiceBinService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.binService.list(station, query);
  }

  @Post('move')
  moveToBin(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeleteInvoicesDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.binService.moveToBin(station, dto.ids, actor);
  }

  @Post('restore')
  restoreFromBin(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeleteInvoicesDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.binService.restoreFromBin(station, dto.ids, actor);
  }

  @Post('bulk-delete')
  permanentDelete(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeleteInvoicesDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.binService.permanentDelete(station, dto.ids, actor);
  }
}
