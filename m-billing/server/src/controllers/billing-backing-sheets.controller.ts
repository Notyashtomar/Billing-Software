import { Controller, Get, Param, Query } from '@nestjs/common';
import { BillingBackingSheetsService } from '../services/billing-backing-sheets.service';
import { CurrentBillingStation } from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import { ListInvoicesQueryDto } from '../dto/billing-invoice.dto';

import { BillingPageAccess } from '../common/billing-page-access.decorator';

@BillingPageAccess()
@Controller('billing/backing-sheets')
export class BillingBackingSheetsController {
  constructor(private readonly backingService: BillingBackingSheetsService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.backingService.list(station, query);
  }

  @Get(':id')
  findOne(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.backingService.findOne(station, id);
  }
}

