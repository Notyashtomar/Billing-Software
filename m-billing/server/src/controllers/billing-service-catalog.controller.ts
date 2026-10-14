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
import { BillingServiceCatalogService } from '../services/billing-service-catalog.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  CreateServiceCatalogDto,
  BulkDeleteServiceCatalogDto,
  ListServiceCatalogQueryDto,
  UpdateServiceCatalogDto,
} from '../dto/billing-service-catalog.dto';

/**
 * BC Page: Items
 * Audit: BC_SCREEN_INVENTORY.md §A2
 * FRIS: /billing/service-catalog
 * Collection: billing (docType: service_catalog)
 */
import { BillingPageAccess } from '../common/billing-page-access.decorator';

@BillingPageAccess()
@Controller('billing/service-catalog')
export class BillingServiceCatalogController {
  constructor(private readonly catalogService: BillingServiceCatalogService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListServiceCatalogQueryDto,
  ) {
    return this.catalogService.list(station, query);
  }

  @Get('uoms')
  listUoms(@CurrentBillingStation() station: StationScopeContext) {
    return this.catalogService.listUoms(station);
  }

  @Post('bulk-delete')
  bulkRemove(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeleteServiceCatalogDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.catalogService.removeMany(station, dto.serviceCodes, actor);
  }

  @Post('delete-all')
  removeAll(
    @CurrentBillingStation() station: StationScopeContext,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.catalogService.removeAll(station, actor);
  }

  @Get(':serviceCode')
  findOne(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('serviceCode') serviceCode: string,
  ) {
    return this.catalogService.findOne(station, decodeURIComponent(serviceCode));
  }

  @Post()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateServiceCatalogDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.catalogService.create(station, dto, actor);
  }

  @Patch(':serviceCode')
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('serviceCode') serviceCode: string,
    @Body() dto: UpdateServiceCatalogDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.catalogService.update(station, decodeURIComponent(serviceCode), dto, actor);
  }

  @Delete(':serviceCode')
  remove(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('serviceCode') serviceCode: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.catalogService.remove(station, decodeURIComponent(serviceCode), actor);
  }
}
