'use client';

import type { BillingKycFormData } from '@/lib/billing-shared/types';
import { billingUi } from '../billingUi';
import { KYC_FORM_SECTIONS } from './kycFormFields';

type Props = {
  form: BillingKycFormData;
  disabled?: boolean;
  onChange: (next: BillingKycFormData) => void;
};

export function KycFormPanel({ form, disabled, onChange }: Props) {
  return (
    <div className="space-y-4">
      {KYC_FORM_SECTIONS.map((section) => (
        <section
          key={section.id}
          className="rounded-[var(--billing-radius-lg)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4"
        >
          <h3 className="m-0 mb-3 text-sm font-semibold text-[color:var(--billing-heading)]">
            {section.title}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {section.fields.map((field) => {
              const value = String(form[field.key] ?? '');
              const id = `kyc-${section.id}-${field.key}`;
              return (
                <label key={field.key} className="block text-xs sm:col-span-1" htmlFor={id}>
                  <span className="mb-1 block font-medium text-[color:var(--billing-text-secondary)]">
                    {field.label}
                    {field.required ? ' *' : ''}
                  </span>
                  {field.type === 'select' ? (
                    <select
                      id={id}
                      disabled={disabled}
                      className={billingUi.input}
                      value={value}
                      onChange={(e) =>
                        onChange({ ...form, [field.key]: e.target.value || undefined })
                      }
                    >
                      <option value="">Select…</option>
                      {(field.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      disabled={disabled}
                      type={field.type ?? 'text'}
                      className={billingUi.input}
                      value={value}
                      onChange={(e) =>
                        onChange({ ...form, [field.key]: e.target.value || undefined })
                      }
                    />
                  )}
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
