import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import {
  BillingContractsService,
  BillingRateCardsService,
} from '../services/billing-contracts.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  CreateBillingContractDto,
  CreateBillingRateCardDto,
  BulkDeleteByIdsDto,
  MatchRateCardQueryDto,
  UpdateBillingContractDto,
  UpdateBillingRateCardDto,
} from '../dto/billing-contract.dto';

/**
 * BC Page: Contract / tariff
 * Audit: BC_SCREEN_INVENTORY.md §A7
 * FRIS: /billing/contracts, /billing/rate-cards
 */

@BillingPageAccess()
@Controller('billing/contracts')
export class BillingContractsController {
  constructor(private readonly contractsService: BillingContractsService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query('customerCode') customerCode?: string,
  ) {
    return this.contractsService.list(station, customerCode);
  }

  @Post('bulk-delete')
  bulkRemove(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeleteByIdsDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.contractsService.removeMany(station, dto.ids, actor);
  }

  @Post('delete-all')
  removeAll(
    @CurrentBillingStation() station: StationScopeContext,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.contractsService.removeAll(station, actor);
  }

  @Get(':id')
  findOne(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.contractsService.findOne(station, id);
  }

  @Post()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateBillingContractDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.contractsService.create(station, dto, actor);
  }

  @Patch(':id')
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateBillingContractDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.contractsService.update(station, id, dto, actor);
  }

  @Post(':id/activate')
  activate(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
    @Body() body: { kycOverride?: boolean; kycOverrideReason?: string },
  ) {
    return this.contractsService.activate(station, id, actor, body ?? {});
  }

  @Delete(':id')
  remove(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.contractsService.remove(station, id, actor);
  }
}

@BillingPageAccess()
@Controller('billing/rate-cards')
export class BillingRateCardsController {
  constructor(private readonly rateCardsService: BillingRateCardsService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query('customerCode') customerCode?: string,
    @Query('serviceCode') serviceCode?: string,
  ) {
    return this.rateCardsService.list(station, customerCode, serviceCode);
  }

  @Get('match')
  match(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: MatchRateCardQueryDto,
  ) {
    return this.rateCardsService.match(station, query);
  }

  @Post('bulk-delete')
  bulkRemove(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeleteByIdsDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.rateCardsService.removeMany(station, dto.ids, actor);
  }

  @Post('delete-all')
  removeAll(
    @CurrentBillingStation() station: StationScopeContext,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.rateCardsService.removeAll(station, actor);
  }

  @Post()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateBillingRateCardDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.rateCardsService.create(station, dto, actor);
  }

  @Patch(':id')
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateBillingRateCardDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.rateCardsService.update(station, id, dto, actor);
  }

  @Delete(':id')
  remove(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.rateCardsService.remove(station, id, actor);
  }
}

