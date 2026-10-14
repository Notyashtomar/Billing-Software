'use client';

import { useState, useCallback, useEffect } from 'react';
import { ClipboardList, FileText, Printer, Save, UserRound } from 'lucide-react';
import type { BaseFormProps } from './types';
import { getNsRawFormDefaultUrl, saveNsRawForm, fetchNsRawFormData } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  required,
  selectRequired,
  validDate,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  FLIGHT_DETAILS_FIELD_GRID_CLASS,
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';

const fetch = frisFetch;

const MANIFEST_FIELD_ORDER = ['name', 'ppNo', 'nationality', 'place', 'arrivedFrom', 'departingTo', 'seat', 'gender', 'dob'] as const;
type ManifestField = (typeof MANIFEST_FIELD_ORDER)[number];

interface ManifestFormProps extends BaseFormProps {
  onPrintReport?: (reportName: string) => void;
}

const INITIAL_MANIFEST_FORM = {
  arrDep: '',
  name: '',
  ppNo: '',
  nationality: '',
  type: '',
  place: '',
  arrivedFrom: '',
  departingTo: '',
  seat: '',
  gender: '' as '' | 'Male' | 'Female',
  dob: '',
};

const TYPE_OPTIONS = ['Capt1', 'Capt2', 'F/O', 'CA', 'FE', 'Pax'];
const REPORT_OPTIONS = [
  'Arrival Passenger Manifest',
  'Departure Passenger Manifest',
  'Inward General Declaration',
  'Outward General Declaration',
  'Boarding Pass',
  'Assistant Commandant',
  'Terminal Manager',
  'AFRRO',
];

