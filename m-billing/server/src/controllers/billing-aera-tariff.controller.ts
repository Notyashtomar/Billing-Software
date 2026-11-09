import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  BillingAeraTariffService,
  type AeraTariffImportRow,
} from '../services/billing-aera-tariff.service';

type Actor = { userId: string; userName: string };

@BillingPageAccess()
@Controller('billing/aera-tariff')
export class BillingAeraTariffController {
  constructor(private readonly aeraTariff: BillingAeraTariffService) {}

  @Get()
  list(@CurrentBillingStation() station: StationScopeContext) {
    return this.aeraTariff.list(station);
  }

  /** Bulk load of api/data/Aera Rates/extracted/aera-tariffs.verified.json ({ stations: [...] }). */
  @Post('import')
  importMany(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() body: { stations?: AeraTariffImportRow[] },
    @CurrentBillingActor() actor: Actor,
  ) {
    return this.aeraTariff.importMany(station, body?.stations ?? [], actor);
  }

  @Get(':id')
  findOne(@CurrentBillingStation() station: StationScopeContext, @Param('id') id: string) {
    return this.aeraTariff.findOne(station, id);
  }

  @Put()
  upsert(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() body: AeraTariffImportRow,
    @CurrentBillingActor() actor: Actor,
  ) {
    return this.aeraTariff.upsert(station, body, actor);
  }

  @Delete(':id')
  deactivate(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: Actor,
  ) {
    return this.aeraTariff.deactivate(station, id, actor);
  }
}
