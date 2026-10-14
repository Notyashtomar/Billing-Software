'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Asterisk,
  Ban,
  Calendar,
  Clock,
  Info,
  Plane,
  Save,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/error-utils';
import { toast } from 'sonner';
import type { BaseFormProps } from './types';
import {
  ADVANCE_PATHS,
  advanceDocId,
  advanceList,
  fetchFlightsReferenceAircraft,
  fetchFlightCancellationStatus,
  saveNsRawForm,
  fetchNsRawFormData,
  fetchAdvanceTerminalCodes,
  getApiBase,
} from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import IntimationForm from '@/components/fris/flights/scheduledairlines/cancel-flight/IntimationForm';
import { adaptNonScheduledFlight } from './adaptNonScheduledFlight';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import type { SearchableComboOption } from '@/components/ui/SearchableCombobox';
import { MAIN_DETAILS_DELAY_REASONS } from '@/lib/delayReasons';
import { normalizeMainDetailsData } from '@/utils/dataProcessor';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  email,
  time24,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import { broadcastCancellationEvent } from '@/lib/cancellation-bell';
import DigitalSignaturesSection, {
  type SignatureSectionState,
} from '@/components/fris/flights/scheduledairlines/signatures/DigitalSignaturesSection';
import {
  buildGhRepComboOptions,
  mapGhRepMasterRow,
  REPRESENTATIVES_ACCESS_NOTE,
  type GhRepMasterRow,
} from '@/components/fris/flights/scheduledairlines/ghRepComboOptions';

type MainDetailsFormProps = BaseFormProps & {
  onCancelledChange?: (cancelled: boolean) => void;
};

const NS_CANCEL_KIND = 'non-scheduled' as const;
const INTIMATION_EMAIL_FIELD_ORDER = ['intimationPersonEmail'] as const;

const nsCancelToast = {
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
};

/** Normalize STA/STD display dates to YYYY-MM-DD for cancel OTP snapshot. */
function toCancelYmd(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = s.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const [d, m, y] = parts;
    return `${y}-${(m ?? '').padStart(2, '0')}-${(d ?? '').padStart(2, '0')}`;
  }
  return '';
}

const NS_MAIN_TIME_FIELD_ORDER = ['ataDate', 'ataTime', 'atdTime', 'etdTime'] as const;
type NsMainTimeField = (typeof NS_MAIN_TIME_FIELD_ORDER)[number];

/** Normalize API date to DatePicker default `dd/MM/yyyy`. */
function toMainDetailsPickerDate(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const parts = s.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const [d, m, y] = parts;
    return `${d!.padStart(2, '0')}/${m!.padStart(2, '0')}/${y}`;
  }
  return s;
}

function parseMainDetailsDay(value: string): Date | null {
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!dmy) return null;
  const day = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  if (
    day.getFullYear() !== Number(dmy[3]) ||
    day.getMonth() !== Number(dmy[2]) - 1 ||
    day.getDate() !== Number(dmy[1])
  ) {
    return null;
  }
  return day;
}

// Ops Type dropdown options
const OPS_TYPE_OPTIONS = [
  'Turnaround',
  'Transit',
  'Technical',
  'Originate',
  'Terminate',
  'Ferry In/Ferry Out',
  'Ferry In/Load Out',
  'Load In/Ferry Out',
  'Load In/Terminate',
  'Ferry In/Terminate',
  'Ferry Out Only',
  'Load Out Only',
  'Ramp Handling Only',
  'Diverted Flight',
  'Return to Ramp Flight',
];

// Terminal Code dropdown options
const TERMINAL_CODE_OPTIONS = ['AFT', 'CGO', 'T1D', 'T2', 'T3'];

// Type of Handling dropdown options
const TYPE_OF_HANDLING_OPTIONS = ['Non-Scheduled', 'Scheduled', 'Charter'];

interface AircraftOption {
  value: string;
  label: string;
  body: string;
  mtow: string;
}

interface DelayRow {
  delay: string;
  reasonOfDelay: string;
  gh: boolean;
  oth: boolean;
}

const INITIAL_FORM_DATA = {
  isOperationSplit: false,
  arrivalFlightNo: '',
  departureFlightNo: '',
  ataTime: '',
  ataDate: '',
  atdDate: '',
  atdTime: '',
  etdDate: '',
  etdTime: '',
  regnNo: '',
  terminalCode: '',
  typeOfHandling: 'Non-Scheduled',
  mtow: '',
  aircraftType: '',
  aircraftBody: '',
  opsType: '',
  freighter: false,
  medicalPassenger: false,
  returnToRamp: false,
  status: '',
  actualDelay: '',
  ghRep: '',
  flightCancelled: false,
  /** Performa / Challan number — shown on FHR preview & PDF header. */
  challanNo: '',
  /** Booking number — shown on FHR preview & PDF header. */
  bookingNo: '',
};

const INITIAL_DELAY_ROWS: DelayRow[] = [
  { delay: '', reasonOfDelay: '', gh: false, oth: false },
  { delay: '', reasonOfDelay: '', gh: false, oth: false },
  { delay: '', reasonOfDelay: '', gh: false, oth: false },
];

