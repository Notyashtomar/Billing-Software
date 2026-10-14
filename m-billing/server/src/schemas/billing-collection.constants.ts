/** Single MongoDB collection for all native billing documents. */
export const BILLING_COLLECTION = 'billing';

/** Discriminator values stored in `docType` on each document. */
export const BillingDocType = {
  Customer: 'customer',
  ServiceCatalog: 'service_catalog',
  Contract: 'contract',
  RateCard: 'rate_card',
  PriceCardAirline: 'price_card_airline',
  RafAdhocRate: 'raf_adhoc_rate',
  TaxRule: 'tax_rule',
  ExchangeRate: 'exchange_rate',
  Sequence: 'sequence',
  Settings: 'settings',
  PreparationRecord: 'preparation_record',
  InvoiceHeader: 'invoice_header',
  InvoiceLine: 'invoice_line',
  BackingSheet: 'backing_sheet',
  CreditMemo: 'credit_memo',
  Report: 'report',
  Export: 'export',
  AuditLog: 'audit_log',
  BcBaseline: 'bc_baseline',
  ParallelRunSnapshot: 'parallel_run_snapshot',
  BcDecommissionRecord: 'bc_decommission_record',
  KycCase: 'kyc_case',
} as const;

export type BillingDocTypeValue = (typeof BillingDocType)[keyof typeof BillingDocType];
