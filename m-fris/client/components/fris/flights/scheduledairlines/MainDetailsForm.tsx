'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Save,
  AlertCircle,
  CheckCircle2,
  Plane,
  ShieldCheck,
  Ban,
  AlertTriangle,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/error-utils';
import { format, parse, isValid, differenceInHours } from 'date-fns';
import {
  FlightData,
  MainDetailsData,
  DelayEntry,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
  normalizeMainDetailsData,
} from '@/utils/dataProcessor';
import {
  getApiBase,
  getNsRawFormSavedUrl,
  getRawFlightScheduleBySerialUrl,
  advanceList,
  ADVANCE_PATHS,
  advanceDocId,
  fetchAdvanceTerminalCodes,
  fetchFlightCancellationStatus,
  fetchFhrCollectionFlightLean,
  operationalSerialFromFlightKey,
  putFhrCollectionFlightMerge,
} from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import {
  stashCancellationHistoryFocusDate,
  stashCancellationHistoryHighlight,
} from '@/contexts/DashboardNotificationContext';
import IntimationForm from '@/components/fris/flights/scheduledairlines/cancel-flight/IntimationForm';
import {
  type ScheduleFieldsFromRawApi,
  scheduleStaDateDisplay,
  scheduleStdDateDisplay,
  scheduleStaTimeRawDisplay,
  scheduleStdTimeRawDisplay,
} from './scheduledRowSchedule';
import { sumDelayDurations } from '@/components/fris/flights/scheduledairlines/reportPdfUtils';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { MAIN_DETAILS_DELAY_REASONS as DELAY_REASONS } from '@/lib/delayReasons';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import {
  SearchableCombobox,
  type SearchableComboOption,
} from '@/components/ui/SearchableCombobox';
import DigitalSignaturesSection, {
  type SignatureSectionState,
} from '@/components/fris/flights/scheduledairlines/signatures/DigitalSignaturesSection';
import {
  buildGhRepComboOptions,
  mapGhRepMasterRow,
  REPRESENTATIVES_ACCESS_NOTE,
  type GhRepMasterRow,
} from '@/components/fris/flights/scheduledairlines/ghRepComboOptions';
import { FLIGHT_DETAILS_H_SCROLL_CLASS } from './flightDetailsFormLayout';
// import { toast } from '@/hooks/use-toast';
import { toast } from 'sonner';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  email,
  time24,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';

const MAIN_SAVE_FIELD_ORDER = ['ataDate', 'ataTime', 'atdTime', 'departureStatus'] as const;
type MainSaveField = (typeof MAIN_SAVE_FIELD_ORDER)[number];
const INTIMATION_EMAIL_FIELD_ORDER = ['intimationPersonEmail'] as const;

/** Authenticated user's display name (used to auto-fill the GH signing representative). */
function getLoggedInUserName(): string {
  if (typeof window === 'undefined') return '';
  try {
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.name || user.username || user.fullName || user.displayName || '';
    }
  } catch {
    // ignore parse errors
  }
  return '';
}

type AirlineContactMasterRow = {
  id: string;
  airlineRepresentative: string;
  airline: string;
  email: string;
};

function mapAirlineContactMasterRow(
  doc: Record<string, unknown>,
): AirlineContactMasterRow | null {
  const d = advanceDocId(doc);
  const airlineRepresentative = String(d.airlineRepresentative ?? '').trim();
  if (!airlineRepresentative) return null;
  return {
    id: d.id,
    airlineRepresentative,
    airline: String(d.airline ?? '').trim(),
    email: String(d.email ?? '').trim(),
  };
}

const fetch = frisFetch;

/** Sonner styling aligned with Scheduled Airlines (emerald / soft gradients). */
const scheduleThemedToast = {
  success: (message: string) =>
    toast.success(message, {
      className:
        '!border !border-emerald-200/90 !bg-gradient-to-br !from-emerald-50 !via-white !to-teal-50/40 !text-emerald-950 !shadow-lg !shadow-emerald-500/15',
    }),
  error: (message: string) =>
    toast.error(message, {
      className:
        '!border !border-rose-200/90 !bg-gradient-to-br !from-rose-50 !via-white !to-red-50/50 !text-red-950 !shadow-lg !shadow-rose-500/10',
    }),
  message: (m: string) =>
    toast(m, {
      className:
        '!border !border-emerald-200/80 !bg-gradient-to-br !from-gray-50 !to-emerald-50/30 !text-gray-900 !shadow-md !shadow-emerald-500/5',
    }),
};

const TERMINAL_OPTIONS = ['RGI', 'T1', 'T2', 'T3'];
const OPS_OPTIONS = ['Turnaround', 'Transit', 'Departure', 'Arrival'];
const AIRCRAFT_BODY_OPTIONS = ['NB', 'WB', 'RB'];
const DEPARTURE_STATUS_OPTIONS = ['On Time', 'Delay', 'Cancelled', 'Early'];

const FLIGHT_CATEGORY_SKIP = new Set([
  'unknown',
  'turnaround',
  'transit',
  'arrival',
  'departure',
]);

function usableFlightCategory(value: string | undefined | null): string {
  const s = String(value ?? '').trim();
  if (!s || FLIGHT_CATEGORY_SKIP.has(s.toLowerCase())) return '';
  return s;
}

const FLIGHT_CATEGORY_OPTIONS = [
  'International',
  'Domestic',
  'International BME',
  'Domestic BME',
  'International-Cargo',
  'Domestic-Cargo',
  'International-Domestic',
  'Domestic-International',
];


/** Parse flight date (dd/mm/yyyy, dd-mm-yyyy, or yyyy-mm-dd) to Date or null */
function parseFlightDate(dateStr: string): Date | null {
  if (!dateStr?.trim()) return null;
  const s = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2000) return null;
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  }
  const parts = s.split(/[-/]/);
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2000) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

/** Format Date to yyyy-MM-dd for input[type="date"] */
function toInputDate(date: Date | null): string {
  if (!date || !isValid(date)) return '';
  return format(date, 'yyyy-MM-dd');
}

/** Parse time "HH:mm" or "HH:mm:ss" to minutes since midnight for comparison */
function parseTimeToMinutes(t: string): number | null {
  if (!t?.trim()) return null;
  const parts = t.trim().split(':').map(Number);
  if (parts.length < 2) return null;
  const [h, m, s = 0] = parts;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m + (s / 60);
}

/** Format time HH:mm from "HH:mm" or "H:mm" etc */
function toInputTime(timeStr: string): string {
  if (!timeStr?.trim()) return '';
  const normalized = timeStr.trim().replace(/\./g, ':');
  const parts = normalized.split(':').map((p) => p.trim());
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  return '';
}

/** Format time HH:mm:ss for delay fields (handles server formats like "00.00:36") */
function toInputTimeWithSeconds(timeStr: string): string {
  if (!timeStr?.trim()) return '00:00:00';
  const normalized = timeStr.trim().replace(/\./g, ':');
  const parts = normalized.split(':').map((p) => p.trim());
  const h = (parts[0] && /^\d{1,2}$/.test(parts[0]) ? parts[0].padStart(2, '0') : '00').slice(0, 2);
  const m = (parts[1] && /^\d{1,2}$/.test(parts[1]) ? parts[1].padStart(2, '0') : '00').slice(0, 2);
  const s = (parts[2] && /^\d{1,2}$/.test(parts[2]) ? parts[2].padStart(2, '0') : '00').slice(0, 2);
  return `${h}:${m}:${s}`;
}

interface DelayRow {
  delay: string;
  reason: string;
  gh: boolean;
  oth: boolean;
}

/** Departure / Arrival delay tables always show this many rows in Main Details. */
const MAIN_DETAILS_DELAY_TABLE_ROWS = 3;

/** Wide tables inside the flight-details drawer — scroll horizontally on phones. */
const MAIN_DETAILS_H_SCROLL_CLASS = FLIGHT_DETAILS_H_SCROLL_CLASS;

function emptyMainDetailsDelayRow(): DelayRow {
  return { delay: '00:00:00', reason: '', gh: false, oth: false };
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** Deep-clone main-details shape and drop Mongo metadata so PUT merge stays clean. */
function cloneMainDetailsBaseline(src: Record<string, unknown>): Record<string, unknown> {
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(JSON.stringify(src)) as Record<string, unknown>;
  } catch {
    c = { ...src };
  }
  delete c._id;
  delete c.__v;
  delete c.createdAt;
  delete c.updatedAt;
  return c;
}

/** Pad or trim so the delay-reason table always has exactly three rows. */
function normalizeMainDetailsDelayRows(rows: DelayRow[]): DelayRow[] {
  const padded = rows.map((r) => ({
    ...r,
    delay: r.delay?.trim() ? toInputTimeWithSeconds(r.delay) : '00:00:00',
  }));
  const trimmed = padded.slice(0, MAIN_DETAILS_DELAY_TABLE_ROWS);
  while (trimmed.length < MAIN_DETAILS_DELAY_TABLE_ROWS) {
    trimmed.push(emptyMainDetailsDelayRow());
  }
  return trimmed;
}

