export interface InvoicePdfCompanyBlock {
  name: string;
  addressLines: string[];
  gstin?: string;
  cin?: string;
  phone?: string;
  pan?: string;
}

export interface InvoicePdfBillToBlock {
  name: string;
  addressLines: string[];
  /** Printed in its own box under the first bill-to address. */
  secondaryAddressLines?: string[];
  gstin?: string;
  pan?: string;
  vat?: string;
  stateCode?: string;
}

export interface InvoicePdfBankDetails {
  bankName?: string;
  branchAddress?: string;
  beneficiaryName?: string;
  accountNumber?: string;
  swiftCode?: string;
  ifscCode?: string;
  micr?: string;
}

export interface InvoicePdfContactRow {
  location: string;
  name: string;
  position: string;
  phone: string;
  email: string;
}

export interface InvoicePdfLineInput {
  lineNo: number;
  description: string;
  used?: number;
  charged: number;
  aircraftType?: string;
  uom: string;
  unitPrice: number;
  /** Line amount excluding tax in invoice currency */
  amount: number;
  amountUsd?: number;
  amountInr?: number;
  serviceCode?: string;
  sacCode?: string;
}

export interface InvoicePdfInput {
  title: string;
  irn?: string;
  company: InvoicePdfCompanyBlock;
  invoiceNumber: string;
  invoiceDate: string;
  billTo: InvoicePdfBillToBlock;
  serviceDescription?: string;
  serviceTableTitle?: string;
  flightCategory?: string;
  billingPeriodLabel: string;
  serviceStation: string;
  placeOfSupply?: string;
  state?: string;
  sacCode?: string;
  serviceCode?: string;
  currencyCode: string;
  exchangeRate?: number;
  lines: InvoicePdfLineInput[];
  subtotalExclTax: number;
  subtotalUsd?: number;
  subtotalInr?: number;
  concessionFeePercent?: number;
  concessionFeeAmount: number;
  concessionFeeUsd?: number;
  concessionFeeInr?: number;
  grossAmount: number;
  grossAmountUsd?: number;
  grossAmountInr?: number;
  cgstPercent?: number;
  cgstAmount: number;
  cgstUsd?: number;
  cgstInr?: number;
  sgstPercent?: number;
  sgstAmount: number;
  sgstUsd?: number;
  sgstInr?: number;
  igstPercent?: number;
  igstAmount: number;
  totalInclTax: number;
  totalReceivableUsd?: number;
  totalReceivableInr?: number;
  amountInWords: string;
  amountInWordsUsd?: string;
  amountInWordsInr?: string;
  bankDetails?: InvoicePdfBankDetails;
  hasAnnexures?: boolean;
}

export interface InvoicePdfSnapshot {
  format: 'pdf';
  pdfBase64: string;
  pageCount: number;
  generatedAt: string;
  plainText?: string;
}
