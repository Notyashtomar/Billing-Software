import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BillingCreditMemosService } from '../services/billing-credit-memos.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import { successResponse } from '../common/station-scope';
import { CreateCreditMemoDto, ListInvoicesQueryDto } from '../dto/billing-invoice.dto';

import { BillingPageAccess } from '../common/billing-page-access.decorator';

@BillingPageAccess()
@Controller('billing/credit-memos')
export class BillingCreditMemosController {
  constructor(private readonly creditMemosService: BillingCreditMemosService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.creditMemosService.list(station, query);
  }

  @Get(':id')
  findOne(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.creditMemosService.findOne(station, id);
  }

  @Post()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateCreditMemoDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.creditMemosService.create(station, dto, actor);
  }

  @Post(':id/post')
  post(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.creditMemosService.post(station, id, actor);
  }

  @Get(':id/pdf')
  async pdf(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    const file = await this.creditMemosService.getPdf(station, id);
    return successResponse(file);
  }
}

