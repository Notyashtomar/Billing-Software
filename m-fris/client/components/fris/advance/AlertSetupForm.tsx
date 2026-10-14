'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Copy, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  GATEWAY_CHECKBOX_CONTROL,
  GATEWAY_CHECKBOX_INPUT,
  GATEWAY_LABEL_SPACER,
} from '@/components/fris/advance/gatewayPageLayout';
import {
  airlineCode,
  FRIS_INVALID_CONTROL,
  normalizeText,
  positiveInteger,
  required,
  runValidators,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cn } from '@/lib/utils';

const FIELD_ORDER = [
  'airline',
  'code',
  'aircraftBody',
  'applicableFor',
  'onBehalf',
  'minute',
  'copyRulesSource',
  'copyAircraftBody',
  'appliedAccording',
] as const;
type AlertField = (typeof FIELD_ORDER)[number];

const CONTROL_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500';

const LABEL_CLASS = 'mb-1 block text-sm font-medium text-gray-700';

const EMPTY_FORM = {
  airline: '',
  code: '',
  aircraftBody: '',
  applicableFor: '',
  onBehalf: '',
  minute: '',
  copyRulesSource: '',
  copyAircraftBody: '',
  appliedAccording: '',
  active: false,
};

const AIRLINE_OPTIONS = [
  { value: '', label: 'Select airline' },
  { value: 'AERO NOMAD', label: 'AERO NOMAD' },
  { value: 'Other Airline', label: 'Other Airline' },
];

const BODY_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'NB', label: 'NB' },
  { value: 'WB', label: 'WB' },
];

const APPLICABLE_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'arrival', label: 'Arrival' },
  { value: 'departure', label: 'Departure' },
  { value: 'both', label: 'Both' },
];

const ON_BEHALF_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'airline', label: 'Airline' },
  { value: 'gh', label: 'GH' },
  { value: 'both', label: 'Both' },
];

const COPY_SOURCE_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'same-airline', label: 'Same airline' },
  { value: 'other-airline', label: 'Other airline' },
];

const APPLIED_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'ATA', label: 'ATA' },
  { value: 'ATD', label: 'ATD' },
];

function alertControlClass(invalid?: boolean): string {
  return cn(CONTROL_CLASS, invalid && FRIS_INVALID_CONTROL);
}

