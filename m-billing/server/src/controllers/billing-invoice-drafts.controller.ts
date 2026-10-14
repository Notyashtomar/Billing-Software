import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BillingInvoiceDraftsService } from '../services/billing-invoice-drafts.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  AddInvoiceLineDto,
  CreateInvoiceDraftDto,
  ListInvoicesQueryDto,
  SplitAdsInvoiceDraftDto,
  UpdateCustomInvoiceDraftDto,
  UpdateCustomBillDraftDto,
  UpdateInvoiceDraftDto,
  UpdateInvoiceLineDto,
  UpdateInvoiceLinesDto,
  BulkDeleteInvoicesDto,
  MergeInvoiceDraftsDto,
} from '../dto/billing-invoice.dto';
import { AddDraftPreparationRemarkDto } from '../dto/billing-preparation.dto';

import { BillingPageAccess } from '../common/billing-page-access.decorator';
import { SkipTimeout } from 'src/protection/decorators/skip-timeout.decorator';

@BillingPageAccess()
@Controller('billing/invoice-drafts')
export class BillingInvoiceDraftsController {
  constructor(private readonly draftsService: BillingInvoiceDraftsService) {}

  @Get()
  @SkipTimeout()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.draftsService.list(station, query);
  }

  @Post('bulk-delete')
  bulkDelete(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeleteInvoicesDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.bulkDeleteDrafts(station, dto.ids, actor);
  }

  @Post('merge')
  @SkipTimeout()
  merge(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: MergeInvoiceDraftsDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.mergeSelectedDrafts(station, dto.ids, actor);
  }

  @Post('refresh-all')
  @SkipTimeout()
  refreshAll(
    @CurrentBillingStation() station: StationScopeContext,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.refreshAllOpenDrafts(station, actor);
  }

  @Get(':id')
  @SkipTimeout()
  findOne(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.draftsService.findOne(station, id);
  }

  @Post()
  @SkipTimeout()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateInvoiceDraftDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.createManual(station, dto, actor);
  }

  @Post(':id/split-ads-lines')
  @SkipTimeout()
  splitAdsLines(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: SplitAdsInvoiceDraftDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.splitAdsLines(station, id, dto.lineNos, actor);
  }

  @Patch(':id')
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDraftDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.update(station, id, dto, actor);
  }

  @Patch(':id/custom-lines')
  @SkipTimeout()
  updateCustomLines(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateCustomInvoiceDraftDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.updateCustomLines(station, id, dto, actor);
  }

  @Patch(':id/custom-bill')
  @SkipTimeout()
  updateCustomBill(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateCustomBillDraftDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.updateCustomBill(station, id, dto, actor);
  }

  @Post(':id/lines')
  addLine(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: AddInvoiceLineDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.addLine(station, id, dto, actor);
  }

  @Patch(':id/lines')
  @SkipTimeout()
  updateLines(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceLinesDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.updateLines(station, id, dto, actor);
  }

  @Patch(':id/lines/:lineNo')
  updateLine(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Param('lineNo', ParseIntPipe) lineNo: number,
    @Body() dto: UpdateInvoiceLineDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.updateLine(station, id, lineNo, dto, actor);
  }

  @Delete(':id/lines/:lineNo')
  deleteLine(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Param('lineNo', ParseIntPipe) lineNo: number,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.deleteLine(station, id, lineNo, actor);
  }

  @Post(':id/recalculate')
  recalculate(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.recalculate(station, id, actor);
  }

  @Post(':id/recompute-from-preparation')
  @SkipTimeout()
  recomputeFromPreparation(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.recomputeFromPreparation(station, id, actor);
  }

  @Post(':id/refresh-rates')
  @SkipTimeout()
  refreshRates(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.refreshRates(station, id, actor);
  }

  @Post(':id/convert-to-usd')
  convertToUsd(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.convertToUsd(station, id, actor);
  }

  @Post(':id/convert-to-inr')
  convertToInr(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.convertToInr(station, id, actor);
  }

  @Post(':id/total-receivable-usd')
  setTotalReceivableInUsd(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.setTotalReceivableInUsd(station, id, actor);
  }

  @Post(':id/total-receivable-inr')
  setTotalReceivableInInr(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.setTotalReceivableInInr(station, id, actor);
  }

  @Post(':id/submit-approval')
  submit(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.submitApproval(station, id, actor);
  }

  @Post(':id/remarks')
  addRemark(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: AddDraftPreparationRemarkDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.addDraftRemark(station, id, dto, actor);
  }

  @Delete(':id')
  remove(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.deleteDraft(station, id, actor);
  }
}