export default function MainDetailsForm({
  flight,
  onSave,
  onCancelledChange,
}: MainDetailsFormProps) {
  const [terminalOptions, setTerminalOptions] = useState<string[]>(TERMINAL_CODE_OPTIONS);
  const [aircraftMasterOptions, setAircraftMasterOptions] = useState<AircraftOption[]>([]);
  const [aircraftMasterLoading, setAircraftMasterLoading] = useState(true);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  const [delayRows, setDelayRows] = useState<DelayRow[]>(INITIAL_DELAY_ROWS);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const { errors, clearField, applyAndFocus } = useFieldErrors<NsMainTimeField>(NS_MAIN_TIME_FIELD_ORDER);
  const {
    errors: intimationEmailErrors,
    clearField: clearIntimationEmailField,
    applyAndFocus: applyIntimationEmailErrors,
  } = useFieldErrors<(typeof INTIMATION_EMAIL_FIELD_ORDER)[number]>(
    INTIMATION_EMAIL_FIELD_ORDER,
  );

  const [cancelled, setCancelled] = useState(Boolean(flight?.isCancelled));
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

  const [ghRepMasterList, setGhRepMasterList] = useState<GhRepMasterRow[]>([]);
  const [ghRepOptionsLoading, setGhRepOptionsLoading] = useState(false);
  const ghRepOptionsLoadedRef = useRef(false);
  const [signatureState, setSignatureState] = useState<SignatureSectionState>({
    ghSigned: false,
    airlineSigned: false,
    airlineNamePresent: false,
    isFinalized: false,
  });

  const loadGhRepOptions = useCallback(async () => {
    if (ghRepOptionsLoadedRef.current) return;
    setGhRepOptionsLoading(true);
    try {
      // One GH representative master for Scheduled and Non-Scheduled flights.
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

  const adaptedFlight = useMemo(
    () => (flight ? adaptNonScheduledFlight(flight) : null),
    [flight],
  );

  useEffect(() => {
    let mounted = true;
    async function loadTerminalOptions() {
      const codes = await fetchAdvanceTerminalCodes(TERMINAL_CODE_OPTIONS);
      if (!mounted || !codes.length) return;
      setTerminalOptions(codes);
    }
    loadTerminalOptions();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadAircraftOptions() {
      setAircraftMasterLoading(true);
      try {
        const rows = (await fetchFlightsReferenceAircraft()) as Record<string, unknown>[];
        if (!mounted) return;
        const seen = new Set<string>();
        const options: AircraftOption[] = [];
        for (const row of rows) {
          const data = advanceDocId(row);
          const value = String(data.aircraft ?? '').trim();
          const key = value.toLocaleLowerCase();
          if (!value || seen.has(key)) continue;
          seen.add(key);
          options.push({
            value,
            label: value,
            body: String(data.aircraftBody ?? '').trim(),
            mtow: String(data.mtow ?? '').trim(),
          });
        }
        setAircraftMasterOptions(options.sort((a, b) => a.label.localeCompare(b.label)));
      } catch {
        if (mounted) setAircraftMasterOptions([]);
      } finally {
        if (mounted) setAircraftMasterLoading(false);
      }
    }
    loadAircraftOptions();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const serialNo = flight?.sNo != null ? String(flight.sNo) : null;
    if (!serialNo) return;
    const serial: string = serialNo;
    let aborted = false;

    async function load() {
      try {
        // GET http://localhost:8080/ns-raw-flight-data/main-details/:serialNo — load saved data from DB
        const doc = await fetchNsRawFormData('main-details', serial);
        if (aborted) return;
        const saved = normalizeMainDetailsData(doc);
        if (saved) {
          setFormData({
            ...INITIAL_FORM_DATA,
            isOperationSplit: saved.ifOperationSplit ?? false,
            arrivalFlightNo: saved.arrivalFlightNo ?? '',
            departureFlightNo: saved.departureFlightNo ?? '',
            // Keep ATA blank when DB still has booking STA mirrored into ATA.
            ...(() => {
              const ataDate = toMainDetailsPickerDate(saved.ataDate);
              const ataTime = String(saved.ataTime ?? '').trim();
              const staDate = toMainDetailsPickerDate(flight?.staDate);
              const staTime = String(flight?.staTime ?? '').trim();
              const isStaMirror =
                Boolean(ataDate) &&
                ataDate === staDate &&
                ataTime === staTime;
              return {
                ataDate: isStaMirror ? '' : ataDate,
                ataTime: isStaMirror ? '' : ataTime,
              };
            })(),
            atdDate: toMainDetailsPickerDate(saved.atdDate),
            atdTime: saved.atdTime ?? '',
            etdDate: toMainDetailsPickerDate(saved.etdDate),
            etdTime: saved.etdTime ?? '',
            regnNo: String(flight?.flightNo ?? '').trim().toUpperCase() || (saved.regnNo ?? ''),
            terminalCode: saved.terminalCode || '',
            typeOfHandling: saved.typeOfHandling || 'Non-Scheduled',
            mtow: saved.mtow || '',
            aircraftType: saved.aircraftType || flight?.aircraft || '',
            aircraftBody: saved.aircraftBody ?? '',
            opsType:
              saved.ops ||
              (OPS_TYPE_OPTIONS.includes(flight?.ops ?? '') ? flight?.ops : '') ||
              '',
            freighter: saved.freighter ?? false,
            medicalPassenger: saved.medicalPassenger ?? false,
            returnToRamp: saved.returnToRamp ?? false,
            status: saved.departureStatus ?? '',
            actualDelay: saved.arrivalDelay ?? '',
            ghRep: saved.ghRep ?? '',
            flightCancelled: saved.flightCancelled ?? false,
            challanNo:
              String(saved.challanNo ?? '').trim() ||
              String(flight?.challanNo ?? '').trim() ||
              '',
            bookingNo:
              String(saved.bookingNo ?? '').trim() ||
              String(flight?.bookingNo ?? '').trim() ||
              '',
          });
          setCancelled(Boolean(saved.flightCancelled) || Boolean(flight?.isCancelled));
          const arr =
            saved.departureDelays?.length
              ? saved.departureDelays
              : saved.arrivalDelays ?? [];
          const mappedDelays = arr.slice(0, 3).map((row: DelayRow) => ({
            delay: row.delay ?? '',
            reasonOfDelay: row.reasonOfDelay ?? '',
            gh: row.gh ?? false,
            oth: row.oth ?? false,
          }));
          setDelayRows([
            ...mappedDelays,
            ...INITIAL_DELAY_ROWS.slice(mappedDelays.length, 3),
          ].slice(0, 3));
          return;
        }

        setFormData({
          ...INITIAL_FORM_DATA,
          etdDate: toMainDetailsPickerDate(flight?.stdDate),
          etdTime: flight?.stdTime ?? '',
          regnNo: String(flight?.flightNo ?? '').trim().toUpperCase(),
          aircraftType: flight?.aircraft || INITIAL_FORM_DATA.aircraftType,
          opsType: OPS_TYPE_OPTIONS.includes(flight?.ops ?? '')
            ? flight!.ops
            : INITIAL_FORM_DATA.opsType,
          challanNo: String(flight?.challanNo ?? '').trim(),
          bookingNo: String(flight?.bookingNo ?? '').trim(),
        });
        setDelayRows(INITIAL_DELAY_ROWS);
      } catch {
        if (!aborted) {
          setFormData({
            ...INITIAL_FORM_DATA,
            etdDate: toMainDetailsPickerDate(flight?.stdDate),
            etdTime: flight?.stdTime ?? '',
            regnNo: String(flight?.flightNo ?? '').trim().toUpperCase(),
            aircraftType: flight?.aircraft || INITIAL_FORM_DATA.aircraftType,
            challanNo: String(flight?.challanNo ?? '').trim(),
            bookingNo: String(flight?.bookingNo ?? '').trim(),
          });
          setDelayRows(INITIAL_DELAY_ROWS);
        }
      }
    }
    load();
    return () => { aborted = true; };
  }, [flight]);

  useEffect(() => {
    const serial = flight?.sNo != null ? String(flight.sNo) : '';
    if (!serial) return;
    let mounted = true;
    void (async () => {
      try {
        const status = await fetchFlightCancellationStatus(serial, NS_CANCEL_KIND);
        if (!mounted) return;
        if (status.isCancelled) {
          setCancelled(true);
          setFormData((prev) =>
            prev.flightCancelled ? prev : { ...prev, flightCancelled: true },
          );
        }
      } catch {
        // Keep checkbox/OTP state from main-details if status API is down.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [flight?.sNo, flight?.isCancelled]);

  useEffect(() => {
    if (!showCancelConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCancelConfirm(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showCancelConfirm]);

  /** Regn No locked to flight number for non-scheduled. */
  useEffect(() => {
    const fromFlight = String(flight?.flightNo ?? '').trim().toUpperCase();
    if (!fromFlight) return;
    setFormData((prev) =>
      prev.regnNo === fromFlight ? prev : { ...prev, regnNo: fromFlight },
    );
  }, [flight?.flightNo]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'ataDate' || field === 'ataTime' || field === 'atdTime' || field === 'etdTime' || field === 'atdDate') {
      if (field === 'atdDate') clearField('ataDate');
      else clearField(field as NsMainTimeField);
    }
  };

  const aircraftOptions = useMemo(() => {
    const options = [...aircraftMasterOptions];
    const currentValue = formData.aircraftType.trim() || flight?.aircraft?.trim() || '';
    if (
      currentValue &&
      !options.some((option) => option.value.toLocaleLowerCase() === currentValue.toLocaleLowerCase())
    ) {
      options.unshift({ value: currentValue, label: currentValue, body: '', mtow: '' });
    }
    return options;
  }, [aircraftMasterOptions, flight?.aircraft, formData.aircraftType]);

  const handleAircraftTypeChange = (value: string) => {
    const selected = aircraftMasterOptions.find((option) => option.value === value);
    setFormData((prev) => ({
      ...prev,
      aircraftType: value,
      aircraftBody: selected?.body ?? '',
      mtow: selected?.mtow ?? '',
    }));
  };

  const handleDelayChange = (index: number, field: keyof DelayRow, value: string | boolean) => {
    setDelayRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const flightId = flight?.sNo != null ? String(flight.sNo).trim() : '';
  const displaySerial = flightId || '—';
  const displayAirline = String(flight?.airline ?? '').trim() || '—';
  const displayFlightCode = String(flight?.flightNo ?? '').trim() || '—';

  const cancelFlightSnapshot = () => ({
    airlineName: displayAirline,
    serialNumber: displaySerial,
    flightNo: displayFlightCode,
    aircraftType: formData.aircraftType || flight?.aircraft || '',
    route: flight?.routing || '',
    staDate: toCancelYmd(flight?.staDate) || flight?.staDate || '',
    staTime: flight?.staTime || '',
    stdDate: toCancelYmd(flight?.stdDate) || flight?.stdDate || '',
    stdTime: flight?.stdTime || '',
  });

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
      nsCancelToast.error('File size should be less than 5 MB.');
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
      nsCancelToast.error(getErrorMessage(err, 'Failed to process file.'));
    }
  };

  const sendStepOneOtp = async () => {
    if (!flightId) {
      nsCancelToast.error('Flight identifier missing. Unable to send OTP.');
      return;
    }
    setIsCancelBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const otpPurpose = otpFlowMode === 'reopen' ? 'reopen-step-1' : 'cancel-step-1';
      const res = await frisFetch(`${base}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flightId,
          purpose: otpPurpose,
          flightKind: NS_CANCEL_KIND,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'Failed to send OTP');
      }
      setOtpSent(true);
      setStepOnePurposeUsed(otpPurpose);
      nsCancelToast.success('OTP sent to admin email');
    } catch (e) {
      nsCancelToast.error(e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setIsCancelBusy(false);
    }
  };

  const verifyStepOneOtp = async () => {
    if (!flightId) {
      nsCancelToast.error('Flight identifier missing. Unable to verify OTP.');
      return;
    }
    if (!otpSent || !stepOnePurposeUsed) {
      nsCancelToast.error('Please send OTP first.');
      return;
    }
    if (!/^\d{6}$/.test(otp)) return;
    setIsCancelBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const res = await frisFetch(`${base}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flightId,
          purpose: stepOnePurposeUsed,
          otp,
          flightKind: NS_CANCEL_KIND,
          flightSnapshot: cancelFlightSnapshot(),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'OTP verification failed');
      }
      if (otpFlowMode === 'reopen') {
        setCancelled(false);
        setFormData((prev) => ({ ...prev, flightCancelled: false }));
        onCancelledChange?.(false);
        setStep('main');
        resetCancelFlow();
        nsCancelToast.success('Flight reopened successfully');
      } else {
        nsCancelToast.success('OTP verified — continue with intimation');
        setStep('intimation');
      }
    } catch (e) {
      nsCancelToast.error(e instanceof Error ? e.message : 'OTP verification failed');
    } finally {
      setIsCancelBusy(false);
    }
  };

  const sendFinalOtp = async () => {
    if (!flightId) {
      nsCancelToast.error('Flight identifier missing. Unable to send OTP.');
      return;
    }
    setIsCancelBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const res = await frisFetch(`${base}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flightId,
          purpose: 'cancel-step-2',
          flightKind: NS_CANCEL_KIND,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'Failed to send final OTP');
      }
      setFinalOtpSent(true);
      nsCancelToast.success('Final OTP sent to admin email');
    } catch (e) {
      nsCancelToast.error(e instanceof Error ? e.message : 'Failed to send final OTP');
    } finally {
      setIsCancelBusy(false);
    }
  };

  const submitIntimation = async () => {
    if (!intimationTime.trim() || !intimatedBy.trim() || !intimationMode.trim()) {
      nsCancelToast.error('Please fill Intimation time, Intimated by, and Intimation mode.');
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
      nsCancelToast.error('Flight identifier missing. Unable to verify OTP.');
      return;
    }
    if (!/^\d{6}$/.test(finalOtp)) return;
    setIsCancelBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const res = await frisFetch(`${base}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flightId,
          purpose: 'cancel-step-2',
          otp: finalOtp,
          flightKind: NS_CANCEL_KIND,
          cancellationForm: {
            intimationTime,
            intimatedBy,
            intimationPersonEmail,
            intimationMode,
            proofNote,
            attachment: proofAttachment,
          },
          flightSnapshot: cancelFlightSnapshot(),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'Final OTP verification failed');
      }
      setCancelled(true);
      setFormData((prev) => ({ ...prev, flightCancelled: true }));
      onCancelledChange?.(true);
      broadcastCancellationEvent({
        cancelledAt: Date.now(),
        cancellationId: json?.cancellationId,
        flightKind: 'non-scheduled',
      });
      setStep('main');
      resetCancelFlow();
      nsCancelToast.success('Flight cancelled successfully');
    } catch (e) {
      nsCancelToast.error(e instanceof Error ? e.message : 'Final OTP verification failed');
    } finally {
      setIsCancelBusy(false);
    }
  };

  const handleSave = useCallback(async () => {
    const serial = flight?.sNo != null ? String(flight.sNo) : null;
    if (!serial || !flight) {
      setSaveError('No flight selected');
      setSaveStatus('error');
      return;
    }
    const next: FieldErrors<NsMainTimeField> = {};
    const ataErr = time24(formData.ataTime, 'ATA time');
    if (ataErr) next.ataTime = ataErr;
    const atdErr = time24(formData.atdTime, 'ATD time');
    if (atdErr) next.atdTime = atdErr;
    const etdErr = time24(formData.etdTime, 'ETD time');
    if (etdErr) next.etdTime = etdErr;
    const ataDay = parseMainDetailsDay(formData.ataDate);
    const atdDay = parseMainDetailsDay(formData.atdDate);
    if (ataDay && atdDay && ataDay.getTime() > atdDay.getTime()) {
      next.ataDate = 'ATA date cannot be later than ATD date.';
    }
    if (applyAndFocus(next)) {
      setSaveStatus('error');
      setSaveError(null);
      return;
    }
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const fallbackFlightNo = formData.isOperationSplit ? '' : flight.flightNo || '';
      const derivedAirlineCode =
        flight.airlineCode?.trim() ||
        /^[A-Za-z]{2,3}/.exec(flight.flightNo.trim())?.[0]?.toUpperCase() ||
        '-';
      const canonicalDelays = delayRows.map((row) => ({
        Delay: row.delay,
        ReasonofDelay: row.reasonOfDelay,
        gh: row.gh,
        oth: row.oth,
      }));

      await saveNsRawForm('main-details', serial, {
        Airline: flight.airline?.trim() || '-',
        Arline_Code: derivedAirlineCode,
        ifOperationSplit: formData.isOperationSplit,
        ArrivalFltNo: formData.arrivalFlightNo.trim() || fallbackFlightNo,
        DepartureFltNo: formData.departureFlightNo.trim() || fallbackFlightNo,
        ATADate: formData.ataDate,
        ATATime: formData.ataTime,
        ATDDate: formData.atdDate,
        ATDTime: formData.atdTime,
        etdDate: formData.etdDate,
        ETDtime: formData.etdTime,
        Regn: String(flight.flightNo || formData.regnNo || '').trim().toUpperCase(),
        Terminal: formData.terminalCode,
        Route: flight.routing || '',
        Typeofflight: formData.opsType,
        TypeofHandling: formData.typeOfHandling,
        TypeCraft: formData.aircraftType,
        MTOW: formData.mtow,
        aircraftBody: formData.aircraftBody,
        freighter: formData.freighter,
        medicalPassenger: formData.medicalPassenger,
        returnToRamp: formData.returnToRamp,
        ActualDelay: formData.actualDelay,
        departureStatus: formData.status,
        // Single delay table — store once (departure). Writing both mirrored
        // the same rows and FHR PDF concatenated arrival+departure → duplicates.
        departureDelays: canonicalDelays,
        arrivalDelays: [],
        PAX_Airline_SignByDate: formData.ghRep,
        flightCancelled: cancelled,
        bookingNo: String(flight.bookingNo || formData.bookingNo || '').trim(),
        challanNo: String(flight.challanNo || formData.challanNo || '').trim(),
        BookingNo: String(flight.bookingNo || formData.bookingNo || '').trim(),
        ChallanNo: String(flight.challanNo || formData.challanNo || '').trim(),
        operator: String(flight.operator || '').trim(),
      });
      setSaveStatus('success');
      onSave?.({ ...formData, delayRows });
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveError(getErrorMessage(err, 'Save failed'));
      setSaveStatus('error');
    }
  }, [flight, formData, delayRows, cancelled, onSave, applyAndFocus]);

  const inputClassName = `min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm
    focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20
    hover:border-emerald-400 hover:shadow-sm transition-[border-color,box-shadow] duration-200`;

  const selectClassName = `${inputClassName} cursor-pointer`;
  const labelClassName = 'mb-1.5 block text-sm font-medium text-gray-700';
  const checkboxClassName =
    'h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500 cursor-pointer';
  const sectionClassName =
    'min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-emerald-100 hover:shadow-md';
  const ataDay = parseMainDetailsDay(formData.ataDate);
  const atdDay = parseMainDetailsDay(formData.atdDate);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ns-cancel-flight-confirm-title"
            aria-describedby="ns-cancel-flight-confirm-desc"
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
                    Non-scheduled airlines · {cancelled ? 'reopen' : 'cancellation'}
                  </p>
                  <h2
                    id="ns-cancel-flight-confirm-title"
                    className="mt-1 text-lg font-bold text-gray-900"
                  >
                    {cancelled ? 'Reopen this flight?' : 'Cancel this flight?'}
                  </h2>
                  <p
                    id="ns-cancel-flight-confirm-desc"
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
      <div className="shrink-0 border-b border-gray-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 p-2 shadow-sm">
            <Plane className="h-5 w-5 -rotate-45 text-white" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Main Details</h2>
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
                disabled={!flightId}
                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition-all hover:border-rose-300 hover:bg-rose-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 px-4 py-5 md:px-6"
      >
        {step === 'otp' && (
          <div className="flex items-start justify-center px-2 py-8">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-xl shadow-gray-200/40 ring-1 ring-emerald-500/10">
              <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500" />
              <div className="p-6 md:p-8">
                <div className="mb-6 flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md shadow-emerald-500/30">
                    <ShieldCheck className="h-6 w-6 text-white" aria-hidden />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                      Non-scheduled airlines · {otpFlowMode === 'reopen' ? 'reopen' : 'cancellation'}
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
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-center font-mono text-lg tracking-[0.35em] focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="••••••"
                    />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => void sendStepOneOtp()}
                      disabled={isCancelBusy}
                      className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm transition-all hover:bg-emerald-50 hover:shadow disabled:opacity-60"
                    >
                      Send OTP
                    </button>
                    <button
                      type="button"
                      onClick={() => void verifyStepOneOtp()}
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

        {step === 'intimation' && adaptedFlight && (
          <div className="flex items-start justify-center px-2 py-8">
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
                  flight={adaptedFlight}
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
                  onProofFileChange={(file) => void onProofFileChange(file)}
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
                        className="w-full rounded-xl border border-emerald-200/80 bg-white px-4 py-3 text-center font-mono text-lg tracking-[0.35em] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
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
                        onClick={() => void verifyFinalOtpAndCancel()}
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
        <div className="w-full min-w-0 space-y-6">
          <section className="min-w-0 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-200/80 to-gray-300/80 px-4 py-3">
            <div className="overflow-x-auto overscroll-x-contain">
              <div className="flex w-max min-w-full gap-3 pb-0.5 text-sm font-semibold text-gray-800">
                <span className="shrink-0 rounded-lg bg-white/70 px-3 py-1.5 backdrop-blur-sm">
                  SNo: {flight?.sNo || '—'}
                </span>
                <span className="flex shrink-0 items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5 backdrop-blur-sm">
                  <Plane className="h-3 w-3" aria-hidden />
                  {flight?.airline || '—'}
                </span>
                <span className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-500/10 px-3 py-1.5 text-emerald-700">
                  {flight?.flightNo || '—'}
                </span>
                <span className="shrink-0 rounded-lg border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700">
                  STA: {flight?.staDate || '—'} {flight?.staTime || ''}
                </span>
                <span className="shrink-0 rounded-lg border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700">
                  STD: {flight?.stdDate || '—'} {flight?.stdTime || ''}
                </span>
              </div>
            </div>
          </section>

          <section className={`${sectionClassName} space-y-3`}>
            <h3 className="mb-1 text-sm font-semibold text-gray-800">
              Booking &amp; Performa
            </h3>
            <p className="mb-2 text-xs text-gray-500">
              From booking — shown on FHR / GSE / Team preview and PDF (not editable here).
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClassName} htmlFor="ns-main-performa-no">
                  Performa No.
                </label>
                <input
                  id="ns-main-performa-no"
                  type="text"
                  value={formData.challanNo}
                  readOnly
                  disabled
                  className={`${inputClassName} cursor-not-allowed bg-gray-100 text-gray-700`}
                  placeholder="—"
                  autoComplete="off"
                  aria-readonly="true"
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="ns-main-booking-no">
                  Booking No.
                </label>
                <input
                  id="ns-main-booking-no"
                  type="text"
                  value={formData.bookingNo}
                  readOnly
                  disabled
                  className={`${inputClassName} cursor-not-allowed bg-gray-100 text-gray-700`}
                  placeholder="—"
                  autoComplete="off"
                  aria-readonly="true"
                />
              </div>
            </div>
          </section>

          <section className={`${sectionClassName} space-y-3`}>
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isOperationSplit}
                onChange={(e) => handleInputChange('isOperationSplit', e.target.checked)}
                className={checkboxClassName}
                aria-label="Split arrival and departure operation"
              />
              <span className="text-sm font-medium text-gray-700">If Operation is split</span>
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={`${labelClassName} ${!formData.isOperationSplit ? 'text-gray-400' : ''}`}>
                  Arrival Flight No
                </label>
                <input
                  type="text"
                  value={formData.arrivalFlightNo}
                  onChange={(e) => handleInputChange('arrivalFlightNo', e.target.value)}
                  disabled={!formData.isOperationSplit}
                  className={`${inputClassName} ${!formData.isOperationSplit ? 'cursor-not-allowed bg-gray-100 text-gray-400' : ''}`}
                  placeholder="Enter arrival flight"
                />
                <FormFieldError />
              </div>
              <div>
                <label className={`${labelClassName} ${!formData.isOperationSplit ? 'text-gray-400' : ''}`}>
                  Departure Flight No
                </label>
                <input
                  type="text"
                  value={formData.departureFlightNo}
                  onChange={(e) => handleInputChange('departureFlightNo', e.target.value)}
                  disabled={!formData.isOperationSplit}
                  className={`${inputClassName} ${!formData.isOperationSplit ? 'cursor-not-allowed bg-gray-100 text-gray-400' : ''}`}
                  placeholder="Enter departure flight"
                />
                <FormFieldError />
              </div>
            </div>
          </section>

          <section className={sectionClassName}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Calendar className="h-4 w-4 text-emerald-600" aria-hidden />
              Timing &amp; Registration
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gradient-to-br from-slate-50/80 to-white p-3 transition-colors hover:border-emerald-200">
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">ATA</span>
                <div>
                  <label className={labelClassName} htmlFor="field-ataDate">Date</label>
                  <DatePicker
                    id="field-ataDate"
                    ariaLabel="ATA date"
                    value={formData.ataDate}
                    onChange={(value) => handleInputChange('ataDate', value)}
                    valueFormat="dd/MM/yyyy"
                    maxDate={atdDay ?? undefined}
                  />
                  <FormFieldError id="field-ataDate-error" message={errors.ataDate} />
                </div>
                <div>
                  <label className={labelClassName}>Time (24h)</label>
                  <TimeSelect24
                    hourSelectId="field-ataTime"
                    value={formData.ataTime}
                    onChange={(value) => handleInputChange('ataTime', value)}
                    className={cn('min-h-11 w-full', errors.ataTime && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-ataTime-error" message={errors.ataTime} />
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-gray-200 bg-gradient-to-br from-slate-50/80 to-white p-3 transition-colors hover:border-emerald-200">
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">ATD</span>
                <div>
                  <label className={labelClassName} htmlFor="field-atdDate">Date</label>
                  <DatePicker
                    id="field-atdDate"
                    ariaLabel="ATD date"
                    value={formData.atdDate}
                    onChange={(value) => handleInputChange('atdDate', value)}
                    valueFormat="dd/MM/yyyy"
                    minDate={ataDay ?? undefined}
                  />
                </div>
                <div>
                  <label className={labelClassName}>Time (24h)</label>
                  <TimeSelect24
                    hourSelectId="field-atdTime"
                    value={formData.atdTime}
                    onChange={(value) => handleInputChange('atdTime', value)}
                    className={cn('min-h-11 w-full', errors.atdTime && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-atdTime-error" message={errors.atdTime} />
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-gray-200 bg-gradient-to-br from-slate-50/80 to-white p-3 transition-colors hover:border-emerald-200">
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">ETD</span>
                <div>
                  <label className={labelClassName}>Date</label>
                  <DatePicker
                    value={formData.etdDate}
                    onChange={(value) => handleInputChange('etdDate', value)}
                    valueFormat="dd/MM/yyyy"
                  />
                </div>
                <div>
                  <label className={labelClassName}>Time (24h)</label>
                  <TimeSelect24
                    hourSelectId="field-etdTime"
                    value={formData.etdTime}
                    onChange={(value) => handleInputChange('etdTime', value)}
                    className={cn('min-h-11 w-full', errors.etdTime && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-etdTime-error" message={errors.etdTime} />
                </div>
              </div>

              <div>
                <label className={labelClassName}>Regn No.</label>
                <input
                  type="text"
                  value={formData.regnNo}
                  readOnly
                  disabled
                  aria-readonly="true"
                  className={`${inputClassName} cursor-not-allowed bg-gray-100 text-gray-700`}
                  placeholder="Same as flight no."
                  title="Auto-filled from flight number"
                  autoComplete="off"
                />
                <FormFieldError />
              </div>
              <div>
                <label className={labelClassName}>Route</label>
                <input
                  type="text"
                  value={flight?.routing || ''}
                  readOnly
                  disabled
                  aria-readonly="true"
                  className={`${inputClassName} cursor-not-allowed bg-gray-100 text-gray-700`}
                  placeholder="From booking"
                  title="Route comes from booking and cannot be changed here"
                  autoComplete="off"
                />
                <FormFieldError />
              </div>
              <div>
                <label className={labelClassName}>Terminal Code</label>
                <AdminRadioDropdown
                  value={formData.terminalCode}
                  onChange={(v) => handleInputChange('terminalCode', v)}
                  options={terminalOptions}
                  placeholder="Select terminal"
                  className={selectClassName}
                />
                <FormFieldError />
              </div>
              <div>
                <label className={labelClassName}>Type Of Handling</label>
                <AdminRadioDropdown
                  value={formData.typeOfHandling}
                  onChange={(v) => handleInputChange('typeOfHandling', v)}
                  options={TYPE_OF_HANDLING_OPTIONS}
                  className={selectClassName}
                />
                <FormFieldError />
              </div>
            </div>
          </section>

          <section className={sectionClassName}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Plane className="h-4 w-4 text-emerald-600" aria-hidden />
              Aircraft &amp; Operation
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={labelClassName}>Aircraft Type</label>
                <AdminRadioDropdown
                  value={formData.aircraftType}
                  onChange={handleAircraftTypeChange}
                  options={aircraftOptions}
                  placeholder={aircraftMasterLoading ? 'Loading aircraft…' : 'Select aircraft'}
                  disabled={aircraftMasterLoading}
                  className={selectClassName}
                />
                <FormFieldError />
              </div>
              <div>
                <label className={labelClassName}>Aircraft Body</label>
                <input
                  type="text"
                  value={formData.aircraftBody}
                  onChange={(e) => handleInputChange('aircraftBody', e.target.value)}
                  className={inputClassName}
                />
                <FormFieldError />
              </div>
              <div>
                <label className={labelClassName}>MTOW</label>
                <input
                  type="text"
                  value={formData.mtow}
                  onChange={(e) => handleInputChange('mtow', e.target.value)}
                  className={inputClassName}
                />
                <FormFieldError />
              </div>
              <div>
                <label className={labelClassName}>Ops Type</label>
                <AdminRadioDropdown
                  value={formData.opsType}
                  onChange={(v) => handleInputChange('opsType', v)}
                  options={OPS_TYPE_OPTIONS}
                  placeholder="Select operation type"
                  className={selectClassName}
                />
                <FormFieldError />
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
              <label className="flex min-h-11 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.freighter}
                  onChange={(e) => handleInputChange('freighter', e.target.checked)}
                  className={checkboxClassName}
                  aria-label="Freighter flight"
                />
                <span className="text-sm text-gray-700">Freighter</span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.medicalPassenger}
                  onChange={(e) => handleInputChange('medicalPassenger', e.target.checked)}
                  className={checkboxClassName}
                  aria-label="Medical or passenger flight"
                />
                <span className="text-sm text-gray-700">Medical/Passenger</span>
              </label>
            </div>
          </section>

          <section className={sectionClassName}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Clock className="h-4 w-4 text-emerald-600" aria-hidden />
              Delays
            </h3>
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="flex min-h-11 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.returnToRamp}
                    onChange={(e) => handleInputChange('returnToRamp', e.target.checked)}
                    className={checkboxClassName}
                    aria-label="Return to ramp"
                  />
                  <span className="text-sm text-gray-700">Return to ramp</span>
                </label>
                <FormFieldError />
              </div>
              <div>
                <label className={labelClassName}>Status</label>
                <input
                  type="text"
                  value={formData.status}
                  onChange={(e) => handleInputChange('status', e.target.value)}
                  className={inputClassName}
                />
                <FormFieldError />
              </div>
              <div>
                <label className={labelClassName}>Actual Delay</label>
                <input
                  type="text"
                  value={formData.actualDelay}
                  onChange={(e) => handleInputChange('actualDelay', e.target.value)}
                  className={inputClassName}
                />
                <FormFieldError />
              </div>
            </div>
          </section>

          <section className={sectionClassName}>
            <h3 className="mb-3 text-sm font-bold text-gray-900 underline decoration-emerald-500 underline-offset-2">
              Delay details
            </h3>
            <div
              className="overflow-x-auto overscroll-x-contain rounded-lg border border-gray-200 transition-colors hover:border-emerald-300"
              role="region"
              aria-label="Delay rows"
              tabIndex={0}
            >
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-50">
                    <th className="min-w-[7.5rem] p-2.5 text-left font-medium text-gray-700">Delay</th>
                    <th className="min-w-[12rem] p-2.5 text-left font-medium text-gray-700">Reason of delay</th>
                    <th className="w-16 p-2.5 text-center font-medium text-gray-700">GH</th>
                    <th className="w-16 p-2.5 text-center font-medium text-gray-700">OTH</th>
                  </tr>
                </thead>
                <tbody>
                  {delayRows.map((row, index) => (
                    <tr
                      key={index}
                      className="group border-t border-gray-200 transition-colors hover:bg-emerald-50/40"
                    >
                      <td className="p-2">
                        <TimeSelect24
                          value={row.delay}
                          onChange={(value) => handleDelayChange(index, 'delay', value)}
                          className="min-h-11 w-full"
                        />
                      </td>
                      <td className="p-2">
                        <AdminRadioDropdown
                          value={row.reasonOfDelay}
                          onChange={(value) => handleDelayChange(index, 'reasonOfDelay', value)}
                          options={MAIN_DETAILS_DELAY_REASONS}
                          placeholder="Select reason"
                          clearable
                          clearLabel="Clear reason"
                          aria-label={`Delay row ${index + 1}: reason of delay`}
                          className={selectClassName}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={row.gh}
                            onChange={(e) => handleDelayChange(index, 'gh', e.target.checked)}
                            className={checkboxClassName}
                            aria-label={`Delay row ${index + 1}: GH`}
                          />
                        </label>
                      </td>
                      <td className="p-2 text-center">
                        <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={row.oth}
                            onChange={(e) => handleDelayChange(index, 'oth', e.target.checked)}
                            className={checkboxClassName}
                            aria-label={`Delay row ${index + 1}: OTH`}
                          />
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`${sectionClassName} space-y-4`}>
            <h3 className="text-sm font-semibold text-gray-800">Representatives</h3>
            <p className="text-xs text-gray-500">{REPRESENTATIVES_ACCESS_NOTE}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="group">
                <SearchableCombobox
                  fieldLabel="GH Rep"
                  value={formData.ghRep}
                  onChange={(value) => handleInputChange('ghRep', value)}
                  options={ghRepComboOptions}
                  loading={ghRepOptionsLoading}
                  placeholder="Search by name or employee code"
                  onRequestOptions={() => void loadGhRepOptions()}
                  onPickOption={(option) =>
                    handleInputChange(
                      'ghRep',
                      option.employeeName?.trim() || option.label,
                    )
                  }
                />
                <FormFieldError />
              </div>
            </div>

            <DigitalSignaturesSection
              serialKey={flight?.sNo != null ? String(flight.sNo) : ''}
              ghRepresentativeName={formData.ghRep}
              airlineRepresentativeName=""
              airlineNameOptional
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

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saveStatus === 'saving'}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-[transform,box-shadow,background-color] duration-150 hover:from-emerald-600 hover:to-emerald-700 hover:shadow active:scale-[0.98] focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
              >
                <Save className="h-4 w-4" aria-hidden />
                {saveStatus === 'saving' ? 'Saving...' : 'Save'}
              </button>
              {saveStatus === 'success' && (
                <span className="text-sm font-medium text-emerald-600" role="status">
                  Saved successfully.
                </span>
              )}
              {saveStatus === 'error' && saveError && (
                <span className="text-sm text-red-600" role="alert">
                  {saveError}
                </span>
              )}
            </div>
          </section>
        </div>
        )}
      </form>
    </div>
  );
}
