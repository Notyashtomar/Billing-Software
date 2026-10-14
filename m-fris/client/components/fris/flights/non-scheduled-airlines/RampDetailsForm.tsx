'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, Unlock, Save, Truck } from 'lucide-react';
import type { BaseFormProps } from './types';
import { getNsRawFormDefaultUrl, saveNsRawForm, fetchNsRawFormData } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import {
  normalizeRampDetails1Data,
  rampDetails1FormToSavePayload,
} from '@/utils/dataProcessor';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  time24,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  sanitizeRampDigitInput,
  validateRampDigitLimit,
  rampFieldAttrs,
  RAMP_DIGIT_RULES,
} from '@/components/fris/flights/rampDetailsInputLimits';
import {
  FLIGHT_DETAILS_FIELD_GRID_CLASS,
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_H_SCROLL_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';

const fetch = frisFetch;

type RampDetailsFormProps = BaseFormProps;

const RAMP_CARGO_FIELDS = [
  'arrivalNoOfULD',
  'arrivalCargoWeight',
  'arrivalMailWeight',
  'depPlannedNoOfULD',
  'depPlannedCargoWeight',
  'depPlannedMailWeight',
  'depActualNoOfULD',
  'depActualCargoWeight',
  'depActualMailWeight',
  'transitCargoNoOfULD',
] as const;

const RAMP_TIME_FIELDS = [
  'firstBagArrivalHallDate',
  'firstBagArrivalHallTime',
  'lastBagArrivalHallTime',
  'firstBagBMADate',
  'firstBagBMATime',
  'lastBagBMATime',
  'cleaningStartedDate',
  'cleaningStartedTime',
  'cleaningClosedTime',
  'frontOpenDate',
  'frontOpenTime',
  'frontCloseTime',
  'rearOpenDate',
  'rearOpenTime',
  'rearCloseTime',
  'bulkOpenDate',
  'bulkOpenTime',
  'bulkCloseTime',
  'mainDeckOpenDate',
  'mainDeckOpenTime',
  'mainDeckCloseTime',
] as const;

const RAMP_FIELD_ORDER = [
  ...RAMP_CARGO_FIELDS,
  ...RAMP_TIME_FIELDS,
  'baggageDatesBeforeAta',
  'holdDatesBeforeAta',
] as const;
type RampField = (typeof RAMP_FIELD_ORDER)[number];

const RAMP_FIELD_LABELS: Record<RampField, string> = {
  arrivalNoOfULD: 'Arrival ULD',
  arrivalCargoWeight: 'Arrival cargo weight',
  arrivalMailWeight: 'Arrival mail weight',
  depPlannedNoOfULD: 'Dep planned ULD',
  depPlannedCargoWeight: 'Dep planned cargo weight',
  depPlannedMailWeight: 'Dep planned mail weight',
  depActualNoOfULD: 'Dep actual ULD',
  depActualCargoWeight: 'Dep actual cargo weight',
  depActualMailWeight: 'Dep actual mail weight',
  transitCargoNoOfULD: 'Transit ULD',
  firstBagArrivalHallDate: 'First bag in arrival hall date',
  firstBagArrivalHallTime: 'First bag arrival time',
  lastBagArrivalHallTime: 'Last bag arrival time',
  firstBagBMADate: 'First bag in BMA date',
  firstBagBMATime: 'First bag BMA time',
  lastBagBMATime: 'Last bag BMA time',
  cleaningStartedDate: 'Cleaning started date',
  cleaningStartedTime: 'Cleaning started time',
  cleaningClosedTime: 'Cleaning closed time',
  frontOpenDate: 'Hold front open date',
  frontOpenTime: 'Front open time',
  frontCloseTime: 'Front close time',
  rearOpenDate: 'Hold rear open date',
  rearOpenTime: 'Rear open time',
  rearCloseTime: 'Rear close time',
  bulkOpenDate: 'Hold bulk open date',
  bulkOpenTime: 'Bulk open time',
  bulkCloseTime: 'Bulk close time',
  mainDeckOpenDate: 'Hold main deck open date',
  mainDeckOpenTime: 'Main deck open time',
  mainDeckCloseTime: 'Main deck close time',
  baggageDatesBeforeAta: 'Baggage and cleaning dates',
  holdDatesBeforeAta: 'Hold dates',
};

/** Map stored ramp date (dd/mm/yyyy or yyyy-mm-dd) to DatePicker yyyy-MM-dd. */
function rampDateToPickerInput(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parts = s.split(/[/\-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2].length === 4) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}

function parseRampPickerDay(value: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!iso) return null;
  const day = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  if (
    day.getFullYear() !== Number(iso[1]) ||
    day.getMonth() !== Number(iso[2]) - 1 ||
    day.getDate() !== Number(iso[3])
  ) {
    return null;
  }
  return day;
}

function laterRampDay(a: Date | null, b: Date | null): Date | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

