import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import {
  BillingExchangeRatesService,
  BillingSequencesService,
  BillingSettingsService,
  BillingTaxRulesService,
} from '../services/billing-settings.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  CreateExchangeRateDto,
  CreateSequenceDto,
  CreateTaxRuleDto,
  EffectiveExchangeRateQueryDto,
  UpdateBillingSettingsDto,
  UpdateExchangeRateDto,
  UpdateSequenceDto,
  UpdateTaxRuleDto,
} from '../dto/billing-settings.dto';

/**
 * BC Pages: Currencies, Payment setup, Tax
 * FRIS: /billing/settings/*
 */

@BillingPageAccess()
@Controller('billing/settings')
export class BillingSettingsController {
  constructor(private readonly settingsService: BillingSettingsService) {}

  @Get()
  get(@CurrentBillingStation() station: StationScopeContext) {
    return this.settingsService.get(station);
  }

  @Patch()
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: UpdateBillingSettingsDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.settingsService.update(station, dto, actor);
  }
}

@BillingPageAccess()
@Controller('billing/tax-rules')
export class BillingTaxRulesController {
  constructor(private readonly taxRulesService: BillingTaxRulesService) {}

  @Get()
  list(@CurrentBillingStation() station: StationScopeContext) {
    return this.taxRulesService.list(station);
  }

  @Post()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateTaxRuleDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.taxRulesService.create(station, dto, actor);
  }

  @Patch(':id')
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateTaxRuleDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.taxRulesService.update(station, id, dto, actor);
  }
}

@BillingPageAccess()
@Controller('billing/exchange-rates')
export class BillingExchangeRatesController {
  constructor(private readonly exchangeRatesService: BillingExchangeRatesService) {}

  @Get()
  list(@CurrentBillingStation() station: StationScopeContext) {
    return this.exchangeRatesService.list(station);
  }

  @Get('effective')
  effective(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: EffectiveExchangeRateQueryDto,
  ) {
    return this.exchangeRatesService.getEffective(station, query);
  }

  @Post()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateExchangeRateDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.exchangeRatesService.create(station, dto, actor);
  }

  @Patch(':id')
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateExchangeRateDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.exchangeRatesService.update(station, id, dto, actor);
  }

  @Delete(':id')
  remove(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.exchangeRatesService.remove(station, id, actor);
  }
}

@BillingPageAccess()
@Controller('billing/sequences')
export class BillingSequencesController {
  constructor(private readonly sequencesService: BillingSequencesService) {}

  @Get()
  list(@CurrentBillingStation() station: StationScopeContext) {
    return this.sequencesService.list(station);
  }

  @Post()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateSequenceDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.sequencesService.create(station, dto, actor);
  }

  @Patch(':id')
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateSequenceDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.sequencesService.update(station, id, dto, actor);
  }

  @Delete(':id')
  remove(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.sequencesService.remove(station, id, actor);
  }
}

