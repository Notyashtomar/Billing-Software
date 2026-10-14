'use client';

import { useState, useCallback, useEffect } from 'react';
import { Building2, Lock, Unlock, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { BaseFormProps } from './types';
import { getNsRawFormDefaultUrl, saveNsRawForm, fetchNsRawFormData } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import {
  normalizeTerminalDetailsData,
  terminalDetailsFormToSavePayload,
} from '@/utils/dataProcessor';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  time24,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  sanitizeTerminalInput,
  validateTerminalInputLimit,
  TERMINAL_INPUT_RULES,
} from '@/components/fris/flights/terminalDetailsInputLimits';
import {
  FLIGHT_DETAILS_FIELD_GRID_CLASS,
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';

const fetch = frisFetch;

type TerminalDetailsFormProps = BaseFormProps;

const TERMINAL_FIELD_ORDER = [
  'igm',
  'egm',
  'dpr',
  'ohd',
  'offloadPax',
  'ahl',
  'gatePlanned',
  'gateFinal',
  'passengerArrived',
  'departed',
  'transit',
  'systemBagCount',
  'beltNo',
  'cabinBreakupF',
  'cabinBreakupC',
  'cabinBreakupY',
  'arrivalWheelChairR',
  'arrivalWheelChairS',
  'arrivalWheelChairC',
  'arrivalWheelChairExtra',
  'departureWheelChairR',
  'departureWheelChairS',
  'departureWheelChairC',
  'departureWheelChairExtra',
  'counterOpen',
  'counterClose',
  'boardingOpen',
  'boardingClose',
] as const;
type TerminalField = (typeof TERMINAL_FIELD_ORDER)[number];

const LIMIT_FIELDS = new Set<TerminalField>(
  TERMINAL_FIELD_ORDER.filter((key) => key in TERMINAL_INPUT_RULES),
);

const TIME_FIELDS = new Set<TerminalField>([
  'counterOpen',
  'counterClose',
  'boardingOpen',
  'boardingClose',
]);

const FIELD_LABELS: Record<TerminalField, string> = {
  igm: 'IGM',
  egm: 'EGM',
  dpr: 'DPR',
  ohd: 'OHD',
  offloadPax: 'Off load Pax',
  ahl: 'AHL',
  gatePlanned: 'Gate Planned',
  gateFinal: 'Gate Final',
  passengerArrived: 'Arrived Pax',
  departed: 'Departed Pax',
  transit: 'Transit',
  systemBagCount: 'System Bag Count',
  beltNo: 'Belt No',
  cabinBreakupF: 'Cabin Break-up [F]',
  cabinBreakupC: 'Cabin Break-up [C]',
  cabinBreakupY: 'Cabin Break-up [Y]',
  arrivalWheelChairR: 'Arrival wheelchair R',
  arrivalWheelChairS: 'Arrival wheelchair S',
  arrivalWheelChairC: 'Arrival wheelchair C',
  arrivalWheelChairExtra: 'Additional arrival wheelchairs',
  departureWheelChairR: 'Departure wheelchair R',
  departureWheelChairS: 'Departure wheelchair S',
  departureWheelChairC: 'Departure wheelchair C',
  departureWheelChairExtra: 'Additional departure wheelchairs',
  counterOpen: 'Counter open',
  counterClose: 'Counter close',
  boardingOpen: 'Boarding open',
  boardingClose: 'Boarding close',
};

const INITIAL_FORM_DATA = {
  igm: '',
  egm: '',
  dpr: '',
  ohd: '',
  offloadPax: '',
  ahl: '',
  gatePlanned: '',
  gateFinal: '',
  counterOpen: '',
  counterClose: '',
  systemBagCount: '',
  boardingOpen: '',
  boardingClose: '',
  beltNo: '',
  passengerArrived: '',
  departed: '',
  transit: '',
  cabinBreakupF: '',
  cabinBreakupC: '',
  cabinBreakupY: '',
  arrivalWheelChairR: '',
  arrivalWheelChairS: '',
  arrivalWheelChairC: '',
  arrivalWheelChairExtra: '',
  departureWheelChairR: '',
  departureWheelChairS: '',
  departureWheelChairC: '',
  departureWheelChairExtra: '',
};

export default function TerminalDetailsForm({
  flight,
  onSave,
}: TerminalDetailsFormProps) {
  const [isLocked, setIsLocked] = useState(true);

  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const { errors, clearField, applyAndFocus } =
    useFieldErrors<TerminalField>(TERMINAL_FIELD_ORDER);

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
        // GET .../ns-raw-flight-data/terminal-details/:serialNo — load saved data from DB
        const doc = await fetchNsRawFormData('terminal-details', serialNo);
        if (cancelled) return;
        const data = normalizeTerminalDetailsData(doc);
        if (data) {
          setFormData({
            ...INITIAL_FORM_DATA,
            igm: data.igm ?? '',
            egm: data.egm ?? '',
            dpr: data.dpr ?? '',
            ohd: data.ohd ?? '',
            offloadPax: data.offLoadPax ?? '',
            ahl: data.ahl ?? '',
            gatePlanned: data.gatePlanned ?? '',
            gateFinal: data.gateFinal ?? '',
            counterOpen: data.counterOpen ?? '',
            counterClose: data.counterClose ?? '',
            systemBagCount: data.systemBagCount ?? '',
            boardingOpen: data.boardingOpen ?? '',
            boardingClose: data.boardingClose ?? '',
            beltNo: data.beltNo ?? '',
            passengerArrived: data.passengerArrived ?? '',
            departed: data.departed ?? '',
            transit: data.transit ?? '',
            cabinBreakupF: data.cabinBreakupF ?? '',
            cabinBreakupC: data.cabinBreakupC ?? '',
            cabinBreakupY: data.cabinBreakupY ?? '',
            arrivalWheelChairR: data.arrivalWheelChairR ?? '',
            arrivalWheelChairS: data.arrivalWheelChairS ?? '',
            arrivalWheelChairC: data.arrivalWheelChairC ?? '',
            departureWheelChairR: data.departureWheelChairR ?? '',
            departureWheelChairS: data.departureWheelChairS ?? '',
            departureWheelChairC: data.departureWheelChairC ?? '',
          });
          return;
        }
        const rawRes = await fetch(getNsRawFormDefaultUrl('terminal-details', serialNo), {
          method: 'GET',
        });
        if (cancelled || !rawRes.ok) return;
        const rawJson = await rawRes.json();
        const rawData = normalizeTerminalDetailsData(rawJson?.data ?? rawJson);
        if (!rawData) return;
        setFormData((prev) => ({
          ...prev,
          passengerArrived: rawData.passengerArrived ?? '',
          departed: rawData.departed ?? '',
        }));
      } catch {
        if (!cancelled) setFormData(INITIAL_FORM_DATA);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [flight?.sNo]);

  const handleInputChange = (field: string, value: string) => {
    if (isLocked) return;
    const nextValue = sanitizeTerminalInput(field, value);
    setFormData((prev) => ({ ...prev, [field]: nextValue }));
    if ((TERMINAL_FIELD_ORDER as readonly string[]).includes(field)) {
      clearField(field as TerminalField);
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

    const next: FieldErrors<TerminalField> = {};
    for (const key of TERMINAL_FIELD_ORDER) {
      const value = String(formData[key] ?? '');
      if (LIMIT_FIELDS.has(key)) {
        const err = validateTerminalInputLimit(key, value, FIELD_LABELS[key]);
        if (err) next[key] = err;
      } else if (TIME_FIELDS.has(key)) {
        const err = time24(value, FIELD_LABELS[key]);
        if (err) next[key] = err;
      }
    }
    if (applyAndFocus(next)) {
      toast.warning('Please fix the highlighted fields.');
      return;
    }

    setSaveStatus('saving');
    setSaveError(null);
    try {
      await saveNsRawForm(
        'terminal-details',
        serial,
        terminalDetailsFormToSavePayload({
          airlinesOperator: flight.airline || '',
          flightNo: flight.flightNo || '',
          routing: flight.routing || '',
          operations: flight.ops || '',
          acType: flight.aircraft || '',
          sta: flight.staTime || '',
          staDate: flight.staDate || '',
          std: flight.stdTime || '',
          stdDate: flight.stdDate || '',
          igm: formData.igm,
          egm: formData.egm,
          dpr: formData.dpr,
          ohd: formData.ohd,
          offLoadPax: formData.offloadPax,
          ahl: formData.ahl,
          gatePlanned: formData.gatePlanned,
          gateFinal: formData.gateFinal,
          counterOpen: formData.counterOpen,
          counterClose: formData.counterClose,
          systemBagCount: formData.systemBagCount,
          boardingOpen: formData.boardingOpen,
          boardingClose: formData.boardingClose,
          beltNo: formData.beltNo,
          passengerArrived: formData.passengerArrived,
          departed: formData.departed,
          transit: formData.transit,
          cabinBreakupF: formData.cabinBreakupF,
          cabinBreakupC: formData.cabinBreakupC,
          cabinBreakupY: formData.cabinBreakupY,
          arrivalWheelChairR: formData.arrivalWheelChairR,
          arrivalWheelChairS: formData.arrivalWheelChairS,
          arrivalWheelChairC: formData.arrivalWheelChairC,
          departureWheelChairR: formData.departureWheelChairR,
          departureWheelChairS: formData.departureWheelChairS,
          departureWheelChairC: formData.departureWheelChairC,
        }),
      );
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
  const editableFields = [
    ['igm', 'IGM:'],
    ['egm', 'EGM:'],
    ['dpr', 'DPR:'],
    ['ohd', 'OHD:'],
    ['offloadPax', 'Off load Pax:'],
    ['ahl', 'AHL:'],
    ['gatePlanned', 'Gate Planned:'],
    ['gateFinal', 'Gate Final:'],
    ['systemBagCount', 'System Bag Count:'],
    ['beltNo', 'Belt No:'],
    ['passengerArrived', 'Arrived Pax:'],
    ['departed', 'Departed Pax:'],
    ['transit', 'Transit:'],
    ['cabinBreakupF', 'Cabin Break-up [F]:'],
    ['cabinBreakupC', 'Cabin Break-up [C]:'],
    ['cabinBreakupY', 'Cabin Break-up [Y]:'],
  ] as const;
  const wheelchairSections = [
    {
      title: 'Arrival Wheel Chairs',
      fields: [
        ['arrivalWheelChairR', 'Wheel Chair [R]:'],
        ['arrivalWheelChairS', 'Wheel Chair [S]:'],
        ['arrivalWheelChairC', 'Wheel Chair [C]:'],
        ['arrivalWheelChairExtra', 'Additional Wheel Chairs:'],
      ] as const,
    },
    {
      title: 'Departure Wheel Chairs',
      fields: [
        ['departureWheelChairR', 'Wheel Chair [R]:'],
        ['departureWheelChairS', 'Wheel Chair [S]:'],
        ['departureWheelChairC', 'Wheel Chair [C]:'],
        ['departureWheelChairExtra', 'Additional Wheel Chairs:'],
      ] as const,
    },
  ];

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-emerald-500 px-3 py-3 text-white shadow-md sm:px-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Terminal Details</h2>
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
          <section className={FLIGHT_DETAILS_SECTION_CLASS} aria-labelledby="terminal-flight-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
              <h3 id="terminal-flight-heading" className="text-sm font-bold text-emerald-700">
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
                  <label htmlFor={`terminal-${id}`} className={labelClassName}>{label}</label>
                  <input id={`terminal-${id}`} type="text" value={value || ''} readOnly className={readOnlyInputClassName} />
                  <FormFieldError />
                </div>
              ))}
            </div>
          </section>

          <section className={FLIGHT_DETAILS_SECTION_CLASS} aria-labelledby="terminal-operations-heading">
            <h3 id="terminal-operations-heading" className="mb-4 border-b border-gray-200 pb-2 text-sm font-bold text-emerald-700">
              Passenger and Terminal Operations
            </h3>
            <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
              {editableFields.map(([field, label]) => {
                const isValidated = (TERMINAL_FIELD_ORDER as readonly string[]).includes(field);
                const key = field as TerminalField;
                const rule = TERMINAL_INPUT_RULES[field];
                return (
                  <div key={field}>
                    <label htmlFor={isValidated ? `field-${field}` : `terminal-${field}`} className={labelClassName}>
                      {label}
                    </label>
                    <input
                      id={isValidated ? `field-${field}` : `terminal-${field}`}
                      type="text"
                      value={formData[field]}
                      onChange={(event) => handleInputChange(field, event.target.value)}
                      disabled={isLocked}
                      maxLength={rule?.maxLen}
                      inputMode={rule?.kind === 'digits' ? 'numeric' : 'text'}
                      autoComplete="off"
                      aria-invalid={isValidated && !!errors[key]}
                      className={cn(
                        inputClassName,
                        isValidated && errors[key] && FRIS_INVALID_CONTROL,
                      )}
                    />
                    <FormFieldError
                      id={isValidated ? `field-${field}-error` : undefined}
                      message={isValidated ? errors[key] : undefined}
                    />
                  </div>
                );
              })}
              {[
                ['counterOpen', 'Counter Open:'],
                ['counterClose', 'Counter Close:'],
                ['boardingOpen', 'Boarding Open:'],
                ['boardingClose', 'Boarding Close:'],
              ].map(([field, label]) => {
                const key = field as TerminalField;
                return (
                  <div key={field}>
                    <label className={labelClassName}>{label}</label>
                    <TimeSelect24
                      hourSelectId={`field-${key}`}
                      value={String(formData[key] ?? '')}
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
            </div>
          </section>

          {wheelchairSections.map((section) => (
            <section key={section.title} className={FLIGHT_DETAILS_SECTION_CLASS}>
              <h3 className="mb-4 border-b border-gray-200 pb-2 text-sm font-bold text-emerald-700">{section.title}</h3>
              <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
                {section.fields.map(([field, label]) => {
                  const key = field as TerminalField;
                  const rule = TERMINAL_INPUT_RULES[field];
                  return (
                    <div key={field}>
                      <label htmlFor={`field-${field}`} className={labelClassName}>{label}</label>
                      <input
                        id={`field-${field}`}
                        type="text"
                        value={formData[field]}
                        onChange={(event) => handleInputChange(field, event.target.value)}
                        disabled={isLocked}
                        maxLength={rule?.maxLen}
                        inputMode={rule?.kind === 'digits' ? 'numeric' : 'text'}
                        autoComplete="off"
                        aria-invalid={!!errors[key]}
                        className={cn(inputClassName, errors[key] && FRIS_INVALID_CONTROL)}
                      />
                      <FormFieldError id={`field-${field}-error`} message={errors[key]} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="flex flex-wrap items-center gap-3 pb-2" aria-label="Form actions">
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
          </section>
        </div>
      </form>
    </div>
  );
}
