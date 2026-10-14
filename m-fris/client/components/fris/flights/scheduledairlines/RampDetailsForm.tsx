'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Truck, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import {
  FlightData,
  MainDetailsData,
  RampDetails1Data,
  normalizeRampDetails1Data,
  rampDetails1FormToSavePayload,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import {
  getNsRawFormSavedUrl,
  getRawFlightScheduleBySerialUrl,
} from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
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
import {
  sanitizeRampDigitInput,
  validateRampDigitLimit,
  rampFieldAttrs,
} from '@/components/fris/flights/rampDetailsInputLimits';
import {
  type ScheduleFieldsFromRawApi,
  scheduleStaDateDisplay,
  scheduleStdDateDisplay,
  scheduleStaTimeNormalizedDisplay,
  scheduleStdTimeNormalizedDisplay,
  normalizeTimeToHHmm,
} from './scheduledRowSchedule';
import { routingFromMainAndFlight } from './formRoutingFromMain';
import {
  FLIGHT_DETAILS_FIELD_GRID_CLASS,
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_H_SCROLL_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';

const fetch = frisFetch;

const RAMP_FIELD_ORDER = [
  'arrivalUld',
  'arrivalCargoWeight',
  'arrivalMailWeight',
  'depPlannedUld',
  'depPlannedCargoWeight',
  'depPlannedMailWeight',
  'depActualUld',
  'depActualCargoWeight',
  'depActualMailWeight',
  'transitUld',
  'transitCargoWeight',
  'transitMailWeight',
  'firstBagArrivalDate',
  'firstBagArrivalTime',
  'lastBagArrivalTime',
  'firstBagBmaDate',
  'firstBagBmaTime',
  'lastBagBmaTime',
  'cleaningStartedDate',
  'cleaningStartedTime',
  'cleaningClosedTime',
  'baggageDatesBeforeAta',
  'holdDatesBeforeAta',
  'holdFrontOpenDate',
  'holdFrontOpenTime',
  'holdRearOpenDate',
  'holdRearOpenTime',
  'holdBulkOpenDate',
  'holdBulkOpenTime',
  'holdMainDeckOpenDate',
  'holdMainDeckOpenTime',
  'holdFrontCloseTime',
  'holdRearCloseTime',
  'holdBulkCloseTime',
  'holdMainDeckCloseTime',
  'lastActivityHoldTime',
] as const;
type RampField = (typeof RAMP_FIELD_ORDER)[number];

function formatDisplayDate(dateStr: string): string {
  if (!dateStr?.trim()) return '';
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length !== 3) return dateStr;
  const [d, m, y] = parts;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

/** Accept yyyy-MM-dd or legacy d/m/y strings for ramp DatePickers (dd/MM/yyyy). */
function toRampDatePickerDdMmYyyy(dateStr: string | undefined): string {
  if (!dateStr?.trim()) return '';
  const s = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return formatDisplayDate(s);
}

function parseRampPickerDay(value: string): Date | null {
  const s = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!dmy) return null;
  const day = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  if (day.getFullYear() !== Number(dmy[3]) || day.getMonth() !== Number(dmy[2]) - 1 || day.getDate() !== Number(dmy[1])) {
    return null;
  }
  return day;
}

function laterRampDay(a: Date | null, b: Date | null): Date | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/** Stable field component defined outside form to prevent input remount on every keystroke */
function RampDetailsField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  labelClassName,
  inputClassName,
  maxLength,
  inputMode,
  fieldKey,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  labelClassName: string;
  inputClassName: string;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  /** When set, live-sanitize with ramp digit rules. */
  fieldKey?: string;
}) {
  const attrs = fieldKey ? rampFieldAttrs(fieldKey) : {};
  return (
    <div>
      <label className={labelClassName}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(fieldKey ? sanitizeRampDigitInput(fieldKey, raw) : raw);
        }}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength ?? attrs.maxLength}
        inputMode={inputMode ?? attrs.inputMode}
        autoComplete="off"
        className={inputClassName}
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-bold text-emerald-600 mb-3 mt-4 first:mt-0 border-b border-gray-200 pb-2 bg-gray-100 px-3 py-2 rounded-t-lg">
      {children}
    </h3>
  );
}

/** Parse time string (HH:mm) to minutes since midnight; null if invalid */
function timeToMinutes(timeStr: string): number | null {
  if (!timeStr?.trim()) return null;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.length < 2) return null;
  const [h, m] = parts;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Calculate duration between from time and to time only (no date); return "HH:mm" or "" */
