import type { InvoicePdfInput } from './invoice-pdf.types';

/** DXN (Jewar / Noida International Airport) BHS reference invoice — terms block. */
export const JEWAR_BHS_TERMS_TEMPLATE: string[] = [
  'Rates are including concession fee payable to The Airport Operator.',
  '18% interest will be levied, if the payment is delayed beyond 7 days.',
  'Kindly remit the payment to our bank account,details of which are mentioned hereinbelow.',
  'All claims and disputes must be communicated in writing within 3 days from the date of receipt of the invoice.',
  'Refer the attachment for USD conversion rate.',
  'Cheque/DD shall be payable in favor of "{{ENTITY}}".',
  'GST is applicable @ 18% with effect from 1st July 2017.',
  'GST is not payable under Reverse Charge.',
];

export function jewarBhsTerms(companyName: string): string[] {
  const entity = companyName.trim() || 'BIRD FLIGHT SERVICES (INDIA) PVT. LTD.';
  return JEWAR_BHS_TERMS_TEMPLATE.map((term) => term.split('{{ENTITY}}').join(entity));
}

export function isJewarStation(input: Pick<InvoicePdfInput, 'serviceStation'>): boolean {
  const station = String(input.serviceStation ?? '').trim().toUpperCase();
  return station === 'JEWAR' || station === 'NOIDA' || station === 'DXN';
}

export function isJewarBhsLayout(input: Pick<InvoicePdfInput, 'serviceStation' | 'serviceCode'>): boolean {
  if (!isJewarStation(input)) return false;
  const code = String(input.serviceCode ?? '').trim().toUpperCase();
  return code === 'BHS' || code === 'TRND' || /^SCHEDULED\s*FLIGHT$/i.test(code);
}