const INITIAL_RAMP_FORM = {
  arrivalParkStand: '',
  departureParkStand: '',
  arrivalBaggageCount: '',
  bagreco: '',
  bmaCount: '',
  bbaBelt: '',
  arrivalBag: '',
  xRay: false,
  firstBagArrivalHallDate: '',
  firstBagArrivalHallTime: '',
  lastBagArrivalHallDate: '',
  lastBagArrivalHallTime: '',
  firstBagBMADate: '',
  firstBagBMATime: '',
  lastBagBMADate: '',
  lastBagBMATime: '',
  cleaningStartedDate: '',
  cleaningStartedTime: '',
  cleaningClosedDate: '',
  cleaningClosedTime: '',
  ataDate: '',
  ldc: '',
  ldp: '',
  mdp: '',
  cgoPcsIn: '',
  cgoPcsOut: '',
  courierPcsIn: '',
  courierPcsOut: '',
  frontOpenDate: '',
  frontOpenTime: '',
  frontCloseDate: '',
  frontCloseTime: '',
  rearOpenDate: '',
  rearOpenTime: '',
  rearCloseDate: '',
  rearCloseTime: '',
  bulkOpenDate: '',
  bulkOpenTime: '',
  bulkCloseDate: '',
  bulkCloseTime: '',
  mainDeckOpenDate: '',
  mainDeckOpenTime: '',
  mainDeckCloseDate: '',
  mainDeckCloseTime: '',
  arrivalNoOfULD: '',
  arrivalCargoWeight: '',
  arrivalMailWeight: '',
  depPlannedNoOfULD: '',
  depPlannedCargoWeight: '',
  depPlannedMailWeight: '',
  depActualNoOfULD: '',
  depActualCargoWeight: '',
  depActualMailWeight: '',
  transitCargoNoOfULD: '',
};

