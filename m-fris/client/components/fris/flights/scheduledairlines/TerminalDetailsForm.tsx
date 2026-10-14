'use client';

import React, { useState, useEffect } from 'react';
import { Building2, Lock, Unlock, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  FlightData,
  MainDetailsData,
  normalizeTerminalDetailsData,
  terminalDetailsFormToSavePayload,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import {
  getNsRawFormSavedUrl,
  getRawFlightScheduleBySerialUrl,
} from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
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
  type ScheduleFieldsFromRawApi,
  scheduleStaDateDisplay,
  scheduleStdDateDisplay,
  scheduleStaTimeNormalizedDisplay,
  scheduleStdTimeNormalizedDisplay,
} from './scheduledRowSchedule';
import { routingFromMainAndFlight } from './formRoutingFromMain';
import {
  FLIGHT_DETAILS_FIELD_GRID_CLASS,
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';

const fetch = frisFetch;

const TERMINAL_FIELD_ORDER = [
  'igm',
  'egm',
  'dpr',
  'ohd',
  'offLoadPax',
  'ahl',
  'gatePlanned',
  'gateFinal',
  'passengerArrived',
  'departed',
  'transit',
  'systemBagCount',
  'beltNo',
  'cabinBreakupF',
  'cabinC',
  'cabinY',
  'arrivalWheelChairR',
  'arrivalWheelChairS',
  'arrivalWheelChairC',
  'departureWheelChairR',
  'departureWheelChairS',
  'departureWheelChairC',
  'counterOpen',
  'counterClose',
  'boardingOpen',
  'boardingClose',
] as const;
type TerminalField = (typeof TERMINAL_FIELD_ORDER)[number];

/** Stable field component defined outside form to prevent input remount on every keystroke */
function TerminalDetailsField({
  label,
  value,
  onChange,
  type = 'text',
  disabled,
  labelClassName,
  inputClassName,
  id,
  error,
  maxLength,
  inputMode,
  autoComplete = 'off',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
  labelClassName: string;
  inputClassName: string;
  id?: string;
  error?: string | null;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error && id ? `${id}-error` : undefined}
        className={cn(inputClassName, error && FRIS_INVALID_CONTROL)}
      />
      <FormFieldError id={id ? `${id}-error` : undefined} message={error} />
    </div>
  );
}

function terminalFieldAttrs(field: string): {
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
} {
  const rule = TERMINAL_INPUT_RULES[field];
  if (!rule) return {};
  return {
    maxLength: rule.maxLen,
    inputMode: rule.kind === 'digits' ? 'numeric' : 'text',
  };
}

export interface TerminalDetailsFormProps {
  flight: FlightData;
  showBackButton?: boolean;
  onBack?: () => void;
  mainDetails?: MainDetailsData | null;
  /** Parent refreshes lock columns and may auto-email GH rep when all locks complete. */
  onFhrLocksMayHaveChanged?: (slNo: string) => void;
}

