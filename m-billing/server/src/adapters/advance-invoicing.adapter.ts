/**
 * Wire AdvanceInvoicingService into BillingSourcesScheduledService on FRIS integration.
 *
 * In server/src/billing/billing.module.ts after copy:
 *
 * ```typescript
 * import { AdvanceInvoicingModule } from 'src/advance-invoicing/advance-invoicing.module';
 * import { AdvanceInvoicingService } from 'src/advance-invoicing/advance-invoicing.service';
 * import { BillingSourcesScheduledService } from './services/sources/billing-sources-scheduled.service';
 *
 * @Module({
 *   imports: [AdvanceInvoicingModule, ...],
 *   providers: [
 *     {
 *       provide: 'BillingAdvanceInvoicingAdapter',
 *       useFactory: (svc: AdvanceInvoicingService) => ({
 *         listScheduledFlightReportData: (params, station) =>
 *           svc.listScheduledFlightReportData(
 *             { ...params, dataMode: 'flight-report' },
 *             station,
 *           ),
 *       }),
 *       inject: [AdvanceInvoicingService],
 *     },
 *     {
 *       provide: BillingSourcesScheduledService,
 *       useFactory: (fhr, raw, enrichment, adapter) =>
 *         new BillingSourcesScheduledService(fhr, raw, enrichment, adapter),
 *       inject: [
 *         getModelToken(FhrCollectionRead.name),
 *         getModelToken(RawFlightDataRead.name),
 *         BillingSourceEnrichmentService,
 *         'BillingAdvanceInvoicingAdapter',
 *       ],
 *     },
 *   ],
 * })
 * ```
 */
export const BILLING_ADVANCE_ADAPTER_TOKEN = 'BillingAdvanceInvoicingAdapter';