export default function ManifestForm({
  flight,
  onSave,
  onPrintReport,
}: ManifestFormProps) {
  const [activeTab, setActiveTab] = useState<'manifest' | 'reports'>('manifest');
  const [selectedReport, setSelectedReport] = useState('');

  const [formData, setFormData] = useState(INITIAL_MANIFEST_FORM);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const { errors, clearField, applyAndFocus } = useFieldErrors<ManifestField>(MANIFEST_FIELD_ORDER);

  useEffect(() => {
    const serial = flight?.sNo != null ? String(flight.sNo) : null;
    if (!serial) {
      const resetId = window.setTimeout(() => setFormData(INITIAL_MANIFEST_FORM), 0);
      return () => window.clearTimeout(resetId);
    }
    const serialNo = serial;
    let cancelled = false;
    async function load() {
      try {
        // GET .../ns-raw-flight-data/manifest-details/:serialNo — load saved data from DB
        const doc = await fetchNsRawFormData('manifest-details', serialNo);
        if (cancelled) return;
        if (doc && typeof doc === 'object') {
          const d = (doc as Record<string, unknown>).data ?? doc;
          const data = d as Record<string, unknown>;
          if (data && typeof data === 'object')
            setFormData((prev) => ({ ...prev, ...data }));
          return;
        }
        const rawRes = await fetch(getNsRawFormDefaultUrl('manifest-details', serialNo), { method: 'GET' });
        if (cancelled || !rawRes.ok) return;
        const rawJson = await rawRes.json();
        const data = (rawJson?.data ?? rawJson) as Record<string, unknown>;
        setFormData((prev) => ({ ...prev, ...data }));
      } catch {
        if (!cancelled) setFormData(INITIAL_MANIFEST_FORM);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [flight?.sNo]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'name') clearField('name');
    if (field === 'ppNo') clearField('ppNo');
    if (field === 'nationality') clearField('nationality');
    if (field === 'place') clearField('place');
    if (field === 'arrivedFrom') clearField('arrivedFrom');
    if (field === 'departingTo') clearField('departingTo');
    if (field === 'seat') clearField('seat');
    if (field === 'gender') clearField('gender');
    if (field === 'dob') clearField('dob');
  };

  const handleSave = useCallback(async () => {
    if (!flight) return;
    const serial = flight.sNo != null ? String(flight.sNo) : null;
    if (!serial) {
      setSaveError('No flight selected');
      setSaveStatus('error');
      return;
    }
    const next: FieldErrors<ManifestField> = {};
    const nameErr =
      required(formData.name, 'Name') ??
      (/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(formData.name.trim())
        ? null
        : 'Name may only contain letters.');
    if (nameErr) next.name = nameErr;
    if (formData.ppNo.trim() && !/^[A-Za-z0-9]+$/.test(formData.ppNo.trim())) {
      next.ppNo = 'P. P. No may only contain letters and numbers.';
    }
    if (
      formData.nationality.trim() &&
      !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(formData.nationality.trim())
    ) {
      next.nationality = 'Nationality may only contain letters.';
    }
    if (formData.place.trim() && !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(formData.place.trim())) {
      next.place = 'Place may only contain letters.';
    }
    if (
      formData.arrivedFrom.trim() &&
      !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(formData.arrivedFrom.trim())
    ) {
      next.arrivedFrom = 'Arrived From may only contain letters.';
    }
    if (
      formData.departingTo.trim() &&
      !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(formData.departingTo.trim())
    ) {
      next.departingTo = 'Departing To may only contain letters.';
    }
    if (formData.seat.trim() && !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(formData.seat.trim())) {
      next.seat = 'Seat may only contain letters.';
    }
    const genderErr = selectRequired(formData.gender, 'gender');
    if (genderErr) next.gender = genderErr;
    const dobErr = validDate(formData.dob, 'DOB');
    if (dobErr) next.dob = dobErr;
    if (applyAndFocus(next)) {
      setSaveStatus('error');
      setSaveError(null);
      return;
    }
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await saveNsRawForm('manifest-details', serial, {
        airlineName: flight.airline || '',
        flightNumber: flight.flightNo || '',
        ...formData,
      });
      setSaveStatus('success');
      onSave?.(formData);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
      setSaveStatus('error');
    }
  }, [flight, formData, onSave, applyAndFocus]);

  const handlePrintView = useCallback(() => {
    onPrintReport?.(selectedReport);
  }, [selectedReport, onPrintReport]);

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    let nextTab: 'manifest' | 'reports' | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      nextTab = activeTab === 'manifest' ? 'reports' : 'manifest';
    } else if (event.key === 'Home') {
      nextTab = 'manifest';
    } else if (event.key === 'End') {
      nextTab = 'reports';
    }
    if (!nextTab) return;
    event.preventDefault();
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`${nextTab}-tab`)?.focus());
  };

  const inputClassName =
    'min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-[border-color,box-shadow] duration-200 hover:border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';
  const selectClassName = `${inputClassName} cursor-pointer`;
  const labelClassName = 'mb-1.5 block text-sm font-medium text-gray-700';
  const hasFlightSerial = flight?.sNo != null && String(flight.sNo).trim() !== '';
  const manifestPanelId = 'manifest-tabpanel';
  const reportsPanelId = 'reports-tabpanel';

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      <header className="shrink-0 border-b border-emerald-700/20 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-4 text-white shadow-sm sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">Manifest and Reports</h2>
            <p className="mt-0.5 truncate text-xs text-emerald-50">
              SNo {flight?.sNo || '—'} • Flight {flight?.flightNo || '—'} • {flight?.airline || '—'}
            </p>
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2.5 sm:px-5">
        <div
          className="inline-flex w-full min-w-0 rounded-xl bg-gray-100 p-1 sm:w-auto"
          role="tablist"
          aria-label="Manifest sections"
        >
          <button
            type="button"
            id="manifest-tab"
            role="tab"
            aria-selected={activeTab === 'manifest'}
            aria-controls={manifestPanelId}
            tabIndex={activeTab === 'manifest' ? 0 : -1}
            onClick={() => setActiveTab('manifest')}
            onKeyDown={handleTabKeyDown}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:flex-none ${
              activeTab === 'manifest'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'
            }`}
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            Manifest
          </button>
          <button
            type="button"
            id="reports-tab"
            role="tab"
            aria-selected={activeTab === 'reports'}
            aria-controls={reportsPanelId}
            tabIndex={activeTab === 'reports' ? 0 : -1}
            onClick={() => setActiveTab('reports')}
            onKeyDown={handleTabKeyDown}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:flex-none ${
              activeTab === 'reports'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'
            }`}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Reports
          </button>
        </div>
      </div>

      <div className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        <div className="w-full min-w-0">
          {activeTab === 'manifest' && (
            <section
              id={manifestPanelId}
              role="tabpanel"
              aria-labelledby="manifest-tab"
              tabIndex={0}
              className={`${FLIGHT_DETAILS_SECTION_CLASS} space-y-5`}
            >
              <div className="flex items-start gap-3 border-b border-gray-100 pb-4">
                <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Passenger or crew details</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Enter only verified manifest information. No fields are prefilled with assumed data.
                  </p>
                </div>
              </div>
              <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
                <div>
                  <span className={labelClassName}>Arr/Dep</span>
                  <AdminRadioDropdown
                    value={formData.arrDep}
                    onChange={(v) => handleInputChange('arrDep', v)}
                    options={[
                      { value: 'Arrival', label: 'Arrival' },
                      { value: 'Departure', label: 'Departure' },
                    ]}
                    placeholder="Select movement"
                    className={selectClassName}
                  />
                  <FormFieldError />
                </div>
              </div>

              <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
                <div>
                  <label htmlFor="field-name" className={labelClassName}>
                    Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="field-name"
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      handleInputChange('name', e.target.value.replace(/[^A-Za-z ]/g, ''))
                    }
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'field-name-error' : undefined}
                    className={cn(inputClassName, errors.name && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-name-error" message={errors.name} />
                </div>
                <div>
                  <label htmlFor="field-ppNo" className={labelClassName}>P. P. No</label>
                  <input
                    id="field-ppNo"
                    type="text"
                    value={formData.ppNo}
                    onChange={(e) =>
                      handleInputChange('ppNo', e.target.value.replace(/[^A-Za-z0-9]/g, ''))
                    }
                    aria-invalid={Boolean(errors.ppNo)}
                    aria-describedby={errors.ppNo ? 'field-ppNo-error' : undefined}
                    className={cn(inputClassName, errors.ppNo && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-ppNo-error" message={errors.ppNo} />
                </div>
                <div>
                  <label htmlFor="field-nationality" className={labelClassName}>Nationality</label>
                  <input
                    id="field-nationality"
                    type="text"
                    value={formData.nationality}
                    onChange={(e) =>
                      handleInputChange('nationality', e.target.value.replace(/[^A-Za-z ]/g, ''))
                    }
                    aria-invalid={Boolean(errors.nationality)}
                    aria-describedby={errors.nationality ? 'field-nationality-error' : undefined}
                    className={cn(inputClassName, errors.nationality && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-nationality-error" message={errors.nationality} />
                </div>
              </div>

              <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
                <div>
                  <span className={labelClassName}>Type</span>
                  <AdminRadioDropdown
                    value={formData.type}
                    onChange={(v) => handleInputChange('type', v)}
                    options={[
                      { value: '', label: 'Select Type' },
                      ...TYPE_OPTIONS.map((option) => ({ value: option, label: option })),
                    ]}
                    placeholder="Select Type"
                    className={selectClassName}
                  />
                  <FormFieldError />
                </div>
                <div>
                  <label htmlFor="field-place" className={labelClassName}>Place</label>
                  <input
                    id="field-place"
                    type="text"
                    value={formData.place}
                    onChange={(e) =>
                      handleInputChange('place', e.target.value.replace(/[^A-Za-z ]/g, ''))
                    }
                    aria-invalid={Boolean(errors.place)}
                    aria-describedby={errors.place ? 'field-place-error' : undefined}
                    className={cn(inputClassName, errors.place && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-place-error" message={errors.place} />
                </div>
                <div>
                  <label htmlFor="field-arrivedFrom" className={labelClassName}>Arrived From</label>
                  <input
                    id="field-arrivedFrom"
                    type="text"
                    value={formData.arrivedFrom}
                    onChange={(e) =>
                      handleInputChange('arrivedFrom', e.target.value.replace(/[^A-Za-z ]/g, ''))
                    }
                    aria-invalid={Boolean(errors.arrivedFrom)}
                    aria-describedby={errors.arrivedFrom ? 'field-arrivedFrom-error' : undefined}
                    className={cn(inputClassName, errors.arrivedFrom && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-arrivedFrom-error" message={errors.arrivedFrom} />
                </div>
              </div>

              <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
                <div>
                  <label htmlFor="field-departingTo" className={labelClassName}>Departing To</label>
                  <input
                    id="field-departingTo"
                    type="text"
                    value={formData.departingTo}
                    onChange={(e) =>
                      handleInputChange('departingTo', e.target.value.replace(/[^A-Za-z ]/g, ''))
                    }
                    aria-invalid={Boolean(errors.departingTo)}
                    aria-describedby={errors.departingTo ? 'field-departingTo-error' : undefined}
                    className={cn(inputClassName, errors.departingTo && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-departingTo-error" message={errors.departingTo} />
                </div>
                <div>
                  <label htmlFor="field-seat" className={labelClassName}>Seat</label>
                  <input
                    id="field-seat"
                    type="text"
                    value={formData.seat}
                    onChange={(e) =>
                      handleInputChange('seat', e.target.value.replace(/[^A-Za-z ]/g, ''))
                    }
                    aria-invalid={Boolean(errors.seat)}
                    aria-describedby={errors.seat ? 'field-seat-error' : undefined}
                    className={cn(inputClassName, errors.seat && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-seat-error" message={errors.seat} />
                </div>
              </div>

              <div className={`${FLIGHT_DETAILS_FIELD_GRID_CLASS} items-start`}>
                <fieldset id="field-gender">
                  <legend className={labelClassName}>
                    Gender <span className="text-red-600">*</span>
                  </legend>
                  <div className="flex min-h-11 items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        checked={formData.gender === 'Male'}
                        onChange={() => handleInputChange('gender', 'Male')}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Male</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        checked={formData.gender === 'Female'}
                        onChange={() => handleInputChange('gender', 'Female')}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Female</span>
                    </label>
                  </div>
                  <FormFieldError id="field-gender-error" message={errors.gender} />
                </fieldset>
                <div className={cn(errors.dob && FRIS_INVALID_PICKER_WRAP)}>
                  <span className={labelClassName}>DOB</span>
                  <DatePicker
                    id="field-dob"
                    value={formData.dob}
                    onChange={(v) => handleInputChange('dob', v)}
                    valueFormat="yyyy-MM-dd"
                  />
                  <FormFieldError id="field-dob-error" message={errors.dob} />
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
                <div aria-live="polite" className="min-h-5 text-sm sm:mr-auto">
                  {!hasFlightSerial && <span className="text-amber-700">Select a flight before saving.</span>}
                  {saveStatus === 'success' && <span className="font-medium text-emerald-600">Saved.</span>}
                  {saveStatus === 'error' && saveError && <span className="text-red-600">{saveError}</span>}
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveStatus === 'saving' || !hasFlightSerial}
                  title={!hasFlightSerial ? 'Select a flight before saving' : undefined}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 sm:w-auto"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saveStatus === 'saving' ? 'Saving…' : 'Save'}
                </button>
              </div>
            </section>
          )}

          {activeTab === 'reports' && (
            <section
              id={reportsPanelId}
              role="tabpanel"
              aria-labelledby="reports-tab"
              tabIndex={0}
              className={`${FLIGHT_DETAILS_SECTION_CLASS} space-y-5`}
            >
              <div className="flex items-start gap-3 border-b border-gray-100 pb-4">
                <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Available reports</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Choose a report to open its print-ready view.
                  </p>
                </div>
              </div>
              <fieldset>
                <legend className="sr-only">Select report</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {REPORT_OPTIONS.map((option) => (
                    <label
                      key={option}
                      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.99] ${
                        selectedReport === option
                          ? 'border-emerald-500 bg-emerald-50 shadow-sm ring-1 ring-emerald-500/20'
                          : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reportType"
                        checked={selectedReport === option}
                        onChange={() => setSelectedReport(option)}
                        className="h-4 w-4 border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className={`text-sm ${selectedReport === option ? 'font-medium text-emerald-900' : 'text-gray-700'}`}>
                        {option}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {!onPrintReport && (
                <p id="print-report-disabled" className="text-sm text-amber-700" role="status">
                  Print / View is unavailable because no report callback is configured.
                </p>
              )}

              <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-500" aria-live="polite">
                  {selectedReport ? `Selected: ${selectedReport}` : 'Select a report to continue.'}
                </p>
                <button
                  type="button"
                  onClick={handlePrintView}
                  disabled={!onPrintReport || !selectedReport}
                  aria-describedby={!onPrintReport ? 'print-report-disabled' : undefined}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 sm:w-auto"
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  Print / View
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