export default function RampDetailsForm({
  flight,
  onSave,
}: RampDetailsFormProps) {
  const [isLocked, setIsLocked] = useState(true);

  const [formData, setFormData] = useState(INITIAL_RAMP_FORM);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const { errors, clearField, applyAndFocus } = useFieldErrors<RampField>(RAMP_FIELD_ORDER);

  useEffect(() => {
    const serial = flight?.sNo != null ? String(flight.sNo) : null;
    if (!serial) {
      // Reset stale values when the selected flight is cleared.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData(INITIAL_RAMP_FORM);
      return;
    }
    const serialNo = serial;
    let cancelled = false;
    async function load() {
      try {
        // GET .../ns-raw-flight-data/ramp-details/:serialNo — load saved data from DB
        const doc = await fetchNsRawFormData('ramp-details', serialNo);
        if (cancelled) return;
        const data = normalizeRampDetails1Data(doc);
        if (data) {
          setFormData({
            ...INITIAL_RAMP_FORM,
            arrivalParkStand: data.bayPlanned ?? '',
            departureParkStand: data.bayFinal ?? '',
            arrivalBaggageCount: data.arrivalBaggageCount ?? '',
            bagreco: data.bagreco ?? '',
            bmaCount: data.bmaCount ?? '',
            bbaBelt: data.bbaBelt ?? '',
            arrivalBag: data.arrivalBag ?? '',
            xRay: data.xRay ?? false,
            firstBagArrivalHallDate: rampDateToPickerInput(
              data.firstBagArrivalHallDate ?? data.Fbarr,
            ),
            firstBagArrivalHallTime: data.firstBagArrivalHallTime ?? '',
            lastBagArrivalHallDate: rampDateToPickerInput(
              data.lastBagArrivalHallDate ?? data.Lbarr,
            ),
            lastBagArrivalHallTime: data.lastBagArrivalHallTime ?? '',
            firstBagBMADate: rampDateToPickerInput(data.firstBagInBmaDate),
            firstBagBMATime: data.firstBagInBmaTime ?? '',
            lastBagBMADate: rampDateToPickerInput(data.lastBagInBmaDate),
            lastBagBMATime: data.lastBagInBmaTime ?? '',
            cleaningStartedDate: rampDateToPickerInput(data.cleaningStartedDate),
            cleaningStartedTime: data.cleaningStartedTime ?? '',
            cleaningClosedDate: rampDateToPickerInput(data.cleaningClosedDate),
            cleaningClosedTime: data.cleaningClosedTime ?? '',
            ataDate:
              rampDateToPickerInput(data.ataDate) ||
              rampDateToPickerInput(flight?.staDate),
            ldc: data.ldc ?? '',
            ldp: data.ldp ?? '',
            mdp: data.mdp ?? '',
            cgoPcsIn: data.cgoPcsIn ?? '',
            cgoPcsOut: data.cgoPcsOut ?? '',
            courierPcsIn: data.courierPcsIn ?? '',
            courierPcsOut: data.courierPcsOut ?? '',
            frontOpenDate: rampDateToPickerInput(data.holdOpenFrontDate),
            frontOpenTime: data.holdOpenFrontTime ?? '',
            frontCloseDate: rampDateToPickerInput(data.holdCloseFrontDate),
            frontCloseTime: data.holdCloseFrontTime ?? '',
            rearOpenDate: rampDateToPickerInput(data.holdOpenRearDate),
            rearOpenTime: data.holdOpenRearTime ?? '',
            rearCloseDate: rampDateToPickerInput(data.holdCloseRearDate),
            rearCloseTime: data.holdCloseRearTime ?? '',
            bulkOpenDate: rampDateToPickerInput(data.holdOpenBulkDate),
            bulkOpenTime: data.holdOpenBulkTime ?? '',
            bulkCloseDate: rampDateToPickerInput(data.holdCloseBulkDate),
            bulkCloseTime: data.holdCloseBulkTime ?? '',
            mainDeckOpenDate: rampDateToPickerInput(data.holdOpenMainDeckDate),
            mainDeckOpenTime: data.holdOpenMainDeckTime ?? '',
            mainDeckCloseDate: rampDateToPickerInput(data.holdCloseMainDeckDate),
            mainDeckCloseTime: data.holdCloseMainDeckTime ?? '',
            arrivalNoOfULD: data.arrivalUldCount ?? '',
            arrivalCargoWeight: data.arrivalCargoWeight ?? '',
            arrivalMailWeight: data.arrivalMailWeight ?? '',
            depPlannedNoOfULD: data.depPlannedUldCount ?? '',
            depPlannedCargoWeight: data.depPlannedCargoWeight ?? '',
            depPlannedMailWeight: data.depPlannedMailWeight ?? '',
            depActualNoOfULD: data.depActualUldCount ?? '',
            depActualCargoWeight: data.depActualCargoWeight ?? '',
            depActualMailWeight: data.depActualMailWeight ?? '',
            transitCargoNoOfULD: data.transitCargoUld ?? '',
          });
          return;
        }
        await fetch(getNsRawFormDefaultUrl('ramp-details', serialNo), { method: 'GET' });
      } catch {
        if (!cancelled) setFormData(INITIAL_RAMP_FORM);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [flight?.sNo]);

  const handleInputChange = (field: string, value: string | boolean) => {
    if (isLocked) return;
    const nextValue =
      typeof value === 'string' && field in RAMP_DIGIT_RULES
        ? sanitizeRampDigitInput(field, value)
        : value;
    setFormData((prev) => ({ ...prev, [field]: nextValue }));
    if ((RAMP_FIELD_ORDER as readonly string[]).includes(field)) {
      clearField(field as RampField);
    }
    if (field === 'lastBagArrivalHallDate' || field === 'firstBagArrivalHallDate') {
      clearField('firstBagArrivalHallDate');
    }
    if (field === 'lastBagBMADate' || field === 'firstBagBMADate') {
      clearField('firstBagBMADate');
    }
    if (field === 'cleaningClosedDate' || field === 'cleaningStartedDate') {
      clearField('cleaningStartedDate');
    }
    if (field === 'frontCloseDate' || field === 'frontOpenDate') {
      clearField('frontOpenDate');
    }
    if (field === 'rearCloseDate' || field === 'rearOpenDate') {
      clearField('rearOpenDate');
    }
    if (field === 'bulkCloseDate' || field === 'bulkOpenDate') {
      clearField('bulkOpenDate');
    }
    if (field === 'mainDeckCloseDate' || field === 'mainDeckOpenDate') {
      clearField('mainDeckOpenDate');
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

    const next: FieldErrors<RampField> = {};
    for (const key of RAMP_CARGO_FIELDS) {
      const err = validateRampDigitLimit(
        key,
        String(formData[key] ?? ''),
        RAMP_FIELD_LABELS[key],
      );
      if (err) next[key] = err;
    }
    for (const key of RAMP_TIME_FIELDS) {
      if (key === 'firstBagArrivalHallDate' || key === 'firstBagBMADate' || key === 'cleaningStartedDate' || key === 'frontOpenDate' || key === 'rearOpenDate' || key === 'bulkOpenDate' || key === 'mainDeckOpenDate') continue;
      const err = time24(String(formData[key] ?? ''), RAMP_FIELD_LABELS[key]);
      if (err) next[key] = err;
    }
    const firstBagDay = parseRampPickerDay(String(formData.firstBagArrivalHallDate ?? ''));
    const lastBagDay = parseRampPickerDay(String(formData.lastBagArrivalHallDate ?? ''));
    if (firstBagDay && lastBagDay && firstBagDay.getTime() > lastBagDay.getTime()) {
      next.firstBagArrivalHallDate = 'First bag in arrival hall cannot be later than the last bag date.';
    }
    const firstBmaDay = parseRampPickerDay(String(formData.firstBagBMADate ?? ''));
    const lastBmaDay = parseRampPickerDay(String(formData.lastBagBMADate ?? ''));
    if (firstBmaDay && lastBmaDay && firstBmaDay.getTime() > lastBmaDay.getTime()) {
      next.firstBagBMADate = 'First bag in BMA cannot be later than the last bag in BMA date.';
    }
    const cleaningStartedDay = parseRampPickerDay(String(formData.cleaningStartedDate ?? ''));
    const cleaningClosedDay = parseRampPickerDay(String(formData.cleaningClosedDate ?? ''));
    if (cleaningStartedDay && cleaningClosedDay && cleaningStartedDay.getTime() > cleaningClosedDay.getTime()) {
      next.cleaningStartedDate = 'Cleaning started date cannot be later than the cleaning closed date.';
    }
    const frontOpenDay = parseRampPickerDay(String(formData.frontOpenDate ?? ''));
    const frontCloseDay = parseRampPickerDay(String(formData.frontCloseDate ?? ''));
    if (frontOpenDay && frontCloseDay && frontOpenDay.getTime() > frontCloseDay.getTime()) {
      next.frontOpenDate = 'Hold front open date cannot be later than the hold front close date.';
    }
    const rearOpenDay = parseRampPickerDay(String(formData.rearOpenDate ?? ''));
    const rearCloseDay = parseRampPickerDay(String(formData.rearCloseDate ?? ''));
    if (rearOpenDay && rearCloseDay && rearOpenDay.getTime() > rearCloseDay.getTime()) {
      next.rearOpenDate = 'Hold rear open date cannot be later than the hold rear close date.';
    }
    const bulkOpenDay = parseRampPickerDay(String(formData.bulkOpenDate ?? ''));
    const bulkCloseDay = parseRampPickerDay(String(formData.bulkCloseDate ?? ''));
    if (bulkOpenDay && bulkCloseDay && bulkOpenDay.getTime() > bulkCloseDay.getTime()) {
      next.bulkOpenDate = 'Hold bulk open date cannot be later than the hold bulk close date.';
    }
    const mainDeckOpenDay = parseRampPickerDay(String(formData.mainDeckOpenDate ?? ''));
    const mainDeckCloseDay = parseRampPickerDay(String(formData.mainDeckCloseDate ?? ''));
    if (mainDeckOpenDay && mainDeckCloseDay && mainDeckOpenDay.getTime() > mainDeckCloseDay.getTime()) {
      next.mainDeckOpenDate = 'Hold main deck open date cannot be later than the hold main deck close date.';
    }
    const ataDay = parseRampPickerDay(String(formData.ataDate ?? ''));
    const beforeAta = (value: unknown) => {
      const day = parseRampPickerDay(String(value ?? ''));
      return ataDay != null && day != null && day.getTime() < ataDay.getTime();
    };
    if (
      [
        formData.firstBagArrivalHallDate,
        formData.lastBagArrivalHallDate,
        formData.firstBagBMADate,
        formData.lastBagBMADate,
        formData.cleaningStartedDate,
        formData.cleaningClosedDate,
      ].some(beforeAta)
    ) {
      next.baggageDatesBeforeAta = 'Baggage and cleaning dates cannot be before the ATA date.';
    }
    if (
      [
        formData.frontOpenDate,
        formData.frontCloseDate,
        formData.rearOpenDate,
        formData.rearCloseDate,
        formData.bulkOpenDate,
        formData.bulkCloseDate,
        formData.mainDeckOpenDate,
        formData.mainDeckCloseDate,
      ].some(beforeAta)
    ) {
      next.holdDatesBeforeAta = 'Hold dates cannot be before the ATA date.';
    }
    if (applyAndFocus(next)) {
      toast.warning('Please fix the highlighted fields.');
      return;
    }

    setSaveStatus('saving');
    setSaveError(null);
    try {
      await saveNsRawForm(
        'ramp-details',
        serial,
        rampDetails1FormToSavePayload({
          airlinesOperator: flight.airline || '',
          flightNo: flight.flightNo || '',
          routing: flight.routing || '',
          operations: flight.ops || '',
          etdDate: flight.stdDate || '',
          acType: flight.aircraft || '',
          staDate: flight.staDate || '',
          std: flight.stdTime || '',
          etd: flight.stdTime || '',
          sta: flight.staTime || '',
          ata: flight.staTime || '',
          stdDate: flight.stdDate || '',
          ataDate: formData.ataDate || flight.staDate || '',
          bayPlanned: formData.arrivalParkStand,
          bayFinal: formData.departureParkStand,
          arrivalBaggageCount: formData.arrivalBaggageCount,
          arrivalBag: formData.arrivalBag,
          bagreco: formData.bagreco,
          Fbarr: formData.firstBagArrivalHallDate,
          firstBagArrivalHallTime: formData.firstBagArrivalHallTime,
          firstBagArrivalHallDate: '',
          Lbarr: formData.lastBagArrivalHallDate,
          lastBagArrivalHallTime: formData.lastBagArrivalHallTime,
          lastBagArrivalHallDate: '',
          bmaCount: formData.bmaCount,
          bbaBelt: formData.bbaBelt,
          firstBagInBmaDate: formData.firstBagBMADate,
          firstBagInBmaTime: formData.firstBagBMATime,
          lastBagInBmaDate: formData.lastBagBMADate,
          lastBagInBmaTime: formData.lastBagBMATime,
          xRay: formData.xRay,
          cleaningStartedDate: formData.cleaningStartedDate,
          cleaningStartedTime: formData.cleaningStartedTime,
          cleaningClosedDate: formData.cleaningClosedDate,
          cleaningClosedTime: formData.cleaningClosedTime,
          ldc: formData.ldc,
          ldp: formData.ldp,
          mdp: formData.mdp,
          cgoPcsIn: formData.cgoPcsIn,
          cgoPcsOut: formData.cgoPcsOut,
          courierPcsIn: formData.courierPcsIn,
          courierPcsOut: formData.courierPcsOut,
          holdOpenFrontDate: formData.frontOpenDate,
          holdOpenFrontTime: formData.frontOpenTime,
          holdCloseFrontDate: formData.frontCloseDate,
          holdCloseFrontTime: formData.frontCloseTime,
          holdOpenRearDate: formData.rearOpenDate,
          holdOpenRearTime: formData.rearOpenTime,
          holdCloseRearDate: formData.rearCloseDate,
          holdCloseRearTime: formData.rearCloseTime,
          holdOpenBulkDate: formData.bulkOpenDate,
          holdOpenBulkTime: formData.bulkOpenTime,
          holdCloseBulkDate: formData.bulkCloseDate,
          holdCloseBulkTime: formData.bulkCloseTime,
          holdOpenMainDeckDate: formData.mainDeckOpenDate,
          holdOpenMainDeckTime: formData.mainDeckOpenTime,
          holdCloseMainDeckDate: formData.mainDeckCloseDate,
          holdCloseMainDeckTime: formData.mainDeckCloseTime,
          arrivalNoOfULD: formData.arrivalNoOfULD,
          arrivalCargoWeight: formData.arrivalCargoWeight,
          arrivalMailWeight: formData.arrivalMailWeight,
          depPlannedNoOfULD: formData.depPlannedNoOfULD,
          depPlannedCargoWeight: formData.depPlannedCargoWeight,
          depPlannedMailWeight: formData.depPlannedMailWeight,
          depActualNoOfULD: formData.depActualNoOfULD,
          depActualCargoWeight: formData.depActualCargoWeight,
          depActualMailWeight: formData.depActualMailWeight,
          transitCargoNoOfULD: formData.transitCargoNoOfULD,
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

  const inputClassName = `min-h-11 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition ${
    isLocked
      ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500'
      : 'border-gray-300 bg-white hover:border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30'
  }`;
  const readOnlyInputClassName =
    'min-h-11 w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-3 py-2.5 text-sm text-gray-600';
  const labelClassName = 'mb-1.5 block text-xs font-medium text-gray-600';
  const titleClassName =
    'mb-4 border-b border-gray-200 pb-2 text-sm font-bold text-emerald-700';
  const timeClassName = 'w-full min-h-11';

  const textField = (
    field: keyof typeof INITIAL_RAMP_FORM,
    label: string,
  ) => {
    const isCargo = (RAMP_CARGO_FIELDS as readonly string[]).includes(field);
    const key = field as RampField;
    const attrs = rampFieldAttrs(String(field));
    return (
      <div key={field}>
        <label htmlFor={`ramp-${field}`} className={labelClassName}>
          {label}
        </label>
        <input
          id={`ramp-${field}`}
          type="text"
          value={String(formData[field])}
          onChange={(e) => handleInputChange(field, e.target.value)}
          disabled={isLocked}
          maxLength={attrs.maxLength}
          inputMode={attrs.inputMode}
          autoComplete="off"
          aria-invalid={isCargo && !!errors[key]}
          className={cn(inputClassName, isCargo && errors[key] && FRIS_INVALID_CONTROL)}
        />
        <FormFieldError message={isCargo ? errors[key] : undefined} />
      </div>
    );
  };

  const timingField = (
    label: string,
    dateField: keyof typeof INITIAL_RAMP_FORM,
    timeField: keyof typeof INITIAL_RAMP_FORM,
  ) => {
    const firstBagDay = parseRampPickerDay(String(formData.firstBagArrivalHallDate ?? ''));
    const lastBagDay = parseRampPickerDay(String(formData.lastBagArrivalHallDate ?? ''));
    const firstBmaDay = parseRampPickerDay(String(formData.firstBagBMADate ?? ''));
    const lastBmaDay = parseRampPickerDay(String(formData.lastBagBMADate ?? ''));
    const cleaningStartedDay = parseRampPickerDay(String(formData.cleaningStartedDate ?? ''));
    const cleaningClosedDay = parseRampPickerDay(String(formData.cleaningClosedDate ?? ''));
    const ataDay = parseRampPickerDay(String(formData.ataDate ?? ''));
    const minDate = laterRampDay(
      ataDay,
      dateField === 'lastBagArrivalHallDate'
        ? firstBagDay
        : dateField === 'lastBagBMADate'
          ? firstBmaDay
          : dateField === 'cleaningClosedDate'
            ? cleaningStartedDay
            : null,
    );
    const maxDate =
      dateField === 'firstBagArrivalHallDate'
        ? lastBagDay ?? undefined
        : dateField === 'firstBagBMADate'
          ? lastBmaDay ?? undefined
          : dateField === 'cleaningStartedDate'
            ? cleaningClosedDay ?? undefined
            : undefined;
    const dateError =
      dateField === 'firstBagArrivalHallDate'
        ? errors.firstBagArrivalHallDate
        : dateField === 'firstBagBMADate'
          ? errors.firstBagBMADate
          : dateField === 'cleaningStartedDate'
            ? errors.cleaningStartedDate
            : undefined;
    const dateFieldId =
      dateField === 'firstBagArrivalHallDate' ||
      dateField === 'firstBagBMADate' ||
      dateField === 'cleaningStartedDate'
        ? `field-${dateField}`
        : undefined;
    return (
    <>
      <div>
        <label className={labelClassName} htmlFor={dateFieldId}>
          {label} (Date)
        </label>
        <DatePicker
          id={dateFieldId}
          ariaLabel={`${label} date`}
          value={String(formData[dateField])}
          onChange={(value) => handleInputChange(dateField, value)}
          valueFormat="yyyy-MM-dd"
          disabled={isLocked}
          minDate={minDate}
          maxDate={maxDate}
        />
        <FormFieldError
          id={dateFieldId ? `${dateFieldId}-error` : undefined}
          message={dateError}
        />
      </div>
      <div>
        <label className={labelClassName}>{label} (Time 24h)</label>
        <TimeSelect24
          value={String(formData[timeField] ?? '')}
          onChange={(value) => handleInputChange(timeField, value)}
          disabled={isLocked}
          className={timeClassName}
        />
        <FormFieldError message={errors[timeField as RampField]} />
      </div>
    </>
    );
  };

  const cargoRows = [
    {
      label: 'Arrival',
      fields: [
        ['arrivalNoOfULD', 'No. of ULD'],
        ['arrivalCargoWeight', 'Cargo Weight'],
        ['arrivalMailWeight', 'Mail Weight'],
      ],
    },
    {
      label: 'Dep. Planned',
      fields: [
        ['depPlannedNoOfULD', 'No. of ULD'],
        ['depPlannedCargoWeight', 'Cargo Weight'],
        ['depPlannedMailWeight', 'Mail Weight'],
      ],
    },
    {
      label: 'Dep. Actual',
      fields: [
        ['depActualNoOfULD', 'No. of ULD'],
        ['depActualCargoWeight', 'Cargo Weight'],
        ['depActualMailWeight', 'Mail Weight'],
      ],
    },
  ] as const;

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 bg-emerald-500 px-3 py-3 text-white shadow-md sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Truck className="h-6 w-6 shrink-0" aria-hidden="true" />
          <h2 className="text-base font-semibold sm:text-lg">Ramp Details</h2>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={handleLockToggle}
          aria-pressed={!isLocked}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          title={isLocked ? 'Unlock form' : 'Lock form'}
        >
          {isLocked ? (
            <Lock className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Unlock className="h-5 w-5" aria-hidden="true" />
          )}
          {isLocked ? 'Locked' : 'Unlocked'}
        </motion.button>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
        className={FLIGHT_DETAILS_FORM_BODY_CLASS}
      >
        <div className="w-full min-w-0 space-y-6">
          <p className="text-lg font-bold text-emerald-700">
            Serial No.: {flight?.sNo || '—'}
          </p>

          <section className={FLIGHT_DETAILS_SECTION_CLASS} aria-labelledby="ramp-flight-heading">
            <h3 id="ramp-flight-heading" className={titleClassName}>Flight Information</h3>
            <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
              {[
                ['Airlines/Operator', flight?.airline],
                ['Flight No.', flight?.flightNo],
                ['Routing', flight?.routing],
                ['Operations', flight?.ops],
                ['ETD Date', flight?.stdDate],
                ['A/C Type', flight?.aircraft],
                ['STA / ATA', flight?.staTime],
                ['STA Date', flight?.staDate],
                ['STD / ETD', flight?.stdTime],
                ['STD Date', flight?.stdDate],
              ].map(([label, value]) => (
                <div key={label}>
                  <label className={labelClassName}>{label}</label>
                  <input type="text" value={value || ''} readOnly className={readOnlyInputClassName} />
                  <FormFieldError />
                </div>
              ))}
              <div>
                <label className={labelClassName} htmlFor="field-ataDate">ATA Date</label>
                <DatePicker
                  id="field-ataDate"
                  ariaLabel="ATA date"
                  value={formData.ataDate}
                  onChange={(value) => handleInputChange('ataDate', value)}
                  valueFormat="yyyy-MM-dd"
                  disabled={isLocked}
                />
                <FormFieldError />
              </div>
            </div>
          </section>

          <section className={FLIGHT_DETAILS_SECTION_CLASS} aria-labelledby="ramp-stand-baggage-heading">
            <h3 id="ramp-stand-baggage-heading" className={titleClassName}>Park Stands & Baggage</h3>
            <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
              {textField('arrivalParkStand', 'Arrival Park Stand')}
              {textField('departureParkStand', 'Departure Park Stand')}
              {textField('arrivalBaggageCount', 'Departure bags')}
              {textField('bagreco', 'Bag reco')}
              {textField('bmaCount', 'BMA Count')}
              {textField('bbaBelt', 'BBA Belt')}
              {textField('arrivalBag', 'Arrival Bag')}
            </div>
            <label className="mt-4 flex min-h-11 w-fit items-center gap-3 rounded-lg px-1 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.xRay}
                onChange={(e) => handleInputChange('xRay', e.target.checked)}
                disabled={isLocked}
                className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              X Ray
            </label>
          </section>

          <section className={FLIGHT_DETAILS_SECTION_CLASS} aria-labelledby="ramp-timings-heading">
            <h3 id="ramp-timings-heading" className={titleClassName}>Baggage Timings & Cleaning</h3>
            <FormFieldError id="field-baggageDatesBeforeAta-error" message={errors.baggageDatesBeforeAta} />
            <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
              {timingField('First Bag in Arrival Hall', 'firstBagArrivalHallDate', 'firstBagArrivalHallTime')}
              {timingField('Last Bag in Arrival Hall', 'lastBagArrivalHallDate', 'lastBagArrivalHallTime')}
              {timingField('First Bag in BMA', 'firstBagBMADate', 'firstBagBMATime')}
              {timingField('Last Bag in BMA', 'lastBagBMADate', 'lastBagBMATime')}
              {timingField('Cleaning Started', 'cleaningStartedDate', 'cleaningStartedTime')}
              {timingField('Cleaning Closed', 'cleaningClosedDate', 'cleaningClosedTime')}
            </div>
          </section>

          <section className={FLIGHT_DETAILS_SECTION_CLASS} aria-labelledby="ramp-breakup-heading">
            <h3 id="ramp-breakup-heading" className={titleClassName}>Hold Breakup</h3>
            <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
              {textField('ldc', 'LDC')}
              {textField('ldp', 'LDP')}
              {textField('mdp', 'MDP')}
            </div>
          </section>

          <section className={FLIGHT_DETAILS_SECTION_CLASS} aria-labelledby="ramp-compartment-heading">
            <h3 id="ramp-compartment-heading" className={titleClassName}>Compartment Five</h3>
            <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
              {textField('cgoPcsIn', 'Cgo Pcs in')}
              {textField('cgoPcsOut', 'Cgo Pcs Out')}
              {textField('courierPcsIn', 'Courier Pcs in')}
              {textField('courierPcsOut', 'Courier Pcs out')}
            </div>
          </section>

          <section className={FLIGHT_DETAILS_SECTION_CLASS} aria-labelledby="ramp-hold-heading">
            <h3 id="ramp-hold-heading" className={titleClassName}>Hold Open & Close</h3>
            <FormFieldError id="field-holdDatesBeforeAta-error" message={errors.holdDatesBeforeAta} />
            <p id="ramp-hold-help" className="mb-3 text-xs text-gray-500 sm:hidden">
              Swipe horizontally to view all hold positions.
            </p>
            <div
              className={`${FLIGHT_DETAILS_H_SCROLL_CLASS} rounded-lg border border-gray-200`}
              role="region"
              aria-label="Hold open and close dates and times"
              aria-describedby="ramp-hold-help"
              tabIndex={0}
            >
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th scope="col" className="w-20 p-2 text-left font-medium text-gray-700">Action</th>
                    {['Front', 'Rear', 'Bulk', 'Main Deck'].map((position) => (
                      <th key={position} scope="col" className="p-2 text-left font-medium text-gray-700">{position}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['Open', 'frontOpenDate', 'frontOpenTime', 'rearOpenDate', 'rearOpenTime', 'bulkOpenDate', 'bulkOpenTime', 'mainDeckOpenDate', 'mainDeckOpenTime'],
                    ['Close', 'frontCloseDate', 'frontCloseTime', 'rearCloseDate', 'rearCloseTime', 'bulkCloseDate', 'bulkCloseTime', 'mainDeckCloseDate', 'mainDeckCloseTime'],
                  ] as const).map(([action, ...fields]) => (
                    <tr key={action} className="border-t border-gray-200">
                      <th scope="row" className="p-2 text-left font-medium text-gray-700">{action}</th>
                      {[0, 2, 4, 6].map((index) => {
                        const dateKey = fields[index];
                        const ataDay = parseRampPickerDay(String(formData.ataDate ?? ''));
                        const frontOpenDay = parseRampPickerDay(String(formData.frontOpenDate ?? ''));
                        const frontCloseDay = parseRampPickerDay(String(formData.frontCloseDate ?? ''));
                        const rearOpenDay = parseRampPickerDay(String(formData.rearOpenDate ?? ''));
                        const rearCloseDay = parseRampPickerDay(String(formData.rearCloseDate ?? ''));
                        const bulkOpenDay = parseRampPickerDay(String(formData.bulkOpenDate ?? ''));
                        const bulkCloseDay = parseRampPickerDay(String(formData.bulkCloseDate ?? ''));
                        const mainDeckOpenDay = parseRampPickerDay(String(formData.mainDeckOpenDate ?? ''));
                        const mainDeckCloseDay = parseRampPickerDay(String(formData.mainDeckCloseDate ?? ''));
                        const minDate =
                          dateKey === 'frontCloseDate'
                            ? laterRampDay(ataDay, frontOpenDay)
                            : dateKey === 'rearCloseDate'
                              ? laterRampDay(ataDay, rearOpenDay)
                              : dateKey === 'bulkCloseDate'
                                ? laterRampDay(ataDay, bulkOpenDay)
                                : dateKey === 'mainDeckCloseDate'
                                  ? laterRampDay(ataDay, mainDeckOpenDay)
                                  : ataDay ?? undefined;
                        const maxDate =
                          dateKey === 'frontOpenDate'
                            ? frontCloseDay ?? undefined
                            : dateKey === 'rearOpenDate'
                              ? rearCloseDay ?? undefined
                              : dateKey === 'bulkOpenDate'
                                ? bulkCloseDay ?? undefined
                                : dateKey === 'mainDeckOpenDate'
                                  ? mainDeckCloseDay ?? undefined
                                  : undefined;
                        const openErrorId =
                          dateKey === 'frontOpenDate' ||
                          dateKey === 'rearOpenDate' ||
                          dateKey === 'bulkOpenDate' ||
                          dateKey === 'mainDeckOpenDate'
                            ? `field-${dateKey}`
                            : undefined;
                        return (
                        <td key={dateKey} className="p-2">
                          <div className="grid min-w-[11rem] gap-2">
                            <DatePicker
                              id={openErrorId}
                              ariaLabel={
                                dateKey === 'frontOpenDate'
                                  ? 'Hold front open date'
                                  : dateKey === 'frontCloseDate'
                                    ? 'Hold front close date'
                                    : dateKey === 'rearOpenDate'
                                      ? 'Hold rear open date'
                                      : dateKey === 'rearCloseDate'
                                        ? 'Hold rear close date'
                                        : dateKey === 'bulkOpenDate'
                                          ? 'Hold bulk open date'
                                          : dateKey === 'bulkCloseDate'
                                            ? 'Hold bulk close date'
                                            : dateKey === 'mainDeckOpenDate'
                                              ? 'Hold main deck open date'
                                              : dateKey === 'mainDeckCloseDate'
                                                ? 'Hold main deck close date'
                                                : undefined
                              }
                              value={String(formData[dateKey])}
                              onChange={(value) => handleInputChange(dateKey, value)}
                              valueFormat="yyyy-MM-dd"
                              disabled={isLocked}
                              minDate={minDate}
                              maxDate={maxDate}
                            />
                            {openErrorId ? (
                              <FormFieldError
                                id={`${openErrorId}-error`}
                                message={
                                  dateKey === 'frontOpenDate'
                                    ? errors.frontOpenDate
                                    : dateKey === 'rearOpenDate'
                                      ? errors.rearOpenDate
                                      : dateKey === 'bulkOpenDate'
                                        ? errors.bulkOpenDate
                                        : errors.mainDeckOpenDate
                                }
                              />
                            ) : null}
                            <TimeSelect24
                              value={String(formData[fields[index + 1]] ?? '')}
                              onChange={(value) => handleInputChange(fields[index + 1], value)}
                              disabled={isLocked}
                              className={timeClassName}
                            />
                          </div>
                        </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={FLIGHT_DETAILS_SECTION_CLASS} aria-labelledby="ramp-cargo-heading">
            <h3 id="ramp-cargo-heading" className={titleClassName}>Cargo Details</h3>
            <div className="space-y-4 md:hidden">
              {cargoRows.map((row) => (
                <fieldset key={row.label} className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
                  <legend className="px-1 text-sm font-semibold text-gray-800">{row.label}</legend>
                  <div className={`mt-2 ${FLIGHT_DETAILS_FIELD_GRID_CLASS}`}>
                    {row.fields.map(([field, label]) => textField(field, label))}
                  </div>
                </fieldset>
              ))}
              <fieldset className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
                <legend className="px-1 text-sm font-semibold text-gray-800">Transit Cargo</legend>
                <div className="mt-2">{textField('transitCargoNoOfULD', 'No. of ULD')}</div>
              </fieldset>
            </div>
            <div
              className={`${FLIGHT_DETAILS_H_SCROLL_CLASS} hidden rounded-lg border border-gray-200 md:block`}
              role="region"
              aria-label="Cargo details table"
              tabIndex={0}
            >
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th scope="col" className="w-36 p-2.5 text-left font-medium text-gray-700">Movement</th>
                    <th scope="col" className="p-2.5 text-left font-medium text-gray-700">No. of ULD</th>
                    <th scope="col" className="p-2.5 text-left font-medium text-gray-700">Cargo Weight</th>
                    <th scope="col" className="p-2.5 text-left font-medium text-gray-700">Mail Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {cargoRows.map((row) => (
                    <tr key={row.label} className="border-t border-gray-200">
                      <th scope="row" className="p-2 text-left font-medium text-gray-700">{row.label}</th>
                      {row.fields.map(([field]) => {
                        const key = field as RampField;
                        return (
                          <td key={field} className="p-2">
                            <label htmlFor={`field-${field}`} className="sr-only">
                              {row.label} {row.fields.find(([candidate]) => candidate === field)?.[1]}
                            </label>
                            <input
                              id={`field-${field}`}
                              type="text"
                              value={String(formData[field])}
                              onChange={(e) => handleInputChange(field, e.target.value)}
                              disabled={isLocked}
                              maxLength={rampFieldAttrs(field).maxLength}
                              inputMode={rampFieldAttrs(field).inputMode}
                              autoComplete="off"
                              aria-invalid={!!errors[key]}
                              className={cn(inputClassName, errors[key] && FRIS_INVALID_CONTROL)}
                            />
                            <FormFieldError message={errors[key]} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200">
                    <th scope="row" className="p-2 text-left font-medium text-gray-700">Transit Cargo</th>
                    <td colSpan={3} className="p-2">
                      <div className="max-w-xs">
                        <label htmlFor="field-transitCargoNoOfULD" className="sr-only">Transit Cargo No. of ULD</label>
                        <input
                          id="field-transitCargoNoOfULD"
                          type="text"
                          value={formData.transitCargoNoOfULD}
                          onChange={(e) => handleInputChange('transitCargoNoOfULD', e.target.value)}
                          disabled={isLocked}
                          maxLength={2}
                          inputMode="numeric"
                          autoComplete="off"
                          aria-invalid={!!errors.transitCargoNoOfULD}
                          className={cn(
                            inputClassName,
                            errors.transitCargoNoOfULD && FRIS_INVALID_CONTROL,
                          )}
                        />
                        <FormFieldError message={errors.transitCargoNoOfULD} />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-3 pb-1" aria-label="Ramp form actions">
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={handleLockToggle}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            >
              {isLocked ? <Unlock className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
              {isLocked ? 'Unlock' : 'Lock'}
            </motion.button>
            <motion.button
              type="submit"
              whileTap={{ scale: 0.98 }}
              disabled={isLocked || saveStatus === 'saving'}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saveStatus === 'saving' ? 'Saving…' : 'Save'}
            </motion.button>
            <div aria-live="polite" role="status" className="min-h-5 text-sm">
              {saveStatus === 'success' && <span className="font-medium text-emerald-700">Saved.</span>}
              {saveStatus === 'error' && saveError && <span className="text-red-700">{saveError}</span>}
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
