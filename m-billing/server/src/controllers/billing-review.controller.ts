import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BillingReviewService } from '../services/billing-review.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import { ListInvoicesQueryDto, RejectReviewDto } from '../dto/billing-invoice.dto';

import { BillingPageAccess } from '../common/billing-page-access.decorator';

@BillingPageAccess()
@Controller('billing/review')
export class BillingReviewController {
  constructor(private readonly reviewService: BillingReviewService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.reviewService.list(station, query);
  }

  @Get(':invoiceId')
  getReview(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.reviewService.getReview(station, invoiceId);
  }

  @Post(':invoiceId/approve')
  approve(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('invoiceId') invoiceId: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.reviewService.approve(station, invoiceId, actor);
  }

  @Post(':invoiceId/reject')
  reject(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: RejectReviewDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.reviewService.reject(station, invoiceId, dto, actor);
  }
}

