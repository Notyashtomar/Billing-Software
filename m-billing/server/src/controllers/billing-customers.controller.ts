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
import { BillingCustomersService } from '../services/billing-customers.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  CreateBillingCustomerDto,
  BulkDeleteBillingCustomersDto,
  ListBillingCustomersQueryDto,
  UpdateBillingCustomerDto,
} from '../dto/billing-customer.dto';

/**
 * BC Page: Customers
 * Audit: BC_SCREEN_INVENTORY.md §A1
 * FRIS: /billing/customers
 * API: GET/POST/PATCH /billing/customers
 * Collection: billing_customers
 */
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import { SkipTimeout } from 'src/protection/decorators/skip-timeout.decorator';

@BillingPageAccess()
@Controller('billing/customers')
export class BillingCustomersController {
  constructor(private readonly customersService: BillingCustomersService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListBillingCustomersQueryDto,
  ) {
    return this.customersService.list(station, query);
  }

  @Post('sync-from-advance')
  @SkipTimeout()
  syncFromAdvance(
    @CurrentBillingStation() station: StationScopeContext,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.syncFromAdvanceAirline(station, actor);
  }

  @Post('bulk-delete')
  bulkRemove(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeleteBillingCustomersDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.removeMany(station, dto.ids, actor);
  }

  @Post('delete-all')
  removeAll(
    @CurrentBillingStation() station: StationScopeContext,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.removeAll(station, actor);
  }

  @Get(':id')
  findOne(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.customersService.findOne(station, id);
  }

  @Post()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateBillingCustomerDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.create(station, dto, actor);
  }

  @Patch(':id')
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateBillingCustomerDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.update(station, id, dto, actor);
  }

  @Delete(':id')
  remove(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.remove(station, id, actor);
  }
}