export default function AlertSetupForm() {
  const [copyRules, setCopyRules] = useState(false);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { errors, clearField, applyAndFocus, clearAll, setFieldError } =
    useFieldErrors<AlertField>(FIELD_ORDER);

  const validate = (): FieldErrors<AlertField> => {
    const next: FieldErrors<AlertField> = {};

    if (!normalizeText(form.airline)) next.airline = 'Select an airline.';

    const code = form.code.trim().toUpperCase();
    const codeErr = runValidators(required(code, 'Code'), airlineCode(code, 'Code'));
    if (codeErr) next.code = codeErr;

    if (!form.aircraftBody.trim()) next.aircraftBody = 'Select an aircraft body.';
    if (!form.applicableFor.trim()) next.applicableFor = 'Select applicable for.';
    if (!form.onBehalf.trim()) next.onBehalf = 'Select on behalf.';

    const minuteErr = positiveInteger(form.minute, 'Minute', {
      min: 0,
      max: 9999,
      allowEmpty: false,
    });
    if (minuteErr) next.minute = minuteErr;

    if (copyRules) {
      if (!form.copyRulesSource.trim()) {
        next.copyRulesSource = 'Select a copy source.';
      }
      if (!form.copyAircraftBody.trim()) {
        next.copyAircraftBody = 'Select an aircraft body.';
      }
      if (!form.appliedAccording.trim()) {
        next.appliedAccording = 'Select applied according.';
      }
    }

    return next;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const next = validate();
    if (applyAndFocus(next)) return;

    setSubmitting(true);
    try {
      // Persist API not wired yet — validation gate only.
      toast.message(
        copyRules
          ? 'Alert copy rules validated. Save API is not connected yet.'
          : 'Alert setup validated. Save API is not connected yet.',
      );
      if (!copyRules) {
        setForm(EMPTY_FORM);
        clearAll();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/80 shadow-sm">
        <div className="border-b border-gray-200 bg-white/60 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Create Record</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="field-airline">
                Airline
              </label>
              <AdminRadioDropdown
                id="field-airline"
                value={form.airline}
                onChange={(v) => {
                  setForm((f) => ({ ...f, airline: v }));
                  clearField('airline');
                }}
                options={AIRLINE_OPTIONS}
                aria-invalid={!!errors.airline}
                aria-describedby={errors.airline ? 'field-airline-error' : undefined}
                className={alertControlClass(!!errors.airline)}
                disabled={submitting}
              />
              <FormFieldError id="field-airline-error" message={errors.airline} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="field-code">
                Code
              </label>
              <input
                id="field-code"
                type="text"
                value={form.code}
                aria-invalid={!!errors.code}
                aria-describedby={errors.code ? 'field-code-error' : undefined}
                onChange={(e) => {
                  const code = e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 5);
                  setForm((f) => ({ ...f, code }));
                  clearField('code');
                }}
                onBlur={() => {
                  const code = form.code.trim().toUpperCase();
                  setFieldError(
                    'code',
                    runValidators(required(code, 'Code'), airlineCode(code, 'Code')),
                  );
                }}
                className={cn(alertControlClass(!!errors.code), 'uppercase')}
                placeholder="Code"
                maxLength={5}
                disabled={submitting}
              />
              <FormFieldError id="field-code-error" message={errors.code} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="field-aircraftBody">
                Aircraft Body
              </label>
              <AdminRadioDropdown
                id="field-aircraftBody"
                value={form.aircraftBody}
                onChange={(v) => {
                  setForm((f) => ({ ...f, aircraftBody: v }));
                  clearField('aircraftBody');
                }}
                options={BODY_OPTIONS}
                placeholder="Select"
                aria-invalid={!!errors.aircraftBody}
                aria-describedby={
                  errors.aircraftBody ? 'field-aircraftBody-error' : undefined
                }
                className={alertControlClass(!!errors.aircraftBody)}
                disabled={submitting}
              />
              <FormFieldError id="field-aircraftBody-error" message={errors.aircraftBody} />
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="field-applicableFor">
                Applicable For
              </label>
              <AdminRadioDropdown
                id="field-applicableFor"
                value={form.applicableFor}
                onChange={(v) => {
                  setForm((f) => ({ ...f, applicableFor: v }));
                  clearField('applicableFor');
                }}
                options={APPLICABLE_OPTIONS}
                placeholder="Select"
                aria-invalid={!!errors.applicableFor}
                aria-describedby={
                  errors.applicableFor ? 'field-applicableFor-error' : undefined
                }
                className={alertControlClass(!!errors.applicableFor)}
                disabled={submitting}
              />
              <FormFieldError id="field-applicableFor-error" message={errors.applicableFor} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="field-onBehalf">
                On Behalf
              </label>
              <AdminRadioDropdown
                id="field-onBehalf"
                value={form.onBehalf}
                onChange={(v) => {
                  setForm((f) => ({ ...f, onBehalf: v }));
                  clearField('onBehalf');
                }}
                options={ON_BEHALF_OPTIONS}
                placeholder="Select"
                aria-invalid={!!errors.onBehalf}
                aria-describedby={errors.onBehalf ? 'field-onBehalf-error' : undefined}
                className={alertControlClass(!!errors.onBehalf)}
                disabled={submitting}
              />
              <FormFieldError id="field-onBehalf-error" message={errors.onBehalf} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="field-minute">
                Minute
              </label>
              <input
                id="field-minute"
                type="text"
                inputMode="numeric"
                value={form.minute}
                aria-invalid={!!errors.minute}
                aria-describedby={errors.minute ? 'field-minute-error' : undefined}
                onChange={(e) => {
                  const minute = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
                  setForm((f) => ({ ...f, minute }));
                  clearField('minute');
                }}
                className={alertControlClass(!!errors.minute)}
                placeholder="Minute"
                maxLength={4}
                disabled={submitting}
              />
              <FormFieldError id="field-minute-error" message={errors.minute} />
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={copyRules ? '' : 'pointer-events-none opacity-60'}>
              <label className={LABEL_CLASS} htmlFor="field-copyRulesSource">
                From (copy source)
              </label>
              <AdminRadioDropdown
                id="field-copyRulesSource"
                value={form.copyRulesSource}
                onChange={(v) => {
                  setForm((f) => ({ ...f, copyRulesSource: v }));
                  clearField('copyRulesSource');
                }}
                options={COPY_SOURCE_OPTIONS}
                placeholder="Select"
                disabled={!copyRules || submitting}
                aria-invalid={!!errors.copyRulesSource}
                aria-describedby={
                  errors.copyRulesSource ? 'field-copyRulesSource-error' : undefined
                }
                className={cn(
                  alertControlClass(!!errors.copyRulesSource),
                  'disabled:cursor-not-allowed disabled:bg-gray-50',
                )}
              />
              <FormFieldError
                id="field-copyRulesSource-error"
                message={errors.copyRulesSource}
              />
            </div>
            <div className={copyRules ? '' : 'pointer-events-none opacity-60'}>
              <label className={LABEL_CLASS} htmlFor="field-copyAircraftBody">
                Aircraft Body
              </label>
              <AdminRadioDropdown
                id="field-copyAircraftBody"
                value={form.copyAircraftBody}
                onChange={(v) => {
                  setForm((f) => ({ ...f, copyAircraftBody: v }));
                  clearField('copyAircraftBody');
                }}
                options={BODY_OPTIONS}
                placeholder="Select"
                disabled={!copyRules || submitting}
                aria-invalid={!!errors.copyAircraftBody}
                aria-describedby={
                  errors.copyAircraftBody ? 'field-copyAircraftBody-error' : undefined
                }
                className={cn(
                  alertControlClass(!!errors.copyAircraftBody),
                  'disabled:cursor-not-allowed disabled:bg-gray-50',
                )}
              />
              <FormFieldError
                id="field-copyAircraftBody-error"
                message={errors.copyAircraftBody}
              />
            </div>
            <div className={copyRules ? '' : 'pointer-events-none opacity-60'}>
              <label className={LABEL_CLASS} htmlFor="field-appliedAccording">
                Applied According
              </label>
              <AdminRadioDropdown
                id="field-appliedAccording"
                value={form.appliedAccording}
                onChange={(v) => {
                  setForm((f) => ({ ...f, appliedAccording: v }));
                  clearField('appliedAccording');
                }}
                options={APPLIED_OPTIONS}
                placeholder="Select"
                disabled={!copyRules || submitting}
                aria-invalid={!!errors.appliedAccording}
                aria-describedby={
                  errors.appliedAccording ? 'field-appliedAccording-error' : undefined
                }
                className={cn(
                  alertControlClass(!!errors.appliedAccording),
                  'disabled:cursor-not-allowed disabled:bg-gray-50',
                )}
              />
              <FormFieldError
                id="field-appliedAccording-error"
                message={errors.appliedAccording}
              />
            </div>
            <div className={copyRules ? '' : 'pointer-events-none opacity-60'}>
              <span className={GATEWAY_LABEL_SPACER} aria-hidden="true">
                &nbsp;
              </span>
              <label className={GATEWAY_CHECKBOX_CONTROL}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  disabled={!copyRules || submitting}
                  className={GATEWAY_CHECKBOX_INPUT}
                />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
              <FormFieldError />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={copyRules}
                onChange={(e) => {
                  const next = e.target.checked;
                  setCopyRules(next);
                  if (!next) {
                    clearField('copyRulesSource');
                    clearField('copyAircraftBody');
                    clearField('appliedAccording');
                  }
                }}
                disabled={submitting}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-gray-700">Copy Rules</span>
            </label>
            <motion.button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              whileHover={submitting ? undefined : { scale: 1.02 }}
              whileTap={submitting ? undefined : { scale: 0.98 }}
              aria-busy={submitting}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60 ${
                copyRules
                  ? 'bg-emerald-600 shadow-md shadow-emerald-500/25 hover:bg-emerald-700'
                  : 'bg-emerald-500 shadow-md shadow-emerald-500/25 hover:bg-emerald-600'
              }`}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : copyRules ? (
                <Copy className="h-4 w-4" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              {submitting ? (copyRules ? 'Copying…' : 'Saving…') : copyRules ? 'Copy' : 'Save'}
            </motion.button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setViewDetailsOpen((o) => !o)}
          className="flex w-full items-center justify-between bg-gray-100 px-5 py-3.5 text-left transition-colors hover:bg-gray-50"
        >
          <span className="text-sm font-semibold text-gray-800">View Details</span>
          {viewDetailsOpen ? (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-500" />
          )}
        </button>
        {viewDetailsOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-gray-100 bg-gray-50/50 px-5 py-4"
          >
            <p className="text-sm text-gray-500">Details and records will be listed here.</p>
          </motion.div>
        )}
      </section>
    </div>
  );
}