export default function TerminalDetailsForm({
  flight,
  showBackButton = false,
  onBack,
  mainDetails,
  onFhrLocksMayHaveChanged,
}: TerminalDetailsFormProps) {
  const displayAirline =
    String(mainDetails?.airlineName ?? '').trim() || flight.airline;
  const displayFlightNo =
    String(mainDetails?.flightCode ?? '').trim() || flight.flightNo;
  const displayAircraft =
    String(mainDetails?.aircraftType ?? '').trim() || flight.aircraft;
  const [isLocked, setIsLocked] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [scheduleFromRaw, setScheduleFromRaw] =
    useState<ScheduleFieldsFromRawApi | null>(null);

  useEffect(() => {
    if (!flight?.slNo) {
      setScheduleFromRaw(null);
      return;
    }
    const url = getRawFlightScheduleBySerialUrl(flight.slNo);
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((row: ScheduleFieldsFromRawApi | null) => {
        if (
          row != null &&
          typeof row === 'object' &&
          !Array.isArray(row) &&
          (String(row.staDate ?? '').trim() ||
            String(row.stdDate ?? '').trim() ||
            String(row.staTime ?? '').trim() ||
            String(row.stdTime ?? '').trim())
        ) {
          setScheduleFromRaw(row);
        } else setScheduleFromRaw(null);
      })
      .catch(() => setScheduleFromRaw(null));
  }, [flight?.slNo]);

  useEffect(() => {
    if (!flight?.slNo) return;

    setIgm('');
    setOhd('');
    setGatePlanned('');
    setCounterClose('');
    setBoardingClose('');
    setDeparted('');
    setCabinC('');
    setEgm('');
    setOffLoadPax('');
    setGateFinal('');
    setSystemBagCount('');
    setBeltNo('');
    setTransit('');
    setCabinY('');
    setDpr('');
    setAhl('');
    setCounterOpen('');
    setBoardingOpen('');
    setPassengerArrived('');
    setCabinBreakupF('');
    setArrivalWheelChairR('');
    setArrivalWheelChairS('');
    setArrivalWheelChairC('');
    setDepartureWheelChairR('');
    setDepartureWheelChairS('');
    setDepartureWheelChairC('');

    const url = getNsRawFormSavedUrl(
      'terminal-details',
      nsFormSerialForFlight(flight),
    );
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        const data = normalizeTerminalDetailsData(raw);
        // Section 1 always from schedule / saved header.
        // Operational fields only when saved from this form (enteredFromForm) —
        // Excel/FHR seed must not appear as prefilled form values.
        if (data) {
          setAirlinesOperator(data.airlinesOperator ?? displayAirline ?? '');
          setRouting(
            routingFromMainAndFlight(data.routing, mainDetails, flight),
          );
          setAcType(data.acType ?? displayAircraft ?? '');
          setFlightNo(data.flightNo ?? displayFlightNo ?? '');
          setOperations(data.operations ?? 'Turnaround');
          if (data.enteredFromForm) {
            if (data.igm != null) setIgm(String(data.igm));
            if (data.egm != null) setEgm(String(data.egm));
            if (data.gatePlanned != null) setGatePlanned(data.gatePlanned);
            if (data.gateFinal != null) setGateFinal(data.gateFinal);
            if (data.counterOpen != null) setCounterOpen(data.counterOpen);
            if (data.counterClose != null) setCounterClose(data.counterClose);
            if (data.boardingOpen != null) setBoardingOpen(data.boardingOpen);
            if (data.boardingClose != null)
              setBoardingClose(data.boardingClose);
            if (data.passengerArrived != null)
              setPassengerArrived(String(data.passengerArrived));
            if (data.departed != null) setDeparted(String(data.departed));
            if (data.systemBagCount != null)
              setSystemBagCount(String(data.systemBagCount));
            if (data.beltNo != null) setBeltNo(data.beltNo);
            if (data.transit != null) setTransit(String(data.transit));
            if (data.dpr != null) setDpr(String(data.dpr));
            if (data.ahl != null) setAhl(String(data.ahl));
            if (data.ohd != null) setOhd(String(data.ohd));
            if (data.offLoadPax != null) setOffLoadPax(String(data.offLoadPax));
            if (data.cabinBreakupF != null)
              setCabinBreakupF(String(data.cabinBreakupF));
            if (data.cabinBreakupC != null)
              setCabinC(String(data.cabinBreakupC));
            if (data.cabinBreakupY != null)
              setCabinY(String(data.cabinBreakupY));
            if (data.arrivalWheelChairR != null)
              setArrivalWheelChairR(String(data.arrivalWheelChairR));
            if (data.arrivalWheelChairS != null)
              setArrivalWheelChairS(String(data.arrivalWheelChairS));
            if (data.arrivalWheelChairC != null)
              setArrivalWheelChairC(String(data.arrivalWheelChairC));
            if (data.departureWheelChairR != null)
              setDepartureWheelChairR(String(data.departureWheelChairR));
            if (data.departureWheelChairS != null)
              setDepartureWheelChairS(String(data.departureWheelChairS));
            if (data.departureWheelChairC != null)
              setDepartureWheelChairC(String(data.departureWheelChairC));
          }
        } else {
          setAirlinesOperator(displayAirline ?? '');
          setAcType(displayAircraft ?? '');
          setFlightNo(displayFlightNo ?? '');
          setRouting(routingFromMainAndFlight(undefined, mainDetails, flight));
        }
      })
      .catch((err) => console.error('[TerminalDetailsForm] Fetch error:', err));
  }, [flight?.slNo, mainDetails?.route]);

  useEffect(() => {
    const m = (mainDetails?.route ?? '').trim();
    if (!m) return;
    setRouting((prev) => (prev.trim() === '' ? m : prev));
  }, [mainDetails?.route]);

  // Top section
  const [airlinesOperator, setAirlinesOperator] = useState(
    displayAirline || '',
  );
  const [routing, setRouting] = useState('');
  const [acType, setAcType] = useState(displayAircraft || '');
  const [flightNo, setFlightNo] = useState(displayFlightNo || '');
  const [operations, setOperations] = useState('Turnaround');

  // Three-column section — blank until saved terminal-details exist for this flight.
  const [igm, setIgm] = useState('');
  const [ohd, setOhd] = useState('');
  const [gatePlanned, setGatePlanned] = useState('');
  const [counterClose, setCounterClose] = useState('');
  const [boardingClose, setBoardingClose] = useState('');
  const [departed, setDeparted] = useState('');
  const [cabinC, setCabinC] = useState('');

  const [egm, setEgm] = useState('');
  const [offLoadPax, setOffLoadPax] = useState('');
  const [gateFinal, setGateFinal] = useState('');
  const [systemBagCount, setSystemBagCount] = useState('');
  const [beltNo, setBeltNo] = useState('');
  const [transit, setTransit] = useState('');
  const [cabinY, setCabinY] = useState('');

  const [dpr, setDpr] = useState('');
  const [ahl, setAhl] = useState('');
  const [counterOpen, setCounterOpen] = useState('');
  const [boardingOpen, setBoardingOpen] = useState('');
  const [passengerArrived, setPassengerArrived] = useState('');
  const [cabinBreakupF, setCabinBreakupF] = useState('');

  // Wheel chairs
  const [arrivalWheelChairR, setArrivalWheelChairR] = useState('');
  const [arrivalWheelChairS, setArrivalWheelChairS] = useState('');
  const [arrivalWheelChairC, setArrivalWheelChairC] = useState('');
  const [departureWheelChairR, setDepartureWheelChairR] = useState('');
  const [departureWheelChairS, setDepartureWheelChairS] = useState('');
  const [departureWheelChairC, setDepartureWheelChairC] = useState('');
  const { errors, clearField, applyAndFocus } =
    useFieldErrors<TerminalField>(TERMINAL_FIELD_ORDER);

  const setValidated = (key: TerminalField, value: string, setter: (v: string) => void) => {
    setter(sanitizeTerminalInput(key, value));
    clearField(key);
  };

  const setLimited = (field: string, value: string, setter: (v: string) => void) => {
    setter(sanitizeTerminalInput(field, value));
    if ((TERMINAL_FIELD_ORDER as readonly string[]).includes(field)) {
      clearField(field as TerminalField);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || !flight?.slNo) return;

    const next: FieldErrors<TerminalField> = {};
    const limitChecks: Array<[TerminalField, string]> = [
      ['igm', igm],
      ['egm', egm],
      ['dpr', dpr],
      ['ohd', ohd],
      ['offLoadPax', offLoadPax],
      ['ahl', ahl],
      ['gatePlanned', gatePlanned],
      ['gateFinal', gateFinal],
      ['passengerArrived', passengerArrived],
      ['departed', departed],
      ['transit', transit],
      ['systemBagCount', systemBagCount],
      ['beltNo', beltNo],
      ['cabinBreakupF', cabinBreakupF],
      ['cabinC', cabinC],
      ['cabinY', cabinY],
      ['arrivalWheelChairR', arrivalWheelChairR],
      ['arrivalWheelChairS', arrivalWheelChairS],
      ['arrivalWheelChairC', arrivalWheelChairC],
      ['departureWheelChairR', departureWheelChairR],
      ['departureWheelChairS', departureWheelChairS],
      ['departureWheelChairC', departureWheelChairC],
    ];
    for (const [key, value] of limitChecks) {
      const err = validateTerminalInputLimit(key, value);
      if (err) next[key] = err;
    }
    const timeChecks: Array<[TerminalField, string, string]> = [
      ['counterOpen', counterOpen, 'Counter open'],
      ['counterClose', counterClose, 'Counter close'],
      ['boardingOpen', boardingOpen, 'Boarding open'],
      ['boardingClose', boardingClose, 'Boarding close'],
    ];
    for (const [key, value, label] of timeChecks) {
      const err = time24(value, label);
      if (err) next[key] = err;
    }
    if (applyAndFocus(next)) {
      toast.warning('Please fix the highlighted fields.');
      return;
    }

    setIsSaving(true);
    try {
      const body = terminalDetailsFormToSavePayload({
        airlinesOperator: airlinesOperator || displayAirline || '',
        flightNo: (flightNo || displayFlightNo || '').trim(),
        routing,
        operations,
        acType: acType || displayAircraft || '',
        sta: scheduleStaTimeNormalizedDisplay(flight, scheduleFromRaw),
        staDate: scheduleStaDateDisplay(flight, scheduleFromRaw),
        std: scheduleStdTimeNormalizedDisplay(flight, scheduleFromRaw),
        stdDate: scheduleStdDateDisplay(flight, scheduleFromRaw),
        igm,
        egm,
        dpr,
        ohd,
        offLoadPax,
        ahl,
        gatePlanned,
        gateFinal,
        counterOpen,
        counterClose,
        systemBagCount,
        boardingOpen,
        boardingClose,
        beltNo,
        passengerArrived,
        departed,
        transit,
        cabinBreakupF,
        cabinBreakupC: cabinC,
        cabinBreakupY: cabinY,
        arrivalWheelChairR,
        arrivalWheelChairS,
        arrivalWheelChairC,
        departureWheelChairR,
        departureWheelChairS,
        departureWheelChairC,
      });
      const res = await fetch(
        getNsRawFormSavedUrl('terminal-details', nsFormSerialForFlight(flight)),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (res.ok) {
        toast.success('Terminal details saved');
        onFhrLocksMayHaveChanged?.(String(flight.slNo ?? '').trim());
      } else {
        toast.error('Failed to save terminal details');
      }
    } catch {
      toast.error('Failed to save terminal details');
    } finally {
      setIsSaving(false);
    }
  };

  const inputBase =
    'w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all';
  const inputClass = `${inputBase} border-gray-300 bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 hover:border-emerald-400`;
  const inputLockedClass = `${inputBase} border-gray-200 bg-gray-100 text-gray-700 cursor-not-allowed`;
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1.5';

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      {/* Emerald header with title and lock */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-emerald-500 px-3 py-3 text-white shadow-md sm:px-4">
        <div className="flex items-center gap-3">
          {showBackButton && onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-emerald-600 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            <h2 className="text-lg font-semibold">Terminal Details</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsLocked((prev) => !prev)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${
            isLocked
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-emerald-400 hover:bg-emerald-500'
          }`}
          title={isLocked ? 'Click to unlock form' : 'Click to lock form'}
        >
          {isLocked ? (
            <>
              <Lock className="w-5 h-5" />
              <span>Locked</span>
            </>
          ) : (
            <>
              <Unlock className="w-5 h-5" />
              <span>Unlocked</span>
            </>
          )}
        </button>
      </div>

      <form onSubmit={handleSave} className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        {/* Serial No - bold emerald display */}
        <section className="flex items-center gap-4">
          <span className="text-lg font-bold text-emerald-600">
            Serial No: {displayScheduledAirlinesTableSerial(flight)}
          </span>
        </section>

        {/* Top section - flight and aircraft details */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
            <TerminalDetailsField
              label="Airlines/Operator:"
              value={airlinesOperator}
              onChange={setAirlinesOperator}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <TerminalDetailsField
              label="Routing:"
              value={routing}
              onChange={setRouting}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <TerminalDetailsField
              label="A/C Type:"
              value={acType}
              onChange={setAcType}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <TerminalDetailsField
              label="STA Date (schedule):"
              value={scheduleStaDateDisplay(flight, scheduleFromRaw)}
              onChange={() => {}}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <TerminalDetailsField
              label="STD Date (schedule):"
              value={scheduleStdDateDisplay(flight, scheduleFromRaw)}
              onChange={() => {}}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <TerminalDetailsField
              label="Flight No.:"
              value={flightNo}
              onChange={setFlightNo}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <TerminalDetailsField
              label="Operations:"
              value={operations}
              onChange={setOperations}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <div>
              <label className={labelClass}>STA (24h, schedule):</label>
              <TimeSelect24
                value={scheduleStaTimeNormalizedDisplay(
                  flight,
                  scheduleFromRaw,
                )}
                onChange={() => {}}
                disabled
                className="w-full min-h-[42px]"
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>STD (24h, schedule):</label>
              <TimeSelect24
                value={scheduleStdTimeNormalizedDisplay(
                  flight,
                  scheduleFromRaw,
                )}
                onChange={() => {}}
                disabled
                className="w-full min-h-[42px]"
              />
              <FormFieldError />
            </div>
          </div>
        </section>

        {/* Three-column operational details */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4">
              <TerminalDetailsField
                id="field-igm"
                label="IGM:"
                value={igm}
                onChange={(v) => setLimited('igm', v, setIgm)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.igm}
                {...terminalFieldAttrs('igm')}
              />
              <TerminalDetailsField
                id="field-ohd"
                label="OHD:"
                value={ohd}
                onChange={(v) => setLimited('ohd', v, setOhd)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.ohd}
                {...terminalFieldAttrs('ohd')}
              />
              <TerminalDetailsField
                id="field-gatePlanned"
                label="Gate Planned:"
                value={gatePlanned}
                onChange={(v) => setLimited('gatePlanned', v, setGatePlanned)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.gatePlanned}
                {...terminalFieldAttrs('gatePlanned')}
              />
              <div>
                <label className={labelClass}>Counter Close (24h):</label>
                <TimeSelect24
                  hourSelectId="field-counterClose"
                  value={counterClose}
                  onChange={(v) => setValidated('counterClose', v, setCounterClose)}
                  disabled={isLocked}
                  allowEmpty
                  placeholder="—"
                  className={cn(
                    'w-full min-h-[42px]',
                    errors.counterClose && 'border-red-500 ring-2 ring-red-200',
                  )}
                />
                <FormFieldError id="field-counterClose-error" message={errors.counterClose} />
              </div>
              <div>
                <label className={labelClass}>Boarding Close (24h):</label>
                <TimeSelect24
                  hourSelectId="field-boardingClose"
                  value={boardingClose}
                  onChange={(v) => setValidated('boardingClose', v, setBoardingClose)}
                  disabled={isLocked}
                  allowEmpty
                  placeholder="—"
                  className={cn(
                    'w-full min-h-[42px]',
                    errors.boardingClose && 'border-red-500 ring-2 ring-red-200',
                  )}
                />
                <FormFieldError id="field-boardingClose-error" message={errors.boardingClose} />
              </div>
              <TerminalDetailsField
                id="field-departed"
                label="Departed Pax:"
                value={departed}
                onChange={(v) => setValidated('departed', v, setDeparted)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.departed}
                {...terminalFieldAttrs('departed')}
              />
              <TerminalDetailsField
                id="field-cabinC"
                label="[C]:"
                value={cabinC}
                onChange={(v) => setValidated('cabinC', v, setCabinC)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.cabinC}
                {...terminalFieldAttrs('cabinC')}
              />
            </div>
            <div className="space-y-4">
              <TerminalDetailsField
                id="field-egm"
                label="EGM:"
                value={egm}
                onChange={(v) => setLimited('egm', v, setEgm)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.egm}
                {...terminalFieldAttrs('egm')}
              />
              <TerminalDetailsField
                id="field-offLoadPax"
                label="Off load Pax:"
                value={offLoadPax}
                onChange={(v) => setValidated('offLoadPax', v, setOffLoadPax)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.offLoadPax}
                {...terminalFieldAttrs('offLoadPax')}
              />
              <TerminalDetailsField
                id="field-gateFinal"
                label="Gate Final:"
                value={gateFinal}
                onChange={(v) => setLimited('gateFinal', v, setGateFinal)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.gateFinal}
                {...terminalFieldAttrs('gateFinal')}
              />
              <TerminalDetailsField
                id="field-systemBagCount"
                label="System Bag Count:"
                value={systemBagCount}
                onChange={(v) => setValidated('systemBagCount', v, setSystemBagCount)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.systemBagCount}
                {...terminalFieldAttrs('systemBagCount')}
              />
              <TerminalDetailsField
                id="field-beltNo"
                label="Belt No:"
                value={beltNo}
                onChange={(v) => setLimited('beltNo', v, setBeltNo)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.beltNo}
                {...terminalFieldAttrs('beltNo')}
              />
              <TerminalDetailsField
                id="field-transit"
                label="Transit:"
                value={transit}
                onChange={(v) => setValidated('transit', v, setTransit)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.transit}
                {...terminalFieldAttrs('transit')}
              />
              <TerminalDetailsField
                id="field-cabinY"
                label="[Y]:"
                value={cabinY}
                onChange={(v) => setValidated('cabinY', v, setCabinY)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.cabinY}
                {...terminalFieldAttrs('cabinY')}
              />
            </div>
            <div className="space-y-4">
              <TerminalDetailsField
                id="field-dpr"
                label="DPR:"
                value={dpr}
                onChange={(v) => setLimited('dpr', v, setDpr)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.dpr}
                {...terminalFieldAttrs('dpr')}
              />
              <TerminalDetailsField
                id="field-ahl"
                label="AHL:"
                value={ahl}
                onChange={(v) => setLimited('ahl', v, setAhl)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.ahl}
                {...terminalFieldAttrs('ahl')}
              />
              <div>
                <label className={labelClass}>Counter Open (24h):</label>
                <TimeSelect24
                  hourSelectId="field-counterOpen"
                  value={counterOpen}
                  onChange={(v) => setValidated('counterOpen', v, setCounterOpen)}
                  disabled={isLocked}
                  allowEmpty
                  placeholder="—"
                  className={cn(
                    'w-full min-h-[42px]',
                    errors.counterOpen && 'border-red-500 ring-2 ring-red-200',
                  )}
                />
                <FormFieldError id="field-counterOpen-error" message={errors.counterOpen} />
              </div>
              <div>
                <label className={labelClass}>Boarding Open (24h):</label>
                <TimeSelect24
                  hourSelectId="field-boardingOpen"
                  value={boardingOpen}
                  onChange={(v) => setValidated('boardingOpen', v, setBoardingOpen)}
                  disabled={isLocked}
                  allowEmpty
                  placeholder="—"
                  className={cn(
                    'w-full min-h-[42px]',
                    errors.boardingOpen && 'border-red-500 ring-2 ring-red-200',
                  )}
                />
                <FormFieldError id="field-boardingOpen-error" message={errors.boardingOpen} />
              </div>
              <TerminalDetailsField
                id="field-passengerArrived"
                label="Arrived Pax:"
                value={passengerArrived}
                onChange={(v) => setValidated('passengerArrived', v, setPassengerArrived)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.passengerArrived}
                {...terminalFieldAttrs('passengerArrived')}
              />
              <TerminalDetailsField
                id="field-cabinBreakupF"
                label="Cabin Break-up [F]:"
                value={cabinBreakupF}
                onChange={(v) => setValidated('cabinBreakupF', v, setCabinBreakupF)}
                disabled={isLocked}
                labelClassName={labelClass}
                inputClassName={isLocked ? inputLockedClass : inputClass}
                error={errors.cabinBreakupF}
                {...terminalFieldAttrs('cabinBreakupF')}
              />
            </div>
          </div>
        </section>

        {/* Arrival Wheel Chairs */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <h3 className="text-sm font-bold text-emerald-600 mb-4 border-b border-gray-200 pb-2">
            Arrival Wheel Chairs
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TerminalDetailsField
              id="field-arrivalWheelChairR"
              label="Wheel Chair [R]:"
              value={arrivalWheelChairR}
              onChange={(v) => setValidated('arrivalWheelChairR', v, setArrivalWheelChairR)}
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={isLocked ? inputLockedClass : inputClass}
              error={errors.arrivalWheelChairR}
              {...terminalFieldAttrs('arrivalWheelChairR')}
            />
            <TerminalDetailsField
              id="field-arrivalWheelChairS"
              label="[S]:"
              value={arrivalWheelChairS}
              onChange={(v) => setValidated('arrivalWheelChairS', v, setArrivalWheelChairS)}
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={isLocked ? inputLockedClass : inputClass}
              error={errors.arrivalWheelChairS}
              {...terminalFieldAttrs('arrivalWheelChairS')}
            />
            <TerminalDetailsField
              id="field-arrivalWheelChairC"
              label="[C]:"
              value={arrivalWheelChairC}
              onChange={(v) => setValidated('arrivalWheelChairC', v, setArrivalWheelChairC)}
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={isLocked ? inputLockedClass : inputClass}
              error={errors.arrivalWheelChairC}
              {...terminalFieldAttrs('arrivalWheelChairC')}
            />
          </div>
        </section>

        {/* Departure Wheel Chairs */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <h3 className="text-sm font-bold text-emerald-600 mb-4 border-b border-gray-200 pb-2">
            Departure Wheel Chairs
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TerminalDetailsField
              id="field-departureWheelChairR"
              label="Wheel Chair [R]:"
              value={departureWheelChairR}
              onChange={(v) => setValidated('departureWheelChairR', v, setDepartureWheelChairR)}
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={isLocked ? inputLockedClass : inputClass}
              error={errors.departureWheelChairR}
              {...terminalFieldAttrs('departureWheelChairR')}
            />
            <TerminalDetailsField
              id="field-departureWheelChairS"
              label="[S]:"
              value={departureWheelChairS}
              onChange={(v) => setValidated('departureWheelChairS', v, setDepartureWheelChairS)}
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={isLocked ? inputLockedClass : inputClass}
              error={errors.departureWheelChairS}
              {...terminalFieldAttrs('departureWheelChairS')}
            />
            <TerminalDetailsField
              id="field-departureWheelChairC"
              label="[C]:"
              value={departureWheelChairC}
              onChange={(v) => setValidated('departureWheelChairC', v, setDepartureWheelChairC)}
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={isLocked ? inputLockedClass : inputClass}
              error={errors.departureWheelChairC}
              {...terminalFieldAttrs('departureWheelChairC')}
            />
          </div>
        </section>

        {/* Action buttons */}
        <section className="flex flex-wrap items-center gap-3 pt-2">
          {showBackButton && onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 focus:ring-2 focus:ring-emerald-300"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsLocked((prev) => !prev)}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg focus:ring-2 focus:ring-offset-1 ${
              isLocked
                ? 'bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-300'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300 focus:ring-gray-400'
            }`}
          >
            {isLocked ? 'Unlock' : 'Lock'}
          </button>
          <button
            type="submit"
            disabled={isLocked || isSaving}
            className="px-5 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 focus:ring-2 focus:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </section>
      </form>
    </div>
  );
}
