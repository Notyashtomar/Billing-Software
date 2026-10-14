/** Stable workspace slice keys — one personal bag per route family. */
export const BILLING_WORKSPACE_PAGE_KEYS = {
  preparation: 'preparation',
  source: (fetchMethod: string) => `sources.${fetchMethod}`,
  invoiceDrafts: 'invoices.drafts',
  invoiceReview: 'invoices.review',
  invoiceList: 'invoices.list',
  invoiceBin: 'invoices.bin',
  invoiceDetail: (invoiceId: string) => `invoices.detail.${invoiceId}`,
  reports: 'output.reports',
  audit: 'output.audit',
  creditMemos: 'output.credit-memos',
  backingSheets: 'output.backing-sheets',
  customers: 'masters.customers',
  contracts: 'masters.contracts',
  rateCards: 'masters.rate-cards',
  serviceCatalog: 'masters.service-catalog',
  concessions: 'masters.concessions',
} as const;