/** Sum Delay column values from arrival/departure reason rows → HH:mm:ss. */
function sumMainDetailsDelayRows(rows: DelayRow[]): string {
  return sumDelayDurations(...rows.map((r) => r.delay));
}

function keyify(v: string): string {
  return v.trim().toLowerCase();
}

/** Aircraft type keys for registration master match (handles "A320/A321"). */
function aircraftTypeMatchKeys(aircraft: string): string[] {
  const raw = keyify(aircraft);
  if (!raw) return [];
  const keys = new Set<string>([raw]);
  for (const part of raw.split(/[/,|]+/)) {
    const p = part.trim();
    if (p) keys.add(p);
  }
  return [...keys];
}

export interface MainDetailsFormProps {
  flight: FlightData;
  onBack: () => void;
  showBackButton?: boolean;
  /** Called when main details are loaded from server; use to populate sidebar header from response */
  onMainDetailsLoaded?: (data: MainDetailsData) => void;
  /** Notify parent when cancellation state changes on save. */
  onCancelledChange?: (cancelled: boolean) => void;
  /** After save — parent refreshes locks and may send opt-in shared reports. */
  onFhrLocksMayHaveChanged?: (slNo: string) => void;
}

function getInitialStdInputDate(flight: FlightData): string {
  return toInputDate(parseFlightDate(flight.stdDate));
}
function getInitialStdTime(flight: FlightData): string {
  return flight.stdTime?.trim() ? toInputTime(flight.stdTime) : '';
}

