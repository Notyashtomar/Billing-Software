import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsPaxShiftReportModule } from 'src/reports-pax-shift-report/reports-pax-shift-report.module';
import { BillingPersonalWorkspaceInterceptor } from './common/billing-personal-workspace.interceptor';
import { billingMongooseFeature } from './schemas/billing-mongoose.feature';
import {
  AdsUsageData,
  AdsUsageDataSchema,
  FhrCollectionRead,
  FhrCollectionReadSchema,
  NsRawFlightData,
  NsRawFlightDataSchema,
  RafUsageData,
  RafUsageDataSchema,
  RawFlightDataRead,
  RawFlightDataReadSchema,
  AdvanceAirlineRead,
  AdvanceAirlineReadSchema,
  AdvanceGatewayScheduledAirlineRead,
  AdvanceGatewayScheduledAirlineReadSchema,
  AdvanceScheduleSetupRead,
  AdvanceScheduleSetupReadSchema,
  AdvanceRafAirlineRead,
  AdvanceRafAirlineReadSchema,
  CreationRafRead,
  CreationRafReadSchema,
  RafCollectionRead,
  RafCollectionReadSchema,
} from './schemas/operational.schemas';
import { AuditEngineService } from './engines/audit-engine.service';
import { ValidationEngineService } from './engines/validation-engine.service';
import { BillingDashboardService } from './services/billing-dashboard.service';
import { BillingCustomersService } from './services/billing-customers.service';
import { BillingServiceCatalogService } from './services/billing-service-catalog.service';
import {
  BillingContractsService,
  BillingRateCardsService,
} from './services/billing-contracts.service';
import { BillingPriceCardAirlinesService } from './services/billing-price-card-airlines.service';
import { BillingRafAdhocRatesService } from './services/billing-raf-adhoc-rates.service';
import {
  BillingExchangeRatesService,
  BillingSequencesService,
  BillingSettingsService,
  BillingTaxRulesService,
} from './services/billing-settings.service';
import { BillingSourcesService } from './services/billing-sources.service';
import { BillingUldService } from './services/billing-uld.service';
import { BillingSourceEnrichmentService } from './services/sources/billing-source-enrichment.service';
import { BillingSourcesScheduledService } from './services/sources/billing-sources-scheduled.service';
import { BillingSourcesCustomService } from './services/sources/billing-sources-custom.service';
import {
  BillingSourcesAdsService,
  BillingSourcesEquipmentService,
  BillingSourcesMaaFhrAdsService,
  BillingSourcesManpowerService,
  BillingSourcesRafService,
} from './services/sources/billing-sources-usage.service';
import {
  BillingSourcesCleaningService,
  BillingSourcesMaasService,
  BillingSourcesNonScheduledService,
  BillingSourcesXxldService,
} from './services/sources/billing-sources-fhr.service';
import { BillingDashboardController } from './controllers/billing-dashboard.controller';
import { BillingCustomersController } from './controllers/billing-customers.controller';
import { BillingServiceCatalogController } from './controllers/billing-service-catalog.controller';
import {
  BillingContractsController,
  BillingRateCardsController,
} from './controllers/billing-contracts.controller';
import { BillingPriceCardAirlinesController } from './controllers/billing-price-card-airlines.controller';
import { BillingRafAdhocRatesController } from './controllers/billing-raf-adhoc-rates.controller';
import {
  BillingExchangeRatesController,
  BillingSequencesController,
  BillingSettingsController,
  BillingTaxRulesController,
} from './controllers/billing-settings.controller';
import { BillingSourcesController } from './controllers/billing-sources.controller';
import { BillingPreparationController } from './controllers/billing-preparation.controller';
import { BillingInvoiceDraftsController } from './controllers/billing-invoice-drafts.controller';
import { BillingInvoiceBinController } from './controllers/billing-invoice-bin.controller';
import { BillingReviewController } from './controllers/billing-review.controller';
import { BillingInvoicesController } from './controllers/billing-invoices.controller';
import { BillingCreditMemosController } from './controllers/billing-credit-memos.controller';
import { BillingBackingSheetsController } from './controllers/billing-backing-sheets.controller';
import { BillingReportsController } from './controllers/billing-reports.controller';
import { BillingAuditController } from './controllers/billing-audit.controller';
import { BillingMisBhsController } from './controllers/billing-mis-bhs.controller';
import { BillingMisAdsController } from './controllers/billing-mis-ads.controller';
import { BillingCutoverController } from './controllers/billing-cutover.controller';
import { BillingKycController } from './controllers/billing-kyc.controller';
import { BillingAircraftMasterController } from './controllers/billing-aircraft-master.controller';
import { BillingEquipmentMasterController } from './controllers/billing-equipment-master.controller';
import { BillingKycInviteController } from './controllers/billing-kyc-invite.controller';
import { BillingPreparationService } from './services/billing-preparation.service';
import { BillingKycService } from './services/billing-kyc.service';
import { BillingKycMailerService } from './services/billing-kyc-mailer.service';
import { BillingInvoiceDraftsService } from './services/billing-invoice-drafts.service';
import { BillingInvoiceBinService } from './services/billing-invoice-bin.service';
import { BillingReviewService } from './services/billing-review.service';
import { BillingInvoicesService } from './services/billing-invoices.service';
import { BillingCreditMemosService } from './services/billing-credit-memos.service';
import { BillingBackingSheetsService } from './services/billing-backing-sheets.service';
import { BillingReportsService } from './services/billing-reports.service';
import { BillingCutoverService } from './services/billing-cutover.service';
import { BillingParallelRunService } from './services/billing-parallel-run.service';
import { BillingDecommissionService } from './services/billing-decommission.service';
import { BillingMisBhsService } from './services/billing-mis-bhs.service';
import { BillingMisAdsService } from './services/billing-mis-ads.service';
import { BillingIndexMigrationService } from './services/billing-index-migration.service';
import { BillingAircraftMasterService } from './services/billing-aircraft-master.service';
import { BillingEquipmentMasterService } from './services/billing-equipment-master.service';
import { LegacyNavBridgeService } from './services/legacy-nav-bridge.service';
import { TaxEngineService } from './engines/tax-engine.service';
import { CurrencyEngineService } from './engines/currency-engine.service';
import { InvoiceEngineService } from './engines/invoice-engine.service';
import { BackingSheetEngineService } from './engines/backing-sheet-engine.service';
import { ApprovalWorkflowService } from './engines/approval-workflow.service';
import { PdfEngineService } from './engines/pdf-engine.service';
import { ReportingEngineService } from './engines/reporting-engine.service';
import { ExportEngineService } from './engines/export-engine.service';
import { BillingForbiddenErrorFilter } from './common/billing-exception.filter';
import { AdvanceInvoicingModule } from 'src/advance-invoicing/advance-invoicing.module';
import { AdvanceInvoicingService } from 'src/advance-invoicing/advance-invoicing.service';
import { AdvanceAircraftModule } from 'src/advance-aircraft/advance-aircraft.module';
import { FlightCancellationsModule } from 'src/flight-cancellations/flight-cancellations.module';
import { BILLING_ADVANCE_ADAPTER_TOKEN } from './adapters/advance-invoicing.adapter';
import type { StationScopeContext } from 'src/common/station/station-scope';

