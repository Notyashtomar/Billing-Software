import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BillingPreparationService } from '../services/billing-preparation.service';
import { BillingInvoiceDraftsService } from '../services/billing-invoice-drafts.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  BulkDeletePreparationDto,
  BulkDeleteByFilterPreparationDto,
  BulkReadyByFilterPreparationDto,
  BulkReadyPreparationDto,
  IngestPreparationDto,
  UnsendPreparationBySourceDto,
  ListPreparationQueryDto,
  RejectPreparationDto,
  SendBackPreparationDto,
  AddPreparationRemarkDto,
  UpdatePreparationChecklistDto,
  UpdateCustomBillingDto,
  SubmitCustomBillingDto,
} from '../dto/billing-preparation.dto';
import { CreateDraftsFromPreparationDto } from '../dto/billing-invoice.dto';

/**
 * BC: Staging / import review
 * FRIS: /billing/preparation
 * Collection: billing_preparation_records
 */
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import { SkipTimeout } from 'src/protection/decorators/skip-timeout.decorator';

@BillingPageAccess()
@Controller('billing/preparation')
export class BillingPreparationController {
  constructor(
    private readonly preparationService: BillingPreparationService,
    private readonly draftsService: BillingInvoiceDraftsService,
  ) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListPreparationQueryDto,
  ) {
    return this.preparationService.list(station, query);
  }

  @Post('ingest')
  @SkipTimeout()
  ingest(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: IngestPreparationDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.ingest(station, dto, actor);
  }

  @Post('bulk-ready')
  @SkipTimeout()
  bulkReady(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkReadyPreparationDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.bulkReady(station, dto, actor);
  }

  @Post('bulk-ready-by-filter')
  @SkipTimeout()
  bulkReadyByFilter(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkReadyByFilterPreparationDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.bulkReadyByFilter(station, dto, actor);
  }

  @Post('bulk-delete')
  @SkipTimeout()
  bulkDelete(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeletePreparationDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.bulkDelete(station, dto, actor);
  }

  @Post('bulk-delete-by-filter')
  @SkipTimeout()
  bulkDeleteByFilter(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeleteByFilterPreparationDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.bulkDeleteByFilter(station, dto, actor);
  }

  @Post('unsend-by-source')
  @SkipTimeout()
  unsendBySource(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: UnsendPreparationBySourceDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.unsendBySource(station, dto, actor);
  }

  @Post('refresh')
  @SkipTimeout()
  refresh(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListPreparationQueryDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.refresh(station, query, actor);
  }

  @Post('create-drafts')
  @SkipTimeout()
  createDrafts(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateDraftsFromPreparationDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.draftsService.createFromPreparation(station, dto, actor);
  }

  /** Save custom billing lines and create invoice draft(s) for custom prep rows. */
  @Post('submit-custom')
  @SkipTimeout()
  submitCustom(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: SubmitCustomBillingDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.submitCustomBilling(station, dto, actor);
  }

  @Get(':id')
  findOne(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.preparationService.findOne(station, id);
  }

  @Patch(':id/custom-billing')
  updateCustomBilling(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateCustomBillingDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.updateCustomBilling(station, id, dto, actor);
  }

  @Post(':id/validate')
  validate(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.validate(station, id, actor);
  }

  @Patch(':id/checklist')
  updateChecklist(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdatePreparationChecklistDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.updateChecklist(station, id, dto, actor);
  }

  @Post(':id/send-back')
  sendBack(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: SendBackPreparationDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.sendBack(station, id, dto, actor);
  }

  @Post(':id/remarks')
  addRemark(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: AddPreparationRemarkDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.addRemark(station, id, dto, actor);
  }

  @Post(':id/reject')
  reject(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: RejectPreparationDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.reject(station, id, dto, actor);
  }

  @Post(':id/ready')
  markReady(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.preparationService.markReady(station, id, actor);
  }
}

