import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  BulkCreateBillingPriceCardAirlinesDto,
  ListBillingPriceCardAirlinesQueryDto,
  UpdateBillingPriceCardAirlineDto,
} from '../dto/billing-price-card-airline.dto';
import { BillingPriceCardAirlinesService } from '../services/billing-price-card-airlines.service';
import { SkipTimeout } from 'src/protection/decorators/skip-timeout.decorator';

@BillingPageAccess()
@Controller('billing/price-card-airlines')
export class BillingPriceCardAirlinesController {
  constructor(private readonly service: BillingPriceCardAirlinesService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListBillingPriceCardAirlinesQueryDto,
  ) {
    return this.service.list(station, query);
  }

  @Post('bulk')
  @SkipTimeout()
  createBulk(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkCreateBillingPriceCardAirlinesDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.service.createBulk(station, dto, actor);
  }

  @Patch(':id')
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateBillingPriceCardAirlineDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.service.update(station, id, dto, actor);
  }

  @Delete(':id')
  remove(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.service.remove(station, id, actor);
  }
}