@Module({
  imports: [
    AdvanceInvoicingModule,
    AdvanceAircraftModule,
    FlightCancellationsModule,
    ReportsPaxShiftReportModule,
    MongooseModule.forFeature([
      billingMongooseFeature,
      { name: FhrCollectionRead.name, schema: FhrCollectionReadSchema },
      { name: RawFlightDataRead.name, schema: RawFlightDataReadSchema },
      { name: AdsUsageData.name, schema: AdsUsageDataSchema },
      { name: RafUsageData.name, schema: RafUsageDataSchema },
      { name: NsRawFlightData.name, schema: NsRawFlightDataSchema },
      { name: AdvanceAirlineRead.name, schema: AdvanceAirlineReadSchema },
      {
        name: AdvanceGatewayScheduledAirlineRead.name,
        schema: AdvanceGatewayScheduledAirlineReadSchema,
      },
      { name: AdvanceScheduleSetupRead.name, schema: AdvanceScheduleSetupReadSchema },
      { name: AdvanceRafAirlineRead.name, schema: AdvanceRafAirlineReadSchema },
      { name: CreationRafRead.name, schema: CreationRafReadSchema },
      { name: RafCollectionRead.name, schema: RafCollectionReadSchema },
    ]),
  ],
  controllers: [
    BillingKycInviteController,
    BillingDashboardController,
    BillingCustomersController,
    BillingServiceCatalogController,
    BillingContractsController,
    BillingRateCardsController,
    BillingPriceCardAirlinesController,
    BillingRafAdhocRatesController,
    BillingSettingsController,
    BillingTaxRulesController,
    BillingExchangeRatesController,
    BillingSequencesController,
    BillingSourcesController,
    BillingPreparationController,
    BillingInvoiceDraftsController,
    BillingInvoiceBinController,
    BillingReviewController,
    BillingInvoicesController,
    BillingCreditMemosController,
    BillingBackingSheetsController,
    BillingReportsController,
    BillingAuditController,
    BillingMisBhsController,
    BillingMisAdsController,
    BillingCutoverController,
    BillingKycController,
    BillingAircraftMasterController,
    BillingEquipmentMasterController,
  ],
  providers: [
    { provide: APP_FILTER, useClass: BillingForbiddenErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: BillingPersonalWorkspaceInterceptor },
    {
      provide: BILLING_ADVANCE_ADAPTER_TOKEN,
      useFactory: (svc: AdvanceInvoicingService) => ({
        listScheduledFlightReportData: (
          params: {
            from?: string;
            to?: string;
            dateBasis?: string;
            customerCode?: string;
          },
          station: StationScopeContext,
        ) => {
          const dateBasis =
            params.dateBasis === 'exported-date'
              ? 'exported-date'
              : params.dateBasis === 'atd-date'
                ? 'atd-date'
                : 'schedule-date';
          return svc.listScheduledFlightReportData(
            {
              from: params.from ?? '',
              to: params.to ?? '',
              dateBasis,
              dataMode: 'flight-report',
              customerCode: params.customerCode ?? '',
            },
            station,
          );
        },
      }),
      inject: [AdvanceInvoicingService],
    },
    AuditEngineService,
    ValidationEngineService,
    BillingDashboardService,
    BillingCustomersService,
    BillingServiceCatalogService,
    BillingContractsService,
    BillingRateCardsService,
    BillingPriceCardAirlinesService,
    BillingRafAdhocRatesService,
    BillingSettingsService,
    BillingTaxRulesService,
    BillingExchangeRatesService,
    BillingSequencesService,
    BillingSourceEnrichmentService,
    BillingSourcesScheduledService,
    BillingSourcesCleaningService,
    BillingSourcesRafService,
    BillingSourcesMaasService,
    BillingSourcesMaaFhrAdsService,
    BillingSourcesAdsService,
    BillingSourcesXxldService,
    BillingSourcesEquipmentService,
    BillingSourcesManpowerService,
    BillingSourcesNonScheduledService,
    BillingSourcesCustomService,
    BillingSourcesService,
    BillingUldService,
    BillingPreparationService,
    TaxEngineService,
    CurrencyEngineService,
    InvoiceEngineService,
    BackingSheetEngineService,
    ApprovalWorkflowService,
    PdfEngineService,
    ReportingEngineService,
    ExportEngineService,
    BillingInvoiceDraftsService,
    BillingInvoiceBinService,
    BillingReviewService,
    BillingInvoicesService,
    BillingCreditMemosService,
    BillingBackingSheetsService,
    BillingReportsService,
    BillingCutoverService,
    BillingKycService,
    BillingKycMailerService,
    BillingParallelRunService,
    BillingDecommissionService,
    BillingMisBhsService,
    BillingMisAdsService,
    BillingIndexMigrationService,
    BillingAircraftMasterService,
    BillingEquipmentMasterService,
    LegacyNavBridgeService,
  ],
  exports: [
    AuditEngineService,
    ValidationEngineService,
    BillingCustomersService,
    BillingContractsService,
    BillingKycService,
    BillingRateCardsService,
    BillingSequencesService,
    BillingSourcesService,
    BillingSourceEnrichmentService,
    BillingPreparationService,
    BillingInvoiceDraftsService,
    BillingInvoicesService,
    InvoiceEngineService,
    BillingDecommissionService,
  ],
})
export class BillingModule {}