export default function MainDetailsForm({
  flight,
  onBack,
  showBackButton = true,
  onMainDetailsLoaded,
  onCancelledChange,
  onFhrLocksMayHaveChanged,
}: MainDetailsFormProps) {
  const [openInTab, setOpenInTab] = useState<'yes' | 'no'>('no');
  const [operationSplit, setOperationSplit] = useState(false);
  const [arrivalFlightNo, setArrivalFlightNo] = useState('');
  const [departureFlightNo, setDepartureFlightNo] = useState('');
  const [stdLessThanSta, setStdLessThanSta] = useState(false);
  const [ataDate, setAtaDate] = useState('');
  const [ataTime, setAtaTime] = useState('');
  const [atdDate, setAtdDate] = useState(() => getInitialStdInputDate(flight));
  const [atdTime, setAtdTime] = useState(() => getInitialStdTime(flight));
  const [etdDate, setEtdDate] = useState(() => getInitialStdInputDate(flight));
  const [etdTime, setEtdTime] = useState(() => getInitialStdTime(flight));
  const { errors: saveErrors, clearField: clearSaveField, applyAndFocus: applySaveErrors } =
    useFieldErrors<MainSaveField>(MAIN_SAVE_FIELD_ORDER);
  const {
    errors: intimationEmailErrors,
    clearField: clearIntimationEmailField,
    applyAndFocus: applyIntimationEmailErrors,
  } = useFieldErrors<(typeof INTIMATION_EMAIL_FIELD_ORDER)[number]>(INTIMATION_EMAIL_FIELD_ORDER);
  const [regnNo, setRegnNo] = useState('');
  const [terminalOptions, setTerminalOptions] = useState<string[]>(TERMINAL_OPTIONS);
  const [terminalCode, setTerminalCode] = useState(TERMINAL_OPTIONS[0]);
  const [route, setRoute] = useState(() => (flight.route ?? '').trim());
  const [ops, setOps] = useState('Turnaround');
  const [flightCategory, setFlightCategory] = useState(
    () => usableFlightCategory(flight.cateOfFlight) || 'International',
  );
  const [nightHalt, setNightHalt] = useState(false);
  const [aircraftBody, setAircraftBody] = useState('NB');
  const [returnToRamp, setReturnToRamp] = useState(false);
  const [arrivalDelay, setArrivalDelay] = useState('00:00:00');
  const [departureStatus, setDepartureStatus] = useState('');
  const [departureStatusManuallySet, setDepartureStatusManuallySet] = useState(false);
  const [departureDelay, setDepartureDelay] = useState('00:00:00');
  const [departureRows, setDepartureRows] = useState<DelayRow[]>(() =>
    normalizeMainDetailsDelayRows([]),
  );
  const [arrivalRows, setArrivalRows] = useState<DelayRow[]>(() =>
    normalizeMainDetailsDelayRows([]),
  );
  const [ghRep, setGhRep] = useState('');
  const [ghRepMasterList, setGhRepMasterList] = useState<GhRepMasterRow[]>([]);
  const [ghRepOptionsLoading, setGhRepOptionsLoading] = useState(false);
  const ghRepOptionsLoadedRef = useRef(false);
  const [airlineRep, setAirlineRep] = useState('');
  const [airlineRepMasterList, setAirlineRepMasterList] = useState<AirlineContactMasterRow[]>([]);
  const [airlineRepOptionsLoading, setAirlineRepOptionsLoading] = useState(false);
  const airlineRepOptionsLoadedRef = useRef(false);
  const airlineRepOptionsFetchingRef = useRef(false);
  const [shareFhrToAirline, setShareFhrToAirline] = useState(false);
  const [shareReportsToGhRep, setShareReportsToGhRep] = useState(false);
  const [cancelled, setCancelled] = useState(flight.isCancelled);
  const [step, setStep] = useState<'main' | 'otp' | 'intimation'>('main');
  const [otpFlowMode, setOtpFlowMode] = useState<'cancel' | 'reopen'>('cancel');
  const [stepOnePurposeUsed, setStepOnePurposeUsed] = useState<
    'cancel-step-1' | 'reopen-step-1' | null
  >(null);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [finalOtp, setFinalOtp] = useState('');
  const [finalOtpSent, setFinalOtpSent] = useState(false);
  const [intimationTime, setIntimationTime] = useState('');
  const [intimatedBy, setIntimatedBy] = useState('');
  const [intimationPersonEmail, setIntimationPersonEmail] = useState('');
  const [intimationMode, setIntimationMode] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [proofAttachment, setProofAttachment] = useState<{
    fileName: string;
    mimeType: string;
    base64: string;
  } | null>(null);
  const [isCancelBusy, setIsCancelBusy] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showNightHaltConfirm, setShowNightHaltConfirm] = useState(false);
  const [pendingNightHalt, setPendingNightHalt] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState('');
  const [signatureState, setSignatureState] = useState<SignatureSectionState>({
    ghSigned: false,
    airlineSigned: false,
    airlineNamePresent: false,
    isFinalized: false,
  });

  const [dbData, setDbData] = useState<MainDetailsData | null>(null);
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const mainDetailsEmbedBaselineRef = useRef<Record<string, unknown> | null>(null);
  const [isRegnAutoLoading, setIsRegnAutoLoading] = useState(false);
  const [scheduleFromRaw, setScheduleFromRaw] = useState<ScheduleFieldsFromRawApi | null>(null);

  const scheduleStaDate = useMemo(
    () => scheduleStaDateDisplay(flight, scheduleFromRaw),
    [flight, scheduleFromRaw],
  );
  const scheduleStdDate = useMemo(
    () => scheduleStdDateDisplay(flight, scheduleFromRaw),
    [flight, scheduleFromRaw],
  );
  const scheduleStaTime = useMemo(
    () => scheduleStaTimeRawDisplay(flight, scheduleFromRaw),
    [flight, scheduleFromRaw],
  );
  const scheduleStdTime = useMemo(
    () => scheduleStdTimeRawDisplay(flight, scheduleFromRaw),
    [flight, scheduleFromRaw],
  );
  const scheduleStaYmd = useMemo(() => toInputDate(parseFlightDate(scheduleStaDate)), [scheduleStaDate]);
  const scheduleStdYmd = useMemo(() => toInputDate(parseFlightDate(scheduleStdDate)), [scheduleStdDate]);

  const staDateParsed = useMemo(() => parseFlightDate(scheduleStaDate), [scheduleStaDate]);
  const staTimeMinutes = useMemo(() => parseTimeToMinutes(scheduleStaTime || ''), [scheduleStaTime]);
  const stdDateParsed = useMemo(() => parseFlightDate(scheduleStdDate), [scheduleStdDate]);
  const stdTimeMinutes = useMemo(() => parseTimeToMinutes(scheduleStdTime || ''), [scheduleStdTime]);
  const ataDateParsed = useMemo(() => {
    if (!ataDate) return null;
    const d = parse(ataDate, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : null;
  }, [ataDate]);
  const ataTimeMinutes = useMemo(() => parseTimeToMinutes(ataTime), [ataTime]);
  const atdDateParsed = useMemo(() => {
    if (!atdDate) return null;
    const d = parse(atdDate, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : null;
  }, [atdDate]);
  const atdTimeMinutes = useMemo(() => parseTimeToMinutes(atdTime), [atdTime]);
  /** Turnaround: aircraft arrives (ATA) then departs (ATD). ATA calendar day must not be after ATD. */
  const ataDateExceedsAtd = useMemo(() => {
    if (!ataDateParsed || !atdDateParsed) return false;
    const ataDay = new Date(ataDateParsed.getFullYear(), ataDateParsed.getMonth(), ataDateParsed.getDate());
    const atdDay = new Date(atdDateParsed.getFullYear(), atdDateParsed.getMonth(), atdDateParsed.getDate());
    return ataDay.getTime() > atdDay.getTime();
  }, [ataDateParsed, atdDateParsed]);

  const ataError = useMemo(() => {
    if (!ataDateParsed || ataTimeMinutes == null || !staDateParsed || staTimeMinutes == null) return false;
    const ataDt = new Date(ataDateParsed.getTime());
    ataDt.setHours(Math.floor(ataTimeMinutes / 60), ataTimeMinutes % 60, 0, 0);
    const staDt = new Date(staDateParsed.getTime());
    staDt.setHours(Math.floor(staTimeMinutes / 60), staTimeMinutes % 60, 0, 0);
    const diffH = differenceInHours(staDt, ataDt);
    return diffH > 12;
  }, [ataDateParsed, ataTimeMinutes, staDateParsed, staTimeMinutes]);

  useEffect(() => {
    if (cancelled) {
      setDepartureStatusManuallySet(false);
      if (departureStatus !== 'Cancelled') setDepartureStatus('Cancelled');
      return;
    }
    if (departureStatusManuallySet) return;
    if (!atdDateParsed || atdTimeMinutes == null || !stdDateParsed || stdTimeMinutes == null) return;

    const atdDt = new Date(atdDateParsed.getTime());
    atdDt.setHours(Math.floor(atdTimeMinutes / 60), Math.floor(atdTimeMinutes % 60), 0, 0);

    const stdDt = new Date(stdDateParsed.getTime());
    stdDt.setHours(Math.floor(stdTimeMinutes / 60), Math.floor(stdTimeMinutes % 60), 0, 0);

    const diffMs = atdDt.getTime() - stdDt.getTime();
    const autoStatus = diffMs > 0 ? 'Delay' : diffMs < 0 ? 'Early' : 'On Time';
    if (departureStatus !== autoStatus) setDepartureStatus(autoStatus);
  }, [
    cancelled,
    atdDateParsed,
    atdTimeMinutes,
    stdDateParsed,
    stdTimeMinutes,
    departureStatus,
    departureStatusManuallySet,
  ]);

  const updateDepartureRow = (i: number, field: keyof DelayRow, value: string | boolean) => {
    setDepartureRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };
  const updateArrivalRow = (i: number, field: keyof DelayRow, value: string | boolean) => {
    setArrivalRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  // Arrival / Departure Delay totals = sum of Delay column in each reason table.
  useEffect(() => {
    setDepartureDelay(sumMainDetailsDelayRows(departureRows));
  }, [departureRows]);

  useEffect(() => {
    setArrivalDelay(sumMainDetailsDelayRows(arrivalRows));
  }, [arrivalRows]);

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
        } else {
          setScheduleFromRaw(null);
        }
      })
      .catch(() => setScheduleFromRaw(null));
  }, [flight?.slNo]);

  useEffect(() => {
    setLoggedInUser(getLoggedInUserName());
  }, []);

  useEffect(() => {
    mainDetailsEmbedBaselineRef.current = null;
  }, [flight.slNo, flight.legacySlNo]);

  useEffect(() => {
    let mounted = true;

    async function fetchMainDetails() {
      const serial = nsFormSerialForFlight(flight);
      if (!serial?.trim()) {
        if (mounted) {
          setRoute((flight.route ?? '').trim());
          setIsLoadingDb(false);
        }
        return;
      }

      try {
        let raw: unknown = null;

        const fhrDoc = await fetchFhrCollectionFlightLean(serial);
        const fhrMain =
          fhrDoc && isPlainRecord(fhrDoc.mainDetails) ? fhrDoc.mainDetails : null;
        if (fhrMain && Object.keys(fhrMain).length > 0) {
          raw = fhrMain;
          mainDetailsEmbedBaselineRef.current = cloneMainDetailsBaseline(fhrMain);
        }

        if (raw == null) {
          const url = getNsRawFormSavedUrl('main-details', serial);
          const res = await fetch(url);
          if (res.ok) {
            const nsRaw: unknown = await res.json();
            raw = nsRaw;
            if (isPlainRecord(nsRaw)) {
              mainDetailsEmbedBaselineRef.current = cloneMainDetailsBaseline(nsRaw);
            }
          }
        }

        if (!mounted) return;

        if (raw == null) {
          setRoute((flight.route ?? '').trim());
          setIsLoadingDb(false);
          return;
        }

        const data = normalizeMainDetailsData(raw);
        if (!data) {
          setRoute((flight.route ?? '').trim());
          setIsLoadingDb(false);
          return;
        }

        setDbData(data);
        onMainDetailsLoaded?.(data);

        // Helper: server sends dd/MM/yyyy, dd-MM-yyyy, or yyyy-MM-dd; date inputs need yyyy-MM-dd
        const toInputDateFromServer = (dateStr: string | undefined): string => {
          if (!dateStr?.trim()) return '';
          const s = dateStr.trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          const parsed = parseFlightDate(s);
          return toInputDate(parsed);
        };

        // Populate form state from server response
        setOperationSplit(Boolean(data.ifOperationSplit));
        setArrivalFlightNo(data.arrivalFlightNo ?? '');
        setDepartureFlightNo(data.departureFlightNo ?? '');
        setStdLessThanSta(Boolean(data.stdLessThanSta));

        setAtaDate(toInputDateFromServer(data.ataDate) || scheduleStaYmd || '');
        setAtaTime(data.ataTime ? toInputTime(data.ataTime) : '');
        setAtdDate(toInputDateFromServer(data.atdDate) || scheduleStdYmd || '');
        setAtdTime(data.atdTime ? toInputTime(data.atdTime) : toInputTime(scheduleStdTime));
        setEtdDate(toInputDateFromServer(data.etdDate) || scheduleStdYmd || '');
        setEtdTime(data.etdTime ? toInputTime(data.etdTime) : toInputTime(scheduleStdTime));

        setRegnNo(String(data.regnNo ?? '').trim().toUpperCase());
        setTerminalCode(String(data.terminalCode ?? '').trim() || TERMINAL_OPTIONS[0]);
        // Route is schedule-owned — never editable on Main Details.
        setRoute(
          (flight.route ?? '').trim() || (data.route ?? '').trim(),
        );
        setOps(data.ops ?? ops);
        setFlightCategory(
          usableFlightCategory(data.flightCategory) ||
            usableFlightCategory(flight.cateOfFlight) ||
            'International',
        );
        setNightHalt(Boolean(data.stationBaseNightHalt));
        setAircraftBody(data.aircraftBody ?? aircraftBody);
        setReturnToRamp(Boolean(data.returnToRamp));
        setArrivalDelay(data.arrivalDelay ? toInputTimeWithSeconds(data.arrivalDelay) : '00:00:00');
        setDepartureStatus(data.departureStatus ?? '');
        setDepartureStatusManuallySet(Boolean((data.departureStatus ?? '').trim()));
        setDepartureDelay(data.departureDelay ? toInputTimeWithSeconds(data.departureDelay) : '00:00:00');
        setGhRep(data.ghRep ?? '');
        setAirlineRep(data.airlineRep ?? '');
        setShareFhrToAirline(Boolean(data.shareFhrToAirline));
        setShareReportsToGhRep(Boolean(data.shareReportsToGhRep));
        // Cancel/reopen button state is sourced from `flight_cancellations` endpoint.

        const departureFromServer: DelayRow[] = Array.isArray(data.departureDelays)
          ? data.departureDelays.map((d: DelayEntry) => ({
              delay: d.delay ? toInputTimeWithSeconds(d.delay) : '00:00:00',
              reason: d.reasonOfDelay ?? '',
              gh: Boolean(d.gh),
              oth: Boolean(d.oth),
            }))
          : [];
        setDepartureRows(normalizeMainDetailsDelayRows(departureFromServer));

        const arrivalFromServer: DelayRow[] = Array.isArray(data.arrivalDelays)
          ? data.arrivalDelays.map((d: DelayEntry) => ({
              delay: d.delay ? toInputTimeWithSeconds(d.delay) : '00:00:00',
              reason: d.reasonOfDelay ?? '',
              gh: Boolean(d.gh),
              oth: Boolean(d.oth),
            }))
          : [];
        setArrivalRows(normalizeMainDetailsDelayRows(arrivalFromServer));
      } catch (err) {
        console.error('Failed to load main details', err);
      } finally {
        setIsLoadingDb(false);
      }
    }

    fetchMainDetails();

    return () => {
      mounted = false;
    };
  }, [flight.slNo, flight.legacySlNo, scheduleStaYmd, scheduleStdYmd, scheduleStdTime]);

  useEffect(() => {
    if (isLoadingDb) return;
    const hasSavedAtaDate = Boolean(dbData?.ataDate?.trim());
    const hasSavedAtdDate = Boolean(dbData?.atdDate?.trim());
    const hasSavedEtdDate = Boolean(dbData?.etdDate?.trim());
    if (!hasSavedAtaDate && scheduleStaYmd) setAtaDate(scheduleStaYmd);
    if (!hasSavedAtdDate && scheduleStdYmd) setAtdDate(scheduleStdYmd);
    if (!hasSavedEtdDate && scheduleStdYmd) setEtdDate(scheduleStdYmd);
  }, [isLoadingDb, dbData, scheduleStaYmd, scheduleStdYmd]);

  useEffect(() => {
    let mounted = true;
    async function fetchCancellationStatus() {
      const serial = nsFormSerialForFlight(flight);
      if (!serial) return;
      try {
        const status = await fetchFlightCancellationStatus(serial);
        if (!mounted) return;
        setCancelled(Boolean(status.isCancelled));
      } catch {
        // Keep current state if status API is temporarily unavailable.
      }
    }
    void fetchCancellationStatus();
    return () => {
      mounted = false;
    };
  }, [flight.slNo, flight.legacySlNo]);

  useEffect(() => {
    let mounted = true;
    async function loadTerminalOptions() {
      const codes = await fetchAdvanceTerminalCodes(TERMINAL_OPTIONS);
      if (!mounted || codes.length === 0) return;
      setTerminalOptions(codes);
      setTerminalCode((prev) => (codes.includes(prev) ? prev : codes[0]));
    }
    loadTerminalOptions();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!terminalOptions.length) return;
    setTerminalCode((prev) => (terminalOptions.includes(prev) ? prev : terminalOptions[0]));
  }, [terminalOptions]);

  const loadGhRepOptions = useCallback(async () => {
    if (ghRepOptionsLoadedRef.current) return;
    setGhRepOptionsLoading(true);
    try {
      const list = (await advanceList(ADVANCE_PATHS.ghrep)) as Record<
        string,
        unknown
      >[];
      setGhRepMasterList(
        list.map(mapGhRepMasterRow).filter((row): row is GhRepMasterRow => row != null),
      );
      ghRepOptionsLoadedRef.current = true;
    } catch {
      setGhRepMasterList([]);
    } finally {
      setGhRepOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGhRepOptions();
  }, [loadGhRepOptions]);

  const ghRepComboOptions = useMemo(
    (): SearchableComboOption[] => buildGhRepComboOptions(ghRepMasterList),
    [ghRepMasterList],
  );

  const loadAirlineRepOptions = useCallback(async () => {
    // Refresh on every dropdown open so representatives added on
    // Advance → Airline Contacts appear without a page reload.
    if (airlineRepOptionsFetchingRef.current) return;
    airlineRepOptionsFetchingRef.current = true;
    setAirlineRepOptionsLoading(true);
    try {
      const list = (await advanceList(ADVANCE_PATHS.contact)) as Record<string, unknown>[];
      setAirlineRepMasterList(
        list
          .map(mapAirlineContactMasterRow)
          .filter((row): row is AirlineContactMasterRow => row != null),
      );
      airlineRepOptionsLoadedRef.current = true;
    } catch {
      // Keep whatever was loaded before; only clear when nothing ever loaded.
      if (!airlineRepOptionsLoadedRef.current) setAirlineRepMasterList([]);
    } finally {
      airlineRepOptionsFetchingRef.current = false;
      setAirlineRepOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAirlineRepOptions();
  }, [loadAirlineRepOptions]);

  const displayAirlineForRep =
    String(dbData?.airlineName ?? '').trim() || flight.airline;
  const flightAirlineCodeForRep =
    String(dbData?.airlineCode ?? '').trim() ||
    String((flight as { airlineCode?: string }).airlineCode ?? '').trim();

  const airlineRepComboOptions = useMemo((): SearchableComboOption[] => {
    const normalizeAirlineKey = (value: string): string =>
      value.trim().replace(/\s+/g, ' ').toLowerCase();
    // Match a contact row by flight airline name OR airline code, so rows
    // saved with either form ("IndiGo" / "6E") stay visible for this flight.
    const flightAirlineKeys = new Set(
      [displayAirlineForRep, flightAirlineCodeForRep]
        .map(normalizeAirlineKey)
        .filter(Boolean),
    );
    const seen = new Set<string>();
    const options: SearchableComboOption[] = [];
    for (const row of airlineRepMasterList) {
      const name = row.airlineRepresentative.trim();
      if (!name) continue;
      const rowAirline = normalizeAirlineKey(row.airline);
      if (flightAirlineKeys.size > 0 && rowAirline && !flightAirlineKeys.has(rowAirline))
        continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        id: row.id,
        label: name,
        description: row.airline ? `Airline: ${row.airline}` : row.email || undefined,
        searchIndex: `${name} ${row.airline} ${row.email}`.toLowerCase(),
        airlineRepresentative: name,
        airline: row.airline,
      });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [airlineRepMasterList, displayAirlineForRep, flightAirlineCodeForRep]);

  /** Route locked to schedule/creation routing — keep in sync when flight merges. */
  useEffect(() => {
    const r = (flight.route ?? '').trim();
    if (!r) return;
    setRoute(r);
  }, [flight.route]);

  useEffect(() => {
    if (!showCancelConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCancelConfirm(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showCancelConfirm]);

  // Same Sl.No as scheduled airlines table / sidebar (strip decorative FL- only).
  const displaySerial = displayScheduledAirlinesTableSerial(flight);
  const displayAirline =
    String(dbData?.airlineName ?? '').trim() || flight.airline;
  const displayFlightCode =
    String(dbData?.flightCode ?? '').trim() || flight.flightNo;
  const flightId = String(flight.slNo || '').trim();

  const authHeaders = () => {
    return {
      'Content-Type': 'application/json',
    };
  };

  const resetCancelFlow = () => {
    setOtp('');
    setOtpSent(false);
    setFinalOtp('');
    setFinalOtpSent(false);
    setIntimationTime('');
    setIntimatedBy('');
    setIntimationPersonEmail('');
    setIntimationMode('');
    setProofNote('');
    setProofAttachment(null);
    setStepOnePurposeUsed(null);
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });

  const onProofFileChange = async (file: File | null) => {
    if (!file) {
      setProofAttachment(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      scheduleThemedToast.error('File size should be less than 5 MB.');
      return;
    }
    try {
      const base64 = await readFileAsBase64(file);
      setProofAttachment({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64,
      });
    } catch (err) {
      scheduleThemedToast.error(getErrorMessage(err, 'Failed to process file.'));
    }
  };

  const sendStepOneOtp = async () => {
    if (!flightId) {
      scheduleThemedToast.error('Flight identifier missing. Unable to send OTP.');
      return;
    }
    setIsCancelBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const otpPurpose = otpFlowMode === 'reopen' ? 'reopen-step-1' : 'cancel-step-1';
      const res = await fetch(`${base}/auth/send-otp`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ flightId, purpose: otpPurpose }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'Failed to send OTP');
      }
      setOtpSent(true);
      setStepOnePurposeUsed(otpPurpose);
      scheduleThemedToast.success('OTP sent to admin email');
    } catch (e) {
      scheduleThemedToast.error(e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setIsCancelBusy(false);
    }
  };

  const verifyStepOneOtp = async () => {
    if (!flightId) {
      scheduleThemedToast.error('Flight identifier missing. Unable to verify OTP.');
      return;
    }
    if (!otpSent || !stepOnePurposeUsed) {
      scheduleThemedToast.error('Please send OTP first.');
      return;
    }
    if (!/^\d{6}$/.test(otp)) return;
    setIsCancelBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const res = await fetch(`${base}/auth/verify-otp`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          flightId,
          purpose: stepOnePurposeUsed,
          otp,
          flightSnapshot: {
            airlineName: displayAirline,
            serialNumber: displaySerial,
            flightNo: displayFlightCode,
            aircraftType: flight.aircraft,
            airlineRepresentativeName: airlineRep,
            route: (route || flight.route || '').trim(),
            staDate: scheduleStaDate,
            staTime: scheduleStaTime,
            stdDate: scheduleStdDate,
            stdTime: scheduleStdTime,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'OTP verification failed');
      }
      if (otpFlowMode === 'reopen') {
        setCancelled(false);
        onCancelledChange?.(false);
        setStep('main');
        resetCancelFlow();
        scheduleThemedToast.success('Flight reopened successfully');
      } else {
        scheduleThemedToast.success('OTP verified — continue with intimation');
        setStep('intimation');
      }
    } catch (e) {
      scheduleThemedToast.error(e instanceof Error ? e.message : 'OTP verification failed');
    } finally {
      setIsCancelBusy(false);
    }
  };

  const sendFinalOtp = async () => {
    if (!flightId) {
      scheduleThemedToast.error('Flight identifier missing. Unable to send OTP.');
      return;
    }
    setIsCancelBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const res = await fetch(`${base}/auth/send-otp`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ flightId, purpose: 'cancel-step-2' }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'Failed to send final OTP');
      }
      setFinalOtpSent(true);
      scheduleThemedToast.success('Final OTP sent to admin email');
    } catch (e) {
      scheduleThemedToast.error(e instanceof Error ? e.message : 'Failed to send final OTP');
    } finally {
      setIsCancelBusy(false);
    }
  };

  const submitIntimation = async () => {
    if (!intimationTime.trim() || !intimatedBy.trim() || !intimationMode.trim()) {
      scheduleThemedToast.error('Please fill Intimation time, Intimated by, and Intimation mode.');
      return;
    }
    const emailErr = email(intimationPersonEmail, 'Intimation person email');
    if (applyIntimationEmailErrors(emailErr ? { intimationPersonEmail: emailErr } : {})) {
      return;
    }
    await sendFinalOtp();
  };

  const verifyFinalOtpAndCancel = async () => {
    if (!flightId) {
      scheduleThemedToast.error('Flight identifier missing. Unable to verify OTP.');
      return;
    }
    if (!/^\d{6}$/.test(finalOtp)) return;
    setIsCancelBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const res = await fetch(`${base}/auth/verify-otp`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          flightId,
          purpose: 'cancel-step-2',
          otp: finalOtp,
          cancellationForm: {
            intimationTime,
            intimatedBy,
            intimationPersonEmail,
            intimationMode,
            proofNote,
            attachment: proofAttachment,
          },
          flightSnapshot: {
            airlineName: displayAirline,
            serialNumber: displaySerial,
            flightNo: displayFlightCode,
            aircraftType: flight.aircraft,
            airlineRepresentativeName: airlineRep,
            route: (route || flight.route || '').trim(),
            staDate: scheduleStaDate,
            staTime: scheduleStaTime,
            stdDate: scheduleStdDate,
            stdTime: scheduleStdTime,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'Final OTP verification failed');
      }
      const cancelledDateYmd = String(json.cancelledDate ?? scheduleStaYmd ?? '').trim();
      if (cancelledDateYmd) {
        stashCancellationHistoryFocusDate(cancelledDateYmd);
        if (json.cancellationId) {
          stashCancellationHistoryHighlight(String(json.cancellationId));
        }
      }
      setCancelled(true);
      onCancelledChange?.(true);
      setStep('main');
      resetCancelFlow();
      scheduleThemedToast.success('Flight cancelled successfully');
    } catch (e) {
      scheduleThemedToast.error(e instanceof Error ? e.message : 'Final OTP verification failed');
    } finally {
      setIsCancelBusy(false);
    }
  };

  // Regn locked: Advance Gateway Aircraft Registration (unique airline+aircraft match).
  // Fall back to previously saved Main Details when master has 0 or many matches.
  useEffect(() => {
    if (isLoadingDb) return;
    let mounted = true;

    async function resolveRegnNo() {
      const saved = String(dbData?.regnNo ?? '').trim().toUpperCase();
      const airline = (displayAirline || '').trim();
      const aircraft = (flight.aircraft || '').trim();
      if (!airline || !aircraft) {
        if (mounted) setRegnNo(saved);
        return;
      }

      setIsRegnAutoLoading(true);
      try {
        const list = (await advanceList(
          ADVANCE_PATHS.aircraftRegistration,
        )) as Record<string, unknown>[];
        if (!mounted) return;

        const airlineKey = keyify(airline);
        const aircraftKeys = new Set(aircraftTypeMatchKeys(aircraft));
        const matches = list
          .map((doc) => advanceDocId(doc))
          .filter((d) => {
            if (d.active === false) return false;
            if (keyify(String(d.airline ?? '')) !== airlineKey) return false;
            const masterAircraftKeys = aircraftTypeMatchKeys(
              String(d.aircraft ?? ''),
            );
            return masterAircraftKeys.some((k) => aircraftKeys.has(k));
          });

        const uniqueRegns = [
          ...new Set(
            matches
              .map((d) => String(d.regnNo ?? '').trim().toUpperCase())
              .filter(Boolean),
          ),
        ];

        setRegnNo(uniqueRegns.length === 1 ? (uniqueRegns[0] ?? '') : saved);
      } catch {
        if (mounted) setRegnNo(saved);
      } finally {
        if (mounted) setIsRegnAutoLoading(false);
      }
    }

    void resolveRegnNo();
    return () => {
      mounted = false;
    };
  }, [isLoadingDb, displayAirline, flight.aircraft, dbData?.regnNo]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Signatures are optional at save time — any FRIS role can sign later.
    // Other Main Details fields must still persist when filled.
    const next: FieldErrors<MainSaveField> = {};
    if (ataDateExceedsAtd) {
      next.ataDate = 'ATA date cannot be later than ATD date.';
    }
    const ataErr = time24(ataTime, 'ATA time');
    if (ataErr) next.ataTime = ataErr;
    const atdErr = time24(atdTime, 'ATD time');
    if (atdErr) next.atdTime = atdErr;

    // Departure status must match the ATD vs STD deviation.
    // Only validate when both ATD and STD are fully set and the flight isn't cancelled.
    if (
      !cancelled &&
      departureStatus &&
      departureStatus !== 'Cancelled' &&
      atdDateParsed &&
      atdTimeMinutes != null &&
      stdDateParsed &&
      stdTimeMinutes != null
    ) {
      const atdDt = new Date(atdDateParsed.getTime());
      atdDt.setHours(Math.floor(atdTimeMinutes / 60), Math.floor(atdTimeMinutes % 60), 0, 0);
      const stdDt = new Date(stdDateParsed.getTime());
      stdDt.setHours(Math.floor(stdTimeMinutes / 60), Math.floor(stdTimeMinutes % 60), 0, 0);
      const diffMs = atdDt.getTime() - stdDt.getTime();
      const expected = diffMs > 0 ? 'Delay' : diffMs < 0 ? 'Early' : 'On Time';
      if (departureStatus !== expected) {
        next.departureStatus = `Departure status must be "${expected}" based on ATD vs STD deviation.`;
      }
    }

    if (applySaveErrors(next)) return;

    setIsSaving(true);

    // CreateMainDetailsDto + Mongo paths (whitelist keeps only these server keys)
    const airlineName = displayAirline.trim() || flight.airline.trim() || '-';
    const arlineCode =
      String(dbData?.airlineCode ?? '').trim() ||
      String((flight as { airlineCode?: string }).airlineCode ?? '').trim() ||
      '-';
    const depFlt =
      departureFlightNo.trim() ||
      (operationSplit ? '' : displayFlightCode.trim() || flight.flightNo.trim());
    const arrFlt =
      arrivalFlightNo.trim() ||
      (operationSplit ? '' : displayFlightCode.trim() || flight.flightNo.trim());

    const payload = {
      Airline: airlineName,
      Arline_Code: arlineCode,
      ifOperationSplit: operationSplit,
      ArrivalFltNo: arrFlt,
      DepartureFltNo: depFlt,
      stdLessThanSta,
      ATADate: ataDate,
      ATATime: ataTime,
      ATDDate: atdDate,
      ATDTime: atdTime,
      etdDate,
      ETDtime: etdTime,

      Regn: regnNo,
      Terminal: terminalCode,
      Route: route,
      Typeofflight: ops,
      TypeofHandling: String(flight.typeOfHandling ?? '').trim(),
      Cate_of_Flight: usableFlightCategory(flightCategory) || 'International',
      stationBaseNightHalt: nightHalt,

      TypeCraft: (flight.aircraft ?? '').trim(),
      aircraftBody,

      returnToRamp,
      ActualDelay: arrivalDelay,
      departureStatus,
      departureDelay,

      departureDelays: departureRows
        .filter((r) => r.delay || r.reason)
        .map((r) => ({
          Delay: r.delay,
          ReasonofDelay: r.reason,
          gh: r.gh,
          oth: r.oth,
        })),

      arrivalDelays: arrivalRows
        .filter((r) => r.delay || r.reason)
        .map((r) => ({
          Delay: r.delay,
          ReasonofDelay: r.reason,
          gh: r.gh,
          oth: r.oth,
        })),

      airrep: airlineRep,
      PAX_Airline_SignByDate: ghRep,
      shareFhrToAirline,
      shareReportsToGhRep,
      flightCancelled: cancelled,
    };

    const serial = nsFormSerialForFlight(flight);
    const serialNum = operationalSerialFromFlightKey(serial);
    if (!serial?.trim() || serialNum == null) {
      scheduleThemedToast.error('Invalid flight serial — cannot save main details.');
      setIsSaving(false);
      return;
    }

    const baseline = mainDetailsEmbedBaselineRef.current ?? {};
    const mergedMainDetails: Record<string, unknown> = {
      ...baseline,
      ...payload,
      SerialNo: serialNum,
      flightSerialNumber: serialNum,
    };

    try {
      const savedDoc = await putFhrCollectionFlightMerge(
        serial,
        { mainDetails: mergedMainDetails },
        'scheduled_main_details_form',
      );

      const mdRaw = savedDoc.mainDetails;
      if (isPlainRecord(mdRaw)) {
        mainDetailsEmbedBaselineRef.current = cloneMainDetailsBaseline(mdRaw);
      }
      const normalizedSaved = normalizeMainDetailsData(
        isPlainRecord(mdRaw) ? mdRaw : { ...payload, SerialNo: serialNum, flightSerialNumber: serialNum },
      );
      if (normalizedSaved) {
        setDbData(normalizedSaved);
        onMainDetailsLoaded?.(normalizedSaved);
      }
      onCancelledChange?.(cancelled);

      scheduleThemedToast.success('Flight details saved successfully');
      onFhrLocksMayHaveChanged?.(String(flight.slNo ?? '').trim());
    } catch (err: any) {
      console.error(err);
      scheduleThemedToast.error(getErrorMessage(err, 'Something went wrong'));
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all duration-200 hover:border-emerald-400 hover:shadow-sm active:scale-[0.98]';
  const selectClass =
    'w-full px-3 py-2.5 pr-9 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all duration-200 hover:border-emerald-400 hover:shadow-sm appearance-none cursor-pointer active:scale-[0.98]';
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1.5 transition-colors duration-200 group-hover:text-emerald-600';

  const radioClass = 'w-4 h-4 text-emerald-600 focus:ring-emerald-500 transition-all duration-200 hover:scale-110';
  const checkboxClass = 'w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 transition-all duration-200 hover:scale-110 hover:border-emerald-400';

  return (
    <div className="flex h-full min-w-0 flex-col bg-gradient-to-br from-gray-50 to-white animate-fadeIn">
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-flight-confirm-title"
            aria-describedby="cancel-flight-confirm-desc"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xl shadow-gray-900/15 ring-1 ring-emerald-500/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1.5 bg-gradient-to-r from-amber-400 via-rose-400 to-rose-500" />
            <div className="p-6 md:p-7">
              <div className="mb-5 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-red-600 shadow-md shadow-rose-500/25">
                  <AlertTriangle className="h-6 w-6 text-white" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                    Scheduled airlines · {cancelled ? 'reopen' : 'cancellation'}
                  </p>
                  <h2
                    id="cancel-flight-confirm-title"
                    className="mt-1 text-lg font-bold text-gray-900"
                  >
                    {cancelled ? 'Reopen this flight?' : 'Cancel this flight?'}
                  </h2>
                  <p
                    id="cancel-flight-confirm-desc"
                    className="mt-2 text-sm leading-relaxed text-gray-600"
                  >
                    You are about to start the {cancelled ? 'reopen' : 'cancellation'} flow for{' '}
                    <span className="font-semibold text-gray-900">{displayFlightCode}</span>
                    {displaySerial && displaySerial !== '—' ? (
                      <>
                        {' '}
                        <span className="text-gray-500">(Sl. No. {displaySerial})</span>
                      </>
                    ) : null}
                    . An OTP will be sent to the admin email on the next step.
                  </p>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50/60"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelConfirm(false);
                    resetCancelFlow();
                    setOtpFlowMode(cancelled ? 'reopen' : 'cancel');
                    setStep('otp');
                  }}
                  className="rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-500/25 transition-all hover:from-rose-700 hover:to-red-700"
                >
                  Continue to OTP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="shrink-0 flex items-center gap-2 border-b border-gray-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm md:px-6">
        {showBackButton && (
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-gray-100 transition-all duration-200 hover:scale-105 active:scale-95 group"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 group-hover:text-emerald-600 transition-colors" />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg shadow-sm">
            <Plane className="w-5 h-5 text-white transform -rotate-45" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Main Details</h2>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {cancelled ? (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-3 py-1.5 text-xs font-semibold text-rose-800 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50"
            >
              <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Cancelled (click to reopen)
            </button>
          ) : step === 'main' ? (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition-all hover:border-rose-300 hover:bg-rose-50 hover:shadow-md"
            >
              <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Cancel Flight
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setStep('main');
                resetCancelFlow();
              }}
              className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50/60"
            >
              Back to Main Details
            </button>
          )}
        </div>
      </div>
      <form onSubmit={handleSave} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 md:px-6">
        <div className="w-full min-w-0 animate-slideUp">
        {step === 'otp' && (
          <div className="flex justify-center items-start py-8 px-2">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-xl shadow-gray-200/40 ring-1 ring-emerald-500/10">
              <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500" />
              <div className="p-6 md:p-8">
                <div className="mb-6 flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md shadow-emerald-500/30">
                    <ShieldCheck className="h-6 w-6 text-white" aria-hidden />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                      Scheduled airlines · {otpFlowMode === 'reopen' ? 'reopen' : 'cancellation'}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-gray-900">Verify your identity</h2>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                      We sent a one-time password to the admin email. Enter it below to continue
                      {otpFlowMode === 'reopen' ? ' reopening this flight.' : ' to intimation details.'}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-600">
                      6-digit OTP
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-center text-lg font-mono tracking-[0.35em] focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="••••••"
                    />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={sendStepOneOtp}
                      disabled={isCancelBusy}
                      className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm transition-all hover:bg-emerald-50 hover:shadow disabled:opacity-60"
                    >
                      Send OTP
                    </button>
                    <button
                      type="button"
                      onClick={verifyStepOneOtp}
                      disabled={!otpSent || otp.length !== 6 || isCancelBusy}
                      className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60 disabled:shadow-none"
                    >
                      {otpFlowMode === 'reopen' ? 'Verify OTP & reopen flight' : 'Verify OTP'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'intimation' && (
          <div className="flex justify-center items-start py-8 px-2">
            <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-xl shadow-gray-200/40 ring-1 ring-emerald-500/10">
              <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400" />
              <div className="p-6 md:p-8">
                <div className="mb-6 flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-500/25">
                    <Ban className="h-6 w-6 text-white" aria-hidden />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                      Step 2 · Intimation
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-gray-900">Intimation details</h2>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                      Record how the airline was intimated, then confirm with the final OTP to complete
                      cancellation.
                    </p>
                  </div>
                </div>

                <IntimationForm
                  flight={flight}
                  intimationTime={intimationTime}
                  intimatedBy={intimatedBy}
                  intimationPersonEmail={intimationPersonEmail}
                  intimationMode={intimationMode}
                  proofNote={proofNote}
                  proofAttachment={proofAttachment}
                  onIntimationTimeChange={setIntimationTime}
                  onIntimatedByChange={setIntimatedBy}
                  onIntimationPersonEmailChange={(v) => {
                    setIntimationPersonEmail(v);
                    clearIntimationEmailField('intimationPersonEmail');
                  }}
                  onIntimationModeChange={setIntimationMode}
                  onProofNoteChange={setProofNote}
                  onProofFileChange={onProofFileChange}
                />
                {intimationEmailErrors.intimationPersonEmail && (
                  <p
                    id="field-intimationPersonEmail-error"
                    role="alert"
                    className="mt-2 text-xs text-red-600"
                  >
                    {intimationEmailErrors.intimationPersonEmail}
                  </p>
                )}

                <div className="mt-8 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/40 p-5 shadow-sm">
                  <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <AlertCircle className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    Final OTP confirmation
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-gray-600">
                        Final 6-digit OTP
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={finalOtp}
                        onChange={(e) => setFinalOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full rounded-xl border border-emerald-200/80 bg-white px-4 py-3 text-center text-lg font-mono tracking-[0.35em] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="••••••"
                      />
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void submitIntimation()}
                        disabled={isCancelBusy}
                        className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm transition-all hover:bg-emerald-50 disabled:opacity-60"
                      >
                        Submit intimation & send OTP
                      </button>
                      <button
                        type="button"
                        onClick={verifyFinalOtpAndCancel}
                        disabled={!finalOtpSent || finalOtp.length !== 6 || isCancelBusy}
                        className="rounded-xl border-2 border-rose-200 bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-500/20 transition-all hover:from-rose-700 hover:to-red-700 disabled:opacity-60 disabled:shadow-none"
                      >
                        Verify OTP & cancel flight
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end border-t border-gray-100 pt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('main');
                      resetCancelFlow();
                    }}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50/50"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'main' && (
        <div className="space-y-6">

        {/* Flight identification header */}
        <section className="min-w-0 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-200/80 to-gray-300/80 px-4 py-3 transition-all duration-300 hover:shadow-sm">
          <div className={MAIN_DETAILS_H_SCROLL_CLASS}>
            <div className="flex w-max min-w-full gap-3 pb-0.5 text-sm font-semibold text-gray-800">
            <span className="shrink-0 rounded-lg bg-white/70 px-3 py-1 backdrop-blur-sm">SNo: {displaySerial}</span>
            <span className="flex shrink-0 items-center gap-2 rounded-lg bg-white/70 px-3 py-1 backdrop-blur-sm">
              <Plane className="w-3 h-3" />
              {displayAirline}
            </span>
            <span className="shrink-0 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-500/10 to-emerald-600/10 px-3 py-1 text-emerald-700">
              {displayFlightCode}
            </span>
            <span className="shrink-0 rounded-lg border border-gray-200 bg-white/80 px-3 py-1 text-xs font-medium text-gray-700">
              STA: {scheduleStaDate || '—'} {scheduleStaTime || ''}
            </span>
            <span className="shrink-0 rounded-lg border border-gray-200 bg-white/80 px-3 py-1 text-xs font-medium text-gray-700">
              STD: {scheduleStdDate || '—'} {scheduleStdTime || ''}
            </span>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">Schedule times match the scheduled airlines table (read-only).</p>
        </section>

        {/* If Operation is split */}
        <section className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 space-y-3 group hover:border-emerald-100">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={operationSplit}
              onChange={(e) => setOperationSplit(e.target.checked)}
              className={checkboxClass}
            />
            <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-700 transition-colors">If Operation is split</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="group">
              <label className={`${labelClass} ${!operationSplit ? 'text-gray-400' : ''}`}>Arrival Flight No</label>
              <input
                type="text"
                value={arrivalFlightNo}
                onChange={(e) => setArrivalFlightNo(e.target.value)}
                className={`${inputClass} ${!operationSplit ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                placeholder="Enter arrival flight"
                disabled={!operationSplit}
              />
              <FormFieldError />
            </div>
            <div className="group">
              <label className={`${labelClass} ${!operationSplit ? 'text-gray-400' : ''}`}>Departure Flight No</label>
              <input
                type="text"
                value={departureFlightNo}
                onChange={(e) => setDepartureFlightNo(e.target.value)}
                className={`${inputClass} ${!operationSplit ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                placeholder="Enter departure flight"
                disabled={!operationSplit}
              />
              <FormFieldError />
            </div>
          </div>
          <label className="flex items-start gap-2 cursor-pointer mt-2 group">
            <input
              type="checkbox"
              checked={stdLessThanSta}
              onChange={(e) => setStdLessThanSta(e.target.checked)}
              className={`${checkboxClass} mt-1 shrink-0`}
            />
            <span className="text-xs text-gray-600 group-hover:text-emerald-600 transition-colors">Tick if the STD is lesser than STA (applied for the nature of flight operation : departure-Arrival)</span>
          </label>
        </section>

        {ataError && (
          <div className="p-3 rounded-lg bg-gradient-to-r from-red-50 to-red-100 border border-red-200 animate-pulse">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">ATA is less than STA for more than 12 hrs, it should not accept</p>
            </div>
          </div>
        )}

        {/* Timing and registration */}
        <section className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 hover:border-emerald-100 group">
          <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2 group-hover:text-emerald-700 transition-colors">
            <Calendar className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
            Timing & Registration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* ATA — Date + Time (24h) */}
            <div className="rounded-lg border border-gray-200 bg-gradient-to-br from-slate-50/80 to-white p-3 space-y-2 hover:border-emerald-200 transition-colors">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">ATA</span>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className={labelClass} htmlFor="field-ataDate">Date</label>
                  <DatePicker
                    id="field-ataDate"
                    ariaLabel="ATA date"
                    value={ataDate}
                    onChange={(v) => {
                      setAtaDate(v);
                      clearSaveField('ataDate');
                    }}
                    valueFormat="yyyy-MM-dd"
                    maxDate={atdDateParsed ?? undefined}
                  />
                  <FormFieldError id="field-ataDate-error" message={saveErrors.ataDate} />
                  {ataDateExceedsAtd && !saveErrors.ataDate ? (
                    <p id="field-ataDate-error" className="mt-1 text-xs text-red-600" role="alert">
                      ATA date cannot be later than ATD date.
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className={labelClass}>Time (24h)</label>
                  <TimeSelect24
                    hourSelectId="field-ataTime"
                    value={ataTime}
                    onChange={(v) => {
                      setAtaTime(v);
                      clearSaveField('ataTime');
                    }}
                    className={cn('w-full min-h-[42px]', saveErrors.ataTime && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-ataTime-error" message={saveErrors.ataTime} />
                </div>
              </div>
            </div>
            {/* ATD — Date + Time (24h) */}
            <div className="rounded-lg border border-gray-200 bg-gradient-to-br from-slate-50/80 to-white p-3 space-y-2 hover:border-emerald-200 transition-colors">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">ATD</span>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className={labelClass} htmlFor="field-atdDate">Date</label>
                  <DatePicker
                    id="field-atdDate"
                    ariaLabel="ATD date"
                    value={atdDate}
                    onChange={(v) => {
                      setAtdDate(v);
                      clearSaveField('ataDate');
                    }}
                    valueFormat="yyyy-MM-dd"
                    minDate={ataDateParsed ?? undefined}
                  />
                </div>
                <div>
                  <label className={labelClass}>Time (24h)</label>
                  <TimeSelect24
                    hourSelectId="field-atdTime"
                    value={atdTime}
                    onChange={(v) => {
                      setAtdTime(v);
                      clearSaveField('atdTime');
                    }}
                    className={cn('w-full min-h-[42px]', saveErrors.atdTime && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-atdTime-error" message={saveErrors.atdTime} />
                </div>
              </div>
            </div>
            {/* ETD — Date + Time (24h) */}
            <div className="rounded-lg border border-gray-200 bg-gradient-to-br from-slate-50/80 to-white p-3 space-y-2 hover:border-emerald-200 transition-colors">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">ETD</span>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className={labelClass}>Date</label>
                  <DatePicker value={etdDate} onChange={setEtdDate} valueFormat="yyyy-MM-dd" />
                </div>
                <div>
                  <label className={labelClass}>Time (24h)</label>
                  <TimeSelect24 value={etdTime} onChange={setEtdTime} className="w-full min-h-[42px]" />
                  <FormFieldError />
                </div>
              </div>
            </div>

            <div className="group">
              <label className={labelClass}>Regn No.</label>
              <input
                type="text"
                value={regnNo}
                readOnly
                aria-readonly="true"
                className={`${inputClass} bg-gradient-to-r from-gray-50 to-gray-100 cursor-not-allowed`}
                placeholder={
                  isRegnAutoLoading
                    ? 'Loading registration...'
                    : 'From Aircraft Registration'
                }
                maxLength={10}
                autoComplete="off"
                title="Auto-filled from Advance Gateway Aircraft Registration"
              />
              <FormFieldError />
            </div>

            <div className="group">
              <label className={labelClass}>Terminal Code</label>
              <AdminRadioDropdown
                value={terminalCode}
                onChange={(v) => setTerminalCode(v)}
                options={terminalOptions}
                className={selectClass}
              />
              <FormFieldError />
            </div>

            <div className="group">
              <label className={labelClass}>Route</label>
              <input
                type="text"
                value={route}
                readOnly
                aria-readonly="true"
                className={`${inputClass} bg-gradient-to-r from-gray-50 to-gray-100 cursor-not-allowed`}
                placeholder="From schedule"
                title="Route comes from schedule and cannot be changed here"
              />
              <FormFieldError />
            </div>

            <div className="group">
              <label className={labelClass}>Ops</label>
              <AdminRadioDropdown
                value={ops}
                onChange={(v) => setOps(v)}
                options={OPS_OPTIONS}
                className={selectClass}
              />
              <FormFieldError />
            </div>

            <div className="group">
              <label className={labelClass}>Flight Category</label>
              <AdminRadioDropdown
                value={flightCategory}
                onChange={(v) => setFlightCategory(v)}
                options={FLIGHT_CATEGORY_OPTIONS}
                className={selectClass}
              />
              <FormFieldError />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer mt-4 group">
            <input
              type="checkbox"
              checked={nightHalt}
              onChange={(e) => {
                setPendingNightHalt(e.target.checked);
                setShowNightHaltConfirm(true);
              }}
              className={checkboxClass}
            />
            <span className="text-sm text-gray-700 group-hover:text-emerald-700 transition-colors">Station Base/Night Halt Flights</span>
          </label>
          <div className="flex items-center gap-2 mt-2 p-2 bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg border border-emerald-100">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">Please confirm the flight category</p>
          </div>
        </section>

        {/* Night Halt Confirmation Modal */}
        {showNightHaltConfirm && (
          <div className="fixed inset-0 z-[10060] flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm animate-fadeIn">
            <div
              className="max-w-md w-full overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xl shadow-emerald-900/10 ring-1 ring-emerald-500/10 animate-slideUp"
              role="dialog"
              aria-modal="true"
              aria-labelledby="night-halt-confirm-title"
            >
              <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400" />
              <div className="p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md">
                    <Plane className="h-5 w-5 text-white -rotate-45" aria-hidden />
                  </div>
                  <h3 id="night-halt-confirm-title" className="text-lg font-bold text-gray-900">
                    Confirm night halt
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-gray-600">
                  Are you sure you want to {pendingNightHalt ? 'mark' : 'unmark'} this flight as
                  Station Base / Night Halt?
                </p>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNightHaltConfirm(false);
                      setPendingNightHalt(nightHalt);
                    }}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNightHalt(pendingNightHalt);
                      setShowNightHaltConfirm(false);
                    }}
                    className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-emerald-700"
                  >
                    Yes, confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Aircraft details */}
        <section className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 hover:border-emerald-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="group">
              <label className={labelClass}>Aircraft Type</label>
              <input
                type="text"
                value={flight.aircraft}
                readOnly
                className={`${inputClass} bg-gradient-to-r from-gray-50 to-gray-100 cursor-not-allowed`}
              />
              <FormFieldError />
            </div>
            <div className="group">
              <label className={labelClass}>Aircraft Body</label>
              <AdminRadioDropdown
                value={aircraftBody}
                onChange={(v) => setAircraftBody(v)}
                options={AIRCRAFT_BODY_OPTIONS}
                className={selectClass}
              />
              <FormFieldError />
            </div>
          </div>
        </section>

        {/* Return to ramp, Arrival/Departure delay */}
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-300 hover:border-emerald-100 hover:shadow-md">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2 group-hover:text-emerald-700 transition-colors">
            <Clock className="w-4 h-4 text-emerald-600 group-hover:animate-pulse" />
            Delays
          </h3>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="flex h-[42px] items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={returnToRamp}
                  onChange={(e) => setReturnToRamp(e.target.checked)}
                  className={checkboxClass}
                />
                <span className="text-sm text-gray-700 group-hover:text-emerald-700 transition-colors">Return to ramp</span>
              </label>
              <FormFieldError />
            </div>
            <div className="group">
              <label className={labelClass}>Arrival Delay (24h)</label>
              <TimeSelect24
                value={arrivalDelay}
                onChange={setArrivalDelay}
                withSeconds
                disabled
                title="Sum of Arrival delay rows"
                className="min-h-[42px] cursor-default bg-gray-50"
              />
              <FormFieldError />
            </div>
            <div className="group">
              <label className={labelClass} id="field-departureStatus-label">Departure Status</label>
              <AdminRadioDropdown
                value={departureStatus}
                onChange={(v) => {
                  setDepartureStatus(v);
                  setDepartureStatusManuallySet(true);
                  clearSaveField('departureStatus');
                }}
                options={DEPARTURE_STATUS_OPTIONS}
                placeholder="Select"
                className={cn(selectClass, saveErrors.departureStatus && FRIS_INVALID_CONTROL)}
              />
              <FormFieldError id="field-departureStatus-error" message={saveErrors.departureStatus} />
            </div>
            <div className="group">
              <label className={labelClass}>Departure Delay (24h)</label>
              <TimeSelect24
                value={departureDelay}
                onChange={setDepartureDelay}
                withSeconds
                disabled
                title="Sum of Departure delay rows"
                className="min-h-[42px] cursor-default bg-gray-50"
              />
              <FormFieldError />
            </div>
          </div>
        </section>

        {/* Departure delay table */}
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-300 hover:border-emerald-100 hover:shadow-md">
          <h3 className="mb-3 text-sm font-bold text-gray-900 underline decoration-emerald-500 underline-offset-2">Departure</h3>
          <div
            className={`${MAIN_DETAILS_H_SCROLL_CLASS} rounded-lg border border-gray-200 transition-colors hover:border-emerald-300`}
            role="region"
            aria-label="Departure delay rows"
            tabIndex={0}
          >
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-gray-100 to-gray-50">
                  <th className="min-w-[7.5rem] p-2.5 text-left font-medium text-gray-700">Delay</th>
                  <th className="min-w-[12rem] p-2.5 text-left font-medium text-gray-700">Reason of delay</th>
                  <th className="w-14 p-2.5 text-left font-medium text-gray-700">GH</th>
                  <th className="w-14 p-2.5 text-left font-medium text-gray-700">OTH</th>
                </tr>
              </thead>
              <tbody>
                {departureRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-t border-gray-200 hover:bg-gradient-to-r from-emerald-50/30 to-emerald-100/10 transition-all duration-200 group"
                  >
                    <td className="p-2">
                      <TimeSelect24
                        value={row.delay}
                        onChange={(v) => updateDepartureRow(i, 'delay', v)}
                        withSeconds
                        className="w-full min-h-[38px] flex group-hover:shadow-emerald-100/50"
                      />
                    </td>
                    <td className="p-2">
                      <AdminRadioDropdown
                        value={row.reason}
                        onChange={(v) => updateDepartureRow(i, 'reason', v)}
                        options={DELAY_REASONS}
                        placeholder="Select reason"
                        clearable
                        clearLabel="Clear reason"
                        aria-label={`Departure delay row ${i + 1}: reason of delay`}
                        className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer transition-all duration-200 hover:border-emerald-400 hover:shadow-sm group-hover:shadow-emerald-100/50"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.gh}
                        onChange={(e) => updateDepartureRow(i, 'gh', e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer transition-all duration-200 hover:scale-110 hover:border-emerald-400"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.oth}
                        onChange={(e) => updateDepartureRow(i, 'oth', e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer transition-all duration-200 hover:scale-110 hover:border-emerald-400"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Arrival delay table */}
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-300 hover:border-emerald-100 hover:shadow-md">
          <h3 className="mb-3 text-sm font-bold text-gray-900 underline decoration-emerald-500 underline-offset-2">Arrival</h3>
          <div
            className={`${MAIN_DETAILS_H_SCROLL_CLASS} rounded-lg border border-gray-200 transition-colors hover:border-emerald-300`}
            role="region"
            aria-label="Arrival delay rows"
            tabIndex={0}
          >
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-gray-100 to-gray-50">
                  <th className="min-w-[7.5rem] p-2.5 text-left font-medium text-gray-700">Delay</th>
                  <th className="min-w-[12rem] p-2.5 text-left font-medium text-gray-700">Reason of delay</th>
                  <th className="w-14 p-2.5 text-left font-medium text-gray-700">GH</th>
                  <th className="w-14 p-2.5 text-left font-medium text-gray-700">OTH</th>
                </tr>
              </thead>
              <tbody>
                {arrivalRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-t border-gray-200 hover:bg-gradient-to-r from-emerald-50/30 to-emerald-100/10 transition-all duration-200 group"
                  >
                    <td className="p-2">
                      <TimeSelect24
                        value={row.delay}
                        onChange={(v) => updateArrivalRow(i, 'delay', v)}
                        withSeconds
                        className="w-full min-h-[38px] flex group-hover:shadow-emerald-100/50"
                      />
                    </td>
                    <td className="p-2">
                      <AdminRadioDropdown
                        value={row.reason}
                        onChange={(v) => updateArrivalRow(i, 'reason', v)}
                        options={DELAY_REASONS}
                        placeholder="Select reason"
                        clearable
                        clearLabel="Clear reason"
                        aria-label={`Arrival delay row ${i + 1}: reason of delay`}
                        className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer transition-all duration-200 hover:border-emerald-400 hover:shadow-sm group-hover:shadow-emerald-100/50"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.gh}
                        onChange={(e) => updateArrivalRow(i, 'gh', e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer transition-all duration-200 hover:scale-110 hover:border-emerald-400"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.oth}
                        onChange={(e) => updateArrivalRow(i, 'oth', e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer transition-all duration-200 hover:scale-110 hover:border-emerald-400"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* GH Rep, Airline Rep, Cancelled, Save */}
        <section className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 space-y-4 hover:border-emerald-100">
          <p className="text-xs text-gray-500">{REPRESENTATIVES_ACCESS_NOTE}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="group">
              <SearchableCombobox
                fieldLabel="GH Rep"
                value={ghRep}
                onChange={setGhRep}
                options={ghRepComboOptions}
                loading={ghRepOptionsLoading}
                placeholder="Search by name or employee code"
                onRequestOptions={() => void loadGhRepOptions()}
                onPickOption={(option) =>
                  setGhRep(option.employeeName?.trim() || option.label)
                }
              />
              <FormFieldError />
            </div>
            <div className="group">
              <SearchableCombobox
                fieldLabel="Airline Rep"
                value={airlineRep}
                onChange={setAirlineRep}
                options={airlineRepComboOptions}
                loading={airlineRepOptionsLoading}
                placeholder="Search airline representative"
                onRequestOptions={() => void loadAirlineRepOptions()}
                onPickOption={(option) =>
                  setAirlineRep(
                    String(option.airlineRepresentative ?? option.label).trim(),
                  )
                }
              />
              <FormFieldError />
            </div>
          </div>
          <div className="space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer group/check">
              <input
                type="checkbox"
                checked={shareFhrToAirline}
                onChange={(e) => setShareFhrToAirline(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700 group-hover/check:text-gray-900">
                Share fhr to Airline
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer group/check">
              <input
                type="checkbox"
                checked={shareReportsToGhRep}
                onChange={(e) => setShareReportsToGhRep(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700 group-hover/check:text-gray-900">
                Share fhr, gse and teams report to gh representative
              </span>
            </label>
          </div>

          <DigitalSignaturesSection
            serialKey={nsFormSerialForFlight(flight) || String(flight.slNo ?? '')}
            ghRepresentativeName={ghRep}
            airlineRepresentativeName={airlineRep}
            onStateChange={setSignatureState}
          />

          {!signatureState.isFinalized &&
            (!signatureState.ghSigned || !signatureState.airlineSigned) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs font-medium text-amber-800">
                  You can save Main Details now. Add GH / Airline signatures later
                  from Digital Signatures before finalizing the FHR.
                </p>
              </div>
            )}

          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-semibold rounded-lg hover:from-emerald-600 hover:to-emerald-700 focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save
              </>
            )}
          </button>
        </section>
        </div>
        )}
        </div>
      </form>
    </div>
  );
}