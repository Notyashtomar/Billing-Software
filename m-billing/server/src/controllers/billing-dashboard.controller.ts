import { Controller, Get, Query } from '@nestjs/common';
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import { BillingDashboardService } from '../services/billing-dashboard.service';
import { CurrentBillingStation } from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';

/**
 * BC Page: Role center KPIs
 * Audit: BC_DATA_FLOW.md
 * FRIS: /billing/dashboard
 * Collection: billing_preparation_records, billing_invoice_headers
 */
@BillingPageAccess()
@Controller('billing/dashboard')
export class BillingDashboardController {
  constructor(private readonly dashboardService: BillingDashboardService) {}

  @Get('executive')
  getExecutive(
    @CurrentBillingStation() station: StationScopeContext,
    @Query('period') period?: string,
    @Query('airline') airline?: string,
    @Query('service') service?: string,
  ) {
    return this.dashboardService.getExecutive(station, { period, airline, service });
  }

  @Get()
  getDashboard(@CurrentBillingStation() station: StationScopeContext) {
    return this.dashboardService.getKpis(station);
  }
}

