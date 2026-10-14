import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import { CurrentBillingStation } from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  CreateBillingRafAdhocRateDto,
  UpdateBillingRafAdhocRateDto,
} from '../dto/billing-raf-adhoc.dto';
import { BillingRafAdhocRatesService } from '../services/billing-raf-adhoc-rates.service';

@BillingPageAccess()
@Controller('billing/raf-adhoc-rates')
export class BillingRafAdhocRatesController {
  constructor(private readonly service: BillingRafAdhocRatesService) {}

  @Get()
  list(@CurrentBillingStation() station: StationScopeContext) {
    return this.service.list(station);
  }

  @Post()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateBillingRafAdhocRateDto,
  ) {
    return this.service.create(station, dto);
  }

  @Patch(':id')
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateBillingRafAdhocRateDto,
  ) {
    return this.service.update(station, id, dto);
  }

  @Delete(':id')
  remove(@CurrentBillingStation() station: StationScopeContext, @Param('id') id: string) {
    return this.service.remove(station, id);
  }
}
