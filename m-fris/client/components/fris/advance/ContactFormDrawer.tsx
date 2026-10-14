'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { Loader2, Save } from 'lucide-react';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import type { RadioDropdownOption } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import SignaturePad from '@/components/fris/flights/scheduledairlines/signatures/SignaturePad';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { email, phone, required, runValidators } from '@/lib/form-validation';
import type { FieldErrors } from '@/lib/form-validation';
import {
  GATEWAY_CONTROL,
  GATEWAY_DROPDOWN,
  GATEWAY_LABEL,
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';
import {
  CONTACT_DROPDOWN_OPTIONS,
  CONTACT_PRIMARY_BTN,
  CONTACT_SECONDARY_BTN,
  normalizeContactEmail,
  normalizeRepresentativeName,
  type ContactFormValues,
} from '@/components/fris/advance/contactShared';

export type ContactDrawerField = 'email' | 'mobileNo';

type ContactFormDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ContactFormValues;
  setForm: Dispatch<SetStateAction<ContactFormValues>>;
  editingId: string | null;
  loading: boolean;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  airlineOptions: Array<{ value: string; label: string }>;
  airlineOptionsLoading?: boolean;
  /** When set, Contact type is locked (e.g. Non-SKD). */
  lockedContactType?: string;
  contactOptions?: readonly RadioDropdownOption[];
  errors: FieldErrors<ContactDrawerField>;
  clearField: (field: ContactDrawerField) => void;
  setFieldError: (field: ContactDrawerField, message: string | null) => void;
  fieldIdPrefix?: string;
  signatureHint?: string;
};

