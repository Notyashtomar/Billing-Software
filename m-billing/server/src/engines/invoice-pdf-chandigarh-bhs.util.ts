import type { InvoicePdfInput } from './invoice-pdf.types';

/** IXC BHS reference invoice — page 1 block below particulars. */
export const CHANDIGARH_BHS_TERMS_TEMPLATE: string[] = [
  'Rates are excluding concession fee payable to The Airport Operator',
  '18% annual interest will be levied, if the payment is delayed beyond 7 days.',
  'Kindly remit the payment to our bank account, details of which are mentioned hereinbelow.',
  'All claims and disputes must be communicated in writing within three days from the date of receipt of the invoice.',
  'Cheque/DD shall be payable in favor of "{{ENTITY}}".',
];

export function chandigarhBhsTerms(companyName: string): string[] {
  const entity = companyName.trim() || 'BIRD AIRPORT SERVICES (MOHALI) PRIVATE LIMITED';
  return CHANDIGARH_BHS_TERMS_TEMPLATE.map((term) => term.split('{{ENTITY}}').join(entity));
}

export function isChandigarhStation(input: Pick<InvoicePdfInput, 'serviceStation'>): boolean {
  const station = String(input.serviceStation ?? '').trim().toUpperCase();
  return station === 'CHANDIGARH' || station === 'IXC';
}

function isChandigarhServiceCategory(serviceCode: string): boolean {
  const code = serviceCode.trim().toUpperCase();
  return (
    code === 'BHS' ||
    code === 'TRND' ||
    code === 'ADS' ||
    code === 'EQUIPMENT' ||
    code === 'MANPOWER' ||
    /^SCHEDULED\s*FLIGHT$/i.test(code) ||
    code.includes('ADS')
  );
}

export function isChandigarhBhsLayout(input: Pick<InvoicePdfInput, 'serviceStation' | 'serviceCode'>): boolean {
  if (!isChandigarhStation(input)) return false;
  const code = String(input.serviceCode ?? '').trim().toUpperCase();
  return code === 'BHS' || code === 'TRND' || /^SCHEDULED\s*FLIGHT$/i.test(code);
}

/** Chandigarh ADS-family invoices share the same compact page-flow rules as BHS. */
export function isChandigarhAdsLayout(input: Pick<InvoicePdfInput, 'serviceStation' | 'serviceCode'>): boolean {
  if (!isChandigarhStation(input)) return false;
  const code = String(input.serviceCode ?? '').trim().toUpperCase();
  if (isChandigarhBhsLayout(input)) return false;
  return (
    code === 'ADS' ||
    code === 'EQUIPMENT' ||
    code === 'MANPOWER' ||
    code.includes('ADS')
  );
}

/** IXC invoices that pack page-2 footer blocks before opening page 3. */
export function isChandigarhCompactFlow(input: Pick<InvoicePdfInput, 'serviceStation' | 'serviceCode'>): boolean {
  return isChandigarhBhsLayout(input) || isChandigarhAdsLayout(input);
}
