import type { BillingKycFormData } from '@/lib/billing-shared/types';

export type KycFormFieldKey = keyof BillingKycFormData;

export const KYC_FORM_SECTIONS: Array<{
  id: string;
  title: string;
  fields: Array<{
    key: KycFormFieldKey;
    label: string;
    required?: boolean;
    type?: 'text' | 'email' | 'tel' | 'select';
    options?: Array<{ value: string; label: string }>;
  }>;
}> = [
  {
    id: 'identity',
    title: 'Airline identity',
    fields: [
      { key: 'legalName', label: 'Legal name', required: true },
      { key: 'country', label: 'Country' },
      { key: 'address', label: 'Registered address', required: true },
    ],
  },
  {
    id: 'tax',
    title: 'Tax / registration',
    fields: [
      { key: 'gstin', label: 'GSTIN', required: true },
      { key: 'pan', label: 'PAN', required: true },
      { key: 'msme', label: 'MSME registration' },
      {
        key: 'currencyCode',
        label: 'Billing currency',
        type: 'select',
        options: [
          { value: 'INR', label: 'INR' },
          { value: 'USD', label: 'USD' },
        ],
      },
    ],
  },
  {
    id: 'contacts',
    title: 'Primary contacts',
    fields: [
      { key: 'billingContactName', label: 'Billing contact name', required: true },
      {
        key: 'billingContactEmail',
        label: 'Billing contact email',
        required: true,
        type: 'email',
      },
      { key: 'billingContactPhone', label: 'Billing contact phone', type: 'tel' },
      { key: 'opsContactName', label: 'Ops contact name' },
      { key: 'opsContactEmail', label: 'Ops contact email', type: 'email' },
      { key: 'opsContactPhone', label: 'Ops contact phone', type: 'tel' },
    ],
  },
  {
    id: 'bank',
    title: 'Bank / remittance (optional)',
    fields: [
      { key: 'bankAccountName', label: 'Account name' },
      { key: 'bankName', label: 'Bank name' },
      { key: 'bankIfscOrSwift', label: 'IFSC / SWIFT' },
      { key: 'bankAccountNumber', label: 'Account number' },
    ],
  },
];

export function emptyKycForm(): BillingKycFormData {
  return {};
}