export function ContactFormDrawer({
  open,
  onOpenChange,
  form,
  setForm,
  editingId,
  loading,
  onSave,
  onCancel,
  airlineOptions,
  airlineOptionsLoading = false,
  lockedContactType,
  contactOptions = CONTACT_DROPDOWN_OPTIONS,
  errors,
  clearField,
  setFieldError,
  fieldIdPrefix = 'contact',
  signatureHint = 'Optional — reused on FHR reports for this representative',
}: ContactFormDrawerProps) {
  const [nameError, setNameError] = useState<string | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const repId = `${fieldIdPrefix}-rep`;
  const companyId = `${fieldIdPrefix}-company`;

  const title = editingId
    ? `Edit Contact${form.airlineRepresentative.trim() ? ` (${form.airlineRepresentative.trim()})` : ''}`
    : 'Create Airline Contact';

  const emailId = `${fieldIdPrefix}-email`;
  const mobileId = `${fieldIdPrefix}-mobile`;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-gray-200 bg-white p-0 sm:max-w-lg"
      >
        <SheetHeader className="shrink-0 border-b border-gray-100 px-5 py-4 text-left">
          <SheetTitle className="text-lg text-gray-900">{title}</SheetTitle>
          <SheetDescription className="text-sm text-gray-500">
            {editingId
              ? 'Update contact details and signature, then save.'
              : 'Fill primary information and an optional signature.'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Primary Information
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={GATEWAY_LABEL} htmlFor={emailId}>
                  Email
                </label>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, email: e.target.value }));
                    clearField('email');
                  }}
                  onBlur={(e) => {
                    const cleaned = normalizeContactEmail(e.target.value);
                    setForm((f) => ({ ...f, email: cleaned }));
                    setFieldError(
                      'email',
                      runValidators(
                        editingId ? null : required(cleaned, 'Email'),
                        email(cleaned),
                      ),
                    );
                  }}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? `${emailId}-error` : undefined}
                  className={gatewayControlClass(!!errors.email)}
                  placeholder="name@example.com"
                  disabled={loading}
                />
                <FormFieldError id={`${emailId}-error`} message={errors.email} />
              </div>

              <div className="sm:col-span-2">
                <label className={GATEWAY_LABEL}>Contact Type</label>
                {lockedContactType ? (
                  <AdminRadioDropdown
                    value={form.contact || lockedContactType}
                    onChange={(v) => setForm((f) => ({ ...f, contact: v }))}
                    options={[{ value: lockedContactType, label: lockedContactType }]}
                    className={GATEWAY_DROPDOWN}
                    searchable={false}
                  />
                ) : (
                  <AdminRadioDropdown
                    value={form.contact}
                    onChange={(v) => setForm((f) => ({ ...f, contact: v }))}
                    options={[
                      { value: '', label: 'Select contact type' },
                      ...contactOptions,
                    ]}
                    className={GATEWAY_DROPDOWN}
                    searchPlaceholder="Search contact type…"
                  />
                )}
                <FormFieldError />
              </div>

              <div className="sm:col-span-2">
                <label className={GATEWAY_LABEL}>Airline</label>
                <AdminRadioDropdown
                  value={form.airline}
                  onChange={(v) => setForm((f) => ({ ...f, airline: v }))}
                  options={[
                    {
                      value: '',
                      label: airlineOptionsLoading ? 'Loading airlines…' : 'Select airline',
                    },
                    ...airlineOptions,
                  ]}
                  disabled={airlineOptionsLoading || loading}
                  className={`${GATEWAY_DROPDOWN} disabled:cursor-not-allowed disabled:bg-gray-50`}
                  searchPlaceholder="Search airline…"
                />
                <FormFieldError />
              </div>

              <div className="sm:col-span-2">
                <label className={GATEWAY_LABEL} htmlFor={repId}>
                  Airline Representative Name
                </label>
                <input
                  id={repId}
                  type="text"
                  value={form.airlineRepresentative}
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? `${repId}-error` : undefined}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const letters = raw.replace(/[^A-Za-z ]/g, '');
                    setForm((f) => ({ ...f, airlineRepresentative: letters }));
                    setNameError(
                      letters !== raw
                        ? 'Airline representative name may only contain letters.'
                        : null,
                    );
                  }}
                  onBlur={(e) => {
                    const cleaned = normalizeRepresentativeName(e.target.value);
                    setForm((f) => ({ ...f, airlineRepresentative: cleaned }));
                    if (cleaned && !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(cleaned)) {
                      setNameError('Airline representative name may only contain letters.');
                    }
                  }}
                  className={gatewayControlClass(!!nameError)}
                  placeholder="Representative name"
                  disabled={loading}
                />
                <FormFieldError id={`${repId}-error`} message={nameError} />
              </div>

              <div>
                <label className={GATEWAY_LABEL} htmlFor={mobileId}>
                  Mobile Number
                </label>
                <input
                  id={mobileId}
                  name="mobileNo"
                  type="tel"
                  inputMode="tel"
                  value={form.mobileNo}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      mobileNo: e.target.value
                        .replace(/[^\d+]/g, '')
                        .replace(/(?!^)\+/g, '')
                        .slice(0, 15),
                    }));
                    clearField('mobileNo');
                  }}
                  onBlur={(e) => setFieldError('mobileNo', phone(e.target.value, 'Mobile number'))}
                  maxLength={15}
                  aria-invalid={!!errors.mobileNo}
                  aria-describedby={errors.mobileNo ? `${mobileId}-error` : undefined}
                  className={gatewayControlClass(!!errors.mobileNo)}
                  placeholder="e.g. +911234567890"
                  disabled={loading}
                />
                <FormFieldError id={`${mobileId}-error`} message={errors.mobileNo} />
              </div>

              <div>
                <label className={GATEWAY_LABEL} htmlFor={companyId}>
                  Company Name
                </label>
                <input
                  id={companyId}
                  type="text"
                  value={form.companyName}
                  aria-invalid={!!companyError}
                  aria-describedby={companyError ? `${companyId}-error` : undefined}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const letters = raw.replace(/[^A-Za-z ]/g, '');
                    setForm((f) => ({ ...f, companyName: letters }));
                    setCompanyError(
                      letters !== raw
                        ? 'Company name may only contain letters.'
                        : null,
                    );
                  }}
                  className={gatewayControlClass(!!companyError)}
                  placeholder="Company name"
                  disabled={loading}
                />
                <FormFieldError id={`${companyId}-error`} message={companyError} />
              </div>
            </div>
          </section>

          <section className="mt-6 space-y-3 border-t border-gray-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Signature Canvas
              </h3>
              {form.signatureUrl ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  Signature saved
                </span>
              ) : (
                <span className="text-xs text-gray-500">{signatureHint}</span>
              )}
            </div>
            <SignaturePad
              value={form.signatureUrl}
              onChange={(dataUrl) => setForm((f) => ({ ...f, signatureUrl: dataUrl }))}
              disabled={loading}
              height={160}
              placeholder="Draw airline representative signature"
            />
          </section>
        </div>

        <div className="sticky bottom-0 shrink-0 border-t border-gray-100 bg-white px-5 py-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className={CONTACT_SECONDARY_BTN}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const name = normalizeRepresentativeName(form.airlineRepresentative);
                if (name && !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) {
                  setNameError('Airline representative name may only contain letters.');
                  return;
                }
                if (nameError || companyError) return;
                const company = normalizeRepresentativeName(form.companyName);
                if (company && !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(company)) {
                  setCompanyError('Company name may only contain letters.');
                  return;
                }
                void onSave();
              }}
              disabled={loading}
              className={CONTACT_PRIMARY_BTN}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              {loading ? 'Saving…' : 'Save Contact'}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
