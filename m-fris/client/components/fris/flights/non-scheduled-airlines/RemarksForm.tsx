'use client';

import { useState, useCallback, useEffect, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Save } from 'lucide-react';
import type { BaseFormProps } from './types';
import {
  getNsRawFormDefaultUrl,
  saveNsRawForm,
  fetchNsRawFormData,
} from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import {
  AIRLINE_REMARKS_RATINGS,
  normalizeRemarksData,
  staDateStringToIsoYmd,
} from '@/utils/dataProcessor';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  maxLength,
  selectRequired,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';

const fetch = frisFetch;

type RemarksFormProps = BaseFormProps;

const REMARKS_FIELD_ORDER = ['rating', 'ghRemarks', 'airlineRemarks', 'negativeRemarks'] as const;
type RemarksField = (typeof REMARKS_FIELD_ORDER)[number];
const REMARKS_MAX = 500;

const INITIAL_FORM_DATA = {
  ghRemarks: '',
  airlineRemarks: '',
  airlineRemarksRating: '',
  negativeRemarks: '',
  showNegativeRemarks: false,
};

export default function RemarksForm({ flight, onSave }: RemarksFormProps) {
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'success' | 'error'
  >('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const { errors, clearField, applyAndFocus } = useFieldErrors<RemarksField>(REMARKS_FIELD_ORDER);

  useEffect(() => {
    const serial = flight?.sNo != null ? String(flight.sNo) : null;
    if (!serial) {
      let cancelled = false;
      Promise.resolve().then(() => {
        if (!cancelled) setFormData(INITIAL_FORM_DATA);
      });
      return () => {
        cancelled = true;
      };
    }
    const serialNo = serial;
    let cancelled = false;
    async function load() {
      try {
        // GET .../ns-raw-flight-data/remarks-details/:serialNo — load saved data from DB
        const doc = await fetchNsRawFormData('remarks-details', serialNo);
        if (cancelled) return;
        const data = normalizeRemarksData(doc);
        if (data) {
          setFormData({
            ...INITIAL_FORM_DATA,
            ghRemarks: data.ghRemarks ?? '',
            airlineRemarks: data.airlineRemarks ?? '',
            airlineRemarksRating: data.airlineRemarksRating ?? '',
          });
          return;
        }
        await fetch(getNsRawFormDefaultUrl('remarks-details', serialNo), {
          method: 'GET',
        });
      } catch {
        if (!cancelled) setFormData(INITIAL_FORM_DATA);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [flight?.sNo]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'airlineRemarksRating') clearField('rating');
    if (field === 'ghRemarks') clearField('ghRemarks');
    if (field === 'airlineRemarks') clearField('airlineRemarks');
    if (field === 'negativeRemarks') clearField('negativeRemarks');
  };

  const handleSave = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (!flight) return;
      const serial = flight.sNo != null ? String(flight.sNo) : null;
      if (!serial) {
        setSaveError('No flight selected');
        setSaveStatus('error');
        return;
      }
      const ratingTrim = formData.airlineRemarksRating.trim();
      const next: FieldErrors<RemarksField> = {};
      const ratingErr =
        selectRequired(ratingTrim, 'rating') ||
        (!AIRLINE_REMARKS_RATINGS.includes(
          ratingTrim as (typeof AIRLINE_REMARKS_RATINGS)[number],
        )
          ? 'Select a valid rating.'
          : null);
      if (ratingErr) next.rating = ratingErr;
      const ghErr = maxLength(formData.ghRemarks, REMARKS_MAX, 'GH remarks');
      if (ghErr) next.ghRemarks = ghErr;
      const airlineErr = maxLength(formData.airlineRemarks, REMARKS_MAX, 'Airline remarks');
      if (airlineErr) next.airlineRemarks = airlineErr;
      if (formData.showNegativeRemarks) {
        const negErr = maxLength(formData.negativeRemarks, REMARKS_MAX, 'Negative remarks');
        if (negErr) next.negativeRemarks = negErr;
      }
      if (applyAndFocus(next)) {
        setSaveStatus('error');
        setSaveError(null);
        return;
      }

      const flightStaDateIso = staDateStringToIsoYmd(flight.staDate);
      if (!flightStaDateIso) {
        setSaveError(
          'This flight has no usable STA date; remarks cannot be saved for the dashboard date range.',
        );
        setSaveStatus('error');
        return;
      }

      setSaveStatus('saving');
      setSaveError(null);
      try {
        await saveNsRawForm('remarks-details', serial, {
          airline: flight.airline || '',
          flightNo: flight.flightNo || '',
          ghRemarks: formData.ghRemarks,
          airlineRemarks: formData.airlineRemarks,
          airlineRemarksRating: ratingTrim,
          flightStaDateIso,
          toOpenInTab: false,
          wantFeedback: false,
          feedbackRemarks: '',
          ghRep: '',
          airlineRep: '',
        });
        setSaveStatus('success');
        onSave?.(formData);
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed');
        setSaveStatus('error');
      }
    },
    [flight, formData, onSave, applyAndFocus],
  );

  const inputClassName = `w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none
    transition-colors hover:border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30`;

  const textareaClassName = `${inputClassName} min-h-28 resize-y whitespace-pre-wrap break-words [overflow-wrap:anywhere]`;

  const labelClassName = 'mb-1.5 block text-sm font-medium text-gray-700';

  return (
    <div
      className={`${FLIGHT_DETAILS_FORM_ROOT_CLASS} bg-gradient-to-br from-gray-50 to-white`}
    >
      <div className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        <form
          onSubmit={handleSave}
          className="w-full min-w-0 space-y-4 sm:space-y-6"
        >
          <header>
            <h2 className="text-lg font-semibold text-gray-900">Remarks</h2>
            <p className="mt-1 text-sm text-gray-500">
              Record handling and airline feedback.
            </p>
          </header>

          <section
            className={FLIGHT_DETAILS_SECTION_CLASS}
            aria-labelledby="remarks-flight-heading"
          >
            <h3
              id="remarks-flight-heading"
              className="mb-3 text-sm font-semibold text-gray-800"
            >
              Flight
            </h3>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Serial No', flight?.sNo || '—'],
                ['Airline', flight?.airline || '—'],
                ['Flight No', flight?.flightNo || '—'],
                ['Aircraft', flight?.aircraft || '—'],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-lg bg-gray-50 p-3">
                  <dt className="mb-1 text-xs text-gray-500">{label}</dt>
                  <dd
                    className="truncate font-semibold text-gray-900"
                    title={String(value)}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            className={FLIGHT_DETAILS_SECTION_CLASS}
            aria-labelledby="remarks-details-heading"
          >
            <h3
              id="remarks-details-heading"
              className="mb-4 text-sm font-semibold text-gray-800"
            >
              Remarks details
            </h3>
            <div className="mb-5">
              <label
                className={labelClassName}
                htmlFor="field-rating"
              >
                Rating <span className="text-red-600">*</span>
              </label>
              <AdminRadioDropdown
                id="field-rating"
                value={formData.airlineRemarksRating}
                onChange={(v) => handleInputChange('airlineRemarksRating', v)}
                options={AIRLINE_REMARKS_RATINGS.map((r) => ({
                  value: r,
                  label: r,
                }))}
                placeholder="Select rating…"
                className={cn(inputClassName, errors.rating && FRIS_INVALID_CONTROL)}
                aria-invalid={Boolean(errors.rating)}
                aria-describedby={errors.rating ? 'field-rating-error' : undefined}
              />
              <FormFieldError id="field-rating-error" message={errors.rating} />
              <p className="mt-1.5 text-xs text-gray-500">
                Required to save. Used for the Airline Remarks dashboard chart.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClassName} htmlFor="field-ghRemarks">
                  GH Remarks
                </label>
                <textarea
                  id="field-ghRemarks"
                  value={formData.ghRemarks}
                  onChange={(e) =>
                    handleInputChange('ghRemarks', e.target.value)
                  }
                  rows={5}
                  maxLength={REMARKS_MAX}
                  aria-invalid={Boolean(errors.ghRemarks)}
                  aria-describedby={errors.ghRemarks ? 'field-ghRemarks-error' : undefined}
                  className={cn(textareaClassName, errors.ghRemarks && FRIS_INVALID_CONTROL)}
                  placeholder="Enter GH remarks..."
                />
                <FormFieldError id="field-ghRemarks-error" message={errors.ghRemarks} />
              </div>

              <div>
                <label className={labelClassName} htmlFor="field-airlineRemarks">
                  Airline Remarks
                </label>
                <textarea
                  id="field-airlineRemarks"
                  value={formData.airlineRemarks}
                  onChange={(e) =>
                    handleInputChange('airlineRemarks', e.target.value)
                  }
                  rows={5}
                  maxLength={REMARKS_MAX}
                  aria-invalid={Boolean(errors.airlineRemarks)}
                  aria-describedby={errors.airlineRemarks ? 'field-airlineRemarks-error' : undefined}
                  className={cn(textareaClassName, errors.airlineRemarks && FRIS_INVALID_CONTROL)}
                  placeholder="Enter airline remarks..."
                />
                <FormFieldError id="field-airlineRemarks-error" message={errors.airlineRemarks} />
              </div>
            </div>
          </section>

          <section
            className={FLIGHT_DETAILS_SECTION_CLASS}
            aria-labelledby="negative-feedback-heading"
          >
            <h3
              id="negative-feedback-heading"
              className="mb-3 text-sm font-semibold text-gray-800"
            >
              Negative feedback
            </h3>
            <fieldset>
              <legend className="text-sm text-gray-700">
                Do you want to add negative remarks?
              </legend>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="negativeRemarksChoice"
                    checked={formData.showNegativeRemarks}
                    onChange={() =>
                      handleInputChange('showNegativeRemarks', true)
                    }
                    className="w-4 h-4 text-emerald-600 border-gray-300 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">Yes</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="negativeRemarksChoice"
                    checked={!formData.showNegativeRemarks}
                    onChange={() =>
                      handleInputChange('showNegativeRemarks', false)
                    }
                    className="h-4 w-4 border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">No</span>
                </label>
              </div>
            </fieldset>

            {formData.showNegativeRemarks && (
              <div className="mt-4">
                <label className={labelClassName} htmlFor="field-negativeRemarks">
                  Negative remarks
                </label>
                <textarea
                  id="field-negativeRemarks"
                  value={formData.negativeRemarks}
                  onChange={(e) =>
                    handleInputChange('negativeRemarks', e.target.value)
                  }
                  rows={3}
                  maxLength={REMARKS_MAX}
                  aria-invalid={Boolean(errors.negativeRemarks)}
                  aria-describedby={errors.negativeRemarks ? 'field-negativeRemarks-error' : undefined}
                  className={cn(textareaClassName, errors.negativeRemarks && FRIS_INVALID_CONTROL)}
                  placeholder="Enter negative remarks..."
                />
                <FormFieldError id="field-negativeRemarks-error" message={errors.negativeRemarks} />
              </div>
            )}
          </section>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <div
              className="min-h-5 text-sm sm:text-right"
              role={saveStatus === 'error' ? 'alert' : 'status'}
              aria-live="polite"
            >
              {saveStatus === 'success' && (
                <span className="font-medium text-emerald-600">Saved.</span>
              )}
              {saveStatus === 'error' && saveError && (
                <span className="text-red-600">{saveError}</span>
              )}
            </div>
            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={saveStatus === 'saving'}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              <Save className="w-4 h-4" />
              {saveStatus === 'saving' ? 'Saving…' : 'Save'}
            </motion.button>
          </div>
        </form>
      </div>
    </div>
  );
}
