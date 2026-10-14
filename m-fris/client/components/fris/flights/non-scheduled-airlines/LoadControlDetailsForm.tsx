'use client';

import { useState, useCallback, useEffect } from 'react';
import { Lock, Scale, Save, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import type { BaseFormProps } from './types';
import { saveNsRawForm, fetchNsRawFormData } from '@/lib/api';
import {
  loadControlDetailsFormToSavePayload,
  normalizeLoadControlDetailsData,
} from '@/utils/dataProcessor';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { time24, type FieldErrors } from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  FLIGHT_DETAILS_FIELD_GRID_CLASS,
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';
import {
  sanitizeAlphanumeric,
  sanitizeDigits,
} from '@/components/fris/flights/terminalDetailsInputLimits';

type LoadControlDetailsFormProps = BaseFormProps;

const LC_FIELD_ORDER = [
  'loadingDiagramGivenAt',
  'loadingSheetPrintedAt',
  'loadingSheetDeliveredAt',
  'flightPlanFieldAt',
] as const;
type LcField = (typeof LC_FIELD_ORDER)[number];

const INITIAL_FORM_DATA = {
  loadingDiagramGivenAt: '',
  loadingSheetPrintedAt: '',
  loadingSheetDeliveredAt: '',
  flightPlanFieldAt: '',
  fic: '',
  adc: '',
};

const LC_TIME_LABELS: Record<LcField, string> = {
  loadingDiagramGivenAt: 'Loading diagram time',
  loadingSheetPrintedAt: 'Loading sheet printed time',
  loadingSheetDeliveredAt: 'Loading sheet delivered time',
  flightPlanFieldAt: 'Flight plan field time',
};

export default function LoadControlDetailsForm({
  flight,
  onSave,
}: LoadControlDetailsFormProps) {
  const [isLocked, setIsLocked] = useState(true);

  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const { errors, clearField, applyAndFocus } = useFieldErrors<LcField>(LC_FIELD_ORDER);

  useEffect(() => {
    const serial = flight?.sNo != null ? String(flight.sNo) : null;
    if (!serial) {
      // Reset immediately when selection clears; this intentionally mirrors flight identity.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData(INITIAL_FORM_DATA);
      return;
    }
    const serialNo = serial;
    let cancelled = false;
    async function load() {
      try {
        // GET .../ns-raw-flight-data/load-control-details/:serialNo — load saved data from DB
        const doc = await fetchNsRawFormData('load-control-details', serialNo);
        if (cancelled) return;
        const data = normalizeLoadControlDetailsData(doc);
        if (data) {
          setFormData({
            loadingDiagramGivenAt: data.loadingDiagramGivenAt ?? '',
            loadingSheetPrintedAt: data.loadingSheetPrintedAt ?? '',
            loadingSheetDeliveredAt: data.loadingSheetDeliveredAt ?? '',
            flightPlanFieldAt: data.flightPlanFieldAt ?? '',
            fic: sanitizeDigits(data.fic ?? '', 4),
            adc: sanitizeAlphanumeric(data.adc ?? '', 6),
          });
          return;
        }
        setFormData(INITIAL_FORM_DATA);
      } catch {
        if (!cancelled) setFormData(INITIAL_FORM_DATA);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [flight?.sNo]);

  const handleInputChange = (field: string, value: string) => {
    if (isLocked) return;
    let next = value;
    if (field === 'fic') next = sanitizeDigits(value, 4);
    else if (field === 'adc') next = sanitizeAlphanumeric(value, 6);
    setFormData((prev) => ({ ...prev, [field]: next }));
    if ((LC_FIELD_ORDER as readonly string[]).includes(field)) {
      clearField(field as LcField);
    }
  };

  const handleLockToggle = () => {
    setIsLocked(!isLocked);
  };

  const handleSave = useCallback(async () => {
    if (isLocked || !flight) return;
    const serial = flight.sNo != null ? String(flight.sNo) : null;
    if (!serial) {
      setSaveError('No flight selected');
      setSaveStatus('error');
      return;
    }

    const next: FieldErrors<LcField> = {};
    for (const key of LC_FIELD_ORDER) {
      const err = time24(formData[key], LC_TIME_LABELS[key]);
      if (err) next[key] = err;
    }
    if (applyAndFocus(next)) {
      toast.warning('Please fix the highlighted fields.');
      return;
    }

    setSaveStatus('saving');
    setSaveError(null);
    try {
      await saveNsRawForm('load-control-details', serial, loadControlDetailsFormToSavePayload({
        airlinesOperator: flight.airline || '',
        flightNo: flight.flightNo || '',
        routing: flight.routing || '',
        operations: flight.ops || '',
        acType: flight.aircraft || '',
        sta: flight.staTime || '',
        staDate: flight.staDate || '',
        std: flight.stdTime || '',
        stdDate: flight.stdDate || '',
        loadingDiagramGivenAt: formData.loadingDiagramGivenAt,
        loadingSheetPrintedAt: formData.loadingSheetPrintedAt,
        loadingSheetDeliveredAt: formData.loadingSheetDeliveredAt,
        flightPlanFieldAt: formData.flightPlanFieldAt,
        fic: formData.fic,
        adc: formData.adc,
      }));
      setSaveStatus('success');
      onSave?.(formData);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
      setSaveStatus('error');
    }
  }, [applyAndFocus, flight, formData, isLocked, onSave]);

  const inputClassName = `min-h-11 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors ${
    isLocked
      ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-600'
      : 'border-gray-300 bg-white hover:border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30'
  }`;
  const readOnlyInputClassName =
    'min-h-11 w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-3 py-2.5 text-sm text-gray-600';
  const labelClassName = 'mb-1.5 block text-xs font-medium text-gray-600';

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-emerald-500 px-3 py-3 text-white shadow-md sm:px-4">
        <div className="flex items-center gap-2">
          <Scale className="h-6 w-6" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Load Control Details</h2>
        </div>
        <button
          type="button"
          onClick={handleLockToggle}
          className="flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 font-medium transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-pressed={!isLocked}
          title={isLocked ? 'Unlock to edit' : 'Lock form'}
        >
          {isLocked ? <Lock className="h-5 w-5" aria-hidden="true" /> : <Unlock className="h-5 w-5" aria-hidden="true" />}
          {isLocked ? 'Locked' : 'Unlocked'}
        </button>
      </header>

      <form
        className={FLIGHT_DETAILS_FORM_BODY_CLASS}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <div className="w-full min-w-0 space-y-6">
          <section className={FLIGHT_DETAILS_SECTION_CLASS} aria-labelledby="load-flight-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
              <h3 id="load-flight-heading" className="text-sm font-bold text-emerald-700">
                Flight Information
              </h3>
              <span className="text-sm font-semibold text-gray-800">Serial No: {flight?.sNo || '—'}</span>
            </div>
            <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
              {[
                ['airline', 'Airlines/Operator:', flight?.airline],
                ['flightNo', 'Flight No.:', flight?.flightNo],
                ['routing', 'Routing:', flight?.routing],
                ['operations', 'Operations:', flight?.ops],
                ['aircraft', 'A/C Type:', flight?.aircraft],
                ['sta', 'STA:', flight?.staTime],
                ['staDate', 'STA Date:', flight?.staDate],
                ['std', 'STD:', flight?.stdTime],
                ['stdDate', 'STD Date:', flight?.stdDate],
              ].map(([id, label, value]) => (
                <div key={id}>
                  <label htmlFor={`load-${id}`} className={labelClassName}>{label}</label>
                  <input id={`load-${id}`} type="text" value={value || ''} readOnly className={readOnlyInputClassName} />
                  <FormFieldError />
                </div>
              ))}
            </div>
          </section>

          <section className={`${FLIGHT_DETAILS_SECTION_CLASS} space-y-4`} aria-labelledby="load-details-heading">
            <h3 id="load-details-heading" className="border-b border-gray-200 pb-2 text-sm font-bold text-emerald-700">
              Loading Details
            </h3>
            <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
              {[
                ['loadingDiagramGivenAt', 'Loading Diagram given at:'],
                ['loadingSheetPrintedAt', 'Loading Sheet Printed at:'],
                ['loadingSheetDeliveredAt', 'Loading Sheet Delivered at:'],
                ['flightPlanFieldAt', 'Flight Plan Field at:'],
              ].map(([field, label]) => {
                const key = field as LcField;
                return (
                  <div key={field}>
                    <label className={labelClassName}>{label}</label>
                    <TimeSelect24
                      hourSelectId={`field-${key}`}
                      value={formData[key]}
                      onChange={(value) => handleInputChange(key, value)}
                      disabled={isLocked}
                      className={cn(
                        'min-h-11 w-full',
                        errors[key] && 'border-red-500 ring-2 ring-red-200',
                      )}
                    />
                    <FormFieldError id={`field-${key}-error`} message={errors[key]} />
                  </div>
                );
              })}
              {[
                ['fic', 'FIC:'],
                ['adc', 'ADC:'],
              ].map(([field, label]) => (
                <div key={field}>
                  <label htmlFor={`load-${field}`} className={labelClassName}>{label}</label>
                  <input
                    id={`load-${field}`}
                    type="text"
                    value={formData[field as 'fic' | 'adc']}
                    onChange={(event) => handleInputChange(field, event.target.value)}
                    disabled={isLocked}
                    maxLength={field === 'fic' ? 4 : 6}
                    inputMode={field === 'fic' ? 'numeric' : 'text'}
                    autoComplete="off"
                    className={inputClassName}
                  />
                <FormFieldError />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4" aria-label="Form actions">
              <button
                type="button"
                onClick={handleLockToggle}
                className="min-h-11 rounded-lg bg-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              >
                {isLocked ? 'Unlock' : 'Lock'}
              </button>
              <button
                type="submit"
                disabled={isLocked || saveStatus === 'saving'}
                className="flex min-h-11 items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {saveStatus === 'saving' ? 'Saving...' : 'Save'}
              </button>
              <div aria-live="polite" aria-atomic="true">
                {saveStatus === 'success' && <span className="text-sm font-medium text-emerald-700">Saved.</span>}
                {saveStatus === 'error' && saveError && <span role="alert" className="text-sm text-red-700">{saveError}</span>}
              </div>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