function calcDurationTimeOnly(fromTime: string, toTime: string): string {
  const fromMins = timeToMinutes(fromTime);
  const toMins = timeToMinutes(toTime);
  if (fromMins == null || toMins == null) return '';
  let diffMins = toMins - fromMins;
  if (diffMins < 0) diffMins += 24 * 60; // across midnight
  const h = Math.floor(diffMins / 60);
  const m = diffMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface RampDetailsFormProps {
  flight: FlightData;
  mainDetails?: MainDetailsData | null;
  /** Parent refreshes lock columns and may auto-email GH rep when all locks complete. */
  onFhrLocksMayHaveChanged?: (slNo: string) => void;
}

export default function RampDetailsForm({
  flight,
  mainDetails,
  onFhrLocksMayHaveChanged,
}: RampDetailsFormProps) {
  const displayAirline = mainDetails?.airlineName ?? flight.airline;
  const displayFlightNo = mainDetails?.flightCode ?? flight.flightNo;
  const displayAircraft = mainDetails?.aircraftType ?? flight.aircraft;
  const [isLocked, setIsLocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExisting, setIsExisting] = useState(false);
  const [scheduleFromRaw, setScheduleFromRaw] =
    useState<ScheduleFieldsFromRawApi | null>(null);
  /** ATA time last saved on ramp doc; superseded in UI/save by main-details ATA when present. */
  const [rampLoadedAtaTime, setRampLoadedAtaTime] = useState('');

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
    const url = getNsRawFormSavedUrl(
      'ramp-details',
      nsFormSerialForFlight(flight),
    );
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        const data = normalizeRampDetails1Data(raw);
        if (!data) {
          setIsExisting(false);
          setBayPlanned('');
          setBayFinal('');
          setArrivalBaggageCount('');
          setBagreco('');
          setBmaCount('');
          setBbaBelt('');
          setArrivalBag('');
          setXRay(false);
          setFirstBagArrivalDate('');
          setFirstBagArrivalTime('');
          setLastBagArrivalDate('');
          setLastBagArrivalTime('');
          setFirstBagBmaDate('');
          setFirstBagBmaTime('');
          setLastBagBmaDate('');
          setLastBagBmaTime('');
          setCleaningStartedDate('');
          setCleaningStartedTime('');
          setCleaningClosedDate('');
          setCleaningClosedTime('');
          setOneSidedBelt(false);
          setCustomChecked(false);
          setLdc('');
          setLdp('');
          setMdp('');
          setCgoPcsIn('');
          setCgoPcsOut('');
          setCourierPcsIn('');
          setCourierPcsOut('');
          setIfNightHalt(false);
          setHoldFrontOpenDate('');
          setHoldFrontOpenTime('');
          setHoldRearOpenDate('');
          setHoldRearOpenTime('');
          setHoldBulkOpenDate('');
          setHoldBulkOpenTime('');
          setHoldMainDeckOpenDate('');
          setHoldMainDeckOpenTime('');
          setHoldFrontCloseDate('');
          setHoldFrontCloseTime('');
          setHoldRearCloseDate('');
          setHoldRearCloseTime('');
          setHoldBulkCloseDate('');
          setHoldBulkCloseTime('');
          setHoldMainDeckCloseDate('');
          setHoldMainDeckCloseTime('');
          setLastActivityHoldDate('');
          setLastActivityHoldTime('');
          setArrivalUld('');
          setArrivalCargoWeight('');
          setArrivalMailWeight('');
          setDepPlannedUld('');
          setDepPlannedCargoWeight('');
          setDepPlannedMailWeight('');
          setDepActualUld('');
          setDepActualCargoWeight('');
          setDepActualMailWeight('');
          setTransitUld('');
          setTransitCargoWeight('');
          setTransitMailWeight('');
          setRampLoadedAtaTime('');
          setRouting(routingFromMainAndFlight(undefined, mainDetails, flight));
          return;
        }
        setIsExisting(true);
        setAirlinesOperator(data.airlinesOperator ?? displayAirline ?? '');
        setFlightNo(data.flightNo ?? displayFlightNo ?? '');
        setRouting(routingFromMainAndFlight(data.routing, mainDetails, flight));
        if (data.operations != null) setOperations(data.operations);
        if (
          data.etdDate != null &&
          !String(mainDetails?.etdDate ?? '').trim()
        ) {
          setEtdDate(toRampDatePickerDdMmYyyy(data.etdDate));
        }
        setAcType(data.acType ?? displayAircraft ?? '');
        const ataFromMain = String(mainDetails?.ataDate ?? '').trim();
        if (!ataFromMain && data.ataDate != null) {
          setAtaDate(toRampDatePickerDdMmYyyy(data.ataDate));
        }
        setRampLoadedAtaTime(
          data.ata?.trim() ? normalizeTimeToHHmm(data.ata) : '',
        );
        if (data.bayPlanned != null) setBayPlanned(data.bayPlanned);
        if (data.bayFinal != null) setBayFinal(data.bayFinal);
        if (data.arrivalBaggageCount != null)
          setArrivalBaggageCount(data.arrivalBaggageCount);
        if (data.bagreco != null) setBagreco(data.bagreco);
        if (data.bmaCount != null) setBmaCount(data.bmaCount);
        if (data.bbaBelt != null) setBbaBelt(data.bbaBelt);
        if (data.arrivalBag != null) setArrivalBag(data.arrivalBag);
        if (data.xRay != null) setXRay(data.xRay);
        if (data.firstBagArrivalHallDate != null)
          setFirstBagArrivalDate(data.firstBagArrivalHallDate);
        if (data.firstBagArrivalHallTime != null)
          setFirstBagArrivalTime(data.firstBagArrivalHallTime);
        if (data.lastBagArrivalHallDate != null)
          setLastBagArrivalDate(data.lastBagArrivalHallDate);
        if (data.lastBagArrivalHallTime != null)
          setLastBagArrivalTime(data.lastBagArrivalHallTime);
        if (data.firstBagInBmaDate != null)
          setFirstBagBmaDate(data.firstBagInBmaDate);
        if (data.firstBagInBmaTime != null)
          setFirstBagBmaTime(data.firstBagInBmaTime);
        if (data.lastBagInBmaDate != null)
          setLastBagBmaDate(data.lastBagInBmaDate);
        if (data.lastBagInBmaTime != null)
          setLastBagBmaTime(data.lastBagInBmaTime);
        setCleaningStartedDate(data.cleaningStartedDate ?? '');
        setCleaningStartedTime(data.cleaningStartedTime ?? '');
        setCleaningClosedDate(data.cleaningClosedDate ?? '');
        setCleaningClosedTime(data.cleaningClosedTime ?? '');
        if (data.oneSidedBelt != null) setOneSidedBelt(data.oneSidedBelt);
        if (data.customChecked != null) setCustomChecked(data.customChecked);
        if (data.ldc != null) setLdc(data.ldc);
        if (data.ldp != null) setLdp(data.ldp);
        if (data.mdp != null) setMdp(data.mdp);
        if (data.cgoPcsIn != null) setCgoPcsIn(data.cgoPcsIn);
        if (data.cgoPcsOut != null) setCgoPcsOut(data.cgoPcsOut);
        if (data.courierPcsIn != null) setCourierPcsIn(data.courierPcsIn);
        if (data.courierPcsOut != null) setCourierPcsOut(data.courierPcsOut);
        if (data.ifNightHalt != null) setIfNightHalt(data.ifNightHalt);
        setHoldFrontOpenDate(data.holdOpenFrontDate ?? '');
        setHoldFrontOpenTime(data.holdOpenFrontTime ?? '');
        setHoldRearOpenDate(data.holdOpenRearDate ?? '');
        setHoldRearOpenTime(data.holdOpenRearTime ?? '');
        setHoldBulkOpenDate(data.holdOpenBulkDate ?? '');
        setHoldBulkOpenTime(data.holdOpenBulkTime ?? '');
        setHoldMainDeckOpenDate(data.holdOpenMainDeckDate ?? '');
        setHoldMainDeckOpenTime(data.holdOpenMainDeckTime ?? '');
        setHoldFrontCloseDate(data.holdCloseFrontDate ?? '');
        setHoldFrontCloseTime(data.holdCloseFrontTime ?? '');
        setHoldRearCloseDate(data.holdCloseRearDate ?? '');
        setHoldRearCloseTime(data.holdCloseRearTime ?? '');
        setHoldBulkCloseDate(data.holdCloseBulkDate ?? '');
        setHoldBulkCloseTime(data.holdCloseBulkTime ?? '');
        setHoldMainDeckCloseDate(data.holdCloseMainDeckDate ?? '');
        setHoldMainDeckCloseTime(data.holdCloseMainDeckTime ?? '');
        if (data.lastActivityHoldDate != null)
          setLastActivityHoldDate(data.lastActivityHoldDate);
        if (data.lastActivityHoldTime != null)
          setLastActivityHoldTime(data.lastActivityHoldTime);
        if (data.arrivalUldCount != null) setArrivalUld(data.arrivalUldCount);
        if (data.arrivalCargoWeight != null)
          setArrivalCargoWeight(data.arrivalCargoWeight);
        if (data.arrivalMailWeight != null)
          setArrivalMailWeight(data.arrivalMailWeight);
        if (data.depPlannedUldCount != null)
          setDepPlannedUld(data.depPlannedUldCount);
        if (data.depPlannedCargoWeight != null)
          setDepPlannedCargoWeight(data.depPlannedCargoWeight);
        if (data.depPlannedMailWeight != null)
          setDepPlannedMailWeight(data.depPlannedMailWeight);
        if (data.depActualUldCount != null)
          setDepActualUld(data.depActualUldCount);
        if (data.depActualCargoWeight != null)
          setDepActualCargoWeight(data.depActualCargoWeight);
        if (data.depActualMailWeight != null)
          setDepActualMailWeight(data.depActualMailWeight);
        if (data.transitCargoUld != null) setTransitUld(data.transitCargoUld);
        if (data.transitCargoWeight != null)
          setTransitCargoWeight(data.transitCargoWeight);
        if (data.transitCargoMail != null)
          setTransitMailWeight(data.transitCargoMail);
      })
      .catch(() => {});
  }, [
    flight?.slNo,
    mainDetails?.route,
    mainDetails?.ataDate,
    mainDetails?.ataTime,
    mainDetails?.etdDate,
  ]);

  useEffect(() => {
    const m = (mainDetails?.route ?? '').trim();
    if (!m) return;
    setRouting((prev) => (prev.trim() === '' ? m : prev));
  }, [mainDetails?.route]);

  // Flight identification
  const [airlinesOperator, setAirlinesOperator] = useState(
    displayAirline || '',
  );
  const [flightNo, setFlightNo] = useState(displayFlightNo || '');
  const [routing, setRouting] = useState('');
  const [operations, setOperations] = useState('Turnaround');
  const [etdDate, setEtdDate] = useState(() =>
    toRampDatePickerDdMmYyyy(scheduleStdDateDisplay(flight, null)),
  );
  const [acType, setAcType] = useState(displayAircraft || '');
  const [ataDate, setAtaDate] = useState(() => {
    const r = scheduleStaDateDisplay(flight, null);
    return r ? formatDisplayDate(r) : '';
  });

  // Bay and baggage — blank until saved ramp-details exist for this flight
  const [bayPlanned, setBayPlanned] = useState('');
  const [bayFinal, setBayFinal] = useState('');
  const [arrivalBaggageCount, setArrivalBaggageCount] = useState('');
  const [bagreco, setBagreco] = useState('');
  const [bmaCount, setBmaCount] = useState('');
  const [bbaBelt, setBbaBelt] = useState('');
  const [arrivalBag, setArrivalBag] = useState('');
  const [xRay, setXRay] = useState(false);

  // Baggage timings
  const [firstBagArrivalDate, setFirstBagArrivalDate] = useState('');
  const [firstBagArrivalTime, setFirstBagArrivalTime] = useState('');
  const [lastBagArrivalDate, setLastBagArrivalDate] = useState('');
  const [lastBagArrivalTime, setLastBagArrivalTime] = useState('');
  const [firstBagBmaDate, setFirstBagBmaDate] = useState('');
  const [firstBagBmaTime, setFirstBagBmaTime] = useState('');
  const [lastBagBmaDate, setLastBagBmaDate] = useState('');
  const [lastBagBmaTime, setLastBagBmaTime] = useState('');
  const [cleaningStartedDate, setCleaningStartedDate] = useState('');
  const [cleaningStartedTime, setCleaningStartedTime] = useState('');
  const [cleaningClosedDate, setCleaningClosedDate] = useState('');
  const [cleaningClosedTime, setCleaningClosedTime] = useState('');

  // Checkboxes
  const [oneSidedBelt, setOneSidedBelt] = useState(false);
  const [customChecked, setCustomChecked] = useState(false);

  // Hold Breakup
  const [ldc, setLdc] = useState('');
  const [ldp, setLdp] = useState('');
  const [mdp, setMdp] = useState('');

  // Compartment Five
  const [cgoPcsIn, setCgoPcsIn] = useState('');
  const [cgoPcsOut, setCgoPcsOut] = useState('');
  const [courierPcsIn, setCourierPcsIn] = useState('');
  const [courierPcsOut, setCourierPcsOut] = useState('');
  const [ifNightHalt, setIfNightHalt] = useState(false);

  // Hold Open/Close (Front / Rear / Bulk / Main Deck) — empty until user enters or server returns values
  const [holdFrontOpenDate, setHoldFrontOpenDate] = useState('');
  const [holdFrontOpenTime, setHoldFrontOpenTime] = useState('');
  const [holdRearOpenDate, setHoldRearOpenDate] = useState('');
  const [holdRearOpenTime, setHoldRearOpenTime] = useState('');
  const [holdBulkOpenDate, setHoldBulkOpenDate] = useState('');
  const [holdBulkOpenTime, setHoldBulkOpenTime] = useState('');
  const [holdMainDeckOpenDate, setHoldMainDeckOpenDate] = useState('');
  const [holdMainDeckOpenTime, setHoldMainDeckOpenTime] = useState('');
  const [holdFrontCloseDate, setHoldFrontCloseDate] = useState('');
  const [holdFrontCloseTime, setHoldFrontCloseTime] = useState('');
  const [holdRearCloseDate, setHoldRearCloseDate] = useState('');
  const [holdRearCloseTime, setHoldRearCloseTime] = useState('');
  const [holdBulkCloseDate, setHoldBulkCloseDate] = useState('');
  const [holdBulkCloseTime, setHoldBulkCloseTime] = useState('');
  const [holdMainDeckCloseDate, setHoldMainDeckCloseDate] = useState('');
  const [holdMainDeckCloseTime, setHoldMainDeckCloseTime] = useState('');
  const [lastActivityHoldDate, setLastActivityHoldDate] = useState('');
  const [lastActivityHoldTime, setLastActivityHoldTime] = useState('');

  // Cargo table
  const [arrivalUld, setArrivalUld] = useState('');
  const [arrivalCargoWeight, setArrivalCargoWeight] = useState('');
  const [arrivalMailWeight, setArrivalMailWeight] = useState('');
  const [depPlannedUld, setDepPlannedUld] = useState('');
  const [depPlannedCargoWeight, setDepPlannedCargoWeight] = useState('');
  const [depPlannedMailWeight, setDepPlannedMailWeight] = useState('');
  const [depActualUld, setDepActualUld] = useState('');
  const [depActualCargoWeight, setDepActualCargoWeight] = useState('');
  const [depActualMailWeight, setDepActualMailWeight] = useState('');
  const [transitUld, setTransitUld] = useState('');
  const [transitCargoWeight, setTransitCargoWeight] = useState('');
  const [transitMailWeight, setTransitMailWeight] = useState('');
  const { errors, clearField, applyAndFocus } = useFieldErrors<RampField>(RAMP_FIELD_ORDER);

  const setCargo = (key: RampField, value: string, setter: (v: string) => void) => {
    setter(sanitizeRampDigitInput(key, value));
    clearField(key);
  };

  const ataDateResolved = useMemo(() => {
    const fromMain = toRampDatePickerDdMmYyyy(mainDetails?.ataDate);
    if (fromMain) return fromMain;
    return ataDate;
  }, [mainDetails?.ataDate, ataDate]);

  const ataTimeResolved = useMemo(() => {
    const fromMain = normalizeTimeToHHmm(mainDetails?.ataTime);
    if (fromMain !== '00:00' || String(mainDetails?.ataTime ?? '').trim())
      return fromMain;
    if (rampLoadedAtaTime) return rampLoadedAtaTime;
    return scheduleStaTimeNormalizedDisplay(flight, scheduleFromRaw);
  }, [mainDetails?.ataTime, rampLoadedAtaTime, flight, scheduleFromRaw]);

  useEffect(() => {
    const fromMainAtaDate = toRampDatePickerDdMmYyyy(mainDetails?.ataDate);
    if (fromMainAtaDate) {
      setAtaDate(fromMainAtaDate);
    }
    const fromMainEtdDate = toRampDatePickerDdMmYyyy(mainDetails?.etdDate);
    if (fromMainEtdDate) {
      setEtdDate(fromMainEtdDate);
    }
  }, [mainDetails?.ataDate, mainDetails?.etdDate]);

  /** STD / ETD schedule date when main-details ETD is blank (row or raw schedule). */
  useEffect(() => {
    if (String(mainDetails?.etdDate ?? '').trim()) return;
    const std = scheduleStdDateDisplay(flight, scheduleFromRaw);
    const next = toRampDatePickerDdMmYyyy(std);
    if (!next) return;
    setEtdDate((prev) => (prev.trim() === '' ? next : prev));
  }, [flight, scheduleFromRaw, mainDetails?.etdDate]);

  const firstBagArrivalDay = useMemo(() => parseRampPickerDay(firstBagArrivalDate), [firstBagArrivalDate]);
  const lastBagArrivalDay = useMemo(() => parseRampPickerDay(lastBagArrivalDate), [lastBagArrivalDate]);
  const firstBagExceedsLast =
    firstBagArrivalDay != null &&
    lastBagArrivalDay != null &&
    firstBagArrivalDay.getTime() > lastBagArrivalDay.getTime();
  const firstBagBmaDay = useMemo(() => parseRampPickerDay(firstBagBmaDate), [firstBagBmaDate]);
  const lastBagBmaDay = useMemo(() => parseRampPickerDay(lastBagBmaDate), [lastBagBmaDate]);
  const firstBmaExceedsLast =
    firstBagBmaDay != null &&
    lastBagBmaDay != null &&
    firstBagBmaDay.getTime() > lastBagBmaDay.getTime();
  const cleaningStartedDay = useMemo(() => parseRampPickerDay(cleaningStartedDate), [cleaningStartedDate]);
  const cleaningClosedDay = useMemo(() => parseRampPickerDay(cleaningClosedDate), [cleaningClosedDate]);
  const cleaningStartedExceedsClosed =
    cleaningStartedDay != null &&
    cleaningClosedDay != null &&
    cleaningStartedDay.getTime() > cleaningClosedDay.getTime();
  const ataDay = useMemo(() => parseRampPickerDay(ataDateResolved), [ataDateResolved]);
  const isBeforeAta = (value: string) => {
    const day = parseRampPickerDay(value);
    return ataDay != null && day != null && day.getTime() < ataDay.getTime();
  };
  const baggageBeforeAta = [
    firstBagArrivalDate,
    lastBagArrivalDate,
    firstBagBmaDate,
    lastBagBmaDate,
    cleaningStartedDate,
    cleaningClosedDate,
  ].some(isBeforeAta);
  const holdBeforeAta = [
    holdFrontOpenDate,
    holdRearOpenDate,
    holdBulkOpenDate,
    holdMainDeckOpenDate,
    holdFrontCloseDate,
    holdRearCloseDate,
    holdBulkCloseDate,
    holdMainDeckCloseDate,
    lastActivityHoldDate,
  ].some(isBeforeAta);
  const ataFloor = ataDay ?? undefined;
  const lastBagArrivalMin = laterRampDay(ataDay, firstBagArrivalDay);
  const lastBagBmaMin = laterRampDay(ataDay, firstBagBmaDay);
  const cleaningClosedMin = laterRampDay(ataDay, cleaningStartedDay);
  const holdFrontOpenDay = useMemo(() => parseRampPickerDay(holdFrontOpenDate), [holdFrontOpenDate]);
  const holdFrontCloseDay = useMemo(() => parseRampPickerDay(holdFrontCloseDate), [holdFrontCloseDate]);
  const holdFrontOpenExceedsClose =
    holdFrontOpenDay != null &&
    holdFrontCloseDay != null &&
    holdFrontOpenDay.getTime() > holdFrontCloseDay.getTime();
  const holdFrontCloseMin = laterRampDay(ataDay, holdFrontOpenDay);
  const holdRearOpenDay = useMemo(() => parseRampPickerDay(holdRearOpenDate), [holdRearOpenDate]);
  const holdRearCloseDay = useMemo(() => parseRampPickerDay(holdRearCloseDate), [holdRearCloseDate]);
  const holdRearOpenExceedsClose =
    holdRearOpenDay != null &&
    holdRearCloseDay != null &&
    holdRearOpenDay.getTime() > holdRearCloseDay.getTime();
  const holdRearCloseMin = laterRampDay(ataDay, holdRearOpenDay);
  const holdBulkOpenDay = useMemo(() => parseRampPickerDay(holdBulkOpenDate), [holdBulkOpenDate]);
  const holdBulkCloseDay = useMemo(() => parseRampPickerDay(holdBulkCloseDate), [holdBulkCloseDate]);
  const holdBulkOpenExceedsClose =
    holdBulkOpenDay != null &&
    holdBulkCloseDay != null &&
    holdBulkOpenDay.getTime() > holdBulkCloseDay.getTime();
  const holdBulkCloseMin = laterRampDay(ataDay, holdBulkOpenDay);
  const holdMainDeckOpenDay = useMemo(() => parseRampPickerDay(holdMainDeckOpenDate), [holdMainDeckOpenDate]);
  const holdMainDeckCloseDay = useMemo(() => parseRampPickerDay(holdMainDeckCloseDate), [holdMainDeckCloseDate]);
  const holdMainDeckOpenExceedsClose =
    holdMainDeckOpenDay != null &&
    holdMainDeckCloseDay != null &&
    holdMainDeckOpenDay.getTime() > holdMainDeckCloseDay.getTime();
  const holdMainDeckCloseMin = laterRampDay(ataDay, holdMainDeckOpenDay);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || !flight?.slNo) return;

    const next: FieldErrors<RampField> = {};
    const cargoChecks: Array<[RampField, string, string]> = [
      ['arrivalUld', arrivalUld, 'Arrival ULD'],
      ['arrivalCargoWeight', arrivalCargoWeight, 'Arrival cargo weight'],
      ['arrivalMailWeight', arrivalMailWeight, 'Arrival mail weight'],
      ['depPlannedUld', depPlannedUld, 'Dep planned ULD'],
      ['depPlannedCargoWeight', depPlannedCargoWeight, 'Dep planned cargo weight'],
      ['depPlannedMailWeight', depPlannedMailWeight, 'Dep planned mail weight'],
      ['depActualUld', depActualUld, 'Dep actual ULD'],
      ['depActualCargoWeight', depActualCargoWeight, 'Dep actual cargo weight'],
      ['depActualMailWeight', depActualMailWeight, 'Dep actual mail weight'],
      ['transitUld', transitUld, 'Transit ULD'],
      ['transitCargoWeight', transitCargoWeight, 'Transit cargo weight'],
      ['transitMailWeight', transitMailWeight, 'Transit mail weight'],
    ];
    for (const [key, value, label] of cargoChecks) {
      const err = validateRampDigitLimit(key, value, label);
      if (err) next[key] = err;
    }
    const timeChecks: Array<[RampField, string, string]> = [
      ['firstBagArrivalTime', firstBagArrivalTime, 'First bag arrival time'],
      ['lastBagArrivalTime', lastBagArrivalTime, 'Last bag arrival time'],
      ['firstBagBmaTime', firstBagBmaTime, 'First bag BMA time'],
      ['lastBagBmaTime', lastBagBmaTime, 'Last bag BMA time'],
      ['cleaningStartedTime', cleaningStartedTime, 'Cleaning started time'],
      ['cleaningClosedTime', cleaningClosedTime, 'Cleaning closed time'],
      ['holdFrontOpenTime', holdFrontOpenTime, 'Hold front open time'],
      ['holdRearOpenTime', holdRearOpenTime, 'Hold rear open time'],
      ['holdBulkOpenTime', holdBulkOpenTime, 'Hold bulk open time'],
      ['holdMainDeckOpenTime', holdMainDeckOpenTime, 'Hold main deck open time'],
      ['holdFrontCloseTime', holdFrontCloseTime, 'Hold front close time'],
      ['holdRearCloseTime', holdRearCloseTime, 'Hold rear close time'],
      ['holdBulkCloseTime', holdBulkCloseTime, 'Hold bulk close time'],
      ['holdMainDeckCloseTime', holdMainDeckCloseTime, 'Hold main deck close time'],
      ['lastActivityHoldTime', lastActivityHoldTime, 'Last activity hold time'],
    ];
    for (const [key, value, label] of timeChecks) {
      const err = time24(value, label);
      if (err) next[key] = err;
    }
    if (firstBagExceedsLast) {
      next.firstBagArrivalDate = 'First bag in arrival hall cannot be later than the last bag date.';
    }
    if (firstBmaExceedsLast) {
      next.firstBagBmaDate = 'First bag in BMA cannot be later than the last bag in BMA date.';
    }
    if (cleaningStartedExceedsClosed) {
      next.cleaningStartedDate = 'Cleaning started date cannot be later than the cleaning closed date.';
    }
    if (baggageBeforeAta) {
      next.baggageDatesBeforeAta = 'Baggage and cleaning dates cannot be before the ATA date.';
    }
    if (holdBeforeAta) {
      next.holdDatesBeforeAta = 'Hold dates cannot be before the ATA date.';
    }
    if (holdFrontOpenExceedsClose) {
      next.holdFrontOpenDate = 'Hold front open date cannot be later than the hold front close date.';
    }
    if (holdRearOpenExceedsClose) {
      next.holdRearOpenDate = 'Hold rear open date cannot be later than the hold rear close date.';
    }
    if (holdBulkOpenExceedsClose) {
      next.holdBulkOpenDate = 'Hold bulk open date cannot be later than the hold bulk close date.';
    }
    if (holdMainDeckOpenExceedsClose) {
      next.holdMainDeckOpenDate = 'Hold main deck open date cannot be later than the hold main deck close date.';
    }
    if (applyAndFocus(next)) {
      toast.warning('Please fix the highlighted fields.');
      return;
    }

    setIsSaving(true);
    const url = getNsRawFormSavedUrl(
      'ramp-details',
      nsFormSerialForFlight(flight),
    );
    const body = rampDetails1FormToSavePayload({
      airlinesOperator: airlinesOperator || '',
      flightNo: flightNo || '',
      routing,
      operations,
      etdDate:
        etdDate.trim() ||
        toRampDatePickerDdMmYyyy(mainDetails?.etdDate) ||
        toRampDatePickerDdMmYyyy(
          scheduleStdDateDisplay(flight, scheduleFromRaw),
        ),
      acType,
      staDate: scheduleStaDateDisplay(flight, scheduleFromRaw),
      std: scheduleStdTimeNormalizedDisplay(flight, scheduleFromRaw),
      etd: scheduleStdTimeNormalizedDisplay(flight, scheduleFromRaw),
      sta: scheduleStaTimeNormalizedDisplay(flight, scheduleFromRaw),
      ata: ataTimeResolved,
      stdDate: scheduleStdDateDisplay(flight, scheduleFromRaw),
      ataDate: ataDateResolved,
      bayPlanned,
      bayFinal,
      arrivalBaggageCount,
      arrivalBag,
      bagreco,
      Fbarr: firstBagArrivalDate,
      firstBagArrivalHallTime: firstBagArrivalTime,
      firstBagArrivalHallDate: '',
      bmaCount,
      Lbarr: lastBagArrivalDate,
      lastBagArrivalHallTime: lastBagArrivalTime,
      lastBagArrivalHallDate: '',
      bbaBelt,
      firstBagInBmaDate: firstBagBmaDate,
      firstBagInBmaTime: firstBagBmaTime,
      lastBagInBmaDate: lastBagBmaDate,
      lastBagInBmaTime: lastBagBmaTime,
      xRay,
      cleaningStartedDate,
      cleaningStartedTime,
      oneSidedBelt,
      customChecked,
      cleaningClosedDate,
      cleaningClosedTime,
      ldc,
      ldp,
      mdp,
      cgoPcsIn,
      cgoPcsOut,
      courierPcsIn,
      courierPcsOut,
      ifNightHalt,
      holdOpenFrontDate: holdFrontOpenDate,
      holdOpenFrontTime: holdFrontOpenTime,
      holdOpenRearDate: holdRearOpenDate,
      holdOpenRearTime: holdRearOpenTime,
      holdOpenBulkDate: holdBulkOpenDate,
      holdOpenBulkTime: holdBulkOpenTime,
      holdOpenMainDeckDate: holdMainDeckOpenDate,
      holdOpenMainDeckTime: holdMainDeckOpenTime,
      holdCloseFrontDate: holdFrontCloseDate,
      holdCloseFrontTime: holdFrontCloseTime,
      holdCloseRearDate: holdRearCloseDate,
      holdCloseRearTime: holdRearCloseTime,
      holdCloseBulkDate: holdBulkCloseDate,
      holdCloseBulkTime: holdBulkCloseTime,
      holdCloseMainDeckDate: holdMainDeckCloseDate,
      holdCloseMainDeckTime: holdMainDeckCloseTime,
      lastActivityHoldDate,
      lastActivityHoldTime,
      arrivalUldCount: arrivalUld,
      arrivalCargoWeight,
      arrivalMailWeight,
      depPlannedUldCount: depPlannedUld,
      depPlannedCargoWeight,
      depPlannedMailWeight,
      depActualUldCount: depActualUld,
      depActualCargoWeight,
      depActualMailWeight,
      transitCargoUld: transitUld,
      transitCargoWeight,
      transitMailWeight,
    });
    try {
      const res = await fetch(url, {
        method: isExisting ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setIsExisting(true);
        toast.success('Ramp details saved');
        onFhrLocksMayHaveChanged?.(String(flight.slNo ?? '').trim());
      } else {
        toast.error('Failed to save ramp details');
      }
    } catch {
      toast.error('Failed to save ramp details');
    } finally {
      setIsSaving(false);
    }
  };

  const inputBase =
    'w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all';
  const inputClass = `${inputBase} border-gray-300 bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500`;
  const inputLockedClass = `${inputBase} border-gray-200 bg-gray-100 text-gray-700 cursor-not-allowed`;
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1.5';
  const checkboxClass =
    'w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500';
  const fieldInputClass = isLocked ? inputLockedClass : inputClass;

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-emerald-500 px-3 py-3 text-white shadow-md sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Truck className="h-6 w-6 shrink-0" />
          <h2 className="text-base font-semibold sm:text-lg">Ramp Detail</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsLocked((p) => !p)}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isLocked ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-400 hover:bg-emerald-500'}`}
          title={isLocked ? 'Unlock form' : 'Lock form'}
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
        <section className="flex items-center gap-4">
          <span className="text-lg font-bold text-emerald-600">
            Serial No.: {displayScheduledAirlinesTableSerial(flight)}
          </span>
        </section>

        {/* Flight identification */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
            <RampDetailsField
              label="Airlines/Operator"
              value={airlinesOperator}
              onChange={setAirlinesOperator}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <RampDetailsField
              label="Flight No."
              value={flightNo}
              onChange={setFlightNo}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <RampDetailsField
              label="Routing"
              value={routing}
              onChange={setRouting}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <RampDetailsField
              label="Operations"
              value={operations}
              onChange={setOperations}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <div>
              <label className={labelClass}>ETD Date</label>
              <DatePicker
                value={etdDate}
                onChange={setEtdDate}
                valueFormat="dd/MM/yyyy"
                disabled={isLocked}
              />
            </div>
            <RampDetailsField
              label="A/C Type"
              value={acType}
              onChange={setAcType}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <RampDetailsField
              label="STA Date (schedule)"
              value={scheduleStaDateDisplay(flight, scheduleFromRaw)}
              onChange={() => {}}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <div>
              <label className={labelClass}>STD/ETD (24h, schedule)</label>
              <TimeSelect24
                value={scheduleStdTimeNormalizedDisplay(
                  flight,
                  scheduleFromRaw,
                )}
                onChange={() => {}}
                disabled
                className="w-full min-h-[42px]"
              />
            </div>
            <RampDetailsField
              label="STD Date (schedule)"
              value={scheduleStdDateDisplay(flight, scheduleFromRaw)}
              onChange={() => {}}
              disabled
              labelClassName={labelClass}
              inputClassName={inputLockedClass}
            />
            <div>
              <label className={labelClass}>ATA Date</label>
              <DatePicker
                value={ataDateResolved}
                onChange={setAtaDate}
                valueFormat="dd/MM/yyyy"
                disabled={isLocked}
              />
            </div>
            <div>
              <label className={labelClass}>STA / ATA (24h)</label>
              <TimeSelect24
                value={ataTimeResolved}
                onChange={() => {}}
                disabled
                className="w-full min-h-[42px]"
              />
            </div>
          </div>
        </section>

        {/* Bay and Baggage */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <SectionTitle>Bay and Baggage</SectionTitle>
          <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
            <RampDetailsField
              label="Bay Planned"
              value={bayPlanned}
              onChange={setBayPlanned}
              fieldKey="bayPlanned"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
            <RampDetailsField
              label="Bay Final"
              value={bayFinal}
              onChange={setBayFinal}
              fieldKey="bayFinal"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
            <RampDetailsField
              label="Departure bags"
              value={arrivalBaggageCount}
              onChange={setArrivalBaggageCount}
              fieldKey="arrivalBaggageCount"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
            <RampDetailsField
              label="Bag reco"
              value={bagreco}
              onChange={setBagreco}
              fieldKey="bagreco"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
            <RampDetailsField
              label="BMA Count"
              value={bmaCount}
              onChange={setBmaCount}
              fieldKey="bmaCount"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
            <RampDetailsField
              label="BBA Belt"
              value={bbaBelt}
              onChange={setBbaBelt}
              fieldKey="bbaBelt"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
            <RampDetailsField
              label="Arrival Bag"
              value={arrivalBag}
              onChange={setArrivalBag}
              fieldKey="arrivalBag"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer mt-3">
            <input
              type="checkbox"
              checked={xRay}
              onChange={(e) => setXRay(e.target.checked)}
              disabled={isLocked}
              className={checkboxClass}
            />
            <span className="text-sm text-gray-700">X Ray</span>
          </label>
        </section>

        {/* Baggage timings & Cleaning */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <div id="field-baggageDatesBeforeAta" tabIndex={-1}>
            <SectionTitle>Baggage Timings & Cleaning</SectionTitle>
            <FormFieldError id="field-baggageDatesBeforeAta-error" message={errors.baggageDatesBeforeAta} />
          </div>
          <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
            <div>
              <label className={labelClass} htmlFor="field-firstBagArrivalDate">
                First Bag in Arrival Hall (Date)
              </label>
              <DatePicker
                id="field-firstBagArrivalDate"
                ariaLabel="First bag in arrival hall date"
                value={firstBagArrivalDate}
                onChange={(v) => {
                  setFirstBagArrivalDate(v);
                  clearField('firstBagArrivalDate');
                }}
                valueFormat="dd/MM/yyyy"
                disabled={isLocked}
                minDate={ataFloor}
                maxDate={lastBagArrivalDay ?? undefined}
              />
              <FormFieldError id="field-firstBagArrivalDate-error" message={errors.firstBagArrivalDate} />
            </div>
            <div>
              <label className={labelClass}>
                First Bag in Arrival Hall (Time 24h)
              </label>
              <TimeSelect24
                value={firstBagArrivalTime}
                onChange={setFirstBagArrivalTime}
                disabled={isLocked}
                className="w-full min-h-[42px]"
              />
            </div>
            <div>
              <label className={labelClass}>
                Last Bag in Arrival Hall (Date)
              </label>
              <DatePicker
                id="field-lastBagArrivalDate"
                ariaLabel="Last bag in arrival hall date"
                value={lastBagArrivalDate}
                onChange={(v) => {
                  setLastBagArrivalDate(v);
                  clearField('firstBagArrivalDate');
                }}
                valueFormat="dd/MM/yyyy"
                disabled={isLocked}
                minDate={lastBagArrivalMin}
              />
            </div>
            <div>
              <label className={labelClass}>
                Last Bag in Arrival Hall (Time 24h)
              </label>
              <TimeSelect24
                value={lastBagArrivalTime}
                onChange={setLastBagArrivalTime}
                disabled={isLocked}
                className="w-full min-h-[42px]"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="field-firstBagBmaDate">First Bag in BMA (Date)</label>
              <DatePicker
                id="field-firstBagBmaDate"
                ariaLabel="First bag in BMA date"
                value={firstBagBmaDate}
                onChange={(v) => {
                  setFirstBagBmaDate(v);
                  clearField('firstBagBmaDate');
                }}
                valueFormat="dd/MM/yyyy"
                disabled={isLocked}
                minDate={ataFloor}
                maxDate={lastBagBmaDay ?? undefined}
              />
              <FormFieldError id="field-firstBagBmaDate-error" message={errors.firstBagBmaDate} />
            </div>
            <div>
              <label className={labelClass}>First Bag in BMA (Time 24h)</label>
              <TimeSelect24
                value={firstBagBmaTime}
                onChange={setFirstBagBmaTime}
                disabled={isLocked}
                className="w-full min-h-[42px]"
              />
            </div>
            <div>
              <label className={labelClass}>Last Bag in BMA (Date)</label>
              <DatePicker
                id="field-lastBagBmaDate"
                ariaLabel="Last bag in BMA date"
                value={lastBagBmaDate}
                onChange={(v) => {
                  setLastBagBmaDate(v);
                  clearField('firstBagBmaDate');
                }}
                valueFormat="dd/MM/yyyy"
                disabled={isLocked}
                minDate={lastBagBmaMin}
              />
            </div>
            <div>
              <label className={labelClass}>Last Bag in BMA (Time 24h)</label>
              <TimeSelect24
                value={lastBagBmaTime}
                onChange={setLastBagBmaTime}
                disabled={isLocked}
                className="w-full min-h-[42px]"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="field-cleaningStartedDate">Cleaning Started (Date)</label>
              <DatePicker
                id="field-cleaningStartedDate"
                ariaLabel="Cleaning started date"
                value={cleaningStartedDate}
                onChange={(v) => {
                  setCleaningStartedDate(v);
                  clearField('cleaningStartedDate');
                }}
                disabled={isLocked}
                minDate={ataFloor}
                maxDate={cleaningClosedDay ?? undefined}
              />
              <FormFieldError id="field-cleaningStartedDate-error" message={errors.cleaningStartedDate} />
            </div>
            <div>
              <label className={labelClass}>Cleaning Started (Time 24h)</label>
              <TimeSelect24
                value={cleaningStartedTime}
                onChange={setCleaningStartedTime}
                disabled={isLocked}
                className="w-full min-h-[42px]"
              />
            </div>
            <div>
              <label className={labelClass}>Cleaning Closed (Date)</label>
              <DatePicker
                id="field-cleaningClosedDate"
                ariaLabel="Cleaning closed date"
                value={cleaningClosedDate}
                onChange={(v) => {
                  setCleaningClosedDate(v);
                  clearField('cleaningStartedDate');
                }}
                disabled={isLocked}
                minDate={cleaningClosedMin}
              />
            </div>
            <div>
              <label className={labelClass}>Cleaning Closed (Time 24h)</label>
              <TimeSelect24
                value={cleaningClosedTime}
                onChange={setCleaningClosedTime}
                disabled={isLocked}
                className="w-full min-h-[42px]"
              />
            </div>
            <div>
              <label className={labelClass}>Cleaning Duration</label>
              <div
                className={`${inputBase} border-gray-200 bg-gray-50 text-gray-700 font-medium`}
              >
                {calcDurationTimeOnly(
                  cleaningStartedTime,
                  cleaningClosedTime,
                ) || '—'}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Calculated from Cleaning Started time to Cleaning Closed time
                (HH:mm)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 mt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={oneSidedBelt}
                onChange={(e) => setOneSidedBelt(e.target.checked)}
                disabled={isLocked}
                className={checkboxClass}
              />
              <span className="text-sm">One-Sided Belt</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={customChecked}
                onChange={(e) => setCustomChecked(e.target.checked)}
                disabled={isLocked}
                className={checkboxClass}
              />
              <span className="text-sm">Custom Checked</span>
            </label>
          </div>
        </section>

        {/* Hold Breakup */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <SectionTitle>Hold Breakup</SectionTitle>
          <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
            <RampDetailsField
              label="LDC"
              value={ldc}
              onChange={setLdc}
              fieldKey="ldc"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
            <RampDetailsField
              label="LDP"
              value={ldp}
              onChange={setLdp}
              fieldKey="ldp"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
            <RampDetailsField
              label="MDP"
              value={mdp}
              onChange={setMdp}
              fieldKey="mdp"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
          </div>
        </section>

        {/* Compartment Five */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <SectionTitle>Compartment Five</SectionTitle>
          <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
            <RampDetailsField
              label="Cgo Pcs in"
              value={cgoPcsIn}
              onChange={setCgoPcsIn}
              fieldKey="cgoPcsIn"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
            <RampDetailsField
              label="Cgo Pcs Out"
              value={cgoPcsOut}
              onChange={setCgoPcsOut}
              fieldKey="cgoPcsOut"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
            <RampDetailsField
              label="Courier Pcs in"
              value={courierPcsIn}
              onChange={setCourierPcsIn}
              fieldKey="courierPcsIn"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
            <RampDetailsField
              label="Courier Pcs out"
              value={courierPcsOut}
              onChange={setCourierPcsOut}
              fieldKey="courierPcsOut"
              disabled={isLocked}
              labelClassName={labelClass}
              inputClassName={fieldInputClass}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer mt-3">
            <input
              type="checkbox"
              checked={ifNightHalt}
              onChange={(e) => setIfNightHalt(e.target.checked)}
              disabled={isLocked}
              className={checkboxClass}
            />
            <span className="text-sm text-emerald-600 font-medium">
              If Night Halt
            </span>
          </label>
        </section>

        {/* Hold Open/Close */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <div id="field-holdDatesBeforeAta" tabIndex={-1}>
            <SectionTitle>Hold</SectionTitle>
            <FormFieldError id="field-holdDatesBeforeAta-error" message={errors.holdDatesBeforeAta} />
          </div>
          <div
            className={`${FLIGHT_DETAILS_H_SCROLL_CLASS} rounded-lg border border-gray-200`}
            role="region"
            aria-label="Hold open and close times"
            tabIndex={0}
          >
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-2 font-medium text-gray-700 w-24"></th>
                  <th className="text-left p-2 font-medium text-gray-700">
                    Front
                  </th>
                  <th className="text-left p-2 font-medium text-gray-700">
                    Rear
                  </th>
                  <th className="text-left p-2 font-medium text-gray-700">
                    Bulk
                  </th>
                  <th className="text-left p-2 font-medium text-gray-700">
                    Main Deck
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-200">
                  <td className="p-2 font-medium text-gray-600">Open</td>
                  <td className="p-2">
                    <div className="grid grid-cols-1 gap-1 min-w-[11rem]">
                      <DatePicker
                        id="field-holdFrontOpenDate"
                        ariaLabel="Hold front open date"
                        value={holdFrontOpenDate}
                        onChange={(v) => {
                          setHoldFrontOpenDate(v);
                          clearField('holdFrontOpenDate');
                        }}
                        disabled={isLocked}
                        minDate={ataFloor}
                        maxDate={holdFrontCloseDay ?? undefined}
                      />
                      <FormFieldError id="field-holdFrontOpenDate-error" message={errors.holdFrontOpenDate} />
                      <TimeSelect24
                        value={holdFrontOpenTime}
                        onChange={setHoldFrontOpenTime}
                        disabled={isLocked}
                        className="w-full min-w-[9rem] min-h-[38px]"
                      />
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="grid grid-cols-1 gap-1 min-w-[11rem]">
                      <DatePicker
                        id="field-holdRearOpenDate"
                        ariaLabel="Hold rear open date"
                        value={holdRearOpenDate}
                        onChange={(v) => {
                          setHoldRearOpenDate(v);
                          clearField('holdRearOpenDate');
                        }}
                        disabled={isLocked}
                        minDate={ataFloor}
                        maxDate={holdRearCloseDay ?? undefined}
                      />
                      <FormFieldError id="field-holdRearOpenDate-error" message={errors.holdRearOpenDate} />
                      <TimeSelect24
                        value={holdRearOpenTime}
                        onChange={setHoldRearOpenTime}
                        disabled={isLocked}
                        className="w-full min-w-[9rem] min-h-[38px]"
                      />
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="grid grid-cols-1 gap-1 min-w-[11rem]">
                      <DatePicker
                        id="field-holdBulkOpenDate"
                        ariaLabel="Hold bulk open date"
                        value={holdBulkOpenDate}
                        onChange={(v) => {
                          setHoldBulkOpenDate(v);
                          clearField('holdBulkOpenDate');
                        }}
                        disabled={isLocked}
                        minDate={ataFloor}
                        maxDate={holdBulkCloseDay ?? undefined}
                      />
                      <FormFieldError id="field-holdBulkOpenDate-error" message={errors.holdBulkOpenDate} />
                      <TimeSelect24
                        value={holdBulkOpenTime}
                        onChange={setHoldBulkOpenTime}
                        disabled={isLocked}
                        className="w-full min-w-[9rem] min-h-[38px]"
                      />
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="grid grid-cols-1 gap-1 min-w-[11rem]">
                      <DatePicker
                        id="field-holdMainDeckOpenDate"
                        ariaLabel="Hold main deck open date"
                        value={holdMainDeckOpenDate}
                        onChange={(v) => {
                          setHoldMainDeckOpenDate(v);
                          clearField('holdMainDeckOpenDate');
                        }}
                        disabled={isLocked}
                        minDate={ataFloor}
                        maxDate={holdMainDeckCloseDay ?? undefined}
                      />
                      <FormFieldError id="field-holdMainDeckOpenDate-error" message={errors.holdMainDeckOpenDate} />
                      <TimeSelect24
                        value={holdMainDeckOpenTime}
                        onChange={setHoldMainDeckOpenTime}
                        disabled={isLocked}
                        className="w-full min-w-[9rem] min-h-[38px]"
                      />
                    </div>
                  </td>
                </tr>
                <tr className="border-t border-gray-200">
                  <td className="p-2 font-medium text-gray-600">Close</td>
                  <td className="p-2">
                    <div className="grid grid-cols-1 gap-1 min-w-[11rem]">
                      <DatePicker
                        id="field-holdFrontCloseDate"
                        ariaLabel="Hold front close date"
                        value={holdFrontCloseDate}
                        onChange={(v) => {
                          setHoldFrontCloseDate(v);
                          clearField('holdFrontOpenDate');
                        }}
                        disabled={isLocked}
                        minDate={holdFrontCloseMin}
                      />
                      <TimeSelect24
                        value={holdFrontCloseTime}
                        onChange={setHoldFrontCloseTime}
                        disabled={isLocked}
                        className="w-full min-w-[9rem] min-h-[38px]"
                      />
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="grid grid-cols-1 gap-1 min-w-[11rem]">
                      <DatePicker
                        id="field-holdRearCloseDate"
                        ariaLabel="Hold rear close date"
                        value={holdRearCloseDate}
                        onChange={(v) => {
                          setHoldRearCloseDate(v);
                          clearField('holdRearOpenDate');
                        }}
                        disabled={isLocked}
                        minDate={holdRearCloseMin}
                      />
                      <TimeSelect24
                        value={holdRearCloseTime}
                        onChange={setHoldRearCloseTime}
                        disabled={isLocked}
                        className="w-full min-w-[9rem] min-h-[38px]"
                      />
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="grid grid-cols-1 gap-1 min-w-[11rem]">
                      <DatePicker
                        id="field-holdBulkCloseDate"
                        ariaLabel="Hold bulk close date"
                        value={holdBulkCloseDate}
                        onChange={(v) => {
                          setHoldBulkCloseDate(v);
                          clearField('holdBulkOpenDate');
                        }}
                        disabled={isLocked}
                        minDate={holdBulkCloseMin}
                      />
                      <TimeSelect24
                        value={holdBulkCloseTime}
                        onChange={setHoldBulkCloseTime}
                        disabled={isLocked}
                        className="w-full min-w-[9rem] min-h-[38px]"
                      />
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="grid grid-cols-1 gap-1 min-w-[11rem]">
                      <DatePicker
                        id="field-holdMainDeckCloseDate"
                        ariaLabel="Hold main deck close date"
                        value={holdMainDeckCloseDate}
                        onChange={(v) => {
                          setHoldMainDeckCloseDate(v);
                          clearField('holdMainDeckOpenDate');
                        }}
                        disabled={isLocked}
                        minDate={holdMainDeckCloseMin}
                      />
                      <TimeSelect24
                        value={holdMainDeckCloseTime}
                        onChange={setHoldMainDeckCloseTime}
                        disabled={isLocked}
                        className="w-full min-w-[9rem] min-h-[38px]"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 max-w-2xl">
            <div className="min-w-[10rem]">
              <label className={labelClass}>
                Last Activity Time on Hold (Date)
              </label>
              <DatePicker
                value={lastActivityHoldDate}
                onChange={setLastActivityHoldDate}
                valueFormat="dd/MM/yyyy"
                disabled={isLocked}
                minDate={ataFloor}
              />
            </div>
            <div className="min-w-[10rem]">
              <label className={labelClass}>
                Last Activity Time on Hold (Time 24h)
              </label>
              <TimeSelect24
                value={lastActivityHoldTime}
                onChange={setLastActivityHoldTime}
                disabled={isLocked}
                className="w-full min-h-[42px]"
              />
            </div>
          </div>
        </section>

        {/* Cargo details table */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <SectionTitle>Cargo Details</SectionTitle>
          <div className="space-y-4 md:hidden">
            {[
              {
                label: 'Arrival',
                uldKey: 'arrivalUld' as const,
                cargoKey: 'arrivalCargoWeight' as const,
                mailKey: 'arrivalMailWeight' as const,
                uld: arrivalUld,
                setUld: setArrivalUld,
                cargo: arrivalCargoWeight,
                setCargoVal: setArrivalCargoWeight,
                mail: arrivalMailWeight,
                setMail: setArrivalMailWeight,
              },
              {
                label: 'Dep. Planned',
                uldKey: 'depPlannedUld' as const,
                cargoKey: 'depPlannedCargoWeight' as const,
                mailKey: 'depPlannedMailWeight' as const,
                uld: depPlannedUld,
                setUld: setDepPlannedUld,
                cargo: depPlannedCargoWeight,
                setCargoVal: setDepPlannedCargoWeight,
                mail: depPlannedMailWeight,
                setMail: setDepPlannedMailWeight,
              },
              {
                label: 'Dep. Actual',
                uldKey: 'depActualUld' as const,
                cargoKey: 'depActualCargoWeight' as const,
                mailKey: 'depActualMailWeight' as const,
                uld: depActualUld,
                setUld: setDepActualUld,
                cargo: depActualCargoWeight,
                setCargoVal: setDepActualCargoWeight,
                mail: depActualMailWeight,
                setMail: setDepActualMailWeight,
              },
              {
                label: 'Transit Cargo',
                uldKey: 'transitUld' as const,
                cargoKey: 'transitCargoWeight' as const,
                mailKey: 'transitMailWeight' as const,
                uld: transitUld,
                setUld: setTransitUld,
                cargo: transitCargoWeight,
                setCargoVal: setTransitCargoWeight,
                mail: transitMailWeight,
                setMail: setTransitMailWeight,
              },
            ].map((row) => (
              <div
                key={row.label}
                className="rounded-lg border border-gray-200 bg-gray-50/80 p-3"
              >
                <p className="mb-3 text-sm font-semibold text-gray-800">
                  {row.label}
                </p>
                <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
                  <div>
                    <label className={labelClass}>No. Of ULD</label>
                    <input
                      type="text"
                      value={row.uld}
                      onChange={(e) => setCargo(row.uldKey, e.target.value, row.setUld)}
                      disabled={isLocked}
                      maxLength={2}
                      inputMode="numeric"
                      autoComplete="off"
                      className={cn(
                        isLocked ? inputLockedClass : inputClass,
                        errors[row.uldKey] && FRIS_INVALID_CONTROL,
                      )}
                    />
                    <FormFieldError message={errors[row.uldKey]} />
                  </div>
                  <div>
                    <label className={labelClass}>Cargo Weight</label>
                    <input
                      type="text"
                      value={row.cargo}
                      onChange={(e) =>
                        setCargo(row.cargoKey, e.target.value, row.setCargoVal)
                      }
                      disabled={isLocked}
                      maxLength={rampFieldAttrs(row.cargoKey).maxLength}
                      inputMode="numeric"
                      autoComplete="off"
                      className={cn(
                        isLocked ? inputLockedClass : inputClass,
                        errors[row.cargoKey] && FRIS_INVALID_CONTROL,
                      )}
                    />
                    <FormFieldError message={errors[row.cargoKey]} />
                  </div>
                  <div>
                    <label className={labelClass}>Mail Weight</label>
                    <input
                      type="text"
                      value={row.mail}
                      onChange={(e) => setCargo(row.mailKey, e.target.value, row.setMail)}
                      disabled={isLocked}
                      maxLength={4}
                      inputMode="numeric"
                      autoComplete="off"
                      className={cn(
                        isLocked ? inputLockedClass : inputClass,
                        errors[row.mailKey] && FRIS_INVALID_CONTROL,
                      )}
                    />
                    <FormFieldError message={errors[row.mailKey]} />
                  </div>
                </div>
              </div>
            ))}
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
                  <th className="text-left p-2.5 font-medium text-gray-700 w-40"></th>
                  <th className="text-left p-2.5 font-medium text-gray-700">
                    No. Of ULD
                  </th>
                  <th className="text-left p-2.5 font-medium text-gray-700">
                    Cargo Weight
                  </th>
                  <th className="text-left p-2.5 font-medium text-gray-700">
                    Mail Weight
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    {
                      label: 'Arrival',
                      uldKey: 'arrivalUld' as const,
                      cargoKey: 'arrivalCargoWeight' as const,
                      mailKey: 'arrivalMailWeight' as const,
                      uld: arrivalUld,
                      setUld: setArrivalUld,
                      cargo: arrivalCargoWeight,
                      setCargoVal: setArrivalCargoWeight,
                      mail: arrivalMailWeight,
                      setMail: setArrivalMailWeight,
                    },
                    {
                      label: 'Dep. Planned',
                      uldKey: 'depPlannedUld' as const,
                      cargoKey: 'depPlannedCargoWeight' as const,
                      mailKey: 'depPlannedMailWeight' as const,
                      uld: depPlannedUld,
                      setUld: setDepPlannedUld,
                      cargo: depPlannedCargoWeight,
                      setCargoVal: setDepPlannedCargoWeight,
                      mail: depPlannedMailWeight,
                      setMail: setDepPlannedMailWeight,
                    },
                    {
                      label: 'Dep. Actual',
                      uldKey: 'depActualUld' as const,
                      cargoKey: 'depActualCargoWeight' as const,
                      mailKey: 'depActualMailWeight' as const,
                      uld: depActualUld,
                      setUld: setDepActualUld,
                      cargo: depActualCargoWeight,
                      setCargoVal: setDepActualCargoWeight,
                      mail: depActualMailWeight,
                      setMail: setDepActualMailWeight,
                    },
                    {
                      label: 'Transit Cargo',
                      uldKey: 'transitUld' as const,
                      cargoKey: 'transitCargoWeight' as const,
                      mailKey: 'transitMailWeight' as const,
                      uld: transitUld,
                      setUld: setTransitUld,
                      cargo: transitCargoWeight,
                      setCargoVal: setTransitCargoWeight,
                      mail: transitMailWeight,
                      setMail: setTransitMailWeight,
                    },
                  ] as const
                ).map((row) => (
                  <tr key={row.label} className="border-t border-gray-200">
                    <td className="p-2 font-medium text-gray-600">{row.label}</td>
                    <td className="p-2">
                      <input
                        id={`field-${row.uldKey}`}
                        type="text"
                        value={row.uld}
                        onChange={(e) => setCargo(row.uldKey, e.target.value, row.setUld)}
                        disabled={isLocked}
                        maxLength={2}
                        inputMode="numeric"
                        autoComplete="off"
                        className={cn(
                          isLocked ? inputLockedClass : inputClass,
                          errors[row.uldKey] && FRIS_INVALID_CONTROL,
                        )}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        id={`field-${row.cargoKey}`}
                        type="text"
                        value={row.cargo}
                        onChange={(e) =>
                          setCargo(row.cargoKey, e.target.value, row.setCargoVal)
                        }
                        disabled={isLocked}
                        maxLength={rampFieldAttrs(row.cargoKey).maxLength}
                        inputMode="numeric"
                        autoComplete="off"
                        className={cn(
                          isLocked ? inputLockedClass : inputClass,
                          errors[row.cargoKey] && FRIS_INVALID_CONTROL,
                        )}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        id={`field-${row.mailKey}`}
                        type="text"
                        value={row.mail}
                        onChange={(e) => setCargo(row.mailKey, e.target.value, row.setMail)}
                        disabled={isLocked}
                        maxLength={4}
                        inputMode="numeric"
                        autoComplete="off"
                        className={cn(
                          isLocked ? inputLockedClass : inputClass,
                          errors[row.mailKey] && FRIS_INVALID_CONTROL,
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Actions */}
        <section className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setIsLocked((p) => !p)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg focus:ring-2 focus:ring-offset-1 ${isLocked ? 'bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-300' : 'bg-gray-200 text-gray-600 hover:bg-gray-300 focus:ring-gray-400'}`}
          >
            {isLocked ? (
              <>
                <Unlock className="w-4 h-4" />
                Unlock
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Lock
              </>
            )}
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
