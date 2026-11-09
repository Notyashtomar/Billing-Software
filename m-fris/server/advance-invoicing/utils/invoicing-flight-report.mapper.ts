/**
 * Single source of truth for FHR → invoicing flight-report rows lives in the
 * billing module. This file used to hold a drifting copy (it ignored the
 * stored `mainDetails.FlightNo` fallback, so FRIS and Billing showed different
 * flight numbers). Re-export so both modules always agree.
 */
export {
  mapFhrToInvoicingFlightReportRow,
  reportDateYmd,
} from 'src/billing/utils/invoicing-flight-report.mapper';
export { isExportedNavValue } from 'src/billing/utils/exported-nav.util';
