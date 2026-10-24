import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { BillingInvoicesService } from '../services/billing-invoices.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import { successResponse } from '../common/station-scope';
import { ListInvoicesQueryDto, PostInvoiceDto, SendInvoicesToAirlineDto, BulkDeleteInvoicesDto } from '../dto/billing-invoice.dto';

import { BillingPageAccess } from '../common/billing-page-access.decorator';
import { SkipTimeout } from 'src/protection/decorators/skip-timeout.decorator';

@BillingPageAccess()
@Controller('billing/invoices')
export class BillingInvoicesController {
  constructor(private readonly invoicesService: BillingInvoicesService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.invoicesService.list(station, query);
  }

  @Get('pdf/sample')
  async samplePdf() {
    const file = await this.invoicesService.getSamplePdf();
    return successResponse(file);
  }

  @Post('send-to-airline')
  @SkipTimeout()
  sendManyToAirline(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: SendInvoicesToAirlineDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.invoicesService.sendManyToAirline(station, dto.ids, actor);
  }

  @Post('bulk-delete')
  bulkDelete(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeleteInvoicesDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.invoicesService.removeMany(station, dto.ids, actor);
  }

  @Get(':id')
  findOne(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.invoicesService.findOne(station, id);
  }

  @Post(':id/generate')
  @SkipTimeout()
  generate(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
    @Body() body: { kycOverride?: boolean; kycOverrideReason?: string },
  ) {
    return this.invoicesService.generate(station, id, actor, body ?? {});
  }

  @Post(':id/send-to-airline')
  sendToAirline(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.invoicesService.sendToAirline(station, id, actor);
  }

  @Post(':id/post')
  post(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: PostInvoiceDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.invoicesService.post(station, id, dto, actor);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.invoicesService.cancel(station, id, actor);
  }

  @Post(':id/archive')
  archive(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.invoicesService.archive(station, id, actor);
  }

  @Delete(':id')
  remove(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.invoicesService.remove(station, id, actor);
  }

  @Get(':id/pdf')
  @SkipTimeout()
  async pdf(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    const file = await this.invoicesService.getPdf(station, id, actor);
    return successResponse(file);
  }

  @Get(':id/annexure')
  @SkipTimeout()
  async annexure(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    const file = await this.invoicesService.getAnnexurePdf(station, id, actor);
    return successResponse(file);
  }

  @Get(':id/backing-sheet/pdf')
  @SkipTimeout()
  async backingPdf(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    const file = await this.invoicesService.getBackingPdf(station, id, actor);
    return successResponse(file);
  }

  @Get(':id/audit-trail')
  findOneWithAudit(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.invoicesService.findOne(station, id);
  }

  @Get(':id/related-flights')
  relatedFlights(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.invoicesService.relatedFlights(station, id);
  }

  @Get(':id/credit-notes')
  creditNotes(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.invoicesService.findOne(station, id);
  }
}